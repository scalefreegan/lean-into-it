import assert from "node:assert/strict";
import { test } from "node:test";
import { parseGoal } from "./goals.ts";
import { MOVES, introName, isMove, moveLine } from "./moves.ts";

test("every move is keyed by its own id and says what it does", () => {
  for (const [key, move] of Object.entries(MOVES)) {
    assert.equal(move.id, key);
    assert.ok(move.does.length > 20, key);
    if (move.needs === "fact") assert.ok(move.prompt, `${key} needs a prompt`);
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
