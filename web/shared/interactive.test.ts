import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { fromReply, refsIn, withRemoved } from "./interactive.ts";

// Replies of `Lean.Widget.getInteractiveGoals` from the real Lean (v4.36),
// for `example (P Q R : Prop) (hPQ : P → Q) : P → Q ∧ P := by intro hP; constructor; …`:
// before `intro hP`, after it, and after `constructor`.
const fx = JSON.parse(fs.readFileSync(new URL("./fixtures/interactive-goals.json", import.meta.url), "utf8"));

test("each hypothesis is one, with its own names, and its type as text and as tagged parts", () => {
  const [{ goal }] = fromReply(fx.afterIntro)!;
  assert.deepEqual(
    goal.hypotheses.map((h) => [h.names, h.type]),
    [
      [["P", "Q", "R"], "Prop"],
      [["hPQ"], "P → Q"],
      [["hP"], "P"],
    ],
  );
  assert.equal(goal.target, "Q ∧ P");
  assert.equal(goal.caseName, undefined);
  // `P → Q` with its two sides as subexpressions; no session reference is kept.
  assert.deepEqual(goal.hypotheses[1].typeTagged, { tag: [{ pos: "/" }, { append: [{ tag: [{ pos: "/0" }, { text: "P" }] }, { text: " → " }, { tag: [{ pos: "/1" }, { text: "Q" }] }] }] });
});

test("the step just made is marked: the hypothesis it added, the parts of a goal it changed", () => {
  const [{ goal }] = fromReply(fx.afterIntro)!;
  assert.deepEqual(goal.hypotheses.map((h) => h.inserted ?? false), [false, false, true]);
  const split = fromReply(fx.afterConstructor)!.map((g) => g.goal);
  assert.deepEqual(split.map((g) => [g.caseName, g.target]), [["left", "Q"], ["right", "P"]]);
  assert.deepEqual(split[0].targetTagged, { tag: [{ pos: "/", diff: "wasChanged" }, { text: "Q" }] });
});

test("seen from before a step, what it will take away is marked", () => {
  const [{ goal }] = fromReply(fx.beforeIntro)!;
  assert.equal(goal.target, "P → Q ∧ P");
  assert.match(JSON.stringify(goal.targetTagged), /"diff":"willDelete"/);
});

test("withRemoved: what the step took away goes with the goals it made, not with the goals it left alone", () => {
  const h = { names: ["h"], type: "P ∧ Q" };
  const before = [
    { id: "a", goal: { hypotheses: [{ ...h, removed: true as const }], target: "Q" } },
    { id: "b", goal: { hypotheses: [h], target: "R" } },
  ];
  const after = [
    { id: "c", goal: { hypotheses: [{ names: ["hp"], type: "P", inserted: true as const }], target: "Q" } },
    { id: "b", goal: { hypotheses: [h], target: "R" } },
  ];
  const out = withRemoved(after, before);
  assert.deepEqual(out[0].gone, [h]);
  assert.equal(out[1].gone, undefined);
  // The facts are only what is there now.
  assert.deepEqual(out[0].hypotheses.map((x) => x.names), [["hp"]]);
  assert.deepEqual(withRemoved(after, null), after.map((g) => g.goal));
});

test("every session reference in a reply is found, to be released", () => {
  const refs = refsIn(fx.afterConstructor);
  assert.ok(refs.length > 10);
  assert.ok(refs.every((r) => typeof r.p === "string"));
  assert.equal(fromReply(null), null);
  assert.equal(fromReply({ nope: 1 }), null);
});
