import assert from "node:assert/strict";
import { test } from "node:test";
import { assemble, bodyLines, endOfBody, forbiddenIn, judge, toBody, toSource, type Diagnostic } from "./proof.ts";

const at = (line: number, message: string, severity: Diagnostic["severity"] = "error"): Diagnostic => ({
  severity,
  message,
  start: { line, character: 0 },
  end: { line, character: 1 },
});

test("the source is the statement with the body indented under by", () => {
  assert.equal(assemble("(P : Prop)  (hP : P) :\n P", "exact hP\n\n"), "import Mathlib\n\nexample (P : Prop) (hP : P) : P := by\n  exact hP\n");
});

test("an empty body is sent as a tactic that does nothing, so Lean reports the opening goal", () => {
  assert.equal(assemble("(P : Prop) : P → P", "  \n"), "import Mathlib\n\nexample (P : Prop) : P → P := by\n  skip\n");
  assert.deepEqual(toSource(endOfBody("")), { line: 3, character: 6 });
});

test("the end of the body is the end of its last non-blank line, in source coordinates", () => {
  assert.deepEqual(bodyLines("intro h\nexact h\n\n  \n"), ["intro h", "exact h"]);
  assert.deepEqual(endOfBody("intro h\nexact h\n\n"), { line: 1, character: 7 });
  assert.deepEqual(toSource({ line: 1, character: 7 }), { line: 4, character: 9 });
});

test("diagnostics come back in body lines; one on the statement has no line; linter remarks are dropped", () => {
  const body = "apply h\nexact hP";
  const out = toBody([at(2, "unsolved goals\n⊢ P"), at(4, "Unknown identifier `hP`"), at(4, "note\nlinter.style.whitespace false", "warning")], body);
  assert.deepEqual(out, [
    { severity: "error", message: "unsolved goals\n⊢ P", line: null },
    { severity: "error", message: "Unknown identifier `hP`", line: 1 },
  ]);
});

test("solved means no error and no sorry, for a body that is not empty", () => {
  assert.equal(judge([], "exact hP").solved, true);
  assert.equal(judge([], "").solved, false);
  assert.equal(judge([], "  \n").solved, false);
});

test("sorry is never a solution, in either of Lean's spellings of the warning", () => {
  for (const message of ["declaration uses `sorry`", "declaration uses 'sorry'", "declaration uses sorry"]) {
    assert.equal(judge([{ severity: "warning", message, line: null }], "sorry").solved, false, message);
  }
});

test("unsolved goals is unfinished, not a wrong move; any other error is", () => {
  const unfinished = judge([{ severity: "error", message: "unsolved goals\n⊢ P", line: null }], "apply h");
  assert.deepEqual([unfinished.solved, unfinished.unfinished, unfinished.error], [false, true, null]);
  const wrong = judge([{ severity: "error", message: "Type mismatch", line: 0 }], "exact h");
  assert.equal(wrong.solved, false);
  assert.equal(wrong.unfinished, false);
  assert.equal(wrong.error?.line, 0);
});

test("a forbidden tactic is found as a whole word, outside comments", () => {
  const forbid = ["simp", "tauto", "exact?"];
  assert.deepEqual(forbiddenIn("intro h\n  simp", forbid), ["simp"]);
  assert.deepEqual(forbiddenIn("simp_all", forbid), []);
  assert.deepEqual(forbiddenIn("exact hP", forbid), []);
  assert.deepEqual(forbiddenIn("exact?", forbid), ["exact?"]);
  assert.deepEqual(forbiddenIn("intro h -- then tauto\n/- simp -/ exact h", forbid), []);
  assert.deepEqual(forbiddenIn("first | tauto | rfl", forbid), ["tauto"]);
  assert.equal(judge([], "tauto", forbid).solved, false);
});
