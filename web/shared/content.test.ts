import assert from "node:assert/strict";
import { test } from "node:test";
import { loadContent } from "../server/loader.ts";
import { sortLessons } from "./content.ts";

type Args = Parameters<typeof sortLessons>;
const lesson = (id: string, level: number, track: string, order: number) => ({ id, level, track, order });
const sorted = (lessons: object[], plans: Record<number, string[]> = {}) =>
  sortLessons(
    lessons as Args[0],
    ["logic", "math", "lean"].map((id) => ({ id })) as Args[1],
    Object.entries(plans).map(([id, p]) => ({ id: Number(id), planned: p.map((x) => ({ id: x })) })) as Args[2],
  ).map((l) => l.id);

const FOUR = [lesson("cantor", 4, "logic", 1), lesson("sets", 4, "math", 1), lesson("ops", 4, "math", 2), lesson("preds", 4, "lean", 1), lesson("zero", 0, "lean", 1)];
const PLAN = ["sets", "preds", "ops", "maps", "cantor"];

test("without a plan, lessons go by level, the order tracks are declared in, then order", () => {
  assert.deepEqual(sorted(FOUR), ["zero", "cantor", "sets", "ops", "preds"]);
  assert.deepEqual(sorted(FOUR, { 4: [] }), ["zero", "cantor", "sets", "ops", "preds"]);
});

test("a level's plan orders its lessons across tracks; one not written yet leaves no gap", () => {
  assert.deepEqual(sorted(FOUR, { 4: PLAN }), ["zero", "sets", "preds", "ops", "cantor"]);
  assert.deepEqual(sorted([...FOUR].reverse(), { 4: PLAN }), ["zero", "sets", "preds", "ops", "cantor"]);
});

test("a lesson the plan does not list goes by its track and order, or last", () => {
  const extra = (track: string, order: number) => sorted([...FOUR, lesson("extra", 4, track, order)], { 4: PLAN });
  assert.deepEqual(extra("math", 1.5), ["zero", "sets", "extra", "preds", "ops", "cantor"]);
  assert.deepEqual(extra("math", 9), ["zero", "sets", "preds", "ops", "extra", "cantor"]);
  assert.deepEqual(extra("math", 0.5), ["zero", "extra", "sets", "preds", "ops", "cantor"]);
  assert.deepEqual(extra("programs", 1), ["zero", "sets", "preds", "ops", "cantor", "extra"]);
});

test("the Path as it is: each planned level's written lessons stand in the plan's order, and levels without a plan by track", () => {
  const content = loadContent();
  assert.deepEqual(content.lessons, sortLessons([...content.lessons].reverse(), content.tracks, content.levels));
  for (const level of content.levels) {
    const ids = content.lessons.filter((l) => l.level === level.id).map((l) => l.id);
    const plan = level.planned.map((p) => p.id);
    assert.deepEqual(ids.filter((id) => plan.includes(id)), plan.filter((id) => ids.includes(id)));
    if (!plan.length) assert.deepEqual(ids, sortLessons(content.lessons.filter((l) => l.level === level.id), content.tracks).map((l) => l.id));
  }
});
