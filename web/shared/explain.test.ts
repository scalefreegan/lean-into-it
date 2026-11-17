import assert from "node:assert/strict";
import { test } from "node:test";
import { UNCHANGED, explain } from "./explain.ts";

// The messages are Lean 4.36's own, copied from a real run.

test("apply with a fact that ends in something else", () => {
  const said = "Tactic `apply` failed: could not unify the conclusion of `hPQ`\n  Q\nwith the goal\n  R\n\nNote: The full type of `hPQ` is\n  P → Q\n\nP Q R : Prop\n⊢ R";
  assert.equal(explain(said), "hPQ ends in “Q”, but the goal is “R”. apply needs a fact whose conclusion is the goal.");
});

test("apply with a plain fact that is not the goal", () => {
  assert.match(explain("Tactic `apply` failed: could not unify the type of `hP`\n  P\nwith the goal\n  R\n\n⊢ R") ?? "", /hP says “P”, which is not the goal “R”/);
});

test("exact with a fact of the wrong type", () => {
  assert.match(explain("Type mismatch\n  hP\nhas type\n  P\nbut is expected to have type\n  R") ?? "", /hP says “P”, but the goal is “R”/);
});

test("intro with nothing to assume, an unknown name, a line too many", () => {
  assert.match(explain("Tactic `introN` failed: There are no additional binders or `let` bindings in the goal to introduce\n\n⊢ R") ?? "", /nothing to assume/);
  assert.match(explain("Unknown identifier `hQ`") ?? "", /called hQ/);
  assert.match(explain("No goals to be solved") ?? "", /already finished/);
});

test("a message with no explanation is left to Lean's own words", () => {
  assert.equal(explain("failed to synthesize\n  Decidable P"), null);
});

test("rfl on two sides that differ, and on a goal that is not an equation", () => {
  // Both messages as Lean 4.36 prints them (checked against the real Lean).
  assert.match(explain("Tactic `rfl` failed: The left-hand side\n  2 + 2\nis not definitionally equal to the right-hand side\n  5\n\n⊢ 2 + 2 = 5") ?? "", /“2 \+ 2” and “5” out to the same thing/);
  assert.match(explain("Tactic `rfl` failed: The left-hand side\n  a\nis not definitionally equal to the right-hand side\n  b\n\na b : ℕ\nh : a = b\n⊢ a = b") ?? "", /“a” and “b”/);
  assert.match(explain("Tactic `rfl` failed: Expected the goal to be a binary relation\n\nHint: Reflexivity tactics can only be used on goals of the form `x ~ x` or `R x x`\n\n⊢ 2 + 2 ≠ 5") ?? "", /not an equation/);
});

test("a move that changed nothing is said to have changed nothing", () => {
  assert.match(explain(UNCHANGED) ?? "", /exactly as they were/);
});

test("a bracket left open is said as that, not as Lean's complaint about what follows the proof", () => {
  assert.match(explain("unexpected token '#print'; expected ')'") ?? "", /bracket is still open/);
  assert.match(explain("unexpected token ')'; expected '{' or tactic") ?? "", /not finished/);
});

test("the Level 1 moves' refusals, with the messages Lean really gives", () => {
  assert.match(explain("Tactic `constructor` failed: target is not an inductive datatype\n\nP Q : Prop\nhP : P\n⊢ P") ?? "", /constructor splits/);
  assert.match(explain("Tactic `left` failed: left tactic works for inductive types with exactly 2 constructors\n\n⊢ P ∧ Q") ?? "", /^left chooses a side/);
  assert.match(explain("Tactic `right` failed: target is not an inductive datatype\n\n⊢ P") ?? "", /^right chooses a side/);
  assert.equal(
    explain("Tactic `rcases` failed: `hP : P → Q` is not an inductive datatype"),
    "hP says “P → Q”, which has no parts to take apart. obtain works on an “and”, an “or”, an “if and only if” or a “there exists”.",
  );
  assert.match(explain("Tactic `contradiction` failed\n\nP Q : Prop\nhP : P\n⊢ P ∧ Q") ?? "", /contradict each other/);
  assert.match(explain("numerals are data in Lean, but the expected type is a proposition\n  P : Prop") ?? "", /A number was given/);
  assert.match(
    explain("Tactic `apply` failed: could not unify the conclusion of `hnP`\n  False\nwith the goal\n  Q\n\nNote: The full type of `hnP` is\n  ¬P\n\n⊢ Q") ?? "",
    /hnP ends in “False”, but the goal is “Q”/,
  );
});
