import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { Readable } from "node:stream";
import { after, before, test } from "node:test";
import { attemptCount, ensureLearner, solvedFor } from "../../scripts/db/progress.ts";
import { freshDb } from "../../scripts/tests/testdb.mjs";
import type { CheckReply, CheckRequest, PlaygroundReply } from "../shared/wire.ts";
import { explain } from "../shared/explain.ts";
import { misfit, moveLine, readLine } from "../shared/moves.ts";
import { assemble, axiomsOf, toBody } from "../shared/proof.ts";
import { checkExercise, handleCheck, handlePlayground } from "./check.ts";
import { setDb, type Db } from "./db.ts";
import { leanProblem, leanServer } from "./lean/lsp.ts";
import { loadContent } from "./loader.ts";

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
  for (const l of content.lessons) {
    for (const e of l.exercises.filter((x) => x.mode === "board")) {
      const solution = e.solution.split("\n").filter((s) => s.trim());
      for (let i = 0; i < solution.length; i++) {
        const want = solution[i];
        const read = readLine(want);
        assert.ok(read && e.moves.includes(read.move.id), `${l.id}/${e.id}: "${want}" is not a move this exercise offers`);
        const { move, arg } = read;
        const state = await checkExercise(leanServer(), e, solution.slice(0, i).join("\n"));
        assert.equal(misfit(move, state.goals[0]), null, `${l.id}/${e.id} line ${i + 1}: the board would refuse "${want}"`);
        assert.equal(moveLine(move, state.goals[0], arg), want, `${l.id}/${e.id} line ${i + 1}`);
        lines++;
      }
    }
  }
  assert.ok(lines >= 80, `replayed ${lines} lines`);
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
