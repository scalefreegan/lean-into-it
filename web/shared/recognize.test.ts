import assert from "node:assert/strict";
import { test } from "node:test";
import { checkParams, EXERCISE_KEYS, EXERCISES } from "./registry.ts";
import { optionGoals, optionProblem, readPairing, sameState, shuffled } from "./recognize.ts";

test("two states are the same whatever the order of the facts, their grouping and their spacing", () => {
  const a = optionGoals("p q : Prop\nhp : p\n⊢ p ∧  q");
  assert.equal(sameState(a, optionGoals("hp : p\np : Prop\nq : Prop\n⊢ p ∧ q")), true);
  assert.equal(sameState(a, optionGoals("p q : Prop\nhp : p\n⊢ q ∧ p")), false);
  assert.equal(sameState(a, optionGoals("p q : Prop\n⊢ p ∧ q")), false, "a fact missing");
  // Two goals are compared in order.
  const two = "p q : Prop\n⊢ p\n\np q : Prop\n⊢ q";
  assert.equal(sameState(optionGoals(two), optionGoals(two)), true);
  assert.equal(sameState(optionGoals(two), optionGoals("p q : Prop\n⊢ q\n\np q : Prop\n⊢ p")), false);
  assert.deepEqual(optionGoals("No goals"), []);
  assert.equal(sameState(optionGoals("no goals"), []), true);
  assert.match(optionProblem("p : Prop")!, /^an option must be a proof state/);
  assert.equal(optionProblem("⊢ True"), null);
  assert.notEqual(optionProblem("p : Prop\n⊢ p\n\nq : Prop"), null, "a goal without its ⊢");
});

test("a match answer pairs every sentence with a different Lean line", () => {
  assert.deepEqual(readPairing("2, 0,1", 3), [2, 0, 1]);
  for (const bad of ["0,1", "0,0,1", "0,1,3", "a,b,c", ""]) assert.equal(typeof readPairing(bad, 3), "string", bad);
});

test("the order shown is the same each time for one exercise, and never the authored one", () => {
  for (const n of [2, 3, 4, 5, 6])
    for (const seed of ["a", "quantifiers", "x-1"]) {
      const o = shuffled(n, seed);
      assert.deepEqual([...o].sort(), [...Array(n).keys()]);
      assert.notDeepEqual(o, [...Array(n).keys()], `${n} ${seed}`);
      assert.deepEqual(shuffled(n, seed), o);
    }
});

test("the registry refuses reading exercises that cannot be marked", () => {
  const says = (kind: "predict" | "read" | "match", p: Record<string, unknown>) => checkParams(EXERCISES[kind], p, EXERCISE_KEYS).join("\n");
  const predict = { says: "s", statement: "(p : Prop) (hp : p) : p", move: "exact hp", options: ["no goals", "⊢ p"], solution: "no goals" };
  assert.equal(says("predict", predict), "");
  assert.match(says("predict", { ...predict, solution: "⊢ q" }), /must include the `solution`/);
  assert.match(says("predict", { ...predict, options: ["no goals", "p"] }), /proof state/);
  assert.match(says("predict", { ...predict, move: "intro h\nexact h" }), /one line/);
  assert.match(says("predict", { ...predict, before: "sorry" }), /sorry/);
  assert.match(says("predict", { ...predict, move: "native_decide" }), /`before`\/`move` line 1/);
  const read = { statement: ": True", options: ["a", "b"], solution: "a" };
  assert.equal(says("read", read), "");
  assert.match(says("read", { ...read, options: ["a"] }), /two to 5/);
  const match = { says: "s", english: ["a", "b"], lean: ["True", "False"] };
  assert.equal(says("match", match), "");
  assert.match(says("match", { ...match, lean: ["True"] }), /one statement for each sentence/);
  assert.match(says("match", { ...match, lean: ["True", "True"] }), /the same statement twice/);
  assert.match(says("match", { ...match, english: ["a"], lean: ["True"] }), /two to six/);
});
