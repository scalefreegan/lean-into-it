import assert from "node:assert/strict";
import { test } from "node:test";
import { bareAnswer, counterBody, negation, readAnswer, splitStatement, valueProblem, valuesProblem, writeAnswer, wrongSide } from "./truefalse.ts";

test("a statement splits into its binder groups, its explicit variables and its claim", () => {
  assert.deepEqual(splitStatement("(n m : ℕ) (x : ℝ) : n + m ≤ x"), { groups: ["(n m : ℕ)", "(x : ℝ)"], names: ["n", "m", "x"], claim: "n + m ≤ x" });
  // Implicit and instance binders are kept for the negation but take no value.
  assert.deepEqual(splitStatement("{α : Type} [Group α] (g : α) : g * g = g")?.names, ["g"]);
  // A binder's type may hold brackets and colons of its own.
  assert.deepEqual(splitStatement("(f : ℕ → (ℕ × ℕ)) (s : Set (ℕ)) : True")?.names, ["f", "s"]);
  assert.deepEqual(splitStatement(": 2 + 2 = 4"), { groups: [], names: [], claim: "2 + 2 = 4" });
  for (const bad of ["n : ℕ", "(n : ℕ) n > 0", "(n : ℕ : n > 0", "(n) : True", "(n : ℕ) :", "⟨a, b⟩ : True"]) assert.equal(splitStatement(bad), null, bad);
});

test("the negation quantifies over every binder and negates the claim", () => {
  assert.equal(negation(splitStatement("(n : ℕ) : n ^ 2 ≥ 2 * n")!), ": ¬ (∀ (n : ℕ), n ^ 2 ≥ 2 * n)");
  assert.equal(negation(splitStatement("{α : Type} (a b : α) : a = b")!), ": ¬ (∀ {α : Type} (a b : α), a = b)");
  assert.equal(negation(splitStatement(": 1 = 2")!), ": ¬ (1 = 2)");
});

test("an answer is its side on the first line, the values after a colon, and the proof lines under it", () => {
  assert.deepEqual(readAnswer("true\nintro n\nomega"), { side: "true", values: [], body: "intro n\nomega" });
  assert.deepEqual(readAnswer("false: 1, -2"), { side: "false", values: ["1", "-2"], body: "" });
  assert.deepEqual(readAnswer("false"), { side: "false", values: [], body: "" });
  assert.equal(typeof readAnswer("maybe"), "string");
  assert.equal(typeof readAnswer(""), "string");
  for (const a of ["true", "true\nrfl", "false: 1", "false: 1, 2\nnorm_num at hc", "false"]) assert.equal(writeAnswer(readAnswer(a) as never), a, a);
  assert.equal(bareAnswer({ side: "true", values: [], body: " " }, "values"), true);
  assert.equal(bareAnswer({ side: "false", values: ["1"], body: "" }, "proof"), false);
  assert.equal(bareAnswer({ side: "false", values: [], body: "" }, "values"), true);
});

test("a value is a number; the count must match the variables", () => {
  for (const ok of ["3", "-2", "0.5", "1/2", " 7 "]) assert.equal(valueProblem(ok), null, ok);
  for (const bad of ["", "x", "1e5", "2+2", "(1)", "1, 2", "Real.pi", "1/", "1 2", "-1/-3"]) assert.notEqual(valueProblem(bad), null, bad);
  assert.equal(valuesProblem(["1", "2"], ["a", "b"]), null);
  assert.match(valuesProblem(["1"], ["a", "b"])!, /^This claim has 2 variables, a, b: give a value for each, in that order\.$/);
  assert.match(valuesProblem([], ["n"])!, /one variable, n: give a value for it/);
  assert.match(valuesProblem(["two"], ["n"])!, /“two” is not a number/);
  assert.match(valuesProblem([""], ["n"])!, /give a value for it/);
  // In ℕ and ℤ a fraction or a decimal is not the number it looks like, and ℕ has no negatives.
  const split = splitStatement("(n : ℕ) (k : ℤ) (x : ℝ) : True")!;
  assert.match(valuesProblem(["1/2", "0", "0"], ["n", "k", "x"], split)!, /not a whole number, and this variable is a natural number/);
  assert.match(valuesProblem(["1", "0.5", "0"], ["n", "k", "x"], split)!, /an integer/);
  assert.match(valuesProblem(["-1", "0", "0"], ["n", "k", "x"], split)!, /is negative/);
  assert.equal(valuesProblem(["1", "-3", "-1/2"], ["n", "k", "x"], split), null);
});

test("the counterexample's proof: the server's lines, then the close or the learner's own", () => {
  assert.equal(counterBody(["1", " 2 "], "norm_num", "values", "ignored"), "intro hall\nhave hc := hall (1) (2)\nclear hall\nrevert hc\nnorm_num");
  assert.equal(counterBody(["1"], "norm_num", "proof", "norm_num at hc\n"), "intro hall\nhave hc := hall (1)\nclear hall\nnorm_num at hc");
  assert.match(wrongSide(true, "Because."), /^This claim is true, so no counterexample can exist.* Because\.$/);
  assert.match(wrongSide(false, "At 1."), /^This claim is false, so it cannot be proved.* At 1\.$/);
});

test("the registry refuses a true-or-false that cannot be backed up as written", async () => {
  const { checkParams, EXERCISES, EXERCISE_KEYS } = await import("./registry.ts");
  const spec = EXERCISES.truefalse;
  const base = { says: "s", statement: "(n : ℕ) : n ^ 2 ≥ 2 * n", why: "w" };
  const says = (p: Record<string, unknown>) => checkParams(spec, { ...base, ...p }, EXERCISE_KEYS).join("\n");
  assert.equal(says({ truth: false, counterexample: "1" }), "");
  assert.match(says({}), /truth/);
  assert.match(says({ truth: true }), /a true claim needs a `solution`/);
  assert.match(says({ truth: true, solution: "nlinarith", counterexample: "1" }), /a true claim has no `counterexample`/);
  assert.match(says({ truth: false }), /a false claim needs a `counterexample`/);
  assert.match(says({ truth: false, counterexample: "1, 2" }), /`counterexample`: This claim has one variable, n/);
  assert.match(says({ truth: false, counterexample: "one" }), /“one” is not a number/);
  assert.match(says({ truth: false, counterexample: "1", solution: "norm_num" }), /with `witness: values` there is no `solution`/);
  assert.match(says({ truth: false, counterexample: "1", witness: "proof" }), /with `witness: proof` a `solution` is needed/);
  assert.match(says({ truth: true, solution: "x", close: "decide" }), /`close` is only for a false claim/);
  assert.match(says({ truth: false, counterexample: "1", statement: "n ^ 2 ≥ 2 * n : True" }), /binder groups/);
  assert.match(says({ truth: false, counterexample: "1", statement: ": 1 = 2" }), /needs variables in `\( \)` binders/);
});
