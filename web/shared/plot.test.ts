import assert from "node:assert/strict";
import { test } from "node:test";
import { parseExpr } from "./expr.ts";
import { inInterval, intervalLabel, readInterval, readPoint, type Interval } from "./numberline.ts";
import { clean, curve, fitHeights, label, placesFor, roundStep, tickPlaces, ticks } from "./plot.ts";

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

test("labels keep enough decimals to tell neighbouring ticks apart", () => {
  assert.deepEqual([1, 0.5, 0.2, 0.01, 0.005, 2e-4, 100].map(placesFor), [0, 1, 1, 2, 3, 4, 0]);
  assert.deepEqual([0.06, 0.05, 0.049, 3, 0.1].map(roundStep).map(clean), [0.05, 0.05, 0.02, 2, 0.1]);
  for (const [lo, hi] of [[0, 0.05], [0.98, 1.01], [0.4999, 0.5001], [-5, 5], [1000, 90000]]) {
    const marks = ticks(lo, hi, 8);
    const labels = marks.map((t) => label(t, tickPlaces(marks)));
    assert.equal(new Set(labels).size, labels.length, `${lo}..${hi}: ${labels.join(" ")}`);
    marks.forEach((t, i) => assert.ok(Math.abs(Number(labels[i].replace("−", "-")) - t) < 1e-9, `${labels[i]} for ${t}`));
  }
});

test("a jump is never joined, wherever the samples fall, and a steep line is never broken", () => {
  // 1/x with one side of the asymptote inside the view.
  for (const shift of [0.05, 0.3, 0.013]) {
    const runs = curve(parseExpr("1/x"), { x0: -15 + shift, x1: 15 + shift, y0: -15, y1: 15 }, 400);
    assert.equal(runs.length, 2, `shift ${shift}`);
    assert.ok(runs[0].every(([x]) => x < 0) && runs[1].every(([x]) => x > 0));
    // Each branch runs off the picture: down on the left, up on the right.
    assert.ok(runs[0].at(-1)![1] < -15 && runs[1][0][1] > 15);
  }
  // A step whose two sides are both in view.
  for (const view of [{ x0: -3, x1: 4, y0: -2, y1: 2 }, { x0: -2.99, x1: 3.01, y0: -2, y1: 2 }]) {
    const step = curve(parseExpr("|x|/x"), view, 400);
    assert.equal(step.length, 2);
    assert.ok(step[0].every(([, y]) => y === -1) && step[1].every(([, y]) => y === 1));
    assert.ok(Math.abs(step[0].at(-1)![0]) < 1e-6 && Math.abs(step[1][0][0]) < 1e-6, "each side reaches the jump");
  }
  // tan, far zoomed out: one run per branch.
  const tan = curve(parseExpr("tan(x)"), { x0: -40, x1: 40, y0: -40, y1: 40 }, 400);
  assert.ok(tan.length >= 25, `${tan.length} runs`);
  for (const run of tan) for (let i = 1; i < run.length; i++) assert.ok(run[i][1] >= run[i - 1][1], "tan only climbs within a branch");
  // Steep, continuous: one run.
  assert.equal(curve(parseExpr("1000(x - 0.0123)"), { x0: -5, x1: 5, y0: -5, y1: 5 }, 400).length, 1);
  assert.equal(curve(parseExpr("x^9"), { x0: -5, x1: 5, y0: -5, y1: 5 }, 400).length, 1);
  assert.equal(curve(parseExpr("sin(50x)"), { x0: -5, x1: 5, y0: -1, y1: 1 }, 400).length, 1);
  // sqrt starts at 0 even when no sample lands there.
  const root = curve(parseExpr("sqrt(x)"), { x0: -3, x1: 4, y0: -1, y1: 3 }, 400);
  assert.equal(root.length, 1);
  assert.ok(root[0][0][0] >= 0 && root[0][0][0] < 1e-6 && root[0][0][1] < 1e-3);
  // A removable hole that a sample lands on: the curve reaches it from both sides.
  const hole = curve(parseExpr("(x^2 - 1)/(x - 1)"), { x0: -3, x1: 5, y0: -1, y1: 7 }, 400);
  assert.equal(hole.length, 2);
  assert.ok(Math.abs(hole[0].at(-1)![0] - 1) < 1e-6 && Math.abs(hole[1][0][0] - 1) < 1e-6);
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
  // Curves far from the x-axis, and tall ones, are shown whole.
  for (const [source, low, high] of [["x + 100", 95, 105], ["x^2 + 50", 50, 75], ["100 sin(x)", -99, 99]] as const) {
    const [flo, fhi] = fitHeights([parseExpr(source)], -5, 5);
    assert.ok(flo <= low && fhi >= high, `${source}: ${flo}..${fhi}`);
  }
  const [blo, bhi] = fitHeights([parseExpr("10^20")], -5, 5);
  assert.ok(bhi > blo, "a huge constant still gets a height");
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
