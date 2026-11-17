import assert from "node:assert/strict";
import { test } from "node:test";
import { isObject, namesIn, parseGoal, parseGoals } from "./goals.ts";

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
});
