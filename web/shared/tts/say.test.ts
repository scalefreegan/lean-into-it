import assert from "node:assert/strict";
import { test } from "node:test";
import { sayCode, sayName, sayText } from "./say.ts";

const said = (code: string) => sayCode(code).text;

test("names are said by their pieces, with the table for the ones a voice would spell", () => {
  assert.equal(sayName("rfl"), "refl");
  assert.equal(sayName("Nat.add_comm"), "nat add comm");
  assert.equal(sayName("h1"), "h 1");
  assert.equal(sayName("hPQ"), "h P Q");
  assert.equal(sayName("ha"), "h a");
  assert.equal(sayName("x'"), "x prime");
  assert.equal(sayName("norm_num"), "norm num");
  assert.equal(sayName("constructor"), "constructor");
});

test("tactics, and tactic lines whose brackets are punctuation", () => {
  assert.deepEqual(sayCode("linarith"), { text: "lin arith", sure: true });
  assert.equal(said("rw [h1, h2]"), "rewrite h 1, h 2");
  assert.equal(said("rw [← h] at h2"), "rewrite backwards h at h 2");
  assert.equal(said("simp [ih, app_assoc]"), "simp I H, app assoc");
  assert.equal(said("obtain ⟨hP, hQ⟩ := h"), "obtain h P, h Q from h");
  assert.equal(said("obtain hA | hB := h"), "obtain h A or h B from h");
  assert.equal(said("exact?"), "exact question mark");
});

test("simple formulas are said in words", () => {
  assert.equal(said("A ∧ B"), "A and B");
  assert.equal(said("¬A"), "not A");
  assert.equal(said("P → Q"), "P implies Q");
  assert.equal(said("a + b = b + a"), "a plus b equals b plus a");
  assert.equal(said("-1 < x - 3 ∧ x - 3 < 1"), "minus 1 is less than x minus 3 and x minus 3 is less than 1");
  assert.equal(said("x :: xs"), "x followed by x's");
  assert.equal(said("app xs [] = xs"), "app x's the empty list equals x's");
  assert.equal(said("|x|"), "the absolute value of x");
  assert.equal(said("⊢"), "the goal symbol");
  assert.equal(said("⊢ P → R"), "the goal P implies R");
  for (const code of ["A ∧ B", "a + b = b + a", "x :: xs", "f x", "ℝ"]) assert.equal(sayCode(code).sure, true, code);
});

test("what a colon means depends on what is beside it", () => {
  assert.equal(said("n : ℕ"), "n, a natural number");
  assert.equal(said("(n : ℝ) / 2"), "n as a real number over 2");
  assert.equal(said("P Q R : Prop"), "P Q R, each a proposition");
  assert.equal(said("h : A ∨ B"), "h, which says A or B");
  assert.equal(said("f : ℝ → ℝ"), "f, a function from the real numbers to the real numbers");
  assert.equal(said("hf : ∀ x, f x ≥ 0"), "h f, which says for every x, f x is at least 0");
  assert.equal(said("h : ∃ n, P n"), "h, which says there exists n such that P n");
});

test("what the tables are not sure of is still said, and marked as wanting a written form", () => {
  for (const code of ["∑ i ∈ Finset.range n, f i", "∀ m < n, P m", "(0 + k).succ", "name : type", "a ⊕ b"]) {
    const s = sayCode(code);
    assert.equal(s.sure, false, code);
    assert.notEqual(s.text, "", code);
  }
  assert.deepEqual(sayCode("⊕"), { text: "", sure: false });
});

test("what is typed for a symbol is said as typed", () => {
  assert.equal(said("\\not"), "backslash not");
  assert.equal(said("\\<"), "backslash less than");
  assert.equal(said("\\R"), "backslash R");
});

test("sets: the symbols Level 4 writes", () => {
  assert.deepEqual(sayCode("hAB : A ⊆ B"), { text: "h A B, which says A is a subset of B", sure: true });
  assert.deepEqual(sayCode("x ∈ A ∪ B"), { text: "x in A union B", sure: true });
});

test("running text: symbols become words, hyphens and slashes stay", () => {
  assert.equal(sayText("a²").text, "a squared");
  assert.equal(sayText("(a−b)²,").text, "(a minus b) squared,");
  assert.equal(sayText("2·2").text, "2 times 2");
  assert.equal(sayText("√2").text, "the square root of 2");
  assert.equal(sayText("…").text, "and so on");
  assert.equal(sayText("well-known").text, "well-known");
  assert.equal(sayText("and/or").text, "and/or");
  assert.deepEqual(sayText("a⊕b"), { text: "ab", unknown: ["⊕"] });
  assert.deepEqual(sayText("café—“so”").unknown, []);
});

test("brackets that change the meaning are said; round one thing or an argument they are not", () => {
  assert.equal(said("P → (Q → R)"), "P implies open bracket Q implies R close bracket");
  assert.notEqual(said("P → (Q → R)"), said("P → Q → R"));
  assert.notEqual(said("(a + b) + c"), said("a + b + c"));
  assert.notEqual(said("f (x + 1)"), said("f x + 1"));
  assert.notEqual(said("↑(5 - 7)"), said("↑5 - ↑7"));
  assert.notEqual(said("¬(P ∧ Q)"), said("¬P ∧ Q"));
  assert.notEqual(said("(a + b) ^ 2"), said("a + b ^ 2"));
  assert.equal(said("app (rev xs) ys"), "app rev x's y's");
  assert.equal(said("(x)"), "x");
  // A binder by itself is a declaration; inside a formula the same shape is a cast.
  assert.equal(said("(n : ℕ)"), "n, a natural number");
  assert.equal(said("(n : ℝ) / 2"), "n as a real number over 2");
});

test("a dot that takes a part of something is said; a namespace's is not", () => {
  assert.equal(said("h.1"), "h dot 1");
  assert.notEqual(said("h.1"), said("h1"));
  assert.equal(said("x.succ"), "x dot suck");
  assert.equal(said("Nat.succ_le"), "nat suck L E");
  assert.equal(said("x₁"), "x 1");
});

test("square brackets are a list, except after a move that takes a list of facts", () => {
  assert.equal(said("obtain h := h2 [x] xs"), "obtain h from h 2 the list x x's");
  assert.equal(said("rw [h2] at h"), "rewrite h 2 at h");
  assert.equal(said("simp at *"), "simp at everything");
  assert.equal(said("<-"), "a less than sign and a hyphen");
  assert.equal(said("_ ≤ z"), "blank is at most z");
  assert.equal(said("\\to"), "backslash to");
});

test("running text: absolute-value bars, lists and Lean names written out", () => {
  assert.equal(sayText("|x|,").text, "the absolute value of x,");
  assert.equal(sayText("|−5|").text, "the absolute value of minus 5");
  assert.equal(["|a", "−", "b|"].map((r) => sayText(r).text).join(" "), "the absolute value of a minus b");
  assert.equal(sayText("[x].").text, "the list x.");
  assert.equal(sayText("[]").text, "the empty list");
  assert.equal(sayText("norm_num,").text, "norm num,");
  // What the voice would stumble on is reported, ASCII too.
  assert.deepEqual(sayText("|").unknown, ["|"]);
  assert.deepEqual(sayText("a\\b{c}").unknown, ["\\", "{", "}"]);
});
