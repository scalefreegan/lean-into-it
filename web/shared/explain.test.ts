import assert from "node:assert/strict";
import { test } from "node:test";
import { suggestion, NOT_SPLITTABLE, UNCHANGED, explain, LEFT_FALSE, leftFalse, chainNotStrict, whatIsLeft } from "./explain.ts";

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

test("the moves of algebra and inequalities, refused", () => {
  assert.match(explain("The `ring` tactic failed to close the goal.") ?? "", /does not read/);
  assert.doesNotMatch(explain("The `ring` tactic failed to close the goal.") ?? "", /ring_nf/);
  assert.match(explain("`ring_nf` made no progress on the goal") ?? "", /could not even tidy either side/);
  assert.match(explain("linarith failed to find a contradiction\na b c : ℝ\nh : a ≤ b\nhc : 0 ≤ c\na✝ : b * c < a * c\n⊢ False\nfailed") ?? "", /a product of two letters, such as ab or x², is a single unknown quantity/);
  // No assumed opposite of the goal among the facts: the goal was not a comparison.
  assert.match(explain("linarith failed to find a contradiction\na b : ℝ\nh : a < b\n⊢ False\nfailed") ?? "", /^linarith found no comparison to prove in this goal.*taken apart first/);
  assert.match(explain("not a positivity goal") ?? "", /0 < A, 0 ≤ A or A ≠ 0/);
  assert.match(explain("failed to prove positivity/nonnegativity/nonzeroness") ?? "", /subtraction/);
  assert.match(explain("`gcongr` did not make progress.\n\na b : ℝ\nh : a ≤ b\n⊢ a - 1 ≤ b + a") ?? "", /same form/);
  assert.match(explain("`field_simp` made no progress on the goal") ?? "", /no fraction/);
  // decide on a real number: Lean's message is about its internals.
  assert.match(explain("Tactic `decide` failed to reduce\n  @decide (2 + 2 = 4) ((2 + 2).decidableEq 4)\nto `true` or `false`.\n\nAfter unfolding the instances `Classical.propDecidable`, `LinearOrder.toDecidableEq`, and `Real.decidableEq`, reduction got stuck at\n  Classical.choice ⋯") ?? "", /norm_num/);
});

test("a rewrite under a for-all or a there-exists is not told the pattern is missing", () => {
  const under = explain("Tactic `rewrite` failed: Did not find an occurrence of the pattern\n  f ?x\nin the target expression\n  ∀ (x y : ℝ), x ≤ y → f x ≤ f y\n\nf : ℝ → ℝ\n⊢ ∀ (x y : ℝ), x ≤ y → f x ≤ f y") ?? "";
  assert.match(under, /^rw found no “f \?x” it can replace/);
  assert.match(under, /“for all” introduces.*intro/);
  assert.doesNotMatch(under, /There is no/);
  assert.match(explain("Tactic `rewrite` failed: Did not find an occurrence of the pattern\n  f ?x\nin the target expression\n  ∃ x, f x = 3\n") ?? "", /“there exists” introduces.*use/);
});

test("a chain whose links point opposite ways", () => {
  const mixed = explain("invalid 'calc' step, failed to synthesize `Trans` instance\n  Trans LE.le GE.ge ?m.14\n\nHint: Additional diagnostic information may be available using the `set_option diagnostics true` command.") ?? "";
  assert.match(mixed, /a “≤” link and then a “≥” link/);
  assert.match(mixed, /point the same way/);
  assert.match(explain("invalid 'calc' step, failed to synthesize `Trans` instance\n  Trans Foo Bar ?m.1") ?? "", /^This chain has two links/);
  assert.match(explain("'calc' expression has type\n  a < c\nbut is expected to have type\n  a ≤ c") ?? "", /^This chain proves “a < c”, but the goal is “a ≤ c”/);
});

test("ring's remark that it did not finish is not a line to try", () => {
  const note = "Try this:\n  [apply] ring_nf\n  \n  The `ring` tactic failed to close the goal. Use `ring_nf` to obtain a normal form.";
  assert.equal(suggestion(note), null);
  assert.equal(suggestion("Try this:\n  [apply] exact Nat.le_trans h1 h2"), "exact Nat.le_trans h1 h2");
});

test("a fact Lean prints unfolded over several lines is not quoted back", () => {
  const said = explain("Tactic `rcases` failed: `h : Quot.lift (fun a₁ ↦ Quotient.lift ((fun x1 x2 ↦ x1 < x2) a₁) ⋯ 1) ⋯\n  (Quotient.map₂ (fun x1 x2 ↦ x1 ⊔ x2) ⋯ (↑3 + -x.cauchy) (-(↑3 + -x.cauchy)))` is not an inductive datatype");
  assert.equal(said, "h is not a fact with parts to take apart. obtain works on an “and”, an “or”, an “if and only if” or a “there exists”.");
});

test("exact? finding nothing, and a goal worked out to False, from Lean's own messages", () => {
  // Lean 4.36 + Mathlib, `example (P Q : Prop) (h : P) : Q := by exact?`.
  assert.match(explain("`exact?` could not close the goal. Try `apply?` to see partial suggestions.") ?? "", /found no single step/);
  // `example : (2:ℕ) + 2 = 5 := by norm_num` leaves the goal False; so does exfalso or by_contra.
  assert.match(explain("unsolved goals\n⊢ False") ?? "", /^What is left to show is False/);
  assert.match(explain("unsolved goals\nP : Prop\nh : P\nhn : ¬P\n⊢ False") ?? "", /contradict each other/);
  // Two goals left, one of them False: the general sentence.
  assert.equal(explain("unsolved goals\ncase a\n⊢ P\n\ncase b\n⊢ False"), "Every line is fine so far, but there is still something left to show.");
  assert.equal(explain("unsolved goals\n⊢ x < y"), "Every line is fine so far, but there is still something left to show.");
});

test("a fact given something it cannot take, from Lean's own messages", () => {
  // Lean 4.36: `example (P Q : Prop) (h : P) (hQ : Q) : P := by exact h hQ`.
  assert.equal(
    explain("Function expected at\n  h\nbut this term has type\n  P\n\nNote: Expected a function because this term is being applied to the argument\n  hQ"),
    "h says “P”, which is not an “if… then” or a “for all”, so nothing can be given to it. Only a fact of that form takes a fact or a thing after its name.",
  );
  // `example (P Q : Prop) (h : P → Q) (hQ : Q) : Q := by exact h hQ`.
  assert.equal(
    explain("Application type mismatch: The argument\n  hQ\nhas type\n  Q\nbut is expected to have type\n  P\nin the application\n  h hQ"),
    "In h hQ, hQ says “Q”, but what goes in that place has to say “P”.",
  );
  // The False sentence names the taught move and the exfalso way in; only one goal False counts.
  assert.match(LEFT_FALSE, /apply a fact of the form “not A”/);
  assert.match(LEFT_FALSE, /exfalso/);
  assert.equal(leftFalse("unsolved goals\nh : P → False\n⊢ Q"), false);
  assert.equal(leftFalse("unsolved goals\n⊢ False ∧ P"), false);
  assert.equal(leftFalse("unsolved goals\ncase h\n⊢ False\n"), true);
});

test("a chain that proves ≤ where < is wanted: the c < c Lean adds is named for what it is", () => {
  const weak = "unsolved goals\ncase calc.step\na b c : ℝ\nh1 : a ≤ b\nh2 : b < c\n⊢ c < c";
  const said = chainNotStrict(weak) ?? "";
  assert.match(said, /^This chain gets to c, but it proves only “≤” where the goal asks for “<”/);
  assert.match(said, /“c < c”, which can never be proved/);
  assert.equal(whatIsLeft(weak), said);
  assert.equal(explain(weak), said);
  // The same with > and a longer expression.
  assert.match(chainNotStrict("unsolved goals\ncase calc.step\nx : ℝ\n⊢ x ^ 2 + 1 > x ^ 2 + 1") ?? "", /gets to x \^ 2 \+ 1, but it proves only “≥” where the goal asks for “>”/);
  // A chain that stops short leaves an honest next link: nothing particular to say.
  assert.equal(chainNotStrict("unsolved goals\ncase calc.step\na b c : ℝ\n⊢ b < c"), null);
  // Not a calc leftover, two goals, or a goal that only looks alike.
  assert.equal(chainNotStrict("unsolved goals\n⊢ c < c"), null);
  assert.equal(chainNotStrict("unsolved goals\ncase calc.step\n⊢ c < c\n\ncase other\n⊢ P"), null);
  assert.equal(chainNotStrict("unsolved goals\ncase calc.step\n⊢ a < b < a"), null);
  assert.equal(chainNotStrict("unsolved goals\ncase calc.step\n⊢ c = c"), null);
  // Only False left is still the False sentence.
  assert.equal(whatIsLeft("unsolved goals\ncase h\n⊢ False\n"), LEFT_FALSE);
});
