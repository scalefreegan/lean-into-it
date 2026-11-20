// The limit explorers' arithmetic (bead lii-53v.2): epsilon-delta, a secant
// turning into a tangent, Riemann sums, a sequence inside an epsilon band.
// Pure, on the safe expressions of web/shared/expr.ts (never `eval`).
//
// These are pictures, not proofs. "δ works" is decided by sampling the
// interval finely, which is right for the continuous, gently curving
// functions a lesson draws, and says so in the widget. Lean is what proves.

import { evaluate, parseExpr, type Expr } from "./expr.ts";

/** Points sampled on each side of a when testing a δ. */
const SAMPLES = 2000;

/** Whether every x with 0 < |x − a| < δ has |f(x) − L| < ε, by sampling;
 *  if not, the sampled x that misses by most. */
export function deltaWorks(f: Expr, a: number, limit: number, eps: number, delta: number): { works: boolean; worst: number | null } {
  let worst: number | null = null;
  let most = -Infinity;
  for (let k = 1; k <= SAMPLES; k++) {
    // The last sample sits just inside the open end, where a monotone f is furthest off.
    const t = k === SAMPLES ? 1 - 1e-9 : k / SAMPLES;
    for (const x of [a - delta * t, a + delta * t]) {
      const y = evaluate(f, x);
      const off = Number.isFinite(y) ? Math.abs(y - limit) : Infinity;
      if (off >= eps && off > most) {
        most = off;
        worst = x;
      }
    }
  }
  return { works: worst === null, worst };
}

/** About the largest δ (at most `max`) that works for ε; 0 when none does.
 *  A δ that works keeps working when made smaller, so halving finds it. */
export function largestDelta(f: Expr, a: number, limit: number, eps: number, max: number): number {
  if (deltaWorks(f, a, limit, eps, max).works) return max;
  let lo = 0;
  let hi = max;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (deltaWorks(f, a, limit, eps, mid).works) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** The slope of the secant from (a, f(a)) to (a + h, f(a + h)). */
export function secantSlope(f: Expr, a: number, h: number): number {
  return (evaluate(f, a + h) - evaluate(f, a)) / h;
}

export type Rule = "left" | "right" | "midpoint";

/** n rectangles under f from a to b, each as tall as f at its left end,
 *  right end or middle, and the sum of their signed areas. */
export function riemann(f: Expr, a: number, b: number, n: number, rule: Rule): { rects: { x0: number; x1: number; height: number }[]; sum: number } {
  const w = (b - a) / n;
  const rects = [...Array(n).keys()].map((i) => {
    const x0 = a + i * w;
    const x1 = a + (i + 1) * w;
    const at = rule === "left" ? x0 : rule === "right" ? x1 : (x0 + x1) / 2;
    return { x0, x1, height: evaluate(f, at) };
  });
  return { rects, sum: rects.reduce((s, r) => s + r.height * w, 0) };
}

/** A sequence's term, written in n (`1/n`, `(-1)^n/n`), read as an expression. */
export function parseTerm(source: string): Expr {
  // n as a name of its own, also after a digit (2n): not inside sin, ln, sqrt.
  try {
    return parseExpr(source.replace(/(?<![A-Za-z])n(?![A-Za-z])/g, "x"));
  } catch (e) {
    // Its complaints speak of x, the expression's variable; here it is n.
    throw new Error((e as Error).message.replace(/(?<![A-Za-z])x(?![A-Za-z])/g, "n"));
  }
}

/** Whether f seems unbounded on [a, b]: its absolute area does not settle
 *  as the strips get thinner, as it does for any f the picture can draw.
 *  Catches a pole between sample points (1/(x − 1/3), tan x past π/2). */
export function unboundedNear(f: Expr, a: number, b: number): number | null {
  const abs = (n: number) => {
    const w = (b - a) / n;
    let sum = 0;
    let at = a;
    let most = -1;
    for (let i = 0; i < n; i++) {
      const x = a + (i + 0.5) * w;
      const y = Math.abs(evaluate(f, x));
      if (!Number.isFinite(y)) return { sum: Infinity, at: x };
      sum += y * w;
      if (y > most) [most, at] = [y, x];
    }
    return { sum, at };
  };
  const coarse = abs(1000);
  const fine = abs(8000);
  if (!Number.isFinite(fine.sum)) return fine.at;
  return Math.abs(fine.sum - coarse.sum) > 1e-3 * (1 + fine.sum) ? fine.at : null;
}

/** The terms a(n) for n from `from` to `to`. */
export function terms(term: Expr, from: number, to: number): { n: number; value: number }[] {
  return [...Array(Math.max(0, to - from + 1)).keys()].map((i) => ({ n: from + i, value: evaluate(term, from + i) }));
}

/** The first N from which every term shown (up to `to`) is within ε of the
 *  limit; null when the last one shown is not. Past `to` nothing is claimed. */
export function inBandFrom(term: Expr, limit: number, eps: number, from: number, to: number): number | null {
  let first: number | null = null;
  for (let n = to; n >= from; n--) {
    const v = evaluate(term, n);
    if (!(Number.isFinite(v) && Math.abs(v - limit) < eps)) break;
    first = n;
  }
  return first;
}
