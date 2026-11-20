import assert from "node:assert/strict";
import { test } from "node:test";
import { insertLine, learnedMoves, resolveLadder, stepDown } from "./ladder.ts";

test("an exercise's own rung wins; otherwise its level's, raised to 3 for a typed one", () => {
  assert.equal(resolveLadder(4, "typed", 1), 4);
  assert.equal(resolveLadder(1, "board", 4), 1);
  assert.equal(resolveLadder(undefined, "board", 1), 1);
  assert.equal(resolveLadder(undefined, "board", 2), 2);
  // A board exercise in a typing level is typed, its moves to hand.
  assert.equal(resolveLadder(undefined, "board", 3), 3);
  assert.equal(resolveLadder(undefined, "board", 4), 4);
  // A typed exercise in a clicking level cannot be clicked: 3.
  assert.equal(resolveLadder(undefined, "typed", 1), 3);
  assert.equal(resolveLadder(undefined, "typed", 4), 4);
});

test("stepping down: a board exercise can go all the way to its own moves; a typed one stops at the moves to hand", () => {
  assert.deepEqual([1, 2, 3, 4].map((r) => stepDown(r as 1 | 2 | 3 | 4, "board")), [null, 1, 2, 3]);
  assert.deepEqual([3, 4].map((r) => stepDown(r as 3 | 4, "typed")), [null, 3]);
});

test("the moves learned by a level: every level up to it, then the exercise's own, less what it switches off", () => {
  const levels = [
    { id: 1, moves: ["intro", "apply"] },
    { id: 0, moves: ["exact", "rfl"] },
    { id: 2, moves: ["rw", "exact?"] },
  ];
  assert.deepEqual(learnedMoves(levels, 1, ["exact"], []), ["exact", "rfl", "intro", "apply"]);
  assert.deepEqual(learnedMoves(levels, 2, ["use"], ["exact?"]), ["exact", "rfl", "intro", "apply", "rw", "use"]);
});

test("a palette click writes its line on a blank caret line, or on a new line after it at the same indent", () => {
  assert.deepEqual(insertLine("", 0, "intro h"), { text: "intro h", caret: { line: 0, character: 7 } });
  assert.deepEqual(insertLine("intro h\n", 1, "exact h"), { text: "intro h\nexact h", caret: { line: 1, character: 7 } });
  assert.deepEqual(insertLine("intro h\nexact h", 0, "apply f"), { text: "intro h\napply f\nexact h", caret: { line: 1, character: 7 } });
  assert.deepEqual(insertLine("  constructor\n  ", 1, "left"), { text: "  constructor\n  left", caret: { line: 1, character: 6 } });
  // Inside a bullet the line stays in that case.
  assert.deepEqual(insertLine("constructor\n· intro h", 1, "exact h").text, "constructor\n· intro h\n  exact h");
  assert.deepEqual(insertLine("  · left", 0, "rfl").text, "  · left\n    rfl");
});
