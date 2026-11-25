import assert from "node:assert/strict";
import { test } from "node:test";
import { checkParams, WIDGETS } from "./registry.ts";
import { insideOf, member, parseSet, readSetDiagram, regionName, regionsOf, setsOf, showSet, type SetFormula } from "./setdiagram.ts";

const f = (s: string) => {
  const r = parseSet(s);
  assert.notEqual(typeof r, "string", `${s}: ${String(r)}`);
  return r as SetFormula;
};
const AB = ["A", "B"];
const ABC = ["A", "B", "C"];

test("a formula names the regions its definition says, for every region", () => {
  const says: [string, (a: boolean, b: boolean, c: boolean) => boolean][] = [
    ["A ∪ B", (a, b) => a || b],
    ["A ∩ B", (a, b) => a && b],
    ["A \\ B", (a, b) => a && !b],
    ["Aᶜ", (a) => !a],
    ["A^c ∩ B^c", (a, b) => !a && !b],
    ["A ∪ B ∩ C", (a, b, c) => a || (b && c)],
    ["(A ∪ B) ∩ C", (a, b, c) => (a || b) && c],
    ["(A \\ B) \\ C", (a, b, c) => a && !b && !c],
    ["A \\ (B \\ C)", (a, b, c) => a && !(b && !c)],
    ["A ∪ Bᶜᶜ", (a, b) => a || b],
    ["∅", () => false],
    ["univ \\ A", (a) => !a],
  ];
  for (const [s, want] of says)
    for (let k = 0; k < 8; k++) {
      const inside = insideOf(ABC, k);
      assert.equal(member(f(s), inside), want(inside.has("A"), inside.has("B"), inside.has("C")), `${s} at ${regionName(ABC, k)}`);
    }
  assert.deepEqual(regionsOf(f("(A ∪ B)ᶜ"), AB), regionsOf(f("Aᶜ ∩ Bᶜ"), AB));
  assert.deepEqual(regionsOf(f("A"), AB), [1, 3]);
});

test("a formula is written back so that it reads the same", () => {
  for (const s of ["A ∪ B ∩ C", "(A ∪ B) ∩ C", "A ∪ (B ∪ C)", "A \\ (B ∩ C)", "(A \\ B) ∩ C", "(A ∩ B)ᶜ", "Aᶜᶜ", "∅ ∪ univ", "(A ∩ B) ∩ C"]) assert.deepEqual(f(showSet(f(s))), f(s), s);
  assert.equal(showSet(f("((A)∪(B))^c")), "(A ∪ B)ᶜ");
  assert.equal(showSet(f("(A \\ B) \\ C")), "(A \\ B) \\ C");
  assert.equal(showSet(f("A ∪ B ∩ C")), "A ∪ (B ∩ C)");
  assert.deepEqual(setsOf(f("C ∪ A ∩ C")), ["A", "C"]);
});

test("a formula that cannot be read says why", () => {
  for (const [s, why] of [["", /empty/], ["A ∪", /too soon/], ["A B", /nothing between/], ["(A ∪ B", /not closed/], ["A)", /nothing open/], ["∩ A", /missing the set/], ["()", /nothing before/], ["A + B", /“\+”/], ["AB", /“AB”/], ["a ∪ B", /“a”/], ["A \\ B \\ C", /brackets/], ["A ∩ B \\ C", /brackets/], ["A \\ B ∩ C", /brackets/]] as const)
    assert.match(String(parseSet(s)), why, s);
});

test("regions in words", () => {
  assert.deepEqual([0, 1, 2, 3].map((k) => regionName(AB, k)), ["in neither A nor B", "in A, not in B", "in B, not in A", "in A and B"]);
  assert.equal(regionName(ABC, 0), "in none of A, B, C");
  assert.equal(regionName(ABC, 1), "in A, not in B or C");
  assert.equal(regionName(ABC, 7), "in A, B and C");
});

test("the registry refuses a diagram it cannot draw", () => {
  const check = (p: Record<string, unknown>) => checkParams(WIDGETS["set-diagram"], p).join("\n");
  assert.equal(check({ formula: "A ∩ B" }), "");
  assert.equal(check({ formula: "Aᶜ", sets: ["A", "B"] }), "");
  assert.match(check({ formula: "Aᶜ" }), /has 1: list the others/);
  assert.match(check({ formula: "A ∪ B ∪ C ∪ D" }), /has 4/);
  assert.match(check({ formula: "A ∪" }), /`formula`: the formula ends too soon/);
  assert.match(check({ formula: "A ∪ B", against: "A +" }), /`against`/);
  assert.match(check({ formula: "A ∪ B", empty: "univ" }), /no region/);
  assert.match(check({ formula: "A ∪ C", sets: ["A", "B"] }), /name C/);
  assert.match(check({ formula: "A", sets: ["A", "A"] }), /twice/);
  assert.match(check({ formula: "A", sets: ["A", "b"] }), /capital/);
  assert.match(check({ formula: "A ∪ B", against: "B ∪ A", fill: true }), /does not go with/);
  const sub = readSetDiagram({ formula: "A", empty: "A \\ B" });
  assert.ok(typeof sub !== "string");
  assert.deepEqual(sub.empty, [1]);
});
