import assert from "node:assert/strict";
import { test } from "node:test";
import { changeBetween, completionsFor, nextToken, TACTICS, tokens } from "./leaneditor.ts";
import { MOVES } from "./moves.ts";

test("a line of Lean is coloured: tactics, keywords, types, numbers, strings, comments, sorry", () => {
  assert.deepEqual(tokens("intro h -- assume it"), [["intro", "tactic"], ["-- assume it", "comment"]]);
  assert.deepEqual(tokens("theorem foo (n : ℕ) : n + 0 = n := by"), [["theorem", "keyword"], ["ℕ", "type"], ["0", "number"], ["by", "keyword"]]);
  assert.deepEqual(tokens('have s := "a -- b"'), [["have", "tactic"], ['"a -- b"', "string"]]);
  assert.deepEqual(tokens("exact? "), [["exact?", "tactic"]]);
  assert.deepEqual(tokens("sorry"), [["sorry", "sorry"]]);
  // A dotted name is one name: Nat.le_refl is not coloured, and neither is a hypothesis named like a tactic's prefix.
  assert.deepEqual(tokens("exact Nat.le_refl n"), [["exact", "tactic"]]);
  assert.deepEqual(tokens("rw [h.symm] at h2"), [["rw", "tactic"], ["at", "keyword"]]);
  assert.deepEqual(tokens("norm_num [h₁, intro']"), [["norm_num", "tactic"]]);
});

test("block comments nest and run across lines", () => {
  const state = { depth: 0 };
  assert.deepEqual(tokens("intro h /- a /- b -/ still", state), [["intro", "tactic"], ["/- a /- b -/ still", "comment"]]);
  assert.equal(state.depth, 1);
  assert.deepEqual(tokens("in -/ exact h", state), [["in -/", "comment"], ["exact", "tactic"]]);
  assert.equal(state.depth, 0);
});

test("the tokenizer always moves forward, whatever the text", () => {
  for (const line of ["", "⟨hP, hQ⟩", "x ∣ y → ¬ z", '"never closed', "𝔸 + 𝔹", "..", "a.", "/-", "-/", "\\to"]) {
    const state = { depth: 0 };
    let pos = 0;
    while (pos < line.length) {
      const t = nextToken(line, pos, state);
      assert.ok(t.end > pos && t.end <= line.length, JSON.stringify(line));
      pos = t.end;
    }
  }
});

test("every move of the board is a tactic the editor knows, as it is typed", () => {
  for (const move of Object.keys(MOVES).filter((m) => m !== "rw_back")) assert.ok(TACTICS.includes(move), move);
  assert.ok(!TACTICS.includes("rw_back"));
});

test("completion: tactics where a tactic starts, the goal's names anywhere, nothing in a comment or after a backslash", () => {
  const names = ["hP", "hPQ", "h✝", "n"];
  const labels = (before: string) => completionsFor(before, names)?.options.map((o) => o.label) ?? null;
  assert.deepEqual(labels("in"), ["induction", "intro"]);
  assert.deepEqual(labels("  · con"), ["congr", "constructor", "contradiction", "conv"]);
  assert.deepEqual(labels("cases h with | inl a => ex"), ["exact", "exact?", "exfalso", "ext"]);
  assert.deepEqual(labels("constructor <;> li"), ["linarith"]);
  // After a tactic, only names: `exact h` offers hypotheses, not `have`.
  assert.deepEqual(labels("exact h"), ["hP", "hPQ"]);
  assert.deepEqual(completionsFor("exact h", names), { from: 6, options: [{ label: "hP", kind: "name" }, { label: "hPQ", kind: "name" }] });
  // A name at the start of a line comes before the tactics; the same word is offered once.
  assert.deepEqual(labels("n"), ["n", "next", "nlinarith", "norm_cast", "norm_num", "nth_rw"]);
  // Nothing to offer: no word, the word is already whole, a comment, a string, an abbreviation.
  assert.equal(labels("exact "), null);
  assert.equal(labels("exact hPQ"), null);
  assert.equal(labels("-- in"), null);
  assert.equal(labels('have s := "in'), null);
  assert.equal(labels("\\in"), null);
  assert.equal(labels("exact zz"), null);
});

test("the smallest change between two texts", () => {
  assert.deepEqual(changeBetween("intro h\n\\to", "intro h\n→"), { from: 8, to: 11, insert: "→" });
  assert.deepEqual(changeBetween("abc", "abc"), { from: 3, to: 3, insert: "" });
  assert.deepEqual(changeBetween("aa", "aaa"), { from: 2, to: 2, insert: "a" });
  assert.deepEqual(changeBetween("", "x"), { from: 0, to: 0, insert: "x" });
});
