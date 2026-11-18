import assert from "node:assert/strict";
import { test } from "node:test";
import { parseExpr } from "./expr.ts";
import { inInterval, intervalLabel, readInterval, readPoint, type Interval } from "./numberline.ts";
import { clean, curve, fitHeights, label, ticks } from "./plot.ts";

test("ticks fall on round numbers and cover the range", () => {
  assert.deepEqual(ticks(-5, 5), [-4, -2, 0, 2, 4]);
  assert.deepEqual(ticks(-5, 5, 10), [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5]);
  assert.deepEqual(ticks(0, 1, 5), [0, 0.2, 0.4, 0.6, 0.8, 1]);
  assert.deepEqual(ticks(-0.3, 0.3, 6), [-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3]);
  assert.deepEqual(ticks(0, 1000, 4), [0, 500, 1000]);
  assert.deepEqual(ticks(2.5, 2.5), []);
  assert.deepEqual(ticks(3, 1), []);
  assert.equal(clean(0.1 + 0.2), 0.3);
});

test("numbers are written the way a textbook writes them", () => {
  assert.equal(label(3), "3");
  assert.equal(label(-3), "−3");
  assert.equal(label(2.5), "2.5");
  assert.equal(label(1 / 3), "0.33");
  assert.equal(label(-0.001), "0");
  assert.equal(label(0.30000000000000004), "0.3");
  assert.equal(label(Number.NaN), "undefined");
  assert.equal(label(1 / 0), "undefined");
});

test("a curve is one run where the function is continuous, and breaks where it is not", () => {
  const view = { x0: -5, x1: 5, y0: -5, y1: 5 };
  const line = curve(parseExpr("2x + 1"), view, 100);
  assert.equal(line.length, 1);
  assert.equal(line[0].length, 101);
  assert.deepEqual(line[0][0], [-5, -9]);
  // 1/x: no value at 0, and the two branches are not joined across it.
  const hyperbola = curve(parseExpr("1/x"), view, 100);
  assert.equal(hyperbola.length, 2);
  assert.ok(hyperbola[0].every(([x]) => x < 0) && hyperbola[1].every(([x]) => x > 0));
  // The same when no sample lands exactly on the asymptote.
  assert.equal(curve(parseExpr("1/(x - 0.013)"), view, 100).length, 2);
  assert.ok(curve(parseExpr("tan(x)"), view, 400).length >= 3);
  // sqrt has no value left of 0: one run, starting at 0.
  const root = curve(parseExpr("sqrt(x)"), view, 100);
  assert.equal(root.length, 1);
  assert.equal(root[0][0][0], 0);
  // A steep but continuous curve is not broken.
  assert.equal(curve(parseExpr("x^3"), view, 100).length, 1);
  // Far-off values are kept drawable.
  assert.ok(curve(parseExpr("x^9"), view, 100)[0].every(([, y]) => Math.abs(y) <= 45));
  // Only part of the view.
  const part = curve(parseExpr("2x + 1"), view, 10, 0, 1);
  assert.deepEqual([part[0][0], part[0].at(-1)], [[0, 1], [1, 3]]);
  assert.deepEqual(curve(parseExpr("x"), view, 10, 7, 9), []);
  assert.deepEqual(curve(parseExpr("log(-abs(x) - 1)"), view, 10), []);
});

test("the height of a plot is fitted to its curves", () => {
  const [lo, hi] = fitHeights([parseExpr("2x + 1")], 0, 1);
  assert.ok(lo < 1 && lo >= -1 && hi > 3 && hi < 4, `${lo}..${hi}`);
  const [plo, phi] = fitHeights([parseExpr("x^2")], -3, 3);
  assert.ok(plo < 0 && plo > -2 && phi > 9 && phi < 11, `${plo}..${phi}`);
  // An asymptote does not flatten everything else.
  const [alo, ahi] = fitHeights([parseExpr("1/x")], -5, 5);
  assert.ok(alo >= -45 && ahi <= 45, `${alo}..${ahi}`);
  assert.deepEqual(fitHeights([parseExpr("sqrt(-1 - x^2)")], -1, 1), [-1, 1]);
  const [clo, chi] = fitHeights([parseExpr("3")], -1, 1);
  assert.ok(clo < 3 && chi > 3);
});

test("points and intervals as a lesson writes them", () => {
  assert.deepEqual(readPoint(2), { value: 2, label: "2" });
  assert.deepEqual(readPoint("1/2"), { value: 0.5, label: "1/2" });
  assert.deepEqual(readPoint("-7/3"), { value: -7 / 3, label: "−7/3" });
  assert.deepEqual(readPoint("sqrt(2): √2"), { value: Math.SQRT2, label: "√2" });
  assert.deepEqual(readPoint("3: a"), { value: 3, label: "a" });
  assert.equal(readPoint("x"), null);
  assert.equal(readPoint("north"), null);
  assert.equal(readPoint(null), null);
  assert.equal(readPoint(Number.POSITIVE_INFINITY), null);

  assert.deepEqual(readInterval("(2, 4)"), { lo: 2, hi: 4, loClosed: false, hiClosed: false });
  assert.deepEqual(readInterval("[0,1]"), { lo: 0, hi: 1, loClosed: true, hiClosed: true });
  assert.deepEqual(readInterval(" ( -inf , 3 ] "), { lo: -Infinity, hi: 3, loClosed: false, hiClosed: true });
  assert.deepEqual(readInterval("[1/2, ∞)"), { lo: 0.5, hi: Infinity, loClosed: true, hiClosed: false });
  assert.match(readInterval("2 to 4") as string, /not an interval/);
  assert.match(readInterval("(4, 2)") as string, /left end must be less/);
  assert.match(readInterval("(2, 2)") as string, /left end must be less/);
  assert.match(readInterval("[-inf, 2)") as string, /no point at -inf/);
  assert.match(readInterval("(2, inf]") as string, /no point at inf/);
  assert.match(readInterval("(a, 2)") as string, /left end “a” is not a number/);
  assert.match(readInterval("(inf, 2)") as string, /left end/);
  assert.match(readInterval(["(2, 4)"]) as string, /written as text/);

  const open = readInterval("(2, 4)") as Interval;
  const half = readInterval("[2, 4)") as Interval;
  assert.deepEqual([2, 3, 4, 5].map((x) => inInterval(x, open)), [false, true, false, false]);
  assert.deepEqual([2, 3, 4].map((x) => inInterval(x, half)), [true, true, false]);
  assert.ok(inInterval(-1e9, readInterval("(-inf, 3]") as Interval));
  assert.equal(intervalLabel(readInterval("(-inf, -1/2]") as Interval), "(−∞, −0.5]");
});
