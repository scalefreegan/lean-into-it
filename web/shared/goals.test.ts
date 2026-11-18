import assert from "node:assert/strict";
import { test } from "node:test";
import { goalsText, isNatural, isObject, namesIn, parseGoal, parseGoals, stillOpenGoals, unsolvedGoals } from "./goals.ts";

test("a goal's hypotheses and target are read as Lean prints them", () => {
  const g = parseGoal("P Q : Prop\nhP : P\nhPQ : P → Q\n⊢ Q");
  assert.deepEqual(g, {
    hypotheses: [
      { names: ["P", "Q"], type: "Prop" },
      { names: ["hP"], type: "P" },
      { names: ["hPQ"], type: "P → Q" },
    ],
    target: "Q",
  });
  assert.deepEqual(namesIn(g), ["P", "Q", "hP", "hPQ"]);
});

test("a case name, an inaccessible name and several goals", () => {
  const [inl, inr] = parseGoals(["case inl\nP Q : Prop\nh✝ : P\n⊢ Q ∨ P", "case inr\nP Q : Prop\nh✝ : Q\n⊢ Q ∨ P"]);
  assert.equal(inl.caseName, "inl");
  assert.equal(inr.caseName, "inr");
  assert.deepEqual(inl.hypotheses[1], { names: ["h✝"], type: "P" });
  assert.equal(inr.target, "Q ∨ P");
});

test("a long type continues on indented lines, in a hypothesis and in the target", () => {
  const g = parseGoal("h : ∀ (x : ℝ),\n    x ^ 2 ≥ 0\nn : ℕ := 5\n⊢ a +\n    b = c");
  assert.equal(g.hypotheses[0].type, "∀ (x : ℝ),\n    x ^ 2 ≥ 0");
  assert.deepEqual(g.hypotheses[1], { names: ["n"], type: "ℕ", value: "5" });
  assert.equal(g.target, "a +\n    b = c");
});

test("a type that itself contains a colon keeps everything after the first", () => {
  const g = parseGoal("f : (x : ℕ) → x = x\n⊢ True");
  assert.deepEqual(g.hypotheses[0], { names: ["f"], type: "(x : ℕ) → x = x" });
});

test("text with no turnstile is kept, not dropped", () => {
  assert.equal(parseGoal("something Lean said").target, "something Lean said");
  assert.deepEqual(parseGoal(""), { hypotheses: [], target: "" });
});

test("objects are told apart from facts", () => {
  assert.equal(isObject({ names: ["P"], type: "Prop" }), true);
  assert.equal(isObject({ names: ["n"], type: "ℕ" }), true);
  assert.equal(isObject({ names: ["x"], type: "ℝ" }), true);
  assert.equal(isObject({ names: ["hP"], type: "P" }), false);
  assert.equal(isObject({ names: ["h"], type: "P → Q" }), false);
  // A function between kinds of thing is a thing; "if P then Q" is a fact.
  assert.equal(isObject({ names: ["f"], type: "ℕ → ℕ" }), true);
  assert.equal(isObject({ names: ["P"], type: "ℕ → Prop" }), true);
  assert.equal(isObject({ names: ["h"], type: "∀ (n : ℕ), P n" }), false);
});

test("induction is offered a number or a list, not a function on them", () => {
  assert.equal(isNatural({ names: ["n"], type: "ℕ" }), true);
  assert.equal(isNatural({ names: ["xs", "ys"], type: "List ℕ" }), true);
  assert.equal(isNatural({ names: ["f"], type: "List ℕ → ℕ" }), false);
  assert.equal(isNatural({ names: ["n✝"], type: "ℕ" }), false);
});

test("goals go to the Tutor as Lean prints them", () => {
  const text = "case inl\nP Q : Prop\nh : P\n⊢ P ∨ Q";
  assert.equal(goalsText(parseGoals([text])), text);
  assert.equal(goalsText([]), "no goals: the proof is complete");
  assert.equal(goalsText(null), "");
});

test("the goals still open are read from Lean's unsolved-goals error, and only from it", () => {
  const open = unsolvedGoals([
    { severity: "error", message: "unsolved goals\ncase right\nP Q : Prop\nhP : P\nhQ : Q\n⊢ Q\n\ncase extra\n⊢ True" },
    { severity: "error", message: "type mismatch\n  hP" },
    { severity: "warning", message: "unsolved goals\n⊢ False" },
  ]);
  assert.deepEqual(open.map((g) => [g.caseName, g.target]), [["right", "Q"], ["extra", "True"]]);
  assert.deepEqual(unsolvedGoals([]), []);
});

test("Still open shows only where nothing is open here and nothing else is wrong", () => {
  const diagnostics = [{ severity: "error", message: "  unsolved goals\ncase right\nhQ : Q\n⊢ Q" }];
  const ok = { solved: false, refusal: null, error: null, diagnostics };
  assert.deepEqual(stillOpenGoals(ok, []).map((g) => g.target), ["Q"], "leading space tolerated");
  assert.deepEqual(stillOpenGoals({ ...ok, error: { line: 2, message: "unknown identifier" } }, []), [], "beside a real error it is where Lean stopped");
  assert.deepEqual(stillOpenGoals({ ...ok, refusal: "uses sorry" }, []), []);
  assert.deepEqual(stillOpenGoals({ ...ok, solved: true }, []), []);
  assert.deepEqual(stillOpenGoals(ok, [parseGoal("⊢ P")]), [], "a goal open here is shown instead");
  assert.deepEqual(stillOpenGoals(ok, null), []);
  assert.deepEqual(stillOpenGoals(null, []), []);
});
