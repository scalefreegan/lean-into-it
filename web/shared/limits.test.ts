import assert from "node:assert/strict";
import { test } from "node:test";
import { parseExpr } from "./expr.ts";
import { deltaWorks, inBandFrom, largestDelta, parseTerm, riemann, secantSlope, terms, unboundedNear } from "./limits.ts";

const f = parseExpr;

test("a line: δ works exactly when δ ≤ ε / slope", () => {
  // 2x + 1 near 1 has limit 3: |f(x) − 3| = 2|x − 1| < ε when |x − 1| < ε/2.
  const g = f("2x + 1");
  for (const eps of [1, 0.5, 0.1]) {
    assert.ok(deltaWorks(g, 1, 3, eps, eps / 2).works, `ε = ${eps}, δ = ε/2`);
    assert.ok(deltaWorks(g, 1, 3, eps, eps / 4).works);
    assert.ok(!deltaWorks(g, 1, 3, eps, eps / 2 + 0.01).works, `ε = ${eps}, δ a little more`);
  }
  assert.ok(Math.abs(largestDelta(g, 1, 3, 0.5, 10) - 0.25) < 1e-6);
});

test("x² near 2: for ε = 1 the largest δ is √5 − 2", () => {
  const g = f("x^2");
  assert.ok(deltaWorks(g, 2, 4, 1, 0.2).works);
  assert.ok(!deltaWorks(g, 2, 4, 1, 0.25).works);
  assert.ok(Math.abs(largestDelta(g, 2, 4, 1, 5) - (Math.sqrt(5) - 2)) < 1e-4);
  // The worst point is on the right, where x² grows fastest.
  assert.ok(deltaWorks(g, 2, 4, 1, 0.3).worst! > 2);
});

test("the wrong limit, or a jump, has no δ at all", () => {
  assert.equal(largestDelta(f("x^2"), 2, 5, 0.5, 1), 0);
  // |x|/x jumps from −1 to 1 at 0: no limit there, so for ε = 1/2 no δ works whatever L is.
  for (const L of [-1, 0, 1]) assert.ok(!deltaWorks(f("abs(x)/x"), 0, L, 0.5, 1e-6).works, `L = ${L}`);
  // sin(x)/x has no value at 0 but has limit 1: a hole is not a jump.
  assert.ok(deltaWorks(f("sin(x)/x"), 0, 1, 0.01, 0.1).works);
});

test("secants of x² at 1 have slope 2 + h, closing in on the tangent's 2", () => {
  for (const h of [1, 0.5, 0.1, -0.1, 0.001]) assert.ok(Math.abs(secantSlope(f("x^2"), 1, h) - (2 + h)) < 1e-9, `h = ${h}`);
});

test("Riemann sums of x on [0, 1]: left under, right over, midpoint exact", () => {
  const n = 4;
  assert.equal(riemann(f("x"), 0, 1, n, "left").sum, (0 + 0.25 + 0.5 + 0.75) / 4);
  assert.equal(riemann(f("x"), 0, 1, n, "right").sum, (0.25 + 0.5 + 0.75 + 1) / 4);
  assert.ok(Math.abs(riemann(f("x"), 0, 1, n, "midpoint").sum - 0.5) < 1e-12);
  // x² on [0, 1] has area 1/3; more rectangles come closer.
  const off = (k: number) => Math.abs(riemann(f("x^2"), 0, 1, k, "left").sum - 1 / 3);
  assert.ok(off(100) < off(10) && off(10) < off(2));
  const r = riemann(f("x^2"), 0, 2, 4, "right");
  assert.deepEqual(r.rects.map((x) => [x.x0, x.x1, x.height]), [[0, 0.5, 0.25], [0.5, 1, 1], [1, 1.5, 2.25], [1.5, 2, 4]]);
});

test("a sequence in n: the terms, and from where they stay within ε", () => {
  const t = parseTerm("1/n");
  assert.deepEqual(terms(t, 1, 3).map((x) => x.value), [1, 0.5, 1 / 3]);
  // 1/n < 0.1 from n = 11 on.
  assert.equal(inBandFrom(t, 0, 0.1, 1, 50), 11);
  // (-1)^n/n swings both sides; within 0.25 from n = 5.
  assert.equal(inBandFrom(parseTerm("(-1)^n/n"), 0, 0.25, 1, 40), 5);
  // n itself never settles: the last term shown is outside.
  assert.equal(inBandFrom(parseTerm("n"), 0, 1, 1, 30), null);
  // `n` is replaced only as a whole name: sin(n) still reads.
  assert.ok(Math.abs(terms(parseTerm("sin(n)"), 1, 1)[0].value - Math.sin(1)) < 1e-12);
});

test("the registry refuses explorers it cannot draw", async () => {
  const { checkParams, WIDGETS } = await import("./registry.ts");
  const c = (type: "epsilon-delta" | "secant-tangent" | "riemann-sum" | "sequence-limit", p: Record<string, unknown>) => checkParams(WIDGETS[type], p).join("\n");
  assert.equal(c("epsilon-delta", { function: "x^2", at: 2 }), "");
  assert.match(c("epsilon-delta", { function: "sin(x)/x", at: 0 }), /no value at x = 0: give the `limit`/);
  assert.equal(c("epsilon-delta", { function: "sin(x)/x", at: 0, limit: 1 }), "");
  assert.match(c("epsilon-delta", { function: "x^", at: 0 }), /`function`:/);
  assert.match(c("secant-tangent", { function: "x^2", at: 1, h: 0 }), /cannot start at 0/);
  assert.match(c("secant-tangent", { function: "1/x", at: 0 }), /no value at x = 0/);
  assert.match(c("riemann-sum", { function: "x", from: 1, to: 1 }), /more than `from`/);
  assert.match(c("riemann-sum", { function: "1/x", from: -1, to: 1 }), /no value at x = 0/);
  assert.equal(c("riemann-sum", { function: "x^2", from: 0, to: 2 }), "");
  assert.match(c("sequence-limit", { term: "1/n", limit: 0, start: 0 }), /no value at n = 0/);
  assert.equal(c("sequence-limit", { term: "(-1)^n/n", limit: 0 }), "");
});

test("n after a digit is n; complaints about a term speak of n", () => {
  assert.equal(terms(parseTerm("2n+1"), 3, 3)[0].value, 7);
  assert.equal(terms(parseTerm("ln(n)/n"), 1, 1)[0].value, 0);
  assert.throws(() => parseTerm("n + y"), (e: Error) => !/\bx\b/.test(e.message));
});

test("a steep f needs a δ far below ε, and one is found", () => {
  // 1000x near 0: δ = ε/1000.
  assert.ok(Math.abs(largestDelta(parseExpr("1000x"), 0, 0, 0.5, 1) - 0.0005) < 1e-9);
  assert.ok(Math.abs(largestDelta(parseExpr("x^2"), 2, 4, 0.001, 5) - 0.00025) < 1e-6);
});

test("a pole between sample points is found; steep but bounded functions are not refused", () => {
  assert.ok(Math.abs(unboundedNear(parseExpr("1/(x - 1/3)"), 0, 1)! - 1 / 3) < 0.01);
  assert.ok(Math.abs(unboundedNear(parseExpr("tan(x)"), 0, 2)! - Math.PI / 2) < 0.01);
  for (const [g, a, b] of [["x^2", 0, 2], ["sqrt(x)", 0, 1], ["x^10", 0, 2], ["exp(5x)", 0, 2], ["abs(x - 1/3)", 0, 1], ["sin(x)", 0, 6.3]] as const)
    assert.equal(unboundedNear(parseExpr(g), a, b), null, g);
});
