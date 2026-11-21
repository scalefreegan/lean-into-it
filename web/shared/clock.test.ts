import assert from "node:assert/strict";
import { test } from "node:test";
import { elapsedFrom, MAX_ELAPSED_MS, WorkClock } from "./clock.ts";

test("the clock starts at the first touch, not before, and a later touch does not restart it", () => {
  let t = 1000;
  const c = new WorkClock(() => t);
  t = 5000;
  assert.equal(c.elapsed(), null, "not touched yet");
  c.start(true);
  t = 7000;
  c.start(true);
  t = 9500;
  assert.equal(c.elapsed(), 4500);
});

test("time while the tab is hidden does not count", () => {
  let t = 0;
  const c = new WorkClock(() => t);
  c.start(true);
  t = 10_000;
  c.visible(false);
  t = 600_000;
  assert.equal(c.elapsed(), 10_000, "hidden for ten minutes");
  c.visible(false);
  c.visible(true);
  t = 603_000;
  c.visible(true);
  assert.equal(c.elapsed(), 13_000);
});

test("touched while hidden, it waits for the tab to show; before a touch, showing and hiding do nothing", () => {
  let t = 0;
  const c = new WorkClock(() => t);
  c.visible(true);
  c.visible(false);
  assert.equal(c.elapsed(), null);
  c.start(false);
  t = 50_000;
  assert.equal(c.elapsed(), 0);
  c.visible(true);
  t = 52_000;
  assert.equal(c.elapsed(), 2000);
});

test("a working time from the browser is whole ms from 0 to a day, or nothing", () => {
  assert.equal(elapsedFrom(0), 0);
  assert.equal(elapsedFrom(83_600), 83_600);
  assert.equal(elapsedFrom(MAX_ELAPSED_MS), MAX_ELAPSED_MS);
  for (const bad of [MAX_ELAPSED_MS + 1, -1, 1.5, Number.NaN, Infinity, "5000", null, undefined, {}]) assert.equal(elapsedFrom(bad), null, String(bad));
  // The clock itself never says more than a day.
  let t = 0;
  const c = new WorkClock(() => t);
  c.start(true);
  t = 3 * MAX_ELAPSED_MS;
  assert.equal(c.elapsed(), MAX_ELAPSED_MS);
});
