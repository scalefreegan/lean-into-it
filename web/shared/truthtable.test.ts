import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluate, lettersOf, parseFormula, partsOf, rowsOf, show, type Formula } from "./truthtable.ts";

const f = (text: string): Formula => {
  const r = parseFormula(text);
  if (typeof r === "string") throw new Error(`${text}: ${r}`);
  return r;
};
const column = (text: string) => {
  const g = f(text);
  return rowsOf(lettersOf(g)).map((row) => (evaluate(g, row) ? "T" : "F")).join("");
};

test("each connective has its truth table", () => {
  // Rows: p,q = TT, TF, FT, FF.
  assert.equal(column("p ∧ q"), "TFFF");
  assert.equal(column("p ∨ q"), "TTTF");
  assert.equal(column("p → q"), "TFTT");
  assert.equal(column("p ↔ q"), "TFFT");
  assert.equal(column("¬p"), "FT");
  assert.equal(column("True ∧ p"), "TF");
  assert.equal(column("p ∨ ⊥"), "TF");
});

test("the plain ASCII spellings mean the same", () => {
  for (const [a, b] of [
    ["p /\\ q", "p ∧ q"],
    ["p & q", "p ∧ q"],
    ["p \\/ q", "p ∨ q"],
    ["p | q", "p ∨ q"],
    ["p -> q", "p → q"],
    ["p <-> q", "p ↔ q"],
    ["~p", "¬p"],
    ["!p", "¬p"],
  ])
    assert.equal(show(f(a)), show(f(b)), a);
});

test("precedence and grouping are Lean's: ¬ tightest, then ∧, ∨, →, ↔; → and ↔ to the right", () => {
  assert.equal(show(f("¬p ∧ q ∨ r → s ↔ t")), "¬p ∧ q ∨ r → s ↔ t");
  assert.equal(show(f("(¬p ∧ q) ∨ r")), "¬p ∧ q ∨ r");
  assert.equal(show(f("¬(p ∧ q)")), "¬(p ∧ q)");
  // p → q → r is p → (q → r), which is not (p → q) → r.
  assert.equal(show(f("p → q → r")), "p → q → r");
  assert.equal(show(f("(p → q) → r")), "(p → q) → r");
  assert.notEqual(column("p → q → r"), column("(p → q) → r"));
  assert.equal(column("p → q → r"), column("p ∧ q → r"));
});

test("well-known laws hold on every row", () => {
  const same = (a: string, b: string) => assert.equal(column(`(${a}) ↔ (${b})`).replace(/T/g, ""), "", `${a} ≡ ${b}`);
  same("¬(p ∧ q)", "¬p ∨ ¬q");
  same("¬(p ∨ q)", "¬p ∧ ¬q");
  same("p → q", "¬q → ¬p");
  same("p → q", "¬p ∨ q");
  same("p ↔ q", "(p → q) ∧ (q → p)");
  same("p ∧ (q ∨ r)", "p ∧ q ∨ p ∧ r");
  assert.match(column("(p → q) ↔ (q → p)"), /F/, "the converse is not the same");
});

test("rows come all-true first, the last letter changing fastest", () => {
  assert.deepEqual(rowsOf(["p", "q"]), [
    { p: true, q: true },
    { p: true, q: false },
    { p: false, q: true },
    { p: false, q: false },
  ]);
  assert.equal(rowsOf(["p", "q", "r"]).length, 8);
  assert.deepEqual(lettersOf(f("r ∧ p → q ∨ p")), ["p", "q", "r"]);
});

test("the parts of a formula, innermost first, each once", () => {
  assert.deepEqual(partsOf(f("(p → q) ∧ ¬q → ¬p")).map(show), ["p → q", "¬q", "(p → q) ∧ ¬q", "¬p", "(p → q) ∧ ¬q → ¬p"]);
  assert.deepEqual(partsOf(f("p ∧ p")).map(show), ["p ∧ p"]);
  assert.deepEqual(partsOf(f("p")).map(show), []);
});

test("text that is not a formula says why", () => {
  for (const [text, why] of [
    ["", /empty/],
    ["p ∧", /ends too soon/],
    ["(p ∧ q", /not closed/],
    ["p ∧ q)", /nothing open/],
    ["p q", /no connective/],
    ["p + q", /“\+” is not part/],
    ["prime ∧ q", /not a letter/],
    ["∧ p", /missing what it connects/],
  ] as const)
    assert.match(parseFormula(text) as string, why, text);
});

test("the registry refuses a table it cannot draw, and a domino gap with no next domino", async () => {
  const { checkParams, WIDGETS } = await import("./registry.ts");
  const table = (p: Record<string, unknown>) => checkParams(WIDGETS["truth-table"], p).join("\n");
  assert.equal(table({ formula: "p → q" }), "");
  assert.match(table({ formula: "p ∧" }), /`formula`: the formula ends too soon/);
  assert.match(table({ formula: "a ∧ b ∧ c ∧ d ∧ e ∧ f" }), /6 letters; at most 5/);
  const dominoes = (p: Record<string, unknown>) => checkParams(WIDGETS["induction-dominoes"], p).join("\n");
  assert.equal(dominoes({ count: 6, start: 1, gap: 2 }), "");
  assert.match(dominoes({ count: 6, start: 1, gap: 6 }), /1 to 5/);
  assert.match(dominoes({ gap: 0, start: 1 }), /1 to 7/);
  assert.notEqual(dominoes({ count: 3 }), "");
});
