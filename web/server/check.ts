// The routes that ask Lean: /api/check (an exercise's proof), /api/playground
// (any Lean source, nothing scored) and /api/lean (can Lean run here at all).

import type { IncomingMessage, ServerResponse } from "node:http";
import { parseGoals } from "../shared/goals.ts";
import { assemble, endOfBody, judge, toBody, toSource, type Position } from "../shared/proof.ts";
import type { CheckReply, CheckRequest, LeanStatus, PlaygroundReply, PlaygroundRequest } from "../shared/wire.ts";
import type { Exercise } from "../shared/content.ts";
import { isSolved, recordAttempt } from "../../scripts/db/progress.ts";
import { learnerId, rawDb } from "./db.ts";
import { LeanUnavailable, leanProblem, leanServer, type LeanServer } from "./lean/lsp.ts";
import { loadContent } from "./loader.ts";
import { HttpError, methodNotAllowed, readJsonBody, sendJson } from "./sse.ts";

/** A proof body is a few lines; a playground file a few screens. */
const MAX_BODY = 20_000;
const MAX_SOURCE = 200_000;

function isPosition(v: unknown): v is Position {
  const p = v as Position | null;
  return !!p && Number.isInteger(p.line) && Number.isInteger(p.character) && p.line >= 0 && p.character >= 0;
}

/** Lean being absent or stuck is a state to explain (503), not a crash. */
async function withLean<T>(run: (lean: LeanServer) => Promise<T>): Promise<T> {
  try {
    return await run(leanServer());
  } catch (e) {
    if (e instanceof LeanUnavailable) throw new HttpError(503, e.message, "lean_unavailable");
    throw e;
  }
}

/**
 * Check `body` against an exercise: the pure part of /api/check, so tests
 * can run it against a real Lean without HTTP or a database. All exercises
 * share one Lean document: they share the import, so moving between them
 * costs a re-check, not a fresh Mathlib load.
 */
export async function checkExercise(lean: LeanServer, exercise: Exercise, body: string, cursor?: Position): Promise<CheckReply> {
  const end = toSource(endOfBody(body));
  const positions = cursor ? [end, toSource(cursor)] : [end];
  const result = await lean.check("exercise", assemble(exercise.statement, body), positions);
  const diagnostics = toBody(result.diagnostics, body);
  const verdict = judge(diagnostics, body, exercise.forbid);
  return {
    solved: verdict.solved,
    goals: parseGoals(result.goals[0] ?? []),
    cursorGoals: cursor && result.goals[1] ? parseGoals(result.goals[1]) : null,
    error: verdict.error,
    diagnostics,
    forbidden: verdict.forbidden,
  };
}

export async function handleCheck(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "POST") return methodNotAllowed(res, "POST");
  const input = await readJsonBody<Partial<CheckRequest>>(req);
  if (typeof input.lessonId !== "string" || typeof input.exerciseId !== "string" || typeof input.body !== "string") {
    throw new HttpError(400, "lessonId, exerciseId and body are required");
  }
  if (input.body.length > MAX_BODY) throw new HttpError(413, "that proof is too long");
  const cursor = isPosition(input.cursor) ? input.cursor : undefined;
  const lesson = loadContent().lessons.find((l) => l.id === input.lessonId);
  const exercise = lesson?.exercises.find((e) => e.id === input.exerciseId);
  if (!lesson || !exercise) throw new HttpError(404, "no such exercise");

  const body = input.body;
  const reply = await withLean((lean) => checkExercise(lean, exercise, body, cursor));
  await keep(lesson.id, exercise.id, body, reply, input.record);
  sendJson(res, 200, reply);
}

/** Which checks become attempt rows (wire.ts CheckRequest.record). A proof
 *  typed live is re-checked on every pause, so a solved body is kept only
 *  the first time or when it was submitted. */
async function keep(lessonId: string, exerciseId: string, body: string, reply: CheckReply, record: unknown): Promise<void> {
  const refused = reply.error !== null || reply.forbidden.length > 0;
  const db = rawDb();
  const learner = await learnerId();
  if (reply.solved) {
    if (record !== "submitted" && (await isSolved(db, learner, lessonId, exerciseId))) return;
    await recordAttempt(db, learner, { lessonId, exerciseId, body, solved: true });
    return;
  }
  if (record === "submitted" || (record === "rejected" && refused)) {
    const error = reply.error?.message ?? (reply.forbidden.length ? `uses ${reply.forbidden.join(", ")}` : "unsolved goals");
    await recordAttempt(db, learner, { lessonId, exerciseId, body, solved: false, error });
  }
}

export async function handlePlayground(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "POST") return methodNotAllowed(res, "POST");
  const input = await readJsonBody<Partial<PlaygroundRequest>>(req);
  if (typeof input.source !== "string") throw new HttpError(400, "source is required");
  if (input.source.length > MAX_SOURCE) throw new HttpError(413, "that file is too long");
  const cursor = isPosition(input.cursor) ? input.cursor : undefined;
  const source = input.source.endsWith("\n") ? input.source : `${input.source}\n`;
  const result = await withLean((lean) => lean.check("playground", source, cursor ? [cursor] : []));
  const reply: PlaygroundReply = {
    // Everything Lean said, linters included: here the file is the learner's own.
    diagnostics: result.diagnostics.map((d) => ({ severity: d.severity, message: d.message, line: d.start.line })),
    cursorGoals: cursor && result.goals[0] ? parseGoals(result.goals[0]) : null,
  };
  sendJson(res, 200, reply);
}

export function handleLean(req: IncomingMessage, res: ServerResponse): void {
  if (req.method !== "GET") return methodNotAllowed(res, "GET");
  const problem = leanProblem();
  sendJson(res, 200, { ready: !problem, problem } satisfies LeanStatus);
}

/** Load Mathlib into the exercise document before the first click needs it.
 *  Best effort: a failure here is reported by the first real check. */
export function warmLean(): void {
  if (leanProblem()) return;
  leanServer()
    .check("exercise", assemble("(P : Prop) (hP : P) : P", "exact hP"), [])
    .catch(() => {});
}
