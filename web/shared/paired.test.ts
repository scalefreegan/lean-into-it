import assert from "node:assert/strict";
import { test } from "node:test";
import { proofLines, readStep, readSteps, unsaid } from "./paired.ts";

test("a step is its lines, then its sentence", () => {
  assert.deepEqual(readStep("2: By hQR it is enough to show Q."), { lines: [2], say: "By hQR it is enough to show Q." });
  assert.deepEqual(readStep(" 2-4 : Clearly."), { lines: [2, 3, 4], say: "Clearly." });
  assert.deepEqual(readStep("3, 1: Twice: once at the start, once here."), { lines: [1, 3], say: "Twice: once at the start, once here." });
  assert.deepEqual(readStep("1-2, 2: Repeats count once."), { lines: [1, 2], say: "Repeats count once." });
});

test("a step that cannot be read says why", () => {
  assert.match(readStep("Suppose P.") as string, /line numbers, a colon/);
  assert.match(readStep("2:") as string, /line numbers, a colon/);
  assert.match(readStep("0: Nothing.") as string, /counted from 1/);
  assert.match(readStep("4-2: Backwards.") as string, /runs upwards/);
  assert.match(readStep("1,,2: Empty part.") as string, /not a list of line numbers/);
  // A huge range is refused before it is written out.
  const t = Date.now();
  assert.match(readStep("1-99999999: Everything.") as string, /at most 50/);
  assert.match(readStep(`1-${"9".repeat(400)}: Infinity.`) as string, /at most 50/);
  assert.ok(Date.now() - t < 100);
});

test("steps are bounded by the solution's lines, and the lines no step names are unsaid", () => {
  const lines = proofLines("intro hP\napply hQR\napply hPQ\nexact hP\n");
  assert.equal(lines.length, 4);
  assert.deepEqual(readSteps(["1: a", "2-3: b"], 4).problems, []);
  assert.match(readSteps(["1: a", "4-5: b"], 4).problems[0], /names line 5, but the solution has 4 lines/);
  assert.match(readSteps([], 4).problems[0], /at least one/);
  assert.match(readSteps([3], 4).problems[0], /line of text/);
  assert.match(readSteps([{ 1: "Suppose P." }], 4).problems[0], /in quotes/);
  assert.deepEqual(unsaid(readSteps(["1: a", "2-3: b"], 4).steps, 4), [4]);
});
