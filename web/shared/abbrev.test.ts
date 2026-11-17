import assert from "node:assert/strict";
import { test } from "node:test";
import { ABBREVIATIONS, expandAt, positionAt } from "./abbrev.ts";

test("a backslash name before the caret becomes its symbol", () => {
  assert.deepEqual(expandAt("P \\to", 5), { text: "P →", caret: 3 });
  assert.deepEqual(expandAt("\\forall x, P", 7), { text: "∀ x, P", caret: 1 });
  assert.deepEqual(expandAt("a \\and b", 6), { text: "a ∧ b", caret: 3 });
});

test("an unknown name, or no backslash, is left alone", () => {
  assert.equal(expandAt("P \\nonsense", 11), null);
  assert.equal(expandAt("P to", 4), null);
  assert.equal(expandAt("\\to x", 5), null);
  assert.equal(expandAt("\\toString", 9), null);
});

test("every abbreviation maps to a symbol, not to another name", () => {
  for (const [name, symbol] of Object.entries(ABBREVIATIONS)) assert.ok(symbol.length >= 1 && !symbol.startsWith("\\"), name);
});

test("a caret offset is a line and a character", () => {
  assert.deepEqual(positionAt("intro h\nexact h", 0), { line: 0, character: 0 });
  assert.deepEqual(positionAt("intro h\nexact h", 8), { line: 1, character: 0 });
  assert.deepEqual(positionAt("intro h\nexact h", 15), { line: 1, character: 7 });
});
