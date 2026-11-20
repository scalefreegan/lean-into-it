import assert from "node:assert/strict";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { Readable } from "node:stream";
import { after, before, test } from "node:test";
import { attemptCount, attemptsFor, ensureLearner, recordHint, solvedFor } from "../../scripts/db/progress.ts";
import { freshDb } from "../../scripts/tests/testdb.mjs";
import { authorRepo, LESSON_FILE, withExercise } from "../../scripts/tests/authorrepo.mjs";
import type { CheckReply, CheckRequest, PlaygroundReply, LeanStatus } from "../shared/wire.ts";
import type { Exercise } from "../shared/content.ts";
import { explain } from "../shared/explain.ts";
import { goalsText, sameGoals, unsolvedGoals, type Goal } from "../shared/goals.ts";
import { LAB_FIRST_LINE, labSource, TACTIC_EXAMPLES } from "../shared/lab.ts";
import { EXERCISES } from "../shared/registry.ts";
import { misfit, moveLine, readLine } from "../shared/moves.ts";
import { assemble, axiomsOf, judge, replayOf, toBody } from "../shared/proof.ts";
import { buildMap, type ProofMap } from "../shared/proofmap.ts";
import { checkExercise, handleCheck, handleGallery, handleLean, handlePlayground, leanError } from "./check.ts";
import { checkSolution, checkWithLean } from "./contentcheck.ts";
import { setDb, type Db } from "./db.ts";
import { LeanTimeout, LeanUnavailable, leanProblem, leanServer, tutorLean, type LeanServer } from "./lean/lsp.ts";
import { loadContent, trueFalseOf } from "./loader.ts";
import { documentedLesson } from "./doclesson.ts";
import type { HttpError } from "./sse.ts";
import { acceptedPart, handleTutor, lineProblem, setAgent } from "./tutor.ts";
import type { TutorReply } from "../shared/wire.ts";

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
let query: (text: string, params?: unknown[]) => Promise<unknown[]>;

before(async () => {
  const fresh = await freshDb();
  db = fresh.db;
  query = fresh.query;
  closeDb = fresh.close;
  setDb(db);
});

after(async () => {
  leanServer().stop();
  tutorLean().close();
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
      // A prediction is solved when Lean's state after the move is the one
      // picked, so it leaves goals; every other kind leaves none.
      if (e.kind !== "predict") assert.deepEqual(reply.goals, [], `${l.id}/${e.id} leaves no goal`);
      // Board exercises have their goals checked at every step by the replay below; a typed one, at its start.
      if (e.kind === "prove" && e.mode === "typed") {
        const start = await checkExercise(leanServer(), e, "");
        assert.ok(start.goals.length && start.goals.every((g) => g.targetTagged), `${l.id}/${e.id}: Lean's structured goals`);
      }
      checked++;
    }
  }
  assert.ok(checked >= 5, `checked ${checked} exercises`);
});

test("every Famous Proofs entry is a proof Lean accepts, its map draws every line and ends done, and /api/gallery records nothing", { skip }, async () => {
  const gallery = content.gallery ?? [];
  assert.ok(gallery.length >= 5, `${gallery.length} entries`);
  const attempts = async () => Number(((await query("select count(*) as n from attempts")) as { n: number | string }[])[0].n);
  const before = await attempts();
  for (const entry of gallery) {
    const { status, reply } = await call<CheckReply>(handleGallery, { id: entry.id });
    assert.equal(status, 200, entry.id);
    assert.equal(reply.solved, true, `${entry.id}: ${JSON.stringify(reply.diagnostics)}`);
    assert.ok(reply.map, entry.id);
    const map = buildMap(reply.map.start, reply.map.steps);
    // Each line of Lean is a move on the map, or the head of a block whose goals it made.
    const lines = entry.solution.split("\n").length;
    const drawn = new Set(map.nodes.flatMap((n) => (n.kind === "move" ? [n.line] : [])));
    assert.ok(drawn.has(lines - 1), `${entry.id}: the last line is on the map`);
    assert.deepEqual(map.nodes.filter((n) => n.kind === "goal" && n.state !== "done").map((n) => n.label), [], `${entry.id}: every goal done`);
  }
  // The goals after a line, for the sentence beside it.
  const odd = await call<CheckReply>(handleGallery, { id: "sum-of-odd-numbers", cursor: { line: 3, character: 32 } });
  assert.equal(odd.reply.cursorGoals?.[0].target, "k ^ 2 + (2 * k + 1) = (k + 1) ^ 2");
  assert.equal(await attempts(), before, "nothing recorded");
  await assert.rejects(call(handleGallery, { id: "no-such-proof" }), /no such proof/);
  await assert.rejects(call(handleGallery, {}), /required/);
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
    assert.ok(state.goals.length && state.goals.every((g) => g.targetTagged), `${label} line ${i + 1}: Lean's structured goals`);
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
  // A bullet proof with its second case never started: no goal at the end of
  // the body, but Lean's "unsolved goals" error names the one still open.
  const bullets = await checkExercise(leanServer(), { ...identity, statement: "(P Q : Prop) (hP : P) (hQ : Q) : P ∧ Q" }, "constructor\n· exact hP");
  assert.equal(bullets.solved, false);
  assert.deepEqual(bullets.goals, []);
  const open = unsolvedGoals(bullets.diagnostics);
  assert.deepEqual(open.map((g) => [g.caseName, g.target]), [["right", "Q"]]);
  assert.ok(open[0].hypotheses.some((h) => h.names.includes("hQ")));
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

test("the goals come as Lean's data: each hypothesis one card with its names, and what the last step changed", { skip }, async () => {
  const at = (statement: string, body: string) => checkExercise(leanServer(), { ...exercise("use-it"), id: "structured", statement, solution: "", forbid: [] }, body);
  const cards = (g: Goal) => g.hypotheses.map((h) => `${h.names.join(" ")} : ${h.type}${h.value ? ` := ${h.value}` : ""}${h.inserted ? " (new)" : ""}`);

  // An implication: intro adds the assumption, marked new.
  const intro = await at("(P Q : Prop) (hPQ : P → Q) : P → Q", "intro hP");
  assert.deepEqual(cards(intro.goals[0]), ["P Q : Prop", "hPQ : P → Q", "hP : P (new)"]);
  assert.equal(intro.goals[0].target, "Q");
  assert.ok(intro.goals[0].targetTagged, "the target as tagged text");
  // The same state reached by other steps carries other marks, and is still the same state (the board's "no further").
  const round = await at("(P Q : Prop) (hPQ : P → Q) : P → Q", "intro hP\nhave h2 := hP\nclear h2");
  assert.notDeepEqual(round.goals, intro.goals, "other marks");
  assert.ok(sameGoals(round.goals, intro.goals));
  assert.ok(!sameGoals((await at("(P Q : Prop) (hPQ : P → Q) : P → Q", "intro hP\nclear hPQ")).goals, intro.goals));

  // A conjunction split into two named goals, each target marked as changed.
  const split = await at("(P Q : Prop) (hP : P) (hQ : Q) : P ∧ Q", "constructor");
  assert.deepEqual(split.goals.map((g) => [g.caseName, g.target]), [["left", "P"], ["right", "Q"]]);
  assert.match(JSON.stringify(split.goals[0].targetTagged), /"diff":"wasChanged"/);

  // An induction: its named cases, and the names Lean made up, which no line can write.
  const ind = await at("(n : ℕ) : 0 + n = n", "induction n");
  assert.deepEqual(ind.goals.map((g) => g.caseName), ["zero", "succ"]);
  const made = ind.goals[1].hypotheses.filter((h) => h.inaccessible);
  assert.equal(made.length, 2, JSON.stringify(ind.goals[1].hypotheses.map((h) => h.names)));
  assert.ok(made.every((h) => h.inserted));

  // Grouped binders, a type Lean prints over several lines, and a let-value: one card each.
  const long = Array(28).fill("a").join(" + ");
  const lets = await at(`(a b : ℕ) (h : a = b ∧ b = a ∧ ${long} = ${Array(24).fill("b").join(" + ")}) : True`, "let x : ℕ := 5");
  assert.deepEqual(lets.goals[0].hypotheses.map((h) => h.names), [["a", "b"], ["h"], ["x"]]);
  assert.match(lets.goals[0].hypotheses[1].type, /\n/, "printed over several lines");
  assert.equal(lets.goals[0].hypotheses[2].value, "5");

  // What the last step took away is listed apart, not as a fact.
  const got = await at("(P Q : Prop) (h : P ∧ Q) : Q", "obtain ⟨hp, hq⟩ := h");
  assert.deepEqual(cards(got.goals[0]), ["P Q : Prop", "hp : P (new)", "hq : Q (new)"]);
  assert.deepEqual(got.goals[0].gone?.map((h) => h.names), [["h"]]);
});

test("the proof map from Lean's goals around each line: apply then exact, and a split with one branch closed", { skip }, async () => {
  const mapOf = async (statement: string, body: string) => {
    const r = await checkExercise(leanServer(), { ...exercise("use-it"), id: "map", statement, solution: "", forbid: [] }, body, undefined, true);
    assert.ok(r.map, "a map was asked for");
    return buildMap(r.map.start, r.map.steps);
  };
  const arrowsOf = (m: ProofMap) => m.edges.map((e) => `${m.nodes.find((n) => n.id === e.from)?.label} -${e.kind}-> ${m.nodes.find((n) => n.id === e.to)?.label}`);
  const shown = (m: ProofMap) => m.nodes.map((n) => `${n.kind} ${n.label}${n.state ? ` (${n.state})` : ""}${n.line !== null ? ` @${n.line}` : ""}`);

  const one = await mapOf("(P Q : Prop) (hP : P) (hPQ : P → Q) : Q", "apply hPQ\nexact hP");
  assert.deepEqual(shown(one), ["fact hP : P", "fact hPQ : P → Q", "goal ⊢ Q (done)", "move apply hPQ @0", "goal ⊢ P (done) @0", "move exact hP (closes) @1"]);
  assert.equal(one.edges.length, 5);

  // Half done: the other branch is still open, and the map says so.
  const split = await mapOf("(P Q : Prop) (hP : P) (hQ : Q) : P ∧ Q", "constructor\n· exact hP");
  assert.deepEqual(
    split.nodes.filter((n) => n.kind === "goal").map((n) => `${n.label} (${n.state}) col ${n.col}`),
    ["⊢ P ∧ Q (worked) col 0", "left: ⊢ P (done) col 0", "right: ⊢ Q (open) col 1"],
  );

  // A line Lean refuses ends the map before it; editing it away brings the rest back.
  const wrong = await mapOf("(P Q : Prop) (hP : P) (hPQ : P → Q) : Q", "apply hPQ\nexact hPQ");
  assert.deepEqual(wrong.nodes.filter((n) => n.kind === "move").map((n) => n.label), ["apply hPQ"]);
  assert.equal(wrong.nodes.find((n) => n.label === "⊢ P")?.state, "open");

  // A step over several lines: the cases inside the block, made by the line that opened it.
  const ind = await mapOf("(n : ℕ) : 0 + n = n", "induction n with\n| zero => rfl\n| succ k ih => omega");
  assert.deepEqual(
    ind.nodes.filter((n) => n.kind === "goal").map((n) => `${n.label} (${n.state}) col ${n.col}`),
    ["⊢ 0 + n = n (done) col 0", "⊢ 0 + 0 = 0 (done) col 0", "⊢ 0 + (k + 1) = k + 1 (done) col 1"],
  );
  // With a case missing, Lean refuses the head; the case written is drawn, and the whole is not done.
  const half = await mapOf("(n : ℕ) : 0 + n = n", "induction n with\n| zero => rfl");
  assert.deepEqual(half.nodes.filter((n) => n.kind === "goal").map((n) => n.state), ["worked", "done"]);
  // have … := by: its own goal, and the rest of the proof with the new fact, both made by the have.
  const have = await mapOf("(P Q : Prop) (hP : P) (hPQ : P → Q) : Q", "have hQ : Q := by\n  apply hPQ\n  exact hP\nexact hQ");
  assert.ok(arrowsOf(have).includes("have hQ : Q := by -makes-> hQ : Q"), arrowsOf(have).join("; "));
  assert.ok(have.nodes.filter((n) => n.kind === "goal").every((n) => n.state === "done"));
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

test("with the word list out of the way, the kernel replay alone refuses a theorem the kernel never checked", { skip }, async () => {
  // The exploit an independent review found (lii-1ou.4): a theorem of False added with the kernel's
  // check switched off. It rests on no axiom, so the axiom report passes it; the replay does not.
  const body =
    "run_tac do\n" +
    "  let d := Lean.Declaration.thmDecl { name := `lii_exercise.fakeThm, levelParams := [], type := Lean.mkConst ``False, value := Lean.mkConst ``True.intro }\n" +
    "  Lean.withOptions (fun o => Lean.debug.skipKernelTC.set o true) (Lean.addDecl d)\n" +
    "exact lii_exercise.fakeThm.elim";
  const result = await leanServer().check("exercise", assemble(FALSE.statement, body), []);
  const errors = toBody(result.diagnostics, body).filter((d) => d.severity === "error");
  assert.deepEqual(errors, [], "Lean itself raises no error in the proof");
  assert.deepEqual(axiomsOf(result.diagnostics, body), [], "and the axiom report sees nothing");
  const replay = replayOf(result.diagnostics, body);
  assert.match(replay ?? "", /^lii-replay: the kernel refused this: [\s\S]*fakeThm/);
  // Judged with the word check set aside (Lean's own diagnostics and the replay, under a body it has no word against):
  const verdict = judge(errors, "exact h", [], [], replay);
  assert.equal(verdict.solved, false);
  assert.match(verdict.refusal ?? "", /refused part of it/);
});

test("the kernel replay refuses a file with anything already where its copies go", { skip }, async () => {
  // Lean's replay skips a theorem it already holds by name and type, so a constant planted under the
  // copies' prefix could stand in for a copy unchecked (found in review of lii-1ou.4). Any such name is refused.
  const given = "theorem _lii_replay.planted : True := trivial";
  const body = "exact hP";
  const result = await leanServer().check("exercise", assemble("(P : Prop) (hP : P) : P", body, given), []);
  assert.match(replayOf(result.diagnostics, body, given) ?? "", /_lii_replay\.planted is in the way/);
});

test("the kernel replay passes an honest proof, with the given's definitions, recursion and an inductive type", { skip }, async () => {
  const given = "inductive MyTree where\n  | leaf : MyTree\n  | node : MyTree → ℕ → MyTree → MyTree\n\ndef MyTree.size : MyTree → ℕ\n  | .leaf => 0\n  | .node l _ r => l.size + 1 + r.size\n\n@[simp] def app : List ℕ → List ℕ → List ℕ\n  | [], ys => ys\n  | x :: xs, ys => x :: app xs ys";
  const statement = "(t : MyTree) (xs : List ℕ) : t.size + 0 = t.size ∧ app [] xs = xs";
  const body = "exact ⟨by simp, rfl⟩";
  const started = Date.now();
  const result = await leanServer().check("exercise", assemble(statement, body, given), []);
  assert.equal(replayOf(result.diagnostics, body, given), "ok", JSON.stringify(result.diagnostics));
  console.log(`# kernel replay with a given of an inductive type and two recursive definitions: whole check ${Date.now() - started} ms`);
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

test("/api/check records attempts, not the re-check of a stored solution, and a solve once a day", { skip }, async () => {
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
  // A solved proof re-checked with no `record` (a stored solution, as an
  // exercise opens) is not an attempt, so opening a lesson passes no review.
  assert.equal((await post({ ...base, body: "intro hP\nexact hP" })).reply.solved, true);
  assert.equal(await count(), 2);
  // The first live solve is recorded and marks the exercise solved...
  assert.equal((await post({ ...base, body: "intro hP\nexact hP", record: "live" })).reply.solved, true);
  assert.equal(await count(), 3);
  assert.deepEqual((await solvedFor(db, learner)).map((r) => [r.exerciseId, r.solution]), [["prove-it", "intro hP\nexact hP"]]);
  // ...a live or board solve later the same day adds nothing...
  await post({ ...base, body: "intro hP\nexact hP", record: "live" });
  await post({ ...base, body: "intro hP\nexact hP", record: "rejected" });
  assert.equal(await count(), 3);
  // ...and a submitted one is always kept (the replay counts a repeat once).
  await post({ ...base, body: "intro hP\nexact hP", record: "submitted" });
  assert.equal(await count(), 4);
  // On a later day a solve is kept again: that is a review.
  await query("update attempts set created_at = created_at - interval '2 days'");
  await post({ ...base, body: "intro hP\nexact hP", record: "live" });
  assert.equal(await count(), 5);
  // The input ladder's rung the check was made at goes on the row (a rung
  // that is not one, or none, is kept as null).
  await post({ ...base, body: "exact hP", record: "rejected", ladder: 2 });
  await post({ ...base, body: "exact hP", record: "submitted", ladder: 9 });
  await post({ ...base, body: "exact hP", record: "submitted" });
  const rungs = (await query("select input_rung from attempts order by id desc limit 3")) as { input_rung: number | null }[];
  assert.deepEqual(rungs.map((r) => r.input_rung), [null, null, 2]);
});

test("rung 3's line is Lean's to pass: one that works is offered, one that does not is not", { skip }, async () => {
  const use = exercise("use-it");
  // On the board (the moves it offers given): a line one of the moves writes, that changes the goals.
  assert.equal(await lineProblem(use, "", "apply hPQ", use.moves), null);
  assert.equal(await lineProblem(use, "apply hPQ", "exact hP", use.moves), null);
  // An error, a line that changes nothing, and a line no move on offer writes.
  assert.ok(await lineProblem(use, "", "exact hP", use.moves));
  assert.match((await lineProblem(use, "", "skip", use.moves))!, /moves|goals/);
  assert.match((await lineProblem(use, "", "simp [hP, hPQ]", use.moves))!, /moves/);
  // Typed (no board): the same exercise takes a line no move writes.
  assert.equal(await lineProblem(use, "", "simp [hP, hPQ]"), null);
  // A typed exercise takes any line, but not a forbidden one.
  const typed = exercise("typed");
  assert.equal(await lineProblem(typed, "intro hPQ", "intro hP"), null);
  assert.match((await lineProblem(typed, "", "tauto"))!, /tauto/);
});

test("/api/tutor rung 3: a line Lean refuses is retried once, then not shown; a line it accepts makes the next check assisted", { skip }, async (t) => {
  const learner = await ensureLearner(db);
  const ex = exercise("chain");
  const context = { page: "lesson", lessonId: lesson.id, exerciseId: ex.id, body: "" };
  const tutor = async (body: unknown): Promise<TutorReply> => {
    const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), { method: "POST", headers: {}, url: "/" }) as unknown as IncomingMessage;
    let text = "";
    const res = Object.assign(new (await import("node:events")).EventEmitter(), { destroyed: false, writeHead() { return this; }, end(c?: string) { text = c ?? ""; } }) as unknown as ServerResponse;
    await handleTutor(req, res);
    return JSON.parse(text) as TutorReply;
  };
  t.after(() => setAgent(null));
  await recordHint(db, learner, lesson.id, ex.id, 1);
  await recordHint(db, learner, lesson.id, ex.id, 2);

  const asked: string[] = [];
  setAgent(async ({ prompt }) => {
    asked.push(prompt);
    return "Close it.\nLINE: exact hQR";
  });
  const refused = await tutor({ hint: 3, context });
  assert.equal(asked.length, 2, "one retry, told why");
  assert.match(asked[1], /does not work there/);
  assert.equal(refused.line, null);
  assert.equal(refused.messages.at(-1)!.role, "note");
  // Rung 3 was not reached: a check now is not assisted.
  await post({ lessonId: lesson.id, exerciseId: ex.id, body: "exact hQR", record: "submitted" });
  assert.equal((await attemptsFor(db, learner)).at(-1)!.assisted, false);

  setAgent(async () => "Suppose P first.\nLINE: `intro hP`");
  const given = await tutor({ hint: 3, context });
  assert.equal(given.line, "intro hP");
  assert.equal(given.messages.at(-1)!.rung, 3);
  assert.match(given.messages.at(-1)!.text, /`intro hP`$/);
  const solved = await post({ lessonId: lesson.id, exerciseId: ex.id, body: ex.solution, record: "submitted" });
  assert.equal(solved.reply.solved, true);
  const last = (await attemptsFor(db, learner)).at(-1)!;
  assert.equal(last.assisted, true, "rung 3 makes the check assisted");
  assert.equal(last.solved, true);
  // Check pressed again on the same proof the same day: still assisted.
  await post({ lessonId: lesson.id, exerciseId: ex.id, body: ex.solution, record: "submitted" });
  assert.deepEqual((await attemptsFor(db, learner)).slice(-2).map((r) => r.assisted), [true, true]);
});

test("rung 3 on a proof with an error: the line is checked after the part Lean accepts", { skip }, async () => {
  const typed = exercise("typed");
  assert.equal(await acceptedPart(typed, "intro hPQ\nexact hPQ\napply h"), "intro hPQ");
  assert.equal(await acceptedPart(typed, "intro hPQ\nintro hP"), "intro hPQ\nintro hP");
  assert.equal(await acceptedPart(typed, ""), "");
  assert.equal(await lineProblem(typed, await acceptedPart(typed, "intro hPQ\nexact hPQ"), "intro hP"), null);
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
      const tf = kind === "truefalse" ? trueFalseOf(example) : null;
      const e = {
        ...exercise("use-it"),
        given: "",
        moves: [],
        forbid: [],
        proof: "",
        options: [],
        ...example,
        kind,
        id: `${kind}-${i}`,
        ...(tf ? { truefalse: tf.spec, solution: tf.solution } : {}),
        ...(kind === "predict" ? { predict: { before: example.before ?? "", move: example.move } } : {}),
        ...(kind === "flaw" ? { steps: example.steps, solution: String(example.flaw), statement: "" } : {}),
        ...(kind === "match" ? { pairs: { english: example.english, lean: example.lean }, solution: (example.english as string[]).map((_, j) => j).join(","), statement: "" } : {}),
      } as Exercise;
      assert.deepEqual((await checkSolution(leanServer(), e)).problems, [], `${kind} example ${i + 1}`);
      if (kind === "prove" && example.mode === "board") assert.ok((await replay(`${kind} example ${i + 1}`, e)) > 0);
      checked++;
    }
  }
  assert.ok(checked >= 12);
});

test("predict, read and match: Lean decides a prediction, the author's answer a reading, and npm test holds both to Lean", { skip }, async () => {
  const lean = leanServer();
  const base = { ...exercise("use-it"), given: "", moves: [], forbid: [], proof: "", options: [], mode: "typed" } as Exercise;
  const [first, second] = EXERCISES.predict.examples;
  const predict = (ex: Record<string, unknown>, more: Partial<Exercise> = {}) =>
    ({ ...base, ...ex, kind: "predict", id: "pr", predict: { before: (ex.before as string) ?? "", move: ex.move as string }, ...more }) as Exercise;
  const p1 = predict(first);
  // Nothing chosen: the state before the move, to show.
  const start = await checkExercise(lean, p1, "");
  assert.equal(goalsText(start.cursorGoals), "p q : Prop\nhp : p\nhpq : p → q\n⊢ q");
  // The right state, written another way, is right; a wrong one is not, and Lean's real state comes back.
  assert.equal((await checkExercise(lean, p1, "hpq : p → q\nhp : p\np q : Prop\n⊢  p")).solved, true);
  const wrong = await checkExercise(lean, p1, (first.options as string[])[2]);
  assert.equal(wrong.solved, false);
  assert.equal(goalsText(wrong.goals), "p q : Prop\nhp : p\nhpq : p → q\n⊢ p");
  // A move that finishes the proof leaves no goals.
  const done = predict({ ...first, move: "exact hpq hp", options: ["no goals", "⊢ q"], solution: "no goals" });
  assert.equal((await checkExercise(lean, done, "no goals")).solved, true);
  // The content check refuses a prediction whose solution is not Lean's state, and one where another option is Lean's too.
  assert.deepEqual((await checkSolution(lean, predict(second))).problems, []);
  const misread = predict({ ...second, solution: (second.options as string[])[1] });
  assert.match((await checkSolution(lean, misread)).problems.join("\n"), /reference solution is not accepted/);
  const twice = predict({ ...first, options: [...(first.options as string[]), "hp : p\nhpq : p → q\np q : Prop\n⊢ p"] });
  assert.match((await checkSolution(lean, twice)).problems.join("\n"), /Lean also accepts the option/);
  // A bullet's move leaves the other case open, though the end of the body shows no goal: that case is the state.
  const bullet = predict({ says: "s", statement: "(p q : Prop) (hp : p) (hq : q) : p ∧ q", before: "constructor", move: "· exact hp", options: ["no goals", "p q : Prop\nhp : p\nhq : q\n⊢ q"], solution: "p q : Prop\nhp : p\nhq : q\n⊢ q" });
  assert.equal((await checkExercise(lean, bullet, "no goals")).solved, false);
  assert.deepEqual((await checkSolution(lean, bullet)).problems, []);
  // Lines that step outside a proof are never run, so nothing is marked right, and the content check says why.
  const escaping = predict({ ...first, move: "native_decide", options: ["no goals", "⊢ q"], solution: "no goals" });
  const escaped = await checkExercise(lean, escaping, "no goals");
  assert.equal(escaped.solved, false);
  assert.match(escaped.refusal!, /^The move fails in this exercise/);
  assert.match((await checkSolution(lean, escaping)).problems.join("\n"), /reference solution is not accepted/);
  // A move that fails is the exercise's fault, said in words.
  assert.match((await checkExercise(lean, predict({ ...first, move: "exact hp" }), "⊢ p")).refusal!, /^The move fails in this exercise/);
  // Read and match: marked against the author's answer, and their Lean must be Lean that Lean reads.
  const read = { ...base, ...EXERCISES.read.examples[0], kind: "read", id: "rd" } as Exercise;
  assert.equal((await checkExercise(lean, read, read.solution)).solved, true);
  assert.equal((await checkExercise(lean, read, read.options[1])).solved, false);
  assert.deepEqual((await checkSolution(lean, read)).problems, []);
  assert.match((await checkSolution(lean, { ...read, statement: "(f : ℕ → ℕ) : ∀ n, ∃ m, f m > nope" })).problems.join("\n"), /Lean cannot read/);
  // A one-letter name never bound is a typo, not a variable Lean may invent.
  assert.match((await checkSolution(lean, { ...read, statement: "(f : ℕ → ℕ) : ∀ n, ∃ m, f m > k" })).problems.join("\n"), /Lean cannot read/);
  const m = EXERCISES.match.examples[0] as { english: string[]; lean: string[] };
  const match = { ...base, kind: "match", id: "mt", statement: "", pairs: { english: m.english, lean: m.lean }, solution: "0,1,2" } as Exercise;
  assert.equal((await checkExercise(lean, match, "0,1,2")).solved, true);
  assert.equal((await checkExercise(lean, match, "1,0,2")).solved, false);
  assert.match((await checkExercise(lean, match, "0,0,2")).refusal!, /exactly one sentence/);
  assert.deepEqual((await checkSolution(lean, match)).problems, []);
  assert.match((await checkSolution(lean, { ...match, pairs: { english: m.english, lean: ["∀ n : ℕ, ∃ m, m >", "True", "False"] } })).problems.join("\n"), /Lean cannot read/);
  // Spot the flaw: the wrong step's number, marked against the author's; rung 3 names it.
  const f = EXERCISES.flaw.examples[0] as { steps: string[]; flaw: number };
  const flaw = { ...base, kind: "flaw", id: "fl", statement: "", steps: f.steps, solution: String(f.flaw) } as Exercise;
  assert.equal((await checkExercise(lean, flaw, "5")).solved, true);
  assert.equal((await checkExercise(lean, flaw, "6")).solved, false);
  assert.deepEqual((await checkSolution(lean, flaw)).problems, []);
  assert.equal(await lineProblem(flaw, "", "Step 5"), null);
  assert.notEqual(await lineProblem(flaw, "", "Step 6"), null);
  assert.notEqual(await lineProblem(flaw, "", "Steps 5 and 6"), null);
  // The Tutor's rung 3 is the answer, checked as the app would.
  assert.equal(await lineProblem(p1, "", "p q : Prop; hpq : p → q; hp : p ⊢ p"), null);
  assert.notEqual(await lineProblem(p1, "", "p q : Prop; hp : p ⊢ p"), null, "a fact missing");
  assert.notEqual(await lineProblem(p1, "", "p q : Prop; hp : p; hpq : p → q ⊢ q"), null);
  assert.equal(await lineProblem(read, "", read.solution), null);
  assert.notEqual(await lineProblem(read, "", read.options[1]), null);
  assert.equal(await lineProblem(match, "", `${m.english[1]} ↔ ${m.lean[1]}`), null);
  assert.notEqual(await lineProblem(match, `${m.english[1]} ↔ ${m.lean[1]}`, `${m.english[1]} ↔ ${m.lean[1]}`), null, "a pair the learner already has");
  assert.notEqual(await lineProblem(match, "", `${m.english[1]} ↔ ${m.lean[0]}`), null);
});

test("true or false: Lean decides each side; the wrong side is answered at once, values that are no counterexample are refused, and a proof is a proof", { skip }, async () => {
  const make = (example: Record<string, unknown>) => {
    const tf = trueFalseOf(example);
    return { ...exercise("use-it"), kind: "truefalse", mode: "typed", given: "", moves: [], forbid: [], proof: "", options: [], ...example, id: "tf", truefalse: tf.spec, solution: tf.solution } as Exercise;
  };
  const [falseOne, trueOne, byProof] = EXERCISES.truefalse.examples.map(make);
  const lean = leanServer();
  const ask = (e: Exercise, answer: string) => checkExercise(lean, e, answer);
  // The wrong side: refused with the exercise's why, and Lean is not asked.
  assert.match((await ask(falseOne, "true\nomega")).refusal!, /^This claim is false, so it cannot be proved[\s\S]*At n = 1/);
  assert.match((await ask(trueOne, "false: 3")).refusal!, /^This claim is true, so no counterexample can exist/);
  // The right side, nothing written yet: not solved, nothing refused.
  const bare = await ask(falseOne, "false");
  assert.deepEqual([bare.solved, bare.refusal], [false, null]);
  // Values: a counterexample is accepted; one that is not is refused in words; a non-number, or the wrong count, never reaches Lean.
  assert.equal((await ask(falseOne, "false: 1")).solved, true);
  const holds = await ask(falseOne, "false: 5");
  assert.equal(holds.solved, false);
  assert.match(holds.refusal!, /^Lean could not show that the claim fails at n = 5: these values may not be a counterexample/);
  assert.match((await ask(falseOne, "false: x")).refusal!, /“x” is not a number/);
  assert.match((await ask(byProof, "false: 1")).refusal!, /^This claim has 2 variables, a, b: give a value for each/);
  // A value Lean cannot read as the variable's type is Lean's to refuse.
  assert.equal((await ask(falseOne, "false: -1")).solved, false);
  // With witness: proof, the learner's lines must prove False from hc; the server's lines are not theirs.
  assert.equal((await ask(byProof, "false: 1, 1\nnorm_num at hc")).solved, true);
  const wrongProof = await ask(byProof, "false: 1, 1\nexact hc");
  assert.equal(wrongProof.solved, false);
  assert.equal(wrongProof.error?.line, 0, "the error is on the learner's first line, not the server's");
  // The values must really be a counterexample: at a = b = 0 nothing proves False,
  // not even the claim at other values, since the server clears it after taking these.
  assert.equal((await ask(byProof, "false: 0, 0\nnorm_num at hc")).solved, false);
  assert.equal((await ask(byProof, "false: 0, 0\nexact absurd (hall 1 1) (by norm_num)")).solved, false);
  // Proof lines without values are asked for the values; a fraction is not a natural number.
  assert.match((await ask(byProof, "false\nnorm_num at hc")).refusal!, /give a value for each/);
  assert.match((await ask(falseOne, "false: 1/2")).refusal!, /not a whole number/);
  // An error is underlined on the learner's own line, not the server's.
  const ranged = wrongProof.diagnostics.filter((d) => d.range);
  assert.ok(ranged.length > 0 && ranged.every((d) => d.range!.start.line === d.line), "every underline is on the line it names, in the learner's own lines");
  // The Tutor's rung 3 gives a counterexample's values, and Lean checks them, with or without the proof being the learner's.
  assert.equal(await lineProblem(byProof, "", "1, 1"), null);
  assert.notEqual(await lineProblem(byProof, "", "0, 0"), null);
  assert.equal(await lineProblem(falseOne, "", "1"), null);
  assert.notEqual(await lineProblem(falseOne, "", "4"), null);
  // The true side is the statement's own proof.
  assert.equal((await ask(trueOne, trueOne.solution)).solved, true);
  assert.equal((await ask(trueOne, "true\nsimp")).solved, false);
  // An escape is refused on either side.
  assert.ok((await ask(byProof, "false: 1, 1\nrun_tac pure ()")).refusal);
  assert.ok((await ask(trueOne, "true\n)\n#eval 1")).refusal);
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

test("every move's example in the Lab is real: Lean accepts it, and shows the opening goal where the cursor starts", { skip }, async () => {
  for (const [tactic, example] of Object.entries(TACTIC_EXAMPLES)) {
    const { status, reply } = await call<PlaygroundReply>(handlePlayground, { source: labSource(example.lean), cursor: { line: LAB_FIRST_LINE + 1, character: 0 } });
    assert.equal(status, 200, tactic);
    assert.deepEqual(reply.diagnostics.filter((d) => d.severity !== "info"), [], `the example for ${tactic}`);
    assert.equal(reply.cursorGoals?.length, 1, `${tactic}: one goal before the first line of the proof`);
  }
  // exact? answers with the fact it found, which is the point of its example.
  const found = await call<PlaygroundReply>(handlePlayground, { source: labSource(TACTIC_EXAMPLES["exact?"].lean) });
  assert.ok(found.reply.diagnostics.some((d) => d.severity === "info" && /Nat\.add_comm/.test(d.message)));
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

/* ------------------------- the Tutor as proof partner ------------------------- */

/** The Tutor's Lean runs under macOS's sandbox, and nowhere without it. */
const skipSandbox = skip || (process.platform !== "darwin" ? "the Tutor's Lean needs macOS's sandbox-exec" : false);
if (!skip && skipSandbox) console.warn(`[lean.test] SKIPPED the Tutor's Lean: ${skipSandbox}. Nothing about it was checked.`);

test("the Tutor's Lean is shut in: it cannot read the user's files, write, or start a program, and still proves things", { skip: skipSandbox }, async () => {
  const os = await import("node:os");
  const repoFile = path.resolve(import.meta.dirname, "../../package.json");
  const out = path.join(os.tmpdir(), `lean-into-it-sandbox-probe-${process.pid}.txt`);
  const toolchainFile = path.resolve(import.meta.dirname, "../../lean/lean-toolchain");
  // Harmless probes (the word filter would refuse them unread, so they are
  // given to each Lean directly): each tries one thing and says whether it
  // could, with Lean's reason when it could not.
  const probe = `import Mathlib
def tryIt (what : String) (act : IO Unit) : IO Unit := do
  try act; IO.println s!"{what}: ALLOWED" catch e => IO.println s!"{what}: {e}"
#eval tryIt "read a file of the repository" (do let s ← IO.FS.readFile ${JSON.stringify(repoFile)}; if s.length == 0 then throw (IO.userError "empty"))
#eval tryIt "list the home folder" (do let _ ← System.FilePath.readDir ${JSON.stringify(os.homedir())})
#eval tryIt "ask about a folder in the home folder" (do let _ ← System.FilePath.metadata ${JSON.stringify(path.join(os.homedir(), "Library"))})
#eval tryIt "list a folder outside the home folder" (do let _ ← System.FilePath.readDir "/Applications")
#eval tryIt "read a system setting" (do let s ← IO.FS.readFile "/private/etc/hosts"; if s.length == 0 then throw (IO.userError "empty"))
#eval tryIt "write a temp file" (IO.FS.writeFile ${JSON.stringify(out)} "x")
#eval tryIt "start a program" (do let o ← IO.Process.output { cmd := "/bin/echo", args := #["hi"] }; if o.stdout != "hi\\n" then throw (IO.userError "it did not run"))
#eval tryIt "start the toolchain's lake" (do let o ← IO.Process.output { cmd := "lake", args := #["--version"] }; if o.exitCode != 0 then throw (IO.userError "it did not run"))
#eval tryIt "read a file of lean/" (do let s ← IO.FS.readFile ${JSON.stringify(toolchainFile)}; if s.length == 0 then throw (IO.userError "empty"))
example (a b : ℝ) : (a + b)^2 = a^2 + 2*a*b + b^2 := by ring
example : (37 : ℕ).Prime := by norm_num
`;
  const told = (r: { diagnostics: { severity: string; message: string }[] }) => r.diagnostics.filter((d) => d.severity === "info").map((d) => d.message.trim().split("\n")[0]);
  const shut = await tutorLean().check("tutor", probe, []);
  const refused = (what: string) => new RegExp(`^${what}: operation not permitted`);
  const said = told(shut);
  for (const [i, what] of ["read a file of the repository", "list the home folder", "ask about a folder in the home folder", "list a folder outside the home folder", "read a system setting", "write a temp file"].entries()) assert.match(said[i], refused(what));
  assert.equal(said[6], "start a program: it did not run");
  assert.equal(said[7], "start the toolchain's lake: it did not run");
  assert.equal(said[8], "read a file of lean/: ALLOWED");
  assert.equal(said.length, 9);
  assert.deepEqual(shut.diagnostics.filter((d) => d.severity === "error"), []);
  assert.equal(fs.existsSync(out), false);
  // The control: the same file on the learner's own Lean, where nothing is
  // shut in. Every probe is allowed there, so it is the sandbox that refused.
  try {
    const open = told(await leanServer().check("sandbox-control", probe, []));
    assert.deepEqual(open.map((l) => l.replace(/^.*: /, "")), Array.from({ length: 9 }, () => "ALLOWED"), open.join("\n"));
    assert.equal(fs.existsSync(out), true);
  } finally {
    fs.rmSync(out, { force: true });
  }
});

test("proof partner: a statement in Lean elaborates, a lemma is found and accepted in use, a step shows the goals it leaves", { skip: skipSandbox }, async () => {
  const { tryLean, TUTOR_DOCUMENT } = await import("./partner.ts");
  const lean = tutorLean();
  assert.equal(TUTOR_DOCUMENT, "tutor");
  // "Formalise: the sum of two even numbers is even."
  const stated = await tryLean(lean, "theorem sum_of_evens (m n : ℕ) (hm : Even m) (hn : Even n) : Even (m + n) := by\n  sorry");
  assert.deepEqual([stated.ran, stated.accepted, stated.sorry], [true, true, true]);
  const wrong = await tryLean(lean, "theorem sum_of_evens (m n : ℕ) : IsEven (m + n) := by\n  sorry");
  assert.equal(wrong.accepted, false);
  assert.equal(wrong.messages.find((m) => m.severity === "error")!.line, 1);
  // "What lemma says a + 0 = a?": a guessed name is looked up, and accepted in use; a wrong guess is not.
  const used = await tryLean(lean, "#check Nat.add_zero\nexample (a : ℕ) : a + 0 = a := Nat.add_zero a");
  assert.deepEqual([used.accepted, used.sorry], [true, false]);
  assert.ok(used.messages.some((m) => m.severity === "info" && m.line === 1 && /Nat\.add_zero.*\+ 0 = /.test(m.message)), JSON.stringify(used.messages));
  assert.equal((await tryLean(lean, "#check Nat.zero_plus_nothing")).accepted, false);
  // Lean's own search finds a proof too (not always the lemma one would name), and what it found is accepted in use.
  const found = await tryLean(lean, "example (a : ℕ) : a + 0 = a := by\n  exact?");
  const said = found.messages.find((m) => m.severity === "info" && m.line === 2)?.message ?? "";
  const term = /exact (.+)$/m.exec(said)?.[1];
  assert.ok(term, JSON.stringify(found.messages));
  assert.equal((await tryLean(lean, `example (a : ℕ) : a + 0 = a := ${term}`)).accepted, true);
  // A next step, run: the goals after its line, as Lean prints them.
  const step = await tryLean(lean, "example (P Q : Prop) (hP : P) (hPQ : P → Q) : Q := by\n  apply hPQ\n  sorry", 2);
  assert.equal(step.goals?.length, 1);
  assert.match(step.goals![0], /hP : P[\s\S]*⊢ P$/);
  const done = await tryLean(lean, "example (P Q : Prop) (hP : P) (hPQ : P → Q) : Q := by\n  apply hPQ\n  exact hP", 3);
  assert.deepEqual([done.accepted, done.sorry, done.goals], [true, false, []]);
  // Not asked for, or past the end of the text: no goals reported.
  assert.equal((await tryLean(lean, "example : True := trivial", 9)).goals, null);
  // What would run a program is refused unread.
  const refused = await tryLean(lean, "example : True := trivial\n#eval 1 + 1");
  assert.deepEqual([refused.ran, refused.accepted], [false, false]);
  assert.match(refused.refused[0], /^line 2: “#eval” is not run for the Tutor/);
});

test("proof partner: a Playground reply's Lean is labelled with what Lean said, and the tool's post is answered during the turn", { skip: skipSandbox }, async (t) => {
  const { db } = await freshDb().then((f) => (t.after(f.close), setDb(f.db as unknown as Db), f));
  t.after(() => setDb(null));
  t.after(() => setAgent(null));
  await ensureLearner(db);
  const call = async <T,>(url: string, body: unknown): Promise<{ status: number; reply: T }> => {
    const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), { method: "POST", headers: { host: "localhost:38800" }, url }) as unknown as IncomingMessage;
    let text = "";
    let status = 0;
    const res = Object.assign(new (await import("node:events")).EventEmitter(), { destroyed: false, writeHead(c: number) { status = c; return this; }, end(c?: string) { text = c ?? ""; } }) as unknown as ServerResponse;
    try {
      await handleTutor(req, res);
    } catch (e) {
      return { status: (e as HttpError).status, reply: { error: (e as Error).message } as T };
    }
    return { status, reply: JSON.parse(text) as T };
  };
  let tool: { status: number; reply: { accepted: boolean; goals: string[] | null } } | null = null;
  setAgent(async ({ lean }) => {
    tool = await call("/lean", { token: lean!.token, lean: "example (P : Prop) (hP : P) : P ∧ P := by\n  constructor\n  all_goals sorry", goalsAfterLine: 2 });
    return [
      "Here it is in Lean:",
      "```lean",
      "theorem sum_of_evens (m n : ℕ) (hm : Even m) (hn : Even n) : Even (m + n) := by",
      "  sorry",
      "```",
      "Proved:",
      "```lean",
      "example (a : ℕ) : a + 0 = a := Nat.add_zero a",
      "```",
      "Not right:",
      "```lean",
      "example (a : ℕ) : a + 0 = a := Nat.no_such_lemma a",
      "```",
      "Then:",
      "```lean",
      "exact hP",
      "```",
      "And never:",
      "```lean",
      "example : True := by run_tac pure ()",
      "```",
    ].join("\n");
  });
  const { reply } = await call<TutorReply>("/", { message: "formalise: the sum of two even numbers is even", context: { page: "playground", source: "" } });
  assert.equal(tool!.status, 200);
  assert.equal(tool!.reply.accepted, true);
  assert.equal(tool!.reply.goals?.length, 2);
  const labels = reply.messages.at(-1)!.text.split("\n").filter((l) => l.startsWith("*Lean:"));
  assert.equal(labels.length, 5);
  assert.match(labels[0], /the statement is accepted; the proof is left open/);
  assert.equal(labels[1], "*Lean: checked, no errors.*");
  assert.match(labels[2], /a sketch, not accepted as written \(.*no_such_lemma/);
  assert.match(labels[3], /not checked; this is part of a proof/);
  assert.match(labels[4], /not checked \(“run_tac” is not run for the Tutor/);
  // Outside the Playground a reply is left as it is.
  setAgent(async () => "```lean\nexample : True := trivial\n```");
  const plain = await call<TutorReply>("/", { message: "show me", context: { page: "path" } });
  assert.ok(!plain.reply.messages.at(-1)!.text.includes("Lean:"));
});

test("lesson authoring with the real Lean: an exercise whose reference solution fails never lands, Lean that runs a program is refused by name, and a good exercise is committed", { skip: skipSandbox }, async (t) => {
  const { db } = await freshDb().then((f) => (t.after(f.close), setDb(f.db as unknown as Db), f));
  const repo = authorRepo();
  t.after(() => {
    setAgent(null);
    setDb(null);
    repo.close();
  });
  await ensureLearner(db);
  const ask = async (): Promise<TutorReply> => {
    const req = Object.assign(Readable.from([Buffer.from(JSON.stringify({ message: "write more exercises on if-then", context: { page: "path" } }))]), { method: "POST", headers: { host: "localhost:38800" }, url: "/" }) as unknown as IncomingMessage;
    let text = "";
    const res = Object.assign(new (await import("node:events")).EventEmitter(), { destroyed: false, writeHead() { return this; }, end(c?: string) { text = c ?? ""; } }) as unknown as ServerResponse;
    await handleTutor(req, res);
    return JSON.parse(text) as TutorReply;
  };
  const notes = (r: TutorReply) => r.messages.filter((m) => m.role === "note").map((m) => m.text).join("\n");
  const write = (content: string, ...exercises: Parameters<typeof withExercise>[1][]) => {
    const file = path.join(content, LESSON_FILE);
    fs.writeFileSync(file, exercises.reduce((raw, e) => withExercise(raw, e), fs.readFileSync(file, "utf8")));
  };
  const base = repo.git("rev-parse", "HEAD");

  // A good exercise and a bad one (its "solution" does not prove the statement): the repair turn leaves it, so nothing lands.
  let runs = 0;
  let prompt2 = "";
  setAgent(async ({ workspace, prompt }) => {
    if (++runs === 1) write(workspace!.content, { id: "good-one" }, { id: "bad-one", solution: "exact hP" });
    else prompt2 = prompt;
    return "Two more exercises.\nChanged: two exercises on if-then";
  });
  let reply = await ask();
  assert.equal(runs, 2);
  assert.match(prompt2, /exercise "bad-one": the reference solution is not accepted: Lean says, at line 1 of the solution: /);
  assert.ok(!prompt2.includes('exercise "good-one"'), "Lean accepted the good one");
  assert.match(notes(reply), /could not accept one file the Tutor wrote[\s\S]*exercise "bad-one": the reference solution is not accepted/);
  assert.equal(reply.commit, null);
  assert.equal(repo.git("rev-parse", "HEAD"), base);
  assert.equal(repo.git("status", "--porcelain"), "");

  // Lean that would run a program is refused by name, before Lean is given it.
  runs = 0;
  setAgent(async ({ workspace }) => {
    if (++runs === 1) write(workspace!.content, { id: "sly-one", given: '#eval IO.println "hi"' });
    return "One more.\nChanged: an exercise";
  });
  reply = await ask();
  assert.match(notes(reply), /exercise "sly-one": “#eval” is not run for the Tutor[\s\S]*A lesson the Tutor writes may not use it\./);
  assert.equal(repo.git("rev-parse", "HEAD"), base);

  // The good one alone: Lean accepts it, and it is committed.
  setAgent(async ({ workspace }) => {
    write(workspace!.content, { id: "good-one" });
    return "One more exercise.\nChanged: one more exercise on if-then";
  });
  reply = await ask();
  assert.match(notes(reply), /^Committed [0-9a-f]{7}: one more exercise on if-then\. Lean accepted every exercise in it/m);
  assert.equal(repo.git("rev-parse", "HEAD^"), base);
  assert.equal(repo.git("diff-tree", "-r", "--name-only", "HEAD^", "HEAD"), `content/${LESSON_FILE}`);
  const landed = loadContent(repo.content).lessons.find((l) => l.id === "logic-1-if-then")!.exercises.find((e) => e.id === "good-one")!;
  // And it is solvable in the app, by the learner's own Lean.
  assert.equal((await checkExercise(leanServer(), landed, landed.solution)).solved, true);
});
