import assert from "node:assert/strict";
import { test } from "node:test";
import { explain } from "./explain.ts";

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
