import assert from "node:assert/strict";
import { test } from "node:test";
import { elapsedFrom, MAX_ELAPSED_MS, WorkClock } from "./clock.ts";

test("the clock says nothing until it first runs, then counts only the time it runs", () => {
  let t = 1000;
  const c = new WorkClock(() => t);
  t = 5000;
  assert.equal(c.elapsed(), null, "never on screen yet");
  c.run(true);
  t = 9000;
  assert.equal(c.elapsed(), 4000);
  // Scrolled away, or the tab hidden: ten minutes that do not count.
  c.run(false);
  t = 609_000;
  assert.equal(c.elapsed(), 4000);
  // Told the same thing twice changes nothing.
  c.run(false);
  c.run(true);
  t = 611_000;
  c.run(true);
  t = 612_500;
  assert.equal(c.elapsed(), 7500);
});

test("a working time from the browser is whole ms from 0 to a day, or nothing", () => {
  assert.equal(elapsedFrom(0), 0);
  assert.equal(elapsedFrom(83_600), 83_600);
  assert.equal(elapsedFrom(MAX_ELAPSED_MS), MAX_ELAPSED_MS);
  for (const bad of [MAX_ELAPSED_MS + 1, -1, 1.5, Number.NaN, Infinity, "5000", null, undefined, {}]) assert.equal(elapsedFrom(bad), null, String(bad));
});

test("a clock run past a day says nothing, not a day", () => {
  let t = 0;
  const c = new WorkClock(() => t);
  c.run(true);
  t = MAX_ELAPSED_MS;
  assert.equal(c.elapsed(), MAX_ELAPSED_MS);
  t = MAX_ELAPSED_MS + 1;
  assert.equal(c.elapsed(), null);
});
