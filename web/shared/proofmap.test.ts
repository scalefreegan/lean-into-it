import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMap, namesInLine, type MapGoal, type ProofMap } from "./proofmap.ts";

const g = (id: string, target: string, facts: [string, string, boolean?][], caseName?: string): MapGoal => ({
  id,
  target,
  ...(caseName ? { caseName } : {}),
  facts: facts.map(([name, type, inserted]) => ({ name, type, ...(inserted ? { inserted: true as const } : {}) })),
});
const label = (m: ProofMap, id: string) => m.nodes.find((n) => n.id === id)?.label;
const arrows = (m: ProofMap) => m.edges.map((e) => `${label(m, e.from)} -${e.kind}-> ${label(m, e.to)}`);

test("P → Q, P ⊢ Q by apply then exact: both facts, the goal Q, the goal P between, and every arrow", () => {
  const facts: [string, string][] = [["hP", "P"], ["hPQ", "P → Q"]];
  const start = [g("q", "Q", facts)];
  const m = buildMap(start, [
    { line: 0, text: "apply hPQ", before: start, after: [g("p", "P", facts)] },
    { line: 1, text: "exact hP", before: [g("p", "P", facts)], after: [] },
  ]);
  assert.deepEqual(
    m.nodes.map((n) => `${n.kind} ${n.label} ${n.state ?? ""}`.trim()),
    ["fact hP : P", "fact hPQ : P → Q", "goal ⊢ Q done", "move apply hPQ", "goal ⊢ P done", "move exact hP closes"],
  );
  assert.deepEqual(arrows(m), ["⊢ Q -acts-> apply hPQ", "hPQ : P → Q -uses-> apply hPQ", "apply hPQ -makes-> ⊢ P", "⊢ P -acts-> exact hP", "hP : P -uses-> exact hP"]);
  // Each node points back at its Lean line; the statement's at none.
  assert.deepEqual(m.nodes.map((n) => n.line), [null, null, null, 0, 0, 1]);
});

test("constructor branches in two lanes; closing one marks only that branch done", () => {
  const facts: [string, string][] = [["hP", "P"], ["hQ", "Q"]];
  const start = [g("pq", "P ∧ Q", facts)];
  const left = g("l", "P", facts, "left");
  const right = g("r", "Q", facts, "right");
  const m = buildMap(start, [
    { line: 0, text: "constructor", before: start, after: [left, right] },
    { line: 1, text: "· exact hP", before: [left, right], after: [] },
  ]);
  const goals = m.nodes.filter((n) => n.kind === "goal").map((n) => [n.label, n.state, n.col]);
  assert.deepEqual(goals, [
    ["⊢ P ∧ Q", "worked", 0],
    ["left: ⊢ P", "done", 0],
    ["right: ⊢ Q", "open", 1],
  ]);
  // The bullet is not part of the move's name.
  assert.ok(m.nodes.some((n) => n.kind === "move" && n.label === "exact hP"));
  assert.equal(m.lanes, 2);
});

test("a fact a move brings in is a node of its own, made by that move; adding a line moves nothing already drawn", () => {
  const start = [g("a", "P → Q", [["hPQ", "P → Q"]])];
  const one = [{ line: 0, text: "intro hP", before: start, after: [g("b", "Q", [["hPQ", "P → Q"], ["hP", "P", true]])] }];
  const m1 = buildMap(start, one);
  assert.ok(arrows(m1).includes("intro hP -makes-> hP : P"));
  const m2 = buildMap(start, [...one, { line: 1, text: "exact hPQ hP", before: one[0].after, after: [] }]);
  for (const n of m1.nodes) assert.deepEqual(m2.nodes.find((k) => k.id === n.id) && [m2.nodes.find((k) => k.id === n.id)!.col, m2.nodes.find((k) => k.id === n.id)!.row], [n.col, n.row], n.id);
  assert.deepEqual(arrows(m2).filter((a) => a.endsWith("exact hPQ hP")), ["⊢ Q -acts-> exact hPQ hP", "hPQ : P → Q -uses-> exact hPQ hP", "hP : P -uses-> exact hPQ hP"]);
});

test("a line that leaves its goal as it was and makes nothing (the head of a step over several lines) draws nothing", () => {
  const start = [g("a", "Q", [])];
  const m = buildMap(start, [{ line: 0, text: "induction n with", before: start, after: start }]);
  assert.equal(m.nodes.filter((n) => n.kind === "move").length, 0);
});

test("the names a line writes are whole identifiers, comments aside", () => {
  assert.deepEqual([...namesInLine("exact hPQ hP -- not h")], ["exact", "hPQ", "hP"]);
  assert.ok(namesInLine("rw [h₁] at h'").has("h₁"));
  assert.ok(namesInLine("obtain ⟨x, hx⟩ := h").has("hx"));
});

test("case names show only where they tell a move's goals apart", () => {
  const start = [g("r", "R", [])];
  const m = buildMap(start, [{ line: 0, text: "apply h", before: start, after: [g("p", "P", [], "a"), g("q", "Q", [], "a")] }]);
  assert.deepEqual(m.nodes.filter((n) => n.kind === "goal").map((n) => n.label), ["⊢ R", "⊢ P", "⊢ Q"]);
});

test("goals first seen inside a block are made by the line that opened it, and a refused head keeps its goal unfinished", () => {
  const start = [g("n", "0 + n = n", [])];
  const zero = g("z", "0 + 0 = 0", []);
  const succ = g("s", "0 + (k + 1) = k + 1", [["ih", "0 + k = k"]]);
  const head = { line: 0, text: "induction n with", before: start, after: start };
  const full = buildMap(start, [head, { line: 1, text: "| zero => rfl", before: [zero], after: [] }, { line: 2, text: "| succ k ih => omega", before: [succ], after: [] }]);
  assert.deepEqual(arrows(full).filter((a) => a.startsWith("induction")), ["induction n with -makes-> ⊢ 0 + 0 = 0", "induction n with -makes-> ⊢ 0 + (k + 1) = k + 1", "induction n with -makes-> ih : 0 + k = k"]);
  assert.equal(full.nodes.find((n) => n.label === "⊢ 0 + n = n")?.state, "done");
  // "Alternative succ has not been provided": the head is refused, the zero case still drawn, the whole not done.
  const part = buildMap(start, [{ ...head, refused: true }, { line: 1, text: "| zero => rfl", before: [zero], after: [] }]);
  assert.equal(part.nodes.find((n) => n.label === "⊢ 0 + 0 = 0")?.state, "done");
  assert.equal(part.nodes.find((n) => n.label === "⊢ 0 + n = n")?.state, "worked");
});

test("all_goals works on every goal it closes; a goal Lean shows again is not drawn twice", () => {
  const start = [g("pp", "P ∧ P", [])];
  const l = g("l", "P", [], "left");
  const r = g("r", "P", [], "right");
  const m = buildMap(start, [
    { line: 0, text: "constructor", before: start, after: [l, r] },
    { line: 1, text: "all_goals exact hP", before: [l, r], after: [] },
  ]);
  assert.deepEqual(m.nodes.filter((n) => n.kind === "goal").map((n) => n.state), ["done", "done", "done"]);
  // The end of a bullet's last line can show the goals outside it: they are not made again.
  const again = buildMap(start, [
    { line: 0, text: "constructor", before: start, after: [l, r] },
    { line: 1, text: "· exact hP", before: [l, r], after: [r] },
  ]);
  assert.equal(new Set(again.nodes.map((n) => n.id)).size, again.nodes.length);
  assert.equal(again.nodes.filter((n) => n.kind === "goal").length, 3);
});

test("no lines: the statement alone", () => {
  const m = buildMap([g("q", "Q", [["hP", "P"]])], []);
  assert.deepEqual(m.nodes.map((n) => `${n.kind} ${n.state ?? ""}`.trim()), ["fact", "goal open"]);
  assert.equal(m.rows, 1);
});
