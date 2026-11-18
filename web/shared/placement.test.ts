import assert from "node:assert/strict";
import { test } from "node:test";
import { loadContent } from "../server/loader.ts";
import { PLACEMENT_DUE_DAYS, PLACEMENT_PER_LEVEL, PLACEMENT_SPREAD_DAYS, placementCredits, placementItems, placementLevels, placementOpens, placementVerdict, toPass } from "./placement.ts";
import { startOfDay } from "./progress.ts";

const lvl = (id: number, status: "written" | "outline" = "written") => ({ id, title: "", summary: "", status, topics: [], moves: [] });
const ex = (id: string, concept: string, extra: Record<string, unknown> = {}) => ({ id, concept, kind: "prove", mode: "typed", options: [], solution: "exact h", ...extra });
const content = {
  levels: [lvl(2), lvl(0), lvl(1), lvl(3, "outline")],
  lessons: [
    { id: "zero", level: 0, exercises: [ex("long", "a", { solution: "intro h\nexact h" }), ex("short", "a"), ex("board", "a", { mode: "board", solution: "intro h\nexact h\nrfl" }), ex("b1", "b")] },
    { id: "zero-b", level: 0, exercises: [ex("fill", "a", { kind: "fill", solution: "h" }), ex("c1", "c")] },
    { id: "one", level: 1, exercises: Array.from({ length: 9 }, (_, i) => ex(`d${i}`, `d${i}`)) },
    { id: "two", level: 2, exercises: [] },
  ],
} as unknown as Parameters<typeof placementItems>[0];

test("placement asks about written levels whose lessons have exercises, in order", () => {
  assert.deepEqual(placementLevels(content), [0, 1]);
});

test("one question per concept, by its quickest exercise; one not solved before first", () => {
  const items = placementItems(content, 0, 1);
  assert.deepEqual(items.map((i) => i.concept), ["a", "b", "c"], "every concept, in curriculum order");
  assert.equal(items[0].exerciseId, "fill", "a fill is quicker than any proof");
  const noFill = { ...content, lessons: content.lessons.filter((l) => l.id !== "zero-b") };
  assert.equal(placementItems(noFill, 0, 1)[0].exerciseId, "board", "a board proof before a typed one");
  assert.equal(placementItems(noFill, 0, 1, { zero: { board: {} } })[0].exerciseId, "short", "then the shortest typed proof, when the board one is solved");
});

test("at most PLACEMENT_PER_LEVEL concepts, chosen by the seed", () => {
  const a = placementItems(content, 1, 7);
  assert.equal(a.length, PLACEMENT_PER_LEVEL);
  assert.deepEqual(placementItems(content, 1, 7), a, "the same seed asks the same");
  const many = new Set(Array.from({ length: 20 }, (_, s) => placementItems(content, 1, s).map((i) => i.concept).join()));
  assert.ok(many.size > 1, "another seed, other concepts");
});

test("a level is settled as soon as it can be", () => {
  assert.equal(toPass(6), 5);
  assert.equal(toPass(4), 3);
  assert.equal(placementVerdict(4, 0, 6), "going");
  assert.equal(placementVerdict(5, 0, 6), "passed", "passed before the last question");
  assert.equal(placementVerdict(3, 1, 6), "going");
  assert.equal(placementVerdict(3, 2, 6), "failed", "two misses in six: 75% is out of reach");
  assert.equal(placementVerdict(0, 1, 3), "failed");
  assert.equal(placementVerdict(0, 0, 0), "passed");
});

test("the passed levels' concepts are credited, due over the following one to two weeks", () => {
  const now = new Date(2026, 10, 18, 15);
  const credits = placementCredits(content, 2, now);
  assert.deepEqual(credits.map((c) => c.concept), ["a", "b", "c", ...Array.from({ length: 9 }, (_, i) => `d${i}`)]);
  const days = credits.map((c) => Math.round((c.dueAt.getTime() - startOfDay(now).getTime()) / 86_400_000));
  assert.equal(Math.min(...days), PLACEMENT_DUE_DAYS);
  assert.equal(Math.max(...days), PLACEMENT_DUE_DAYS + PLACEMENT_SPREAD_DAYS - 1);
  assert.equal(new Set(days).size, PLACEMENT_SPREAD_DAYS, "spread over every day of the window");
  assert.deepEqual(placementCredits(content, 0, now), [], "placed at the start: nothing credited");
  assert.deepEqual(placementCredits(content, 1, now).map((c) => c.concept), ["a", "b", "c"]);
});

test("a placement opens the first level not passed, or the last when all were", () => {
  assert.equal(placementOpens(content, 0), null);
  assert.equal(placementOpens(content, 1), 1);
  assert.equal(placementOpens(content, 2), 1, "past the last level: the last one");
});

test("the real curriculum: every placement level has questions", () => {
  const real = loadContent();
  for (const level of placementLevels(real)) {
    const items = placementItems(real, level, 42);
    assert.ok(items.length > 0 && items.length <= PLACEMENT_PER_LEVEL, `level ${level}`);
    assert.equal(new Set(items.map((i) => i.concept)).size, items.length);
  }
});
