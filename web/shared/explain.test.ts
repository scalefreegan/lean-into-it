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
