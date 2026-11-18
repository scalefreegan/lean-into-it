import assert from "node:assert/strict";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { Readable } from "node:stream";
import { after, before, test } from "node:test";
import { attemptCount, ensureLearner, solvedFor } from "../../scripts/db/progress.ts";
import { freshDb } from "../../scripts/tests/testdb.mjs";
import type { CheckReply, CheckRequest, PlaygroundReply, LeanStatus } from "../shared/wire.ts";
import type { Exercise } from "../shared/content.ts";
import { explain } from "../shared/explain.ts";
import { EXERCISES } from "../shared/registry.ts";
import { misfit, moveLine, readLine } from "../shared/moves.ts";
import { assemble, axiomsOf, toBody } from "../shared/proof.ts";
import { checkExercise, handleCheck, handleLean, handlePlayground, leanError } from "./check.ts";
import { checkSolution, checkWithLean } from "./contentcheck.ts";
import { setDb, type Db } from "./db.ts";
import { LeanTimeout, LeanUnavailable, leanProblem, leanServer, type LeanServer } from "./lean/lsp.ts";
import { loadContent } from "./loader.ts";
import { documentedLesson } from "./doclesson.ts";
import type { HttpError } from "./sse.ts";

// The tests that need a real Lean: they start `lake serve` in lean/ and
// check real proofs, so the first one waits for Mathlib to load (tens of
// seconds). Skipped, loudly, where Lean is not installed
// (`npm run lean:setup`). The database is an in-process PGlite.

const problem = leanProblem();
const skip = problem ? `Lean is not installed: ${problem}` : false;
if (skip) console.warn(`[lean.test] SKIPPED, nothing here was checked. ${skip}`);

const content = loadContent(path.resolve(import.meta.dirname, "../../content"));
const lesson = content.lessons.find((l) => l.id === "logic-1-if-then")!;
const exercise = (id: string) => lesson.exercises.find((e) => e.id === id)!;

let db: Db;
let closeDb: () => Promise<void>;

before(async () => {
  const fresh = await freshDb();
  db = fresh.db;
  closeDb = fresh.close;
  setDb(db);
});

after(async () => {
  leanServer().stop();
  setDb(null);
  await closeDb();
});

/** Call a handler as the dev server would, minus HTTP. */
async function call<T>(handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>, body: unknown): Promise<{ status: number; reply: T }> {
  const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), { method: "POST", headers: {}, url: "/" }) as unknown as IncomingMessage;
  let status = 0;
  let text = "";
  const res = {
    writeHead(code: number) {
      status = code;
      return this;
    },
    end(chunk?: string) {
      text = chunk ?? "";
    },
  } as unknown as ServerResponse;
  await handler(req, res);
  return { status, reply: JSON.parse(text) as T };
}

const post = (body: Partial<CheckRequest>) => call<CheckReply>(handleCheck, body);

test("every exercise's reference solution is accepted by Lean", { skip }, async () => {
  assert.deepEqual(content.problems, []);
  let checked = 0;
  for (const l of content.lessons) {
    for (const e of l.exercises) {
      const reply = await checkExercise(leanServer(), e, e.solution);
      assert.equal(reply.solved, true, `${l.id}/${e.id}: ${JSON.stringify(reply.diagnostics)}`);
      assert.deepEqual(reply.goals, [], `${l.id}/${e.id} leaves no goal`);
      checked++;
    }
  }
  assert.ok(checked >= 5, `checked ${checked} exercises`);
});

test("every board solution is what the board's own clicks write, against the goals Lean reports", { skip }, async () => {
  // The reference solutions are typed by hand; the board writes its lines
  // with moveLine from Lean's goals. Replaying each solution through moveLine
  // catches a name or a pattern the board would get wrong.
  let lines = 0;
  for (const l of content.lessons) for (const e of l.exercises.filter((x) => x.mode === "board")) lines += await replay(`${l.id}/${e.id}`, e);
  assert.ok(lines >= 80, `replayed ${lines} lines`);
});

/** Replay a board exercise's solution as clicks: each line must be offered,
 *  fit the goal Lean reports there, and be the line the board would write. */
async function replay(label: string, e: Exercise): Promise<number> {
  const solution = e.solution.split("\n").filter((s) => s.trim());
  for (let i = 0; i < solution.length; i++) {
    const want = solution[i];
    const read = readLine(want);
    assert.ok(read && e.moves.includes(read.move.id), `${label}: "${want}" is not a move this exercise offers`);
    const { move, arg } = read;
    const state = await checkExercise(leanServer(), e, solution.slice(0, i).join("\n"));
    assert.equal(misfit(move, state.goals[0]), null, `${label} line ${i + 1}: the board would refuse "${want}"`);
    assert.equal(moveLine(move, state.goals[0], arg), want, `${label} line ${i + 1}`);
  }
  return solution.length;
}

test("a switched-off tactic that runs out Lean's time is still named as switched off", async () => {
  const slow = { check: () => Promise.reject(new LeanTimeout("Lean took longer than 20 seconds on this and gave up.")) } as unknown as LeanServer;
  const guarded = { ...exercise("use-it"), forbid: ["tauto"] };
  const reply = await checkExercise(slow, guarded, "try?");
  assert.deepEqual([reply.solved, reply.forbidden, reply.error, reply.goals], [false, ["try?"], null, []]);
  // Anything else that runs out of time is reported as that,
  await assert.rejects(checkExercise(slow, guarded, "exact hPQ hP"), LeanTimeout);
  // and so is every other failure of Lean, switched-off tactic or not.
  const down = { check: () => Promise.reject(new LeanUnavailable("Lean is stopped.")) } as unknown as LeanServer;
  await assert.rejects(checkExercise(down, guarded, "try?"), /Lean is stopped/);
});

test("refusals a learner can reach on the board get a plain sentence, from Lean's real message", { skip }, async () => {
  const find = (lessonId: string, id: string) => content.lessons.find((l) => l.id === lessonId)!.exercises.find((e) => e.id === id)!;
  const cases: [string, string, string, RegExp][] = [
    ["logic-1-there-exists", "pass-it-on", "obtain ⟨h1, h2⟩ := hPQ", /^hPQ says “∀ \(n : ℕ\), P n → Q n”, which has no parts/],
    ["logic-1-there-exists", "a-square", "use -7", /no negative numbers/],
    ["logic-1-there-exists", "a-square", "use 2.5", /decimal point/],
    ["logic-1-there-exists", "from-a-fact", "use h4", /^h4 is a fact/],
    ["logic-1-iff", "forwards", "apply h", /Take it apart with obtain first/],
    ["logic-1-not", "anything", "apply hnP", /hnP ends in “False”, but the goal is “Q”/],
    ["logic-1-or", "go-left", "exact hP", /hP says “P”, but the goal is “P ∨ Q”/],
    ["logic-1-and", "prove-both", "left", /^left chooses a side/],
    ["logic-1-and", "take-apart", "obtain ⟨h1, h2⟩ := h\nobtain ⟨h3, h4⟩ := h1", /^h1 says “P”, which has no parts/],
    ["logic-1-not", "at-once", "exfalso\ncontradiction\ncontradiction", /already finished/],
  ];
  for (const [lessonId, id, body, plain] of cases) {
    const reply = await checkExercise(leanServer(), find(lessonId, id), body);
    assert.ok(reply.error, `${id}: "${body}" should be refused`);
    assert.match(explain(reply.error.message) ?? "(no plain sentence)", plain, `${id}: ${reply.error.message}`);
  }
});

test("Level 3's refusals get a true sentence, from Lean's real message", { skip }, async () => {
  const find = (lessonId: string, id: string) => content.lessons.find((l) => l.id === lessonId)!.exercises.find((e) => e.id === id)!;
  const cases: [string, string, string, RegExp][] = [
    ["math-3-real-numbers", "halves", "rfl", /^Lean cannot work/],
    ["math-3-real-numbers", "halves", "decide", /a real number cannot be computed with/],
    ["math-3-identities", "with-a-fact", "ring", /^ring could not prove this.*does not read/],
    ["math-3-equations", "solve", "ring", /^ring could not prove this/],
    ["math-3-inequalities", "times-nonneg", "linarith", /a product of two letters/],
    ["math-3-inequalities", "between", "linarith", /^linarith found no comparison to prove/],
    ["math-3-inequalities", "a-square", "linarith", /a product of two letters/],
    ["math-3-inequalities", "from-the-square", "positivity", /^positivity proves goals of the form/],
    ["math-3-absolute-value", "never-negative", "linarith", /so are \|x\| and f\(x\)/],
    ["math-3-calc", "side-by-side", "linarith", /a product of two letters/],
    ["math-3-calc", "two-links", "calc a ≤ b := h1\n  _ ≥ a := h1", /a “≤” link and then a “≥” link/],
    ["math-3-functions", "increasing", "rw [hf]", /^rw found no “f \?x” it can replace.*intro/],
    ["math-3-functions", "increasing", "linarith", /^linarith found no comparison to prove/],
    ["math-3-functions", "increasing-twice", "intro x\nintro y\nintro h\ngcongr", /a function that is not known to be increasing/],
  ];
  for (const [lessonId, id, body, plain] of cases) {
    const reply = await checkExercise(leanServer(), find(lessonId, id), body);
    assert.ok(reply.error, `${id}: "${body}" should be refused`);
    assert.match(explain(reply.error.message) ?? "(no plain sentence)", plain, `${id}: ${reply.error.message}`);
  }
});

test("a ring that did not finish is refused; a ring that finished the long way is not", { skip }, async () => {
  const find = (lessonId: string, id: string) => content.lessons.find((l) => l.id === lessonId)!.exercises.find((e) => e.id === id)!;
  // Lean raises no error for a ring that leaves its goal open, only a note:
  // the board would have shown the rewritten goal as progress.
  const identity = find("math-3-identities", "square-of-a-sum");
  const stuck = await checkExercise(leanServer(), { ...identity, statement: "(a b : ℝ) : (a + b) ^ 2 = a ^ 2 + b ^ 2" }, "ring");
  assert.equal(stuck.solved, false);
  assert.equal(stuck.error?.line, 0);
  assert.equal(stuck.error?.message, "The `ring` tactic failed to close the goal.");

  // Inside |…| ring closes the goal by its second method and prints the
  // same note. That line is right, and is never called wrong.
  const triangle = find("math-3-absolute-value", "triangle");
  const link = "calc |a - c| = |(a - b) + (b - c)| := by ring";
  const first = await checkExercise(leanServer(), triangle, link);
  assert.equal(first.solved, false);
  assert.equal(first.error, null, "the first link alone is unfinished, not wrong");
  const whole = await checkExercise(leanServer(), triangle, `${link}\n  _ ≤ |a - b| + |b - c| := abs_add_le (a - b) (b - c)`);
  assert.equal(whole.solved, true);
  const second = await checkExercise(leanServer(), triangle, `${link}\n  _ ≤ |a - b| + |b - c| := by gcongr`);
  assert.equal(second.error?.line, 1, "the wrong line is the second, not the ring on the first");

  // Two goals, the first closed by ring's second method: one goal fewer is not a failure.
  const two = { ...identity, statement: "(a b : ℝ) : |a + b| = |b + a| ∧ a * b = b * a" };
  const half = await checkExercise(leanServer(), two, "constructor\nring");
  assert.equal(half.error, null);
  assert.deepEqual(half.goals.map((g) => g.target), ["a * b = b * a"]);
  assert.equal((await checkExercise(leanServer(), two, "constructor\nring\nring")).solved, true);
  // And a ring that fails in a nested `by` is blamed on its own line.
  const nested = await checkExercise(leanServer(), { ...identity, statement: "(x y : ℝ) (h : x = y) : x = y" }, "have h2 : x * 1 = y + 1 := by ring\nexact h");
  assert.equal(nested.error?.line, 0);
  assert.match(nested.error?.message ?? "", /ring. tactic failed/);
});

test("try? and the other one-line ways round a by-hand exercise are switched off", { skip }, async () => {
  const find = (lessonId: string, id: string) => content.lessons.find((l) => l.id === lessonId)!.exercises.find((e) => e.id === id)!;
  const cases: [string, string, string[]][] = [
    ["math-3-real-numbers", "a-rule-by-name", ["try?", "ring1_nf", "field", "grobner", "algebra", "group"]],
    ["math-3-identities", "by-hand", ["try?", "ring1_nf", "field", "grobner", "algebra", "group"]],
    ["math-3-inequalities", "both-steps", ["try?"]],
    ["math-3-calc", "it-grows", ["try?", "field_simp\nexact h"]],
    ["math-3-absolute-value", "triangle", ["try?", "simpa [Real.norm_eq_abs] using norm_sub_le_norm_sub_add_norm_sub a b c"]],
  ];
  for (const [lessonId, id, bodies] of cases) {
    for (const body of bodies) {
      const reply = await checkExercise(leanServer(), find(lessonId, id), body);
      assert.equal(reply.solved, false, `${id}: ${body}`);
      assert.ok(reply.forbidden.length > 0, `${id}: "${body}" should be named as switched off`);
    }
  }
});

test("an empty proof is not solved, and Lean reports the opening goal", { skip }, async () => {
  const reply = await checkExercise(leanServer(), exercise("use-it"), "");
  assert.equal(reply.solved, false);
  assert.equal(reply.error, null);
  assert.equal(reply.goals.length, 1);
  assert.equal(reply.goals[0].target, "Q");
  assert.deepEqual(
    reply.goals[0].hypotheses.map((h) => `${h.names.join(" ")} : ${h.type}`),
    ["P Q : Prop", "hP : P", "hPQ : P → Q"],
  );
});

test("a right move changes the goal; a wrong move is an error on its line", { skip }, async () => {
  const right = await checkExercise(leanServer(), exercise("use-it"), "apply hPQ");
  assert.equal(right.solved, false);
  assert.equal(right.error, null);
  assert.equal(right.goals[0].target, "P");

  const wrong = await checkExercise(leanServer(), exercise("use-it"), "apply hPQ\nexact hPQ");
  assert.equal(wrong.solved, false);
  assert.equal(wrong.error?.line, 1);
  assert.match(wrong.error?.message ?? "", /mismatch/i);
});

test("sorry is refused, though Lean reports no error for it", { skip }, async () => {
  for (const body of ["sorry", "apply hPQ\nsorry", "exact sorry"]) {
    const reply = await checkExercise(leanServer(), exercise("use-it"), body);
    assert.equal(reply.solved, false, body);
    assert.equal(reply.error, null, body);
  }
});

test("a proof cannot hide its errors by naming something after a linter", { skip }, async () => {
  for (const body of ["exact linter.nope", "have linter.x : True := trivial", "exact linter.style.whitespace"]) {
    const reply = await checkExercise(leanServer(), exercise("use-it"), body);
    assert.equal(reply.solved, false, body);
    assert.ok(reply.diagnostics.some((d) => d.severity === "error"), `${body}: Lean's error is reported`);
  }
});

test("a linter's remark about an unused assumption does not fail a correct proof", { skip }, async () => {
  // "ignore" assumes Q and never uses it: Lean's unused-variable linter may remark on that.
  const e = exercise("ignore");
  const reply = await checkExercise(leanServer(), e, e.solution);
  assert.equal(reply.solved, true);
  assert.deepEqual(reply.diagnostics, []);
});

test("a forbidden tactic is refused even where Lean accepts the proof", { skip }, async () => {
  const typed = exercise("typed");
  assert.ok(typed.forbid.includes("tauto"));
  const banned = await checkExercise(leanServer(), typed, "tauto");
  assert.deepEqual(banned.forbidden, ["tauto"]);
  assert.equal(banned.solved, false);
  // The guard is what refused it: the same proof passes with the ban lifted.
  const lifted = await checkExercise(leanServer(), { ...typed, forbid: [] }, "tauto");
  assert.equal(lifted.solved, true);
});

const FALSE = { ...exercise("use-it"), id: "false", statement: "(P Q : Prop) : Q", solution: "" };

test("classical reasoning and Mathlib's automation are accepted; their axioms are the allowed ones", { skip }, async () => {
  const em = { ...exercise("use-it"), statement: "(P : Prop) : P ∨ ¬P" };
  for (const body of ["exact Classical.em P", "by_contra h\nexact h (Classical.em P)", "tauto"]) {
    const reply = await checkExercise(leanServer(), em, body);
    assert.equal(reply.solved, true, `${body}: ${JSON.stringify([reply.refusal, reply.diagnostics])}`);
  }
  const arithmetic = { ...exercise("use-it"), statement: "(n : ℕ) : n + 0 = n" };
  for (const body of ["simp", "omega", "rfl"]) assert.equal((await checkExercise(leanServer(), arithmetic, body)).solved, true, body);
});

test("a false statement cannot be graded solved by a proof that adds its own axiom or theorem", { skip }, async () => {
  const bodies = [
    // Add an axiom saying False, then use it.
    "run_tac Lean.addDecl (.axiomDecl { name := `cheatAx, levelParams := [], type := Lean.mkConst ``False, isUnsafe := false })\nexact (cheatAx).elim",
    // Add a theorem the kernel is told not to check.
    "set_option debug.skipKernelTC true in\nexact False.elim (by trivial)",
    "open Lean Elab Tactic in run_tac do\n  let g ← getMainGoal\n  g.admit",
    "exact by_elab return Lean.mkConst ``False",
    "native_decide",
  ];
  for (const body of bodies) {
    const reply = await checkExercise(leanServer(), FALSE, body);
    assert.equal(reply.solved, false, body);
    assert.ok(reply.refusal, `${body}: says why`);
  }
});

test("with the word list out of the way, the axiom report alone refuses an added axiom", { skip }, async () => {
  // What checkExercise does after its word check, done by hand: the layers are independent.
  // (Lean lets a theorem's proof add declarations only under the theorem's own name.)
  const body = "run_tac Lean.addDecl (.axiomDecl { name := `lii_exercise.cheat, levelParams := [], type := Lean.mkConst ``False, isUnsafe := false })\nexact (lii_exercise.cheat).elim";
  const result = await leanServer().check("exercise", assemble(FALSE.statement, body), []);
  assert.deepEqual(toBody(result.diagnostics, body).filter((d) => d.severity === "error"), [], "Lean itself raises no error for this");
  assert.deepEqual(axiomsOf(result.diagnostics, body), ["lii_exercise.cheat"]);
});

test("a body cannot end the theorem and write commands of its own, nor stop Lean before the axiom report", { skip }, async () => {
  const good = exercise("use-it");
  // Refused by the bracket rule and the command rule before Lean sees them...
  for (const body of ["exact hPQ hP\n)\nexample : True := (trivial", "exact hPQ hP\n#exit", "exact hPQ hP\n#eval 1"]) {
    const reply = await checkExercise(leanServer(), good, body);
    assert.equal(reply.solved, false, body);
    assert.ok(reply.refusal, body);
  }
  // ...and by Lean where a command is simply written inside the proof: inside the brackets it does not parse.
  const inside = await checkExercise(leanServer(), good, "exact hPQ hP\nexample : True := trivial");
  assert.equal(inside.solved, false);
  assert.ok(inside.diagnostics.some((d) => d.severity === "error"));
  // #exit handed straight to Lean (the word check bypassed): no axiom report arrives, and that alone refuses it.
  const body = "exact hPQ hP\n  )\n#exit\n  (";
  const result = await leanServer().check("exercise", assemble(good.statement, body), []);
  assert.equal(axiomsOf(result.diagnostics, body), null);
});

test("a string or a comment does not hide a forbidden tactic", { skip }, async () => {
  const typed = exercise("typed");
  for (const body of ['have := "--"; tauto', 'have := "/-"\ntauto\n-- -/']) {
    const reply = await checkExercise(leanServer(), typed, body);
    assert.deepEqual(reply.forbidden, ["tauto"], body);
    assert.equal(reply.solved, false, body);
  }
});

test("the goals at the cursor are those before the line the caret starts", { skip }, async () => {
  const reply = await checkExercise(leanServer(), exercise("chain"), "intro hP\napply hQR\napply hPQ\nexact hP", { line: 1, character: 0 });
  assert.equal(reply.solved, true);
  assert.equal(reply.cursorGoals?.[0].target, "R");
  assert.ok(reply.cursorGoals?.[0].hypotheses.some((h) => h.names.includes("hP")));
});

test("/api/check records a rejected move and the first solve, and nothing for a live re-check", { skip }, async () => {
  const learner = await ensureLearner(db);
  const base = { lessonId: lesson.id, exerciseId: "prove-it" };
  const count = () => attemptCount(db, learner, lesson.id, "prove-it");

  // A valid step on the board: not finished, not a failure, not recorded.
  assert.equal((await post({ ...base, body: "intro hP", record: "rejected" })).reply.solved, false);
  assert.equal(await count(), 0);
  // A wrong move on the board is recorded.
  const wrong = await post({ ...base, body: "exact hP", record: "rejected" });
  assert.equal(wrong.status, 200);
  assert.ok(wrong.reply.error);
  assert.equal(await count(), 1);
  // A live check of an unfinished proof (no `record`) is not.
  await post({ ...base, body: "intro hP" });
  assert.equal(await count(), 1);
  // Pressing Check on an unfinished proof is.
  await post({ ...base, body: "intro hP", record: "submitted" });
  assert.equal(await count(), 2);
  // The first solve is recorded and marks the exercise solved...
  assert.equal((await post({ ...base, body: "intro hP\nexact hP" })).reply.solved, true);
  assert.equal(await count(), 3);
  assert.deepEqual((await solvedFor(db, learner)).map((r) => [r.exerciseId, r.solution]), [["prove-it", "intro hP\nexact hP"]]);
  // ...and a live re-check of the solved proof adds nothing.
  await post({ ...base, body: "intro hP\nexact hP" });
  assert.equal(await count(), 3);
});

const fills = content.lessons.flatMap((l) => l.exercises.filter((e) => e.kind === "fill").map((e) => ({ lesson: l, e })));
/** The choice form, from the lessons: the gap is a move after `by` in a calc link. */
const choiceFill = content.lessons.find((l) => l.id === "math-3-calc")!.exercises.find((e) => e.id === "which-reason")!;
/** The typed form, from the lessons: the gap is a term, the reason for a calc link. */
const termFill = content.lessons.find((l) => l.id === "math-3-absolute-value")!.exercises.find((e) => e.id === "add-one")!;
/** A gap inside a move, with lines of the proof after it. */
const typedFill = { ...termFill, id: "edge", statement: "(x : ℝ) (h : |x - 3| < 1) : 2 < x", proof: "rw [<gap>] at h\nobtain ⟨h1, h2⟩ := h\nlinarith", forbid: [], solution: "abs_lt" };
const target = (reply: CheckReply) => reply.cursorGoals?.map((g) => g.target);

test("fill the gap: Lean refuses every option but the solution", { skip }, async () => {
  assert.ok(fills.length >= 2, `${fills.length} fill exercises`);
  let refused = 0;
  for (const { lesson: l, e } of fills) {
    for (const option of e.options.filter((o) => o !== e.solution)) {
      const reply = await checkExercise(leanServer(), e, option);
      assert.equal(reply.solved, false, `${l.id}/${e.id}: the option "${option}" also completes the proof`);
      refused++;
    }
  }
  assert.ok(refused >= 3, `${refused} wrong options refused`);
});

test("fill the gap: Lean judges the proof with the fill in place, and says where it went wrong", { skip }, async () => {
  assert.equal((await checkExercise(leanServer(), typedFill, " abs_lt ")).solved, true);
  // An empty gap is never solved, though the state is read with the solution in place.
  const empty = await checkExercise(leanServer(), typedFill, "  ");
  assert.deepEqual([empty.solved, empty.refusal, empty.error, empty.goals], [false, null, null, []]);

  // A fact that does not fit: the error is on the gap's line.
  const wrong = await checkExercise(leanServer(), typedFill, "abs_nonneg");
  assert.equal(wrong.solved, false);
  assert.equal(wrong.error?.line, 0);
  // A name Lean has never heard of.
  const unknown = await checkExercise(leanServer(), typedFill, "abs_window");
  assert.equal(unknown.solved, false);
  assert.match(unknown.error?.message ?? "", /abs_window/i);
  // Another fact that also does the job is accepted: there is no answer key.
  assert.equal((await checkExercise(leanServer(), typedFill, "abs_sub_lt_iff")).solved, true);
  assert.equal((await checkExercise(leanServer(), termFill, "abs_add_le _ _")).solved, true);
  // A fill Lean accepts on its own line, which breaks a later line of the
  // proof: the error is on that line, and is said in words a learner can read.
  const later = await checkExercise(leanServer(), typedFill, "abs_sub_comm");
  assert.equal(later.solved, false);
  assert.equal(later.error?.line, 1);
  assert.match(explain(later.error?.message ?? "") ?? "", /^h is not a fact with parts to take apart/);
  // The right fact for the wrong numbers.
  const swapped = await checkExercise(leanServer(), termFill, "abs_add_le 1 x");
  assert.equal(swapped.solved, false);
  assert.equal(swapped.error?.line, 0);
  // A step Lean can read that does not finish the proof.
  const weak = await checkExercise(leanServer(), { ...typedFill, proof: "<gap>" }, "skip");
  assert.deepEqual([weak.solved, weak.error], [false, null]);

  // The marker is not Lean: a proof whose gap was never filled is not a proof.
  assert.equal((await checkExercise(leanServer(), { ...typedFill, kind: "prove" }, typedFill.proof)).solved, false);
  // sorry in the gap is still sorry, and it is Lean that says so.
  const sorry = await checkExercise(leanServer(), { ...typedFill, proof: "<gap>" }, "sorry");
  assert.equal(sorry.solved, false);
  assert.ok(sorry.diagnostics.some((d) => /declaration uses .?sorry/.test(d.message)), JSON.stringify(sorry.diagnostics));
});

test("fill the gap: the state shown is what the missing step has to prove", { skip }, async () => {
  // A move after `by` in a calc link: the link, not the whole statement.
  assert.deepEqual(target(await checkExercise(leanServer(), choiceFill, "")), ["x + y ≤ 2 + 3"]);
  assert.deepEqual(target(await checkExercise(leanServer(), choiceFill, "gcongr")), ["x + y ≤ 2 + 3"]);
  assert.deepEqual(target(await checkExercise(leanServer(), choiceFill, "norm_num")), ["x + y ≤ 2 + 3"]);
  // A gap inside a move: the state the move starts from.
  const inside = await checkExercise(leanServer(), typedFill, "");
  assert.deepEqual(target(inside), ["2 < x"]);
  assert.deepEqual(inside.cursorGoals?.[0].hypotheses.map((h) => h.type), ["ℝ", "|x - 3| < 1"]);
  // A gap under a bullet: that case alone.
  const bullet = { ...typedFill, statement: "(P Q : Prop) (hP : P) (hQ : Q) : P ∧ Q", proof: "constructor\n· <gap>\n· exact hQ", solution: "exact hP" };
  assert.deepEqual(target(await checkExercise(leanServer(), bullet, "")), ["P"]);
  assert.deepEqual(target(await checkExercise(leanServer(), bullet, "exact hQ")), ["P"]);
  // A gap that is a term has no state of its own: the start of its line.
  assert.deepEqual(target(await checkExercise(leanServer(), termFill, "")), ["|x + 1| ≤ |x| + 1"]);
});

test("fill the gap: a fill stays in its gap, and a choice must be one on offer", { skip }, async () => {
  for (const [fill, why] of [
    ["abs_lt] at h\nobtain ⟨h1, h2⟩ := h\nlinarith\n--", /one line/],
    ["abs_lt] at h; obtain ⟨h1, h2⟩ := h; linarith --", /comment/],
    ["abs_lt] at h; obtain ⟨h1, h2⟩ := h; linarith; simp [", /closes a bracket/],
    ['abs_lt, "', /string is opened/],
    ["abs_lt, show True by run_tac pure ()", /run_tac/],
  ] as const) {
    const reply = await checkExercise(leanServer(), typedFill, fill);
    assert.equal(reply.solved, false, fill);
    assert.match(reply.refusal ?? "", why, fill);
  }
  // The choice form takes what it offers and nothing else, though Lean would accept it.
  assert.equal((await checkExercise(leanServer(), choiceFill, "gcongr")).solved, true);
  const typedIn = await checkExercise(leanServer(), choiceFill, "linarith");
  assert.equal(typedIn.solved, false);
  assert.match(typedIn.refusal ?? "", /not one of the choices/);
  assert.equal((await checkExercise(leanServer(), { ...choiceFill, options: [] }, "linarith")).solved, true);
  // The forbid list is about the fill: the proof around it uses linarith freely.
  assert.equal((await checkExercise(leanServer(), { ...typedFill, forbid: ["linarith", "abs_sub_lt_iff"] }, "abs_lt")).solved, true);
  const banned = await checkExercise(leanServer(), { ...typedFill, forbid: ["abs_lt"] }, "abs_lt");
  assert.deepEqual([banned.solved, banned.forbidden], [false, ["abs_lt"]]);
  const lazy = await checkExercise(leanServer(), termFill, "by simp");
  assert.deepEqual([lazy.solved, lazy.forbidden], [false, ["simp"]]);
});

test("/api/check on a fill-the-gap exercise takes the fill, and records it", { skip }, async () => {
  const learner = await ensureLearner(db);
  const base = { lessonId: "math-3-absolute-value", exerciseId: "add-one" };
  const count = () => attemptCount(db, learner, base.lessonId, base.exerciseId);
  // Looking at the empty gap is not an attempt, however it is sent.
  assert.equal((await post({ ...base, body: "" })).reply.solved, false);
  assert.equal((await post({ ...base, body: "  ", record: "submitted" })).reply.solved, false);
  assert.equal(await count(), 0);
  assert.equal((await post({ ...base, body: "abs_nonneg x", record: "submitted" })).reply.solved, false);
  assert.equal(await count(), 1);
  assert.equal((await post({ ...base, body: " abs_add_le x 1 ", record: "submitted" })).reply.solved, true);
  assert.equal(await count(), 2);
  // What is kept is the learner's fill, not the proof it went into, and not the spaces around it.
  assert.deepEqual((await solvedFor(db, learner)).filter((r) => r.exerciseId === "add-one").map((r) => r.solution), ["abs_add_le x 1"]);
});

test("the exercise examples in the reference are real: Lean accepts each solution and refuses each other option", { skip }, async () => {
  let checked = 0;
  for (const [kind, spec] of Object.entries(EXERCISES)) {
    for (const [i, example] of spec.examples.entries()) {
      const e = { ...exercise("use-it"), given: "", moves: [], forbid: [], proof: "", options: [], ...example, kind, id: `${kind}-${i}` } as Exercise;
      assert.deepEqual((await checkSolution(leanServer(), e)).problems, [], `${kind} example ${i + 1}`);
      if (kind === "prove" && example.mode === "board") assert.ok((await replay(`${kind} example ${i + 1}`, e)) > 0);
      checked++;
    }
  }
  assert.ok(checked >= 4);
});

test("the complete lesson in docs/CONTENT.md is real: Lean accepts its solutions and refuses its other option", { skip }, async () => {
  const { dir } = documentedLesson();
  try {
    const pass = await checkWithLean(leanServer(), loadContent(dir), { dir });
    assert.deepEqual(pass.problems, []);
    assert.deepEqual([pass.counts.lessons, pass.counts.solutions, pass.counts.options], [1, 2, 1]);
    for (const e of loadContent(dir).lessons[0]!.exercises.filter((x) => x.mode === "board")) assert.ok((await replay(`CONTENT.md/${e.id}`, e)) > 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a failure of Lean reaches the browser as a 503 with its own sentence and a code", () => {
  const timeout = leanError(new LeanTimeout("Lean took longer than 20 seconds on this and gave up.")) as HttpError;
  assert.deepEqual([timeout.status, timeout.code, timeout.message], [503, "lean_timeout", "Lean took longer than 20 seconds on this and gave up."]);
  const down = leanError(new LeanUnavailable("Lean is stopped.")) as HttpError;
  assert.deepEqual([down.status, down.code, down.message], [503, "lean_unavailable", "Lean is stopped."]);
  // Anything else is a bug of ours and stays one.
  const bug = new TypeError("x is not a function");
  assert.equal(leanError(bug), bug);
});

test("/api/lean says what Lean is doing, and /api/lean/restart starts it again", { skip }, async () => {
  const ask = async (method: string, url: string) => {
    let status = 0;
    let text = "";
    const res = { writeHead: (code: number) => ((status = code), res), end: (chunk?: string) => void (text = chunk ?? "") } as unknown as ServerResponse;
    await handleLean(Object.assign(Readable.from([]), { method, headers: {}, url }) as unknown as IncomingMessage, res);
    return { status, reply: JSON.parse(text) as LeanStatus & { error?: string } };
  };
  await checkExercise(leanServer(), exercise("use-it"), "exact hPQ hP");
  for (const url of ["/", "", "/status", "/status?x=1"]) {
    const { status, reply } = await ask("GET", url);
    assert.equal(status, 200, url);
    assert.deepEqual({ state: reply.state, installed: reply.installed, problem: reply.problem }, { state: "ready", installed: true, problem: null }, url);
    assert.match(reply.toolchain ?? "", /^leanprover\/lean4:v/);
  }
  assert.equal((await ask("POST", "/")).status, 405);
  assert.equal((await ask("GET", "/restart")).status, 405);
  assert.equal((await ask("GET", "/elsewhere")).status, 404);
  // Restarting answers once the new server is up; its library is still loading.
  const restarted = await ask("POST", "/restart");
  assert.equal(restarted.status, 200);
  assert.equal(restarted.reply.state, "restarting");
  // And a check after it works.
  assert.equal((await checkExercise(leanServer(), exercise("use-it"), "exact hPQ hP")).solved, true);
  assert.equal((await ask("GET", "/")).reply.state, "ready");
});

test("/api/check refuses an exercise that does not exist", { skip }, async () => {
  await assert.rejects(post({ lessonId: lesson.id, exerciseId: "nope", body: "" }), /no such exercise/);
  await assert.rejects(post({ lessonId: lesson.id, exerciseId: "use-it" }), /required/);
});

test("the Playground reports everything Lean says, linters' remarks included, and grades nothing", { skip }, async () => {
  const source = "import Mathlib\n\nexample (P Q : Prop) (hP : P) (hQ : Q) : P := hP\n\n#check Nat.succ\n";
  const { status, reply } = await call<PlaygroundReply>(handlePlayground, { source, cursor: { line: 2, character: 0 } });
  assert.equal(status, 200);
  const unused = reply.diagnostics.find((d) => /`hQ` is not explicitly referenced/.test(d.message));
  assert.equal(unused?.severity, "warning");
  assert.match(unused?.message ?? "", /This linter can be disabled/);
  assert.ok(reply.diagnostics.some((d) => d.severity === "info" && d.line === 4), "the #check answer is there too");
  assert.equal("solved" in reply, false);
});

test("a refused body is never handed to Lean", async () => {
  // No Lean needed: one that is asked anything fails the test.
  const never = { check: () => Promise.reject(new Error("Lean was asked")) } as unknown as ReturnType<typeof leanServer>;
  for (const body of ["run_tac foo", "exact hP\n#eval 1", "exact hP\n)\nexample : True := (trivial", "set_option maxRecDepth 9 in\nexact hP"]) {
    const reply = await checkExercise(never, exercise("use-it"), body);
    assert.equal(reply.solved, false, body);
    assert.ok(reply.refusal, body);
  }
  await assert.rejects(checkExercise(never, exercise("use-it"), "exact hP"), /Lean was asked/);
});

test("a bracket left open, and a body of comments only, are unfinished proofs with their goals shown", { skip }, async () => {
  const open = await checkExercise(leanServer(), exercise("use-it"), "exact (hPQ hP");
  assert.equal(open.solved, false);
  assert.equal(open.error?.line, 0);
  const comment = await checkExercise(leanServer(), exercise("use-it"), "-- thinking");
  assert.equal(comment.solved, false);
  assert.equal(comment.error, null, JSON.stringify(comment.diagnostics));
  assert.equal(comment.goals[0]?.target, "Q");
});

test("an exercise with definitions of its own: goals, error lines and the axiom report all land where they should", { skip }, async () => {
  const e = content.lessons.find((l) => l.id === "programs-2-list-induction")!.exercises.find((x) => x.id === "len-app")!;
  assert.match(e.given, /def len/);
  const opened = await checkExercise(leanServer(), e, "induction' xs with x xs ih");
  assert.equal(opened.error, null);
  assert.deepEqual(opened.goals.map((g) => g.caseName), ["nil", "cons"]);
  // rfl cannot do the base case (0 + len ys): the error is on the learner's second line.
  // More lines follow it, so an error placed past the end of the body could not land there by luck.
  const wrong = await checkExercise(leanServer(), e, "induction' xs with x xs ih\nrfl\nsimp\nsimp\nrw [ih]");
  assert.equal(wrong.error?.line, 1);
  assert.match(wrong.error?.message ?? "", /^Tactic `rfl` failed/);
  assert.ok(!wrong.diagnostics.some((d) => /axioms/.test(d.message)), "the axiom report is not shown as a diagnostic");
  // The goal at the cursor is read at the right place too.
  const at = await checkExercise(leanServer(), e, e.solution, { line: 3, character: 0 });
  assert.equal(at.solved, true);
  assert.match(at.cursorGoals?.[0]?.target ?? "", /len \(app xs ys\) \+ 1/);
  // A learner cannot lean on a definition that is not the exercise's.
  const other = content.lessons.find((l) => l.id === "programs-2-first-function")!.exercises.find((x) => x.id === "test-len")!;
  assert.equal((await checkExercise(leanServer(), other, "exact len_app [] []")).solved, false);
});
