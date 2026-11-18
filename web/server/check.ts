// The routes that ask Lean: /api/check (an exercise's proof), /api/playground
// (any Lean source, nothing scored) and /api/lean (can Lean check a proof
// now, and start it again).

import type { IncomingMessage, ServerResponse } from "node:http";
import { parseGoals } from "../shared/goals.ts";
import { assemble, axiomsOf, bodyLines, endOfBody, escapesIn, fillBody, fillProblem, gapPosition, judge, ringFailures, ringNotes, toBody, toSource, type Position } from "../shared/proof.ts";
import type { CheckReply, CheckRequest, LeanStatus, PlaygroundReply, PlaygroundRequest } from "../shared/wire.ts";
import type { Exercise } from "../shared/content.ts";
import { isSolved, recordAttempt } from "../../scripts/db/progress.ts";
import { learnerId, rawDb } from "./db.ts";
import { LeanTimeout, LeanUnavailable, leanProblem, leanServer, leanToolchain, type LeanServer } from "./lean/lsp.ts";
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
    // Out of time on this proof: Lean is still there, and the sentence says what to change.
    if (e instanceof LeanTimeout) throw new HttpError(503, e.message, "lean_timeout");
    if (e instanceof LeanUnavailable) throw new HttpError(503, e.message, "lean_unavailable");
    throw e;
  }
}

/**
 * Check an answer to an exercise: the pure part of /api/check, so tests can
 * run it against a real Lean without HTTP or a database. For kind `prove`
 * the answer is the proof body. For `fill` it is what goes in the gap, and
 * the body is the exercise's own proof with it put there.
 */
export async function checkExercise(lean: LeanServer, exercise: Exercise, answer: string, cursor?: Position): Promise<CheckReply> {
  if (exercise.kind !== "fill") return checkBody(lean, exercise, answer, answer, cursor);
  const refuse = (refusal: string | null): CheckReply => ({ solved: false, goals: [], cursorGoals: null, error: null, diagnostics: [], forbidden: [], refusal });
  const fill = answer.trim();
  // What the missing step has to prove is the state where the gap starts.
  // Where the gap is part of a term Lean has no state there, and the state
  // at the start of its line is shown instead.
  const gap = gapPosition(exercise.proof)!;
  const lineStart = { line: gap.line, character: /^\s*/.exec(bodyLines(exercise.proof)[gap.line])![0].length };
  if (!fill) {
    // Nothing in the gap yet. The state there does not depend on what goes
    // in, so it is read with the reference fill in place; only the state is
    // kept, and an empty gap is never solved.
    const reply = await checkBody(lean, exercise, fillBody(exercise.proof, exercise.solution), "", gap, lineStart);
    return { ...refuse(null), cursorGoals: reply.cursorGoals };
  }
  const wrong = fillProblem(fill);
  if (wrong) return refuse(wrong);
  if (exercise.options.length && !exercise.options.includes(fill)) return refuse("That is not one of the choices.");
  return checkBody(lean, exercise, fillBody(exercise.proof, fill), fill, gap, lineStart);
}

/**
 * Check a proof body against an exercise's statement. `written` is the part
 * of the body the learner wrote, which the forbid list applies to.
 * `otherwise` is a second place to read the goals when Lean has none at
 * `cursor`. All
 * exercises share one Lean document: they share the import, so moving
 * between them costs a re-check, not a fresh Mathlib load.
 */
async function checkBody(lean: LeanServer, exercise: Exercise, body: string, written: string, cursor?: Position, otherwise?: Position): Promise<CheckReply> {
  // A body that would step outside a proof is never handed to Lean: what it
  // asks for (`run_tac`, `#eval` …) is a program, and this is not the Playground.
  const escapes = escapesIn(body);
  if (escapes.length) {
    return { solved: false, goals: [], cursorGoals: null, error: null, diagnostics: [], forbidden: [], refusal: escapes[0].message };
  }
  const given = exercise.given;
  const end = toSource(endOfBody(body), given);
  const positions = [end, ...(cursor ? [toSource(cursor, given)] : []), ...(cursor && otherwise ? [toSource(otherwise, given)] : [])];
  const source = assemble(exercise.statement, body, given);
  const result = await lean.check("exercise", source, positions);
  // A `ring` that did not finish says so in a note, not an error: whether it
  // failed is read from the goals on either side of it (proof.ts
  // `ringNotes`). The same source again costs Lean no elaboration.
  const notes = ringNotes(result.diagnostics);
  const around = notes.length ? (await lean.check("exercise", source, notes.flatMap((d) => [d.start, d.end]))).goals : [];
  const diagnostics = toBody(ringFailures(result.diagnostics, notes, around), body, given);
  const verdict = judge(diagnostics, body, exercise.forbid, axiomsOf(result.diagnostics, body, given), written);
  return {
    solved: verdict.solved,
    goals: parseGoals(result.goals[0] ?? []),
    cursorGoals: cursor && result.goals[1]?.length ? parseGoals(result.goals[1]) : cursor && otherwise && result.goals[2] ? parseGoals(result.goals[2]) : cursor && result.goals[1] ? [] : null,
    error: verdict.error,
    diagnostics,
    forbidden: verdict.forbidden,
    refusal: verdict.refusal,
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

  // A fill is kept as it was checked, without the spaces around it.
  const body = exercise.kind === "fill" ? input.body.trim() : input.body;
  const reply = await withLean((lean) => checkExercise(lean, exercise, body, cursor));
  // Looking at an empty gap is not an attempt at it.
  if (exercise.kind !== "fill" || body) await keep(lesson.id, exercise.id, body, reply, input.record);
  sendJson(res, 200, reply);
}

/** Which checks become attempt rows (wire.ts CheckRequest.record). A proof
 *  typed live is re-checked on every pause, so a solved body is kept only
 *  the first time or when it was submitted. */
async function keep(lessonId: string, exerciseId: string, body: string, reply: CheckReply, record: unknown): Promise<void> {
  const refused = reply.error !== null || reply.forbidden.length > 0 || reply.refusal !== null;
  const db = rawDb();
  const learner = await learnerId();
  if (reply.solved) {
    if (record !== "submitted" && (await isSolved(db, learner, lessonId, exerciseId))) return;
    await recordAttempt(db, learner, { lessonId, exerciseId, body, solved: true });
    return;
  }
  if (record === "submitted" || (record === "rejected" && refused)) {
    const error = reply.error?.message ?? reply.refusal ?? (reply.forbidden.length ? `uses ${reply.forbidden.join(", ")}` : "unsolved goals");
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

export function leanStatus(): LeanStatus {
  const missing = leanProblem();
  const health = missing ? { state: "down" as const, problem: missing } : leanServer().health();
  return { ...health, installed: !missing, toolchain: leanToolchain() };
}

/** GET /api/lean and /api/lean/status: can Lean check a proof now.
 *  POST /api/lean/restart: stop it and start it again. */
export async function handleLean(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const route = (req.url ?? "/").split("?")[0].replace(/\/+$/, "");
  if (route === "/restart") {
    if (req.method !== "POST") return methodNotAllowed(res, "POST");
    if (!leanProblem()) {
      // A failure to start is not an error of this request: the status says it.
      await leanServer().restart().catch(() => {});
      warmLean();
    }
    return sendJson(res, 200, leanStatus());
  }
  if (route !== "" && route !== "/status") return sendJson(res, 404, { error: "no such route" });
  if (req.method !== "GET") return methodNotAllowed(res, "GET");
  sendJson(res, 200, leanStatus());
}

/** Load Mathlib into the exercise document before the first click needs it.
 *  Best effort: a failure here is reported by the first real check. */
export function warmLean(): void {
  if (leanProblem()) return;
  leanServer()
    .check("exercise", assemble("(P : Prop) (hP : P) : P", "exact hP"), [])
    .catch(() => {});
}
