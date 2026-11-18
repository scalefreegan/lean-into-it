import { constantValue } from "./expr.ts";
import { label as numberLabel } from "./plot.ts";

// What a lesson writes for the number-line widget: points like `1/2` or
// `sqrt(2): √2`, and intervals in the usual notation, `(2, 4)`, `[0, 1]`,
// `(-inf, 3]`.

export interface Point {
  value: number;
  label: string;
}

export interface Interval {
  lo: number; // -Infinity for a line with no left end
  hi: number;
  /** Whether each end belongs to the interval: `[` and `]` do, `(` and `)` do not. */
  loClosed: boolean;
  hiClosed: boolean;
}

/** `3`, `"1/2"`, `"sqrt(2): √2"`: a number, optionally with the label to write above it. */
export function readPoint(source: unknown): Point | null {
  if (typeof source === "number") return Number.isFinite(source) ? { value: source, label: numberLabel(source) } : null;
  if (typeof source !== "string") return null;
  const colon = source.indexOf(":");
  const number = (colon < 0 ? source : source.slice(0, colon)).trim();
  const value = constantValue(number);
  if (value === null) return null;
  const given = colon < 0 ? "" : source.slice(colon + 1).trim();
  return { value, label: given || number.replace(/-/g, "−") };
}

const INFINITY = /^\+?(inf|infinity|∞)$/i;
const MINUS_INFINITY = /^[-−](inf|infinity|∞)$/i;

/** Why `source` is not an interval, or the interval. */
export function readInterval(source: unknown): Interval | string {
  if (typeof source !== "string") return "must be written as text, like \"(2, 4)\" or \"[0, 1]\"";
  const m = /^\s*([([])\s*(.+?)\s*,\s*(.+?)\s*([)\]])\s*$/.exec(source);
  if (!m) return `“${source}” is not an interval: write (a, b), [a, b], (a, b] or [a, b)`;
  const lo = MINUS_INFINITY.test(m[2]) ? -Infinity : constantValue(m[2]);
  const hi = INFINITY.test(m[3]) ? Infinity : constantValue(m[3]);
  if (lo === null) return `“${source}”: its left end “${m[2]}” is not a number or -inf`;
  if (hi === null) return `“${source}”: its right end “${m[3]}” is not a number or inf`;
  if (!(lo < hi)) return `“${source}”: the left end must be less than the right end`;
  const interval = { lo, hi, loClosed: m[1] === "[", hiClosed: m[4] === "]" };
  if (lo === -Infinity && interval.loClosed) return `“${source}”: there is no point at -inf to include, so that end is written (`;
  if (hi === Infinity && interval.hiClosed) return `“${source}”: there is no point at inf to include, so that end is written )`;
  return interval;
}

export function inInterval(x: number, i: Interval): boolean {
  return (x > i.lo || (i.loClosed && x === i.lo)) && (x < i.hi || (i.hiClosed && x === i.hi));
}

/** `(2, 4]` with a real minus sign and ∞, for a readout. */
export function intervalLabel(i: Interval): string {
  const end = (v: number) => (v === -Infinity ? "−∞" : v === Infinity ? "∞" : numberLabel(v));
  return `${i.loClosed ? "[" : "("}${end(i.lo)}, ${end(i.hi)}${i.hiClosed ? "]" : ")"}`;
}
