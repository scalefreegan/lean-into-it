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

/** The largest round number (1, 2 or 5 times a power of ten) that is at most `raw`. */
export function roundStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  return ([5, 2, 1].find((m) => m * power <= raw * (1 + 1e-9)) ?? 1) * power;
}

/** How many decimals it takes to tell apart numbers `step` apart: 1 → 0,
 *  0.5 → 1, 0.02 → 2. Labels at a finer zoom need more of them. */
export function placesFor(step: number): number {
  if (!(step > 0) || !Number.isFinite(step)) return 2;
  return Math.min(12, Math.max(0, Math.ceil(-Math.log10(step) - 1e-9)));
}

/** The decimals for the labels of `ticks(...)`: those of the gap between them. */
export function tickPlaces(marks: number[]): number {
  return marks.length > 1 ? placesFor(clean(marks[1] - marks[0])) : 2;
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
 * where the function has no value, and where it jumps, as 1/x does at 0 and
 * |x|/x does: joining across a jump would draw a vertical line that is not
 * part of the graph. `from`/`to` restrict the curve to part of the view.
 *
 * Between two samples far apart in height, the function is looked at more
 * closely (by halving, following the larger change): a steep but continuous
 * stretch shrinks to nothing, a jump does not. The same halving finds where
 * a curve starts and stops, so sqrt(x) begins at 0 and not one sample after.
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
  const height = view.y1 - view.y0;
  if (!(hi > lo) || !(height > 0)) return runs;
  // Far enough outside that a line to it leaves the picture in the right
  // direction, near enough that the numbers stay drawable.
  const clamp = (y: number) => Math.max(view.y0 - 4 * height, Math.min(view.y1 + 4 * height, y));
  const push = (x: number, y: number) => {
    const last = run[run.length - 1];
    if (!last || last[0] !== x) run.push([x, clamp(y)]);
  };
  const HALVINGS = 24;
  /** The point nearest `none` (where there is no value) that has one. */
  const edge = (none: number, some: number): [number, number] => {
    for (let i = 0; i < HALVINGS; i++) {
      const mid = (none + some) / 2;
      if (Number.isFinite(evaluate(e, mid))) some = mid;
      else none = mid;
    }
    return [some, evaluate(e, some)];
  };
  /** Is there a jump between two points with values? If so, the points on
   *  each side of it; if the function is only steep there, null. */
  const jump = (a: number, ya: number, b: number, yb: number): [[number, number], [number, number]] | null => {
    for (let i = 0; i < HALVINGS; i++) {
      const mid = (a + b) / 2;
      const ym = evaluate(e, mid);
      if (!Number.isFinite(ym)) return [edge(mid, a), edge(mid, b)];
      if (Math.abs(ym - ya) >= Math.abs(yb - ym)) [b, yb] = [mid, ym];
      else [a, ya] = [mid, ym];
      if (Math.abs(yb - ya) < height / 1000) return null;
    }
    return [
      [a, ya],
      [b, yb],
    ];
  };
  let px = Number.NaN;
  let py = Number.NaN;
  for (let i = 0; i <= samples; i++) {
    const x = lo + ((hi - lo) * i) / samples;
    const y = evaluate(e, x);
    const had = Number.isFinite(py);
    if (!Number.isFinite(y)) {
      if (had) {
        push(...edge(x, px));
        end();
      }
    } else {
      if (i > 0 && !had) push(...edge(px, x));
      else if (had && Math.abs(y - py) > height / 20) {
        const sides = jump(px, py, x, y);
        if (sides) {
          push(...sides[0]);
          end();
          push(...sides[1]);
        }
      }
      push(x, y);
    }
    px = x;
    py = y;
  }
  end();
  return runs;
}

/** A height range that shows the curves over [x0, x1]: their lowest and
 *  highest values with a margin, including the x-axis when it is close.
 *  The most extreme values are left out, so that the neighbourhood of an
 *  asymptote does not flatten everything else. */
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
  // A constant, or numbers too large to tell apart: make room around it.
  if (!(hi > lo)) [lo, hi] = [lo - Math.max(1, Math.abs(lo) * 0.1), lo + Math.max(1, Math.abs(lo) * 0.1)];
  const margin = (hi - lo) * 0.1;
  lo -= margin;
  hi += margin;
  if (lo > 0 && lo < (hi - lo) * 0.5) lo = -margin;
  if (hi < 0 && -hi < (hi - lo) * 0.5) hi = margin;
  return [clean(lo), clean(hi)];
}
