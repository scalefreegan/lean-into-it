import { evaluate, type Expr } from "./expr.ts";

// The arithmetic behind the plot and number-line widgets, kept apart from
// the drawing so that it can be tested: where the ticks go, how a number is
// written beside one, and where a curve has to be broken.

/** Tick positions covering [min, max] at a round step (1, 2 or 5 times a
 *  power of ten), about `about` of them. */
export function ticks(min: number, max: number, about = 8): number[] {
  const span = max - min;
  if (!(span > 0) || !Number.isFinite(span)) return [];
  const raw = span / Math.max(about, 1);
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? 10 * power;
  const out: number[] = [];
  for (let k = Math.ceil(min / step - 1e-9); k * step <= max + step * 1e-9; k++) out.push(clean(k * step));
  return out;
}

/** 0.30000000000000004 → 0.3: what binary arithmetic adds, taken off. */
export function clean(n: number): number {
  return Number(n.toPrecision(12));
}

/** A number as a label: whole numbers whole, others to at most `places`
 *  decimals with no trailing zeros, and a real minus sign. */
export function label(n: number, places = 2): string {
  if (!Number.isFinite(n)) return "undefined";
  const rounded = Number(n.toFixed(places));
  const text = Object.is(rounded, -0) || rounded === 0 ? "0" : String(rounded);
  return text.replace("-", "−");
}

export interface View {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * A curve as runs of points, each run drawn as one unbroken line. A run ends
 * where the function has no value, and where it jumps from far off one edge
 * of the view to far off the other, as 1/x does at 0: joining those would
 * draw a vertical line that is not part of the graph. `from`/`to` restrict
 * the curve to part of the view.
 */
export function curve(e: Expr, view: View, samples = 400, from = view.x0, to = view.x1): [number, number][][] {
  const runs: [number, number][][] = [];
  let run: [number, number][] = [];
  const end = () => {
    if (run.length > 1) runs.push(run);
    run = [];
  };
  const lo = Math.max(view.x0, from);
  const hi = Math.min(view.x1, to);
  if (!(hi > lo)) return runs;
  const height = view.y1 - view.y0;
  // Far enough outside that a line to it leaves the picture in the right
  // direction, near enough that the numbers stay drawable.
  const clamp = (y: number) => Math.max(view.y0 - 4 * height, Math.min(view.y1 + 4 * height, y));
  let last: number | null = null;
  for (let i = 0; i <= samples; i++) {
    const x = lo + ((hi - lo) * i) / samples;
    const y = evaluate(e, x);
    if (!Number.isFinite(y)) {
      end();
      last = null;
      continue;
    }
    const outside = (v: number) => (v > view.y1 ? 1 : v < view.y0 ? -1 : 0);
    if (last !== null && outside(last) * outside(y) === -1 && Math.abs(y - last) > 2 * height) end();
    run.push([x, clamp(y)]);
    last = y;
  }
  end();
  return runs;
}

/** A height range that shows the curves over [x0, x1]: their lowest and
 *  highest values with a margin, always including the x-axis's neighbourhood
 *  when it is close, and never so tall that one spike flattens the rest. */
export function fitHeights(exprs: Expr[], x0: number, x1: number, samples = 200): [number, number] {
  const values: number[] = [];
  for (const e of exprs) {
    for (let i = 0; i <= samples; i++) {
      const y = evaluate(e, x0 + ((x1 - x0) * i) / samples);
      if (Number.isFinite(y)) values.push(y);
    }
  }
  if (!values.length) return [-1, 1];
  values.sort((a, b) => a - b);
  // Ignore the most extreme 2% at each end: the neighbourhood of an asymptote.
  const cut = Math.floor(values.length * 0.02);
  let lo = values[cut];
  let hi = values[values.length - 1 - cut];
  const width = x1 - x0;
  lo = Math.max(lo, -4 * width);
  hi = Math.min(hi, 4 * width);
  if (!(hi > lo)) [lo, hi] = [lo - 1, lo + 1];
  const margin = (hi - lo) * 0.1;
  lo -= margin;
  hi += margin;
  if (lo > 0 && lo < (hi - lo) * 0.5) lo = -margin;
  if (hi < 0 && -hi < (hi - lo) * 0.5) hi = margin;
  return [clean(lo), clean(hi)];
}
