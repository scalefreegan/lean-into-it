import assert from "node:assert/strict";
import { test } from "node:test";
import { suggestion, NOT_SPLITTABLE, UNCHANGED, explain } from "./explain.ts";

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

test("messages Lean gave for a fact with a colon in it, a wrong kind of witness, and an iff applied whole", () => {
  assert.equal(
    explain("Tactic `rcases` failed: `hPQ : ∀ (n : ℕ), P n → Q n` is not an inductive datatype"),
    "hPQ says “∀ (n : ℕ), P n → Q n”, which has no parts to take apart. obtain works on an “and”, an “or”, an “if and only if” or a “there exists”.",
  );
  assert.equal(
    explain("Type mismatch\n  h4\nhas type\n  P 4\nof sort `Prop` but is expected to have type\n  ℕ\nof sort `Type`"),
    "h4 is a fact (it says “P 4”), but what is wanted here is a thing of the kind ℕ, such as a number.",
  );
  const hint = "\n\nHint: Type class instance resolution failures can be inspected with the `set_option trace.Meta.synthInstance true` command.";
  assert.match(explain(`failed to synthesize instance of type class\n  Neg ℕ${hint}`) ?? "", /ℕ has no negative numbers/);
  assert.match(explain(`failed to synthesize instance of type class\n  OfScientific ℕ${hint}`) ?? "", /no numbers with a decimal point/);
  assert.match(explain("Tactic `apply` failed: could not unify the type of `h`\n  P ↔ Q\nwith the goal\n  Q\n\nP Q : Prop\nh : P ↔ Q\nhP : P\n⊢ Q") ?? "", /Take it apart with obtain first/);
  assert.match(explain("numerals are data in Lean, but the expected type is a proposition\n  6 * 6 = 49 : Prop") ?? "", /Undo takes it back/);
  assert.match(explain(NOT_SPLITTABLE) ?? "", /^constructor splits/);
});

test("the Level 2 moves' refusals, from Lean's own messages", () => {
  assert.match(explain("Tactic `rewrite` failed: Did not find an occurrence of the pattern\n  b\nin the target expression\n  a = c\n\na b c : ℕ\n⊢ a = c") ?? "", /^There is no “b” in the goal “a = c”/);
  assert.match(explain("Invalid rewrite argument: Expected an equality or iff proof or definition name, but `h` is a proof of\n  a ≤ b") ?? "", /^h says “a ≤ b”, which is not an equation/);
  assert.match(explain("omega could not prove the goal:\na possible counterexample may satisfy the constraints\n  d ≥ 0") ?? "", /does not multiply two letters/);
  assert.equal(explain("Tactic `decide` proved that the proposition\n  3 = 5\nis false"), "decide checked it, and “3 = 5” is false.");
  assert.match(explain("Expected type must not contain free variables\n  n + 1 ≠ 0\n\nHint: Use the `+revert` option") ?? "", /has a letter in it/);
  assert.match(explain("`simp` made no progress") ?? "", /^simp found nothing/);
  assert.match(explain("Tactic `rfl` failed: The left-hand side\n  0 + a\nis not definitionally equal to the right-hand side\n  a\n\na : ℕ\n⊢ 0 + a = a") ?? "", /“0 \+ a” and “a”/);
});

test("the line exact? proposes is read out of Lean's note", () => {
  assert.equal(suggestion("Try this:\n  [apply] exact Nat.le_trans h1 h2"), "exact Nat.le_trans h1 h2");
  assert.equal(suggestion("Try this: exact h"), "exact h");
  assert.equal(suggestion("unsolved goals"), null);
});

test("a rewrite pattern with a gap in it, and omega with nothing to go on", () => {
  assert.match(explain("Tactic `rewrite` failed: Did not find an occurrence of the pattern\n  f (?k + 1)\nin the target expression\n  f 0 = 0\n") ?? "", /like \?k, stands for anything/);
  assert.match(explain("omega could not prove the goal:\nNo usable constraints found. You may need to unfold definitions so `omega` can see linear arithmetic facts") ?? "", /take such a fact apart with obtain/);
});
