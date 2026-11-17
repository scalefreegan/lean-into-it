import assert from "node:assert/strict";
import { test } from "node:test";
import { NOT_AN_EXISTS, NOT_SPLITTABLE, NO_NUMBER, explain } from "./explain.ts";
import { parseGoal } from "./goals.ts";
import { MOVES, contraName, hiddenExists, misfit, introName, isMove, moveLine, obtainLine, oneLine, readLine, shapeOf } from "./moves.ts";

test("every move is keyed by its own id and says what it does", () => {
  for (const [key, move] of Object.entries(MOVES)) {
    assert.equal(move.id, key);
    assert.ok(move.does.length > 20, key);
    if (move.needs !== "none" && move.needs !== "name") assert.ok(move.prompt, `${key} needs a prompt`);
  }
  assert.equal(isMove("apply"), true);
  assert.equal(isMove("toString"), false);
});

test("intro names an assumption after what is assumed", () => {
  assert.equal(introName(parseGoal("P Q : Prop\n⊢ P → Q")), "hP");
  assert.equal(introName(parseGoal("P Q : Prop\n⊢ (P → Q) → Q")), "h");
  assert.equal(introName(parseGoal("⊢ ∀ x, x = x")), "x");
  assert.equal(introName(parseGoal("⊢ ∀ (n : ℕ), n = n")), "n");
});

test("intro never reuses a name already on the board", () => {
  assert.equal(introName(parseGoal("P : Prop\nhP : P\n⊢ P → P")), "hP1");
  assert.equal(introName(parseGoal("h : A\nh1 : B\n⊢ (A → B) → C")), "h2");
});

test("a move writes one line of Lean", () => {
  const goal = parseGoal("P Q : Prop\nhPQ : P → Q\n⊢ P → Q");
  assert.equal(moveLine(MOVES.intro, goal), "intro hP");
  assert.equal(moveLine(MOVES.apply, goal, "hPQ"), "apply hPQ");
  assert.equal(moveLine(MOVES.exact, goal, "hPQ"), "exact hPQ");
});

test("a move that needs nothing writes just its name", () => {
  const goal = parseGoal("⊢ 2 + 2 = 4");
  assert.equal(moveLine(MOVES.rfl, goal), "rfl");
  assert.equal(moveLine(MOVES.norm_num, goal), "norm_num");
});

test("the outermost connective of a statement, by Lean's precedences", () => {
  assert.deepEqual(shapeOf("P ∧ Q"), { kind: "and", left: "P", right: "Q" });
  assert.deepEqual(shapeOf("P ∧ Q ∧ R"), { kind: "and", left: "P", right: "Q ∧ R" });
  assert.deepEqual(shapeOf("(P ∧ Q) ∧ R"), { kind: "and", left: "P ∧ Q", right: "R" });
  assert.deepEqual(shapeOf("P ∧ Q ∨ R"), { kind: "or", left: "P ∧ Q", right: "R" });
  assert.deepEqual(shapeOf("P ∧ (Q ∨ R)"), { kind: "and", left: "P", right: "Q ∨ R" });
  assert.deepEqual(shapeOf("(P ∨ Q)"), { kind: "or", left: "P", right: "Q" });
  assert.deepEqual(shapeOf("P ∧ Q ↔ Q ∧ P"), { kind: "iff", left: "P ∧ Q", right: "Q ∧ P" });
  assert.deepEqual(shapeOf("P → Q ∧ R"), { kind: "other" });
  assert.deepEqual(shapeOf("¬(P ∧ Q)"), { kind: "other" });
  assert.deepEqual(shapeOf("x > 5"), { kind: "other" });
  // A binder owns everything after it.
  assert.deepEqual(shapeOf("∃ n, P n ∧ Q n"), { kind: "exists", vars: ["n"], bounded: false });
  assert.deepEqual(shapeOf("∃ x y, x + y = 5"), { kind: "exists", vars: ["x", "y"], bounded: false });
  assert.deepEqual(shapeOf("∃ (n : ℕ), n * n = 49"), { kind: "exists", vars: ["n"], bounded: false });
  assert.deepEqual(shapeOf("∃ x > 0, f x = 0"), { kind: "exists", vars: ["x"], bounded: true });
  assert.deepEqual(shapeOf("P ∧ ∃ n, Q n ∨ R"), { kind: "and", left: "P", right: "∃ n, Q n ∨ R" });
  assert.deepEqual(shapeOf("∀ x, P x ∧ Q x"), { kind: "other" });
});

test("obtain writes the pattern for the fact's shape, with names for the pieces", () => {
  const line = (state: string, fact = "h") => obtainLine(parseGoal(state), fact);
  assert.equal(line("P Q : Prop\nh : P ∧ Q\n⊢ Q"), "obtain ⟨hP, hQ⟩ := h");
  assert.equal(line("P Q : Prop\nh : P ∨ Q\n⊢ Q ∨ P"), "obtain hP | hQ := h");
  assert.equal(line("P Q : Prop\nh : P ↔ Q\n⊢ Q ↔ P"), "obtain ⟨hPQ, hQP⟩ := h");
  assert.equal(line("P : ℕ → Prop\nh : ∃ n, P n\n⊢ True"), "obtain ⟨n, hn⟩ := h");
  assert.equal(line("f : ℝ → ℝ\nh : ∃ x > 0, f x = 0\n⊢ True"), "obtain ⟨x, hx, hx'⟩ := h");
  assert.equal(line("h : ∃ x y, x + y = 5\n⊢ True"), "obtain ⟨x, y, h1⟩ := h");
  assert.equal(line("P Q R : Prop\nh : P ∧ (Q ∨ R)\n⊢ True"), "obtain ⟨hP, h2⟩ := h");
  assert.equal(line("P Q : Prop\nh : ¬P ∧ ¬Q\n⊢ True"), "obtain ⟨hnP, hnQ⟩ := h");
  // Names already on the board are not reused.
  assert.equal(line("P Q : Prop\nhP : P\nh : P ∧ Q\n⊢ True"), "obtain ⟨hP1, hQ⟩ := h");
  assert.equal(line("n : ℕ\nP : ℕ → Prop\nh : ∃ n, P n\n⊢ True"), "obtain ⟨n1, hn1⟩ := h");
  assert.equal(line("P : Prop\nh : P ∧ P\n⊢ True"), "obtain ⟨hP, hP1⟩ := h");
  assert.equal(moveLine(MOVES.obtain, parseGoal("P Q : Prop\nhPQ : P ∧ Q\n⊢ P"), "hPQ"), "obtain ⟨hP, hQ⟩ := hPQ");
});

test("intro on a negation assumes what is negated; by_contra names the opposite of the goal", () => {
  assert.equal(introName(parseGoal("P : Prop\n⊢ ¬P")), "hP");
  assert.equal(introName(parseGoal("P Q : Prop\n⊢ ¬(P ∨ Q)")), "h");
  assert.equal(contraName(parseGoal("P : Prop\n⊢ P")), "hnP");
  assert.equal(contraName(parseGoal("P : Prop\nhnP : ¬¬P\n⊢ P")), "hnP1");
  assert.equal(contraName(parseGoal("⊢ x < 5")), "h");
  assert.equal(moveLine(MOVES.by_contra, parseGoal("P : Prop\n⊢ P")), "by_contra hnP");
});

test("typed text for a move is one line", () => {
  assert.equal(moveLine(MOVES.use, parseGoal("⊢ ∃ n, n + 3 = 5"), " 2 "), "use 2");
  assert.equal(oneLine("2\n  exact sorry"), "2 exact sorry");
  assert.equal(moveLine(MOVES["constructor" as string], parseGoal("⊢ P ∧ Q")), "constructor");
});

test("constructor is only sent to Lean for an and or an iff", () => {
  const c = MOVES["constructor" as string];
  assert.equal(misfit(c, parseGoal("⊢ P ∧ Q")), null);
  assert.equal(misfit(c, parseGoal("⊢ P ↔ Q")), null);
  assert.equal(misfit(c, parseGoal("⊢ 12 > 10 ∧ Even 12")), null);
  // Lean accepts constructor on each of these, and leaves goals no lesson has explained.
  for (const goal of ["⊢ ∃ n, n > 10 ∧ Even n", "⊢ 12 > 10", "⊢ Even 12", "⊢ P ∨ Q", "⊢ P → Q ∧ R"]) assert.equal(misfit(c, parseGoal(goal)), NOT_SPLITTABLE, goal);
  assert.equal(misfit(MOVES.left, parseGoal("⊢ P")), null);
});

test("shapes the review found misread", () => {
  assert.deepEqual(shapeOf("P ∧ ¬∃ x, Q x ∨ R x"), { kind: "and", left: "P", right: "¬∃ x, Q x ∨ R x" });
  assert.deepEqual(shapeOf("P ∧ (∀ x, Q x ∨ R x)"), { kind: "and", left: "P", right: "∀ x, Q x ∨ R x" });
  assert.deepEqual(shapeOf("∃! n, P n"), { kind: "other" });
  assert.equal(contraName(parseGoal("⊢ False")), "h");
});

test("use is only offered to Lean for a there-exists goal", () => {
  for (const goal of ["⊢ ∃ n, n * n = 49", "⊢ ∃ n > 10, Even n", "⊢ ∃ x y, x + y = 5"]) assert.equal(misfit(MOVES.use, parseGoal(goal)), null, goal);
  for (const goal of ["⊢ 6 * 6 = 49", "⊢ P 11", "⊢ 12 > 10 ∧ Even 12"]) assert.equal(misfit(MOVES.use, parseGoal(goal)), NOT_AN_EXISTS, goal);
  assert.match(explain(NOT_AN_EXISTS) ?? "", /Undo takes it back/);
});

test("rewriting and induction write the lines Lean reads", () => {
  const goal = parseGoal("f : ℕ → ℕ\nh0 : f 0 = 0\nn : ℕ\n⊢ f n = 2 * n");
  assert.equal(moveLine(MOVES.rw, goal, "h0"), "rw [h0]");
  assert.equal(moveLine(MOVES.rw_back, goal, "h0"), "rw [← h0]");
  assert.equal(moveLine(MOVES.induction, goal, "n"), "induction' n with n ih");
  // An induction inside an induction does not reuse the name of the first hypothesis.
  assert.equal(moveLine(MOVES.induction, parseGoal("m n : ℕ\nih : P n\n⊢ Q m"), "m"), "induction' m with m ih1");
});

test("a board line is read back as its move and what was clicked", () => {
  const read = (line: string) => {
    const r = readLine(line);
    return r && [r.move.id, r.arg];
  };
  assert.deepEqual(read("rw [hstep]"), ["rw", "hstep"]);
  assert.deepEqual(read("rw [← h]"), ["rw_back", "h"]);
  assert.deepEqual(read("induction' n with n ih"), ["induction", "n"]);
  assert.deepEqual(read("obtain ⟨r, hr⟩ := h"), ["obtain", "h"]);
  assert.deepEqual(read("use r + 1"), ["use", "r + 1"]);
  assert.deepEqual(read("exact hP"), ["exact", "hP"]);
  assert.deepEqual(read("omega"), ["omega", undefined]);
  assert.equal(read("ring"), null);
});

test("even, odd and divides are taken apart and proved like a there-exists", () => {
  assert.equal(hiddenExists("Even n"), "r");
  assert.equal(hiddenExists("Odd (n + 1)"), "k");
  assert.equal(hiddenExists("a ∣ b"), "c");
  for (const t of ["Even n → Even (n + 2)", "Even n ∧ Odd m", "¬Even n", "n = 2", "∀ n, Even n"]) assert.equal(hiddenExists(t), null, t);
  assert.equal(obtainLine(parseGoal("n : ℕ\nh : Even n\n⊢ Even (n + 2)"), "h"), "obtain ⟨r, hr⟩ := h");
  assert.equal(obtainLine(parseGoal("n : ℕ\nh : Odd n\n⊢ Even (n + 1)"), "h"), "obtain ⟨k, hk⟩ := h");
  assert.equal(obtainLine(parseGoal("a b c : ℕ\nhab : a ∣ b\nhbc : b ∣ c\n⊢ a ∣ c"), "hab"), "obtain ⟨c1, hc1⟩ := hab");
  for (const goal of ["⊢ 3 ∣ 12", "⊢ Even 10", "⊢ Odd 7"]) assert.equal(misfit(MOVES.use, parseGoal(goal)), null, goal);
});

test("induction is only offered a number that can be named", () => {
  assert.equal(misfit(MOVES.induction, parseGoal("f : ℕ → ℕ\nn : ℕ\n⊢ f n = 0")), null);
  assert.equal(misfit(MOVES.induction, parseGoal("f : ℕ → ℕ\nh0 : f 0 = 0\n⊢ f 0 = 0")), NO_NUMBER);
  assert.equal(misfit(MOVES.induction, parseGoal("n✝ : ℕ\n⊢ P")), NO_NUMBER);
  assert.match(explain(NO_NUMBER) ?? "", /natural number/);
});

test("induction on a list names the first element as well", () => {
  const goal = parseGoal("xs ys : List ℕ\n⊢ len (app xs ys) = len xs + len ys");
  assert.equal(moveLine(MOVES.induction, goal, "xs"), "induction' xs with x xs ih");
  assert.equal(misfit(MOVES.induction, goal), null);
  assert.equal(moveLine(MOVES.induction, parseGoal("x : ℕ\nxs : List ℕ\n⊢ P"), "xs"), "induction' xs with x1 xs ih");
});
