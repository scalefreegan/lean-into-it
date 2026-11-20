// The routes that ask Lean: /api/check (an exercise's proof), /api/playground
// (any Lean source, nothing scored) and /api/lean (can Lean check a proof
// now, and start it again).

import { isLadder, onBoard } from "../shared/ladder.ts";
import type { IncomingMessage, ServerResponse } from "node:http";
import { parseGoals, type Goal } from "../shared/goals.ts";
import { withRemoved } from "../shared/interactive.ts";
import { assemble, axiomsOf, replayOf, bodyLines, endOfBody, escapesIn, fillBody, fillProblem, gapPosition, judge, ringFailures, ringNotes, toBody, toSource, type BodyDiagnostic, type Position, forbiddenIn } from "../shared/proof.ts";
import type { CheckReply, CheckRequest, LeanStatus, PlaygroundReply, PlaygroundRequest } from "../shared/wire.ts";
import type { Exercise } from "../shared/content.ts";
import { isFixed, isReading, optionGoals, readPairing, sameState } from "../shared/recognize.ts";
import { unsolvedGoals } from "../shared/goals.ts";
import { bareAnswer, COUNTER_PREFIX, counterBody, negation, readAnswer, splitStatement, valuesProblem, wrongSide } from "../shared/truefalse.ts";
import { hintRung, recordAttempt, solvedSince } from "../../scripts/db/progress.ts";
import { startOfDay } from "../shared/progress.ts";
import { learnerId, rawDb } from "./db.ts";
import { LeanTimeout, LeanUnavailable, leanProblem, leanServer, leanToolchain, restartTutorLean, type LeanCheck, type LeanServer } from "./lean/lsp.ts";
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
    throw leanError(e);
  }
}

/** What a failure of Lean itself becomes for the browser: a 503 whose
 *  sentence is Lean's own, and a code that says whether it was this proof
 *  that ran out of time (Lean is still there) or Lean that could not answer. */
export function leanError(e: unknown): unknown {
  if (e instanceof LeanTimeout) return new HttpError(503, e.message, "lean_timeout");
  if (e instanceof LeanUnavailable) return new HttpError(503, e.message, "lean_unavailable");
  return e;
}

/**
 * Check an answer to an exercise: the pure part of /api/check, so tests can
 * run it against a real Lean without HTTP or a database. For kind `prove`
 * the answer is the proof body. For `fill` it is what goes in the gap, and
 * the body is the exercise's own proof with it put there.
 */
export async function checkExercise(lean: LeanServer, exercise: Exercise, answer: string, cursor?: Position): Promise<CheckReply> {
  if (exercise.kind === "truefalse") return checkTrueFalse(lean, exercise, answer, cursor);
  if (exercise.kind === "predict") return checkPredict(lean, exercise, answer);
  if (isFixed(exercise.kind)) return checkFixed(exercise, answer);
  if (exercise.kind !== "fill") return checkBody(lean, exercise, answer, answer, cursor);
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

const refuse = (refusal: string | null): CheckReply => ({ solved: false, goals: [], cursorGoals: null, error: null, diagnostics: [], forbidden: [], refusal });

/**
 * Kind `predict` (web/shared/recognize.ts): Lean runs the exercise's
 * `before` lines and its move, and the state it leaves is compared with the
 * one picked. An empty answer asks only for the state before the move (in
 * `cursorGoals`), to show. Lean's state after the move goes back in `goals`
 * once an answer is given, so the learner sees what it really is.
 */
async function checkPredict(lean: LeanServer, exercise: Exercise, answer: string): Promise<CheckReply> {
  const { before, move } = exercise.predict!;
  if (!answer.trim()) {
    const at = await checkBody(lean, exercise, before, before);
    if (at.refusal || at.error) return refuse(`This exercise's own lines fail before the move: ${at.refusal ?? at.error!.message.split("\n")[0]}`);
    return { ...refuse(null), cursorGoals: at.goals };
  }
  const body = before ? `${before}\n${move}` : move;
  const ran = await checkBody(lean, exercise, body, body);
  // A refusal (the lines step outside a proof) means Lean never judged them: nothing to compare with.
  if (ran.refusal || ran.error || ran.forbidden.length) return refuse(`The move fails in this exercise, so there is nothing to predict: ${ran.refusal ?? ran.error?.message.split("\n")[0] ?? "it uses what is switched off"}`);
  // After a bullet or a case the end of the body shows no goal while another
  // case is still open; Lean's "unsolved goals" error names what is left.
  const goals = ran.solved ? [] : ran.goals.length ? ran.goals : unsolvedGoals(ran.diagnostics);
  if (!ran.solved && !goals.length) return refuse("Lean left this proof unfinished but did not say what is left, so there is nothing to compare with.");
  return { ...refuse(null), solved: sameState(optionGoals(answer), goals), goals };
}

/** Kinds `read`, `match` and `flaw` (`isFixed`): a fixed answer, marked against the author's (no Lean). */
export function checkFixed(exercise: Exercise, answer: string): CheckReply {
  if (exercise.kind === "read" || exercise.kind === "flaw") return { ...refuse(null), solved: answer.trim() === exercise.solution.trim() };
  const n = exercise.pairs!.english.length;
  const picks = readPairing(answer, n);
  if (typeof picks === "string") return refuse(picks);
  return { ...refuse(null), solved: picks.every((p, i) => p === i) };
}

/**
 * Kind `truefalse` (web/shared/truefalse.ts). The true side is a proof of
 * the statement, checked as for `prove`. The false side is a proof of the
 * claim's negation that the server writes around the learner's values (and
 * their proof lines, with `witness: proof`); what Lean says is moved back
 * onto the learner's own lines. The side Lean has not backed up is refused
 * with the exercise's `why`, before Lean is asked anything.
 */
async function checkTrueFalse(lean: LeanServer, exercise: Exercise, text: string, cursor?: Position): Promise<CheckReply> {
  const tf = exercise.truefalse!;
  const answer = readAnswer(text);
  if (typeof answer === "string") return refuse(answer);
  if ((answer.side === "true") !== tf.truth) return refuse(wrongSide(tf.truth, tf.why));
  if (answer.side === "true") return checkBody(lean, exercise, answer.body, answer.body, cursor);
  // Only the side so far: nothing to check yet. Proof lines without values are asked for the values.
  if (!answer.values.length && !answer.body.trim()) return refuse(null);
  const split = splitStatement(exercise.statement);
  if (!split) return refuse("This exercise's statement cannot be read.");
  const wrong = valuesProblem(answer.values, tf.names, split);
  if (wrong) return refuse(wrong);
  const written = tf.witness === "proof" ? answer.body : answer.values.join(", ");
  const negated = { ...exercise, statement: negation(split).replace(/^:\s*/, ": ") };
  const shift = (p?: Position) => (p ? { line: p.line + COUNTER_PREFIX, character: p.character } : undefined);
  const reply = await checkBody(lean, negated, counterBody(answer.values, tf.close, tf.witness, answer.body), written, tf.witness === "proof" ? shift(cursor) : undefined);
  // Lines the server wrote are not the learner's: what Lean says about them is said about the values.
  const back = (d: BodyDiagnostic): BodyDiagnostic => {
    const { range, ...rest } = d;
    if (tf.witness !== "proof" || d.line === null || d.line < COUNTER_PREFIX) return { ...rest, line: null };
    const up = (p: Position) => ({ line: p.line - COUNTER_PREFIX, character: p.character });
    return { ...rest, line: d.line - COUNTER_PREFIX, ...(range ? { range: { start: up(range.start), end: up(range.end) } } : {}) };
  };
  const diagnostics = reply.diagnostics.map(back);
  if (tf.witness === "values" && !reply.solved && !reply.refusal && !reply.forbidden.length) {
    const said = reply.error?.message.split("\n")[0] ?? "it leaves something unproved";
    return { ...reply, error: null, diagnostics, refusal: `Lean could not show that the claim fails at ${tf.names.map((n, i) => `${n} = ${answer.values[i]}`).join(", ")}: these values may not be a counterexample. (Lean says: ${said})` };
  }
  return { ...reply, diagnostics, error: reply.error ? back(reply.error) : null };
}

/** The goals at the `i`th position checked: Lean's structured goals, or
 *  where it gave none, its printed goals parsed. */
function goalsAt(result: LeanCheck, i: number): Goal[] {
  return result.structured[i]?.map((g) => g.goal) ?? parseGoals(result.goals[i] ?? []);
}

/** Where the body's last step starts: the first character of its last
 *  line that is not blank. Null for a blank body. */
function lastStep(body: string): Position | null {
  const lines = bodyLines(body);
  for (let line = lines.length - 1; line >= 0; line--) {
    const at = lines[line].search(/\S/);
    if (at >= 0) return { line, character: at };
  }
  return null;
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
  // Last, the start of the last step: Lean marks what a step takes away
  // only on the goals before it (web/shared/interactive.ts withRemoved).
  const last = lastStep(body);
  const positions = [end, ...(cursor ? [toSource(cursor, given)] : []), ...(cursor && otherwise ? [toSource(otherwise, given)] : []), ...(last ? [toSource(last, given)] : [])];
  const source = assemble(exercise.statement, body, given);
  let result: LeanCheck;
  try {
    result = await lean.check("exercise", source, positions, true);
  } catch (e) {
    // A switched-off tactic is often a search (`try?`, `exact?`) and can run
    // out the time limit. The learner is told it is switched off, which is
    // true whatever Lean would have said, and not that Lean took too long.
    const forbidden = forbiddenIn(written, exercise.forbid);
    if (!(e instanceof LeanTimeout) || !forbidden.length) throw e;
    return { solved: false, goals: [], cursorGoals: null, error: null, diagnostics: [], forbidden, refusal: null };
  }
  // A `ring` that did not finish says so in a note, not an error: whether it
  // failed is read from the goals on either side of it (proof.ts
  // `ringNotes`). The same source again costs Lean no elaboration.
  const notes = ringNotes(result.diagnostics);
  const around = notes.length ? (await lean.check("exercise", source, notes.flatMap((d) => [d.start, d.end]))).goals : [];
  const diagnostics = toBody(ringFailures(result.diagnostics, notes, around), body, given);
  const verdict = judge(diagnostics, body, exercise.forbid, axiomsOf(result.diagnostics, body, given), replayOf(result.diagnostics, body, given), written);
  return {
    solved: verdict.solved,
    goals: result.structured[0] ? withRemoved(result.structured[0], last ? result.structured[positions.length - 1] : null) : parseGoals(result.goals[0] ?? []),
    cursorGoals: cursor && result.goals[1]?.length ? goalsAt(result, 1) : cursor && otherwise && result.goals[2] ? goalsAt(result, 2) : cursor && result.goals[1] ? [] : null,
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
  // A fixed answer needs no Lean, so it is marked even while Lean is down.
  const fixed = isFixed(exercise.kind);
  const reply = fixed ? checkFixed(exercise, body) : await withLean((lean) => checkExercise(lean, exercise, body, cursor));
  // Looking at an empty gap is not an attempt at it, nor is choosing the
  // right side of a true-or-false before writing anything (the wrong side
  // is), nor asking for the state a prediction starts from.
  const tf = exercise.kind === "truefalse" ? readAnswer(body) : null;
  const bare =
    ((exercise.kind === "fill" || exercise.kind === "predict" || fixed) && !body.trim()) ||
    (tf !== null && (typeof tf === "string" || (bareAnswer(tf, exercise.truefalse!.witness) && reply.refusal === null)));
  if (!bare) await keep(lesson.id, exercise.id, body, reply, input.record, exercise.kind === "prove" && isLadder(input.ladder) && !(onBoard(input.ladder) && exercise.mode === "typed") ? input.ladder : null);
  sendJson(res, 200, reply);
}

/** Which checks become attempt rows (wire.ts CheckRequest.record). A check
 *  with no `record` is not an attempt. A live or board solve is kept once a
 *  day (a proof typed live is re-checked on every pause); a submitted one is
 *  always kept, and the mastery replay counts a repeat of the row before it
 *  on the same day only once (web/shared/progress.ts). On a later day a
 *  solve is kept again: then it is a review. */
async function keep(lessonId: string, exerciseId: string, body: string, reply: CheckReply, record: unknown, ladder: number | null): Promise<void> {
  // First: a check that records nothing must not need the database.
  if (record !== "rejected" && record !== "submitted" && record !== "live") return;
  const refused = reply.error !== null || reply.forbidden.length > 0 || reply.refusal !== null;
  const db = rawDb();
  const learner = await learnerId();
  // The Tutor's hints on this exercise today: rung 3 gave the line, and
  // makes the check assisted (seen, not credited).
  const rung = (await hintRung(db, learner, lessonId, exerciseId, startOfDay(new Date()))) || null;
  if (reply.solved) {
    if (record !== "submitted" && (await solvedSince(db, learner, lessonId, exerciseId, startOfDay(new Date())))) return;
    await recordAttempt(db, learner, { lessonId, exerciseId, body, solved: true, rung, inputRung: ladder });
    return;
  }
  if (record === "submitted" || (record === "rejected" && refused)) {
    const reading = (await findExercise(lessonId, exerciseId))?.kind;
    const error = reply.error?.message ?? reply.refusal ?? (reply.forbidden.length ? `uses ${reply.forbidden.join(", ")}` : reading && isReading(reading) ? "a wrong answer" : "unsolved goals");
    await recordAttempt(db, learner, { lessonId, exerciseId, body, solved: false, error, rung, inputRung: ladder });
  }
}

export async function handlePlayground(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "POST") return methodNotAllowed(res, "POST");
  const input = await readJsonBody<Partial<PlaygroundRequest>>(req);
  if (typeof input.source !== "string") throw new HttpError(400, "source is required");
  if (input.source.length > MAX_SOURCE) throw new HttpError(413, "that file is too long");
  const cursor = isPosition(input.cursor) ? input.cursor : undefined;
  const source = input.source.endsWith("\n") ? input.source : `${input.source}\n`;
  const result = await withLean((lean) => lean.check("playground", source, cursor ? [cursor] : [], true));
  const reply: PlaygroundReply = {
    // Everything Lean said, linters included: here the file is the learner's own.
    diagnostics: result.diagnostics.map((d) => ({ severity: d.severity, message: d.message, line: d.start.line, range: { start: d.start, end: d.end } })),
    cursorGoals: cursor && result.goals[0] ? goalsAt(result, 0) : null,
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
      void restartTutorLean();
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

/** An exercise by its ids, from the content as now loaded. */
async function findExercise(lessonId: string, exerciseId: string): Promise<Exercise | undefined> {
  return loadContent().lessons.find((l) => l.id === lessonId)?.exercises.find((e) => e.id === exerciseId);
}
