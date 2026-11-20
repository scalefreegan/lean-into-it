import { useState } from "react";
import { evaluate, parseExpr } from "../../shared/expr.ts";
import { deltaWorks, inBandFrom, largestDelta, parseTerm, riemann, secantSlope, terms, type Rule } from "../../shared/limits.ts";
import { fitHeights, type View } from "../../shared/plot.ts";
import { Button, cx } from "../ui.tsx";
import { Frame, Graph, Slider } from "./Frame.tsx";
import { num, str } from "./params.ts";
import type { WidgetProps } from "./types.ts";

// The limit explorers (bead lii-53v.2): epsilon-delta, secant to tangent,
// Riemann sums and a sequence in an epsilon band. The arithmetic is in
// web/shared/limits.ts; these draw it and hold the sliders.

const fmt = (n: number, digits = 3) => (Number.isFinite(n) ? String(Number(n.toPrecision(digits))) : "undefined");
const range = (p: Record<string, unknown>, key: string): [number, number] | null => {
  const v = p[key];
  return Array.isArray(v) && v.length === 2 && typeof v[0] === "number" && typeof v[1] === "number" ? [v[0], v[1]] : null;
};
/** ε and δ move on a log scale: from 0.001 up, as fine near 0 as far from it. */
const LOG_MIN = -3;
/** δ goes much smaller than ε: a steep f needs a δ far below ε. */
const DELTA_MIN = -7;

function Shell({ type, children, caption }: { type: string; children: React.ReactNode; caption: string }) {
  return (
    <figure data-widget={type} className="max-w-3xl rounded-2xl border border-line-strong bg-panel p-3 shadow-sm sm:p-4">
      {children}
      {caption && <figcaption className="mt-2 border-t border-line pt-2 text-sm text-fg-3">{caption}</figcaption>}
    </figure>
  );
}

export function EpsilonDelta({ params }: WidgetProps) {
  const source = str(params, "function", "x");
  const [f] = useState(() => parseExpr(source));
  const a = num(params, "at", 0);
  const L = num(params, "limit", evaluate(f, a));
  const [x0, x1] = range(params, "x") ?? [a - 3, a + 3];
  const [y0, y1] = range(params, "y") ?? [L - 3, L + 3];
  const view: View = { x0, x1, y0, y1 };
  const maxLog = Math.max(LOG_MIN + 1, Math.log10(Math.max(x1 - x0, y1 - y0)));
  const clampLog = (v: number, lo: number) => Math.min(maxLog, Math.max(lo, v));
  const [lgEps, setLgEps] = useState(clampLog(Math.log10(num(params, "epsilon", 0.5)), LOG_MIN));
  const [lgDelta, setLgDelta] = useState(clampLog(Math.log10(num(params, "delta", 1)), DELTA_MIN));
  const eps = 10 ** lgEps;
  const delta = 10 ** lgDelta;
  const { works, worst } = deltaWorks(f, a, L, eps, delta);
  // Whether the last "Largest δ" found none: then there is no limit L here, or not this L.
  const [none, setNone] = useState<number | null>(null);
  const best = () => {
    // Below the slider's least δ counts as none: the picture cannot show it.
    const d = largestDelta(f, a, L, eps, 10 ** maxLog);
    if (d >= 10 ** DELTA_MIN) {
      setNone(null);
      setLgDelta(Math.max(DELTA_MIN, Math.log10(d) - 0.001));
    } else setNone(eps);
  };
  return (
    <Shell type="epsilon-delta" caption={str(params, "caption", "")}>
      <Frame view={view} label={`Graph of y = ${source} near x = ${a}, with a band of ε = ${fmt(eps)} around ${fmt(L)} and a strip of δ = ${fmt(delta)} around ${a}.`}>
        {(s) => (
          <>
            <rect x={s.left} width={s.right - s.left} y={s.sy(L + eps)} height={s.sy(L - eps) - s.sy(L + eps)} className="fill-accent-soft" opacity={0.7} />
            <rect y={s.top} height={s.bottom - s.top} x={s.sx(a - delta)} width={s.sx(a + delta) - s.sx(a - delta)} className="fill-fact-soft" opacity={0.7} />
            <rect
              data-box={works ? "works" : "fails"}
              x={s.sx(a - delta)}
              width={s.sx(a + delta) - s.sx(a - delta)}
              y={s.sy(L + eps)}
              height={s.sy(L - eps) - s.sy(L + eps)}
              className={works ? "fill-good-soft stroke-good" : "fill-bad-soft stroke-bad"}
              strokeWidth={2}
            />
            <Graph expr={f} s={s} />
            <circle cx={s.sx(a)} cy={s.sy(L)} r={5} className="fill-panel stroke-accent" strokeWidth={2} />
            {worst !== null && Number.isFinite(evaluate(f, worst)) && <circle data-worst cx={s.sx(worst)} cy={s.sy(evaluate(f, worst))} r={5} className="fill-bad" />}
          </>
        )}
      </Frame>
      <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2">
        <Slider name="ε" value={lgEps} min={LOG_MIN} max={maxLog} step={0.01} onChange={setLgEps} shown={fmt(eps)} />
        <Slider name="δ" value={lgDelta} min={DELTA_MIN} max={maxLog} step={0.01} onChange={setLgDelta} shown={fmt(delta)} />
        <Button onClick={best}>Largest δ</Button>
      </div>
      <span className="sr-only" aria-live="polite">
        {works ? "Works." : "Does not work."}
      </span>
      <p data-verdict className={cx("mt-2 text-sm", works ? "text-good" : "text-bad")}>
        {works
          ? `δ = ${fmt(delta)} works for ε = ${fmt(eps)}: every x within δ of ${a} (but ${a} itself) has f(x) within ε of ${fmt(L)}.`
          : !Number.isFinite(evaluate(f, worst!))
            ? `δ = ${fmt(delta)} does not work for ε = ${fmt(eps)}: at x = ${fmt(worst!)}, f has no value, so f(x) cannot be within ε of ${fmt(L)}. Every strip around ${a} has such points if f has none on one side.`
            : `δ = ${fmt(delta)} does not work for ε = ${fmt(eps)}: at x = ${fmt(worst!)}, f(x) = ${fmt(evaluate(f, worst!))}, more than ε from ${fmt(L)}. Make δ smaller.`}
      </p>
      {none === eps && (
        <p data-no-delta className="mt-1 text-sm text-bad">
          No δ down to {fmt(10 ** DELTA_MIN)} works for ε = {fmt(eps)}. Either one exists but is smaller still, or f does not stay within ε of {fmt(L)} however close x comes, and {fmt(L)} is not the limit. The picture cannot tell these apart; a proof can.
        </p>
      )}
      <p className="mt-1 text-xs text-fg-3">Checked at 4000 points of the strip: a picture of the definition, not a proof.</p>
    </Shell>
  );
}

export function SecantTangent({ params }: WidgetProps) {
  const source = str(params, "function", "x");
  const [f] = useState(() => parseExpr(source));
  const a = num(params, "at", 0);
  const [x0, x1] = range(params, "x") ?? [a - 3, a + 3];
  const [y0, y1] = range(params, "y") ?? fitHeights([f], x0, x1);
  const view: View = { x0, x1, y0, y1 };
  const reach = Math.max(a - x0, x1 - a);
  // About 400 steps across the slider, and never 0 itself.
  const hStep = Number((reach / 200).toPrecision(1));
  const tiny = hStep / 10;
  const setH = (v: number) => setHRaw(Math.abs(v) < tiny ? (v < 0 ? -tiny : tiny) : v);
  const [h, setHRaw] = useState(Math.min(reach, Math.max(-reach, num(params, "h", 1))) || tiny);
  const fa = evaluate(f, a);
  const slope = secantSlope(f, a, h);
  // A tangent only where the slopes from the two sides agree: none at a corner like |x| at 0.
  const [right, left] = [secantSlope(f, a, 1e-6), secantSlope(f, a, -1e-6)];
  const tangent = Number.isFinite(right) && Number.isFinite(left) && Math.abs(right - left) <= 1e-3 * (1 + Math.abs(right)) ? (right + left) / 2 : NaN;
  const fah = evaluate(f, a + h);
  const line = (m: number) => ({ y0: fa + m * (x0 - a), y1: fa + m * (x1 - a) });
  return (
    <Shell type="secant-tangent" caption={str(params, "caption", "")}>
      <Frame view={view} label={`Graph of y = ${source}, a secant from x = ${a} to x = ${fmt(a + h)} of slope ${fmt(slope)}, and the tangent at ${a}.`}>
        {(s) => (
          <>
            <Graph expr={f} s={s} />
            {Number.isFinite(tangent) && <line x1={s.sx(x0)} x2={s.sx(x1)} y1={s.sy(line(tangent).y0)} y2={s.sy(line(tangent).y1)} className="stroke-fg-3" strokeWidth={1.5} strokeDasharray="6 5" />}
            {Number.isFinite(slope) && <line data-secant x1={s.sx(x0)} x2={s.sx(x1)} y1={s.sy(line(slope).y0)} y2={s.sy(line(slope).y1)} className="stroke-goal" strokeWidth={2} />}
            <circle cx={s.sx(a)} cy={s.sy(fa)} r={5} className="fill-accent" />
            {Number.isFinite(fah) && <circle cx={s.sx(a + h)} cy={s.sy(fah)} r={5} className="fill-goal" />}
          </>
        )}
      </Frame>
      <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2">
        <Slider name="h" value={h} min={-reach} max={reach} step={hStep} onChange={setH} shown={fmt(h)} />
      </div>
      <p data-slope className="lean mt-2 text-sm text-fg">
        {Number.isFinite(fah) ? `(f(${fmt(a)} + h) − f(${fmt(a)})) / h = ${fmt(slope)}` : `f has no value at ${fmt(a + h)}: no secant`}
        <span className="ml-4 text-fg-3">{Number.isFinite(tangent) ? `tangent (dashed): slope ≈ ${fmt(tangent)}` : `no tangent at ${fmt(a)}: the slopes from the left (${fmt(left)}) and the right (${fmt(right)}) differ`}</span>
      </p>
    </Shell>
  );
}

export function RiemannSum({ params }: WidgetProps) {
  const source = str(params, "function", "x");
  const [f] = useState(() => parseExpr(source));
  const a = num(params, "from", 0);
  const b = num(params, "to", 1);
  const pad = (b - a) * 0.1;
  const [h0, h1] = fitHeights([f], a, b);
  const view: View = { x0: a - pad, x1: b + pad, y0: Math.min(0, h0), y1: Math.max(0, h1) };
  const [n, setN] = useState(num(params, "n", 4));
  const [rule, setRule] = useState<Rule>(str(params, "rule", "left") as Rule);
  const { rects, sum } = riemann(f, a, b, n, rule);
  const [area] = useState(() => riemann(f, a, b, 1000, "midpoint").sum);
  return (
    <Shell type="riemann-sum" caption={str(params, "caption", "")}>
      <Frame view={view} label={`Graph of y = ${source} from ${a} to ${b}, under ${n} rectangles, ${rule} rule; their area is ${fmt(sum)}.`}>
        {(s) => (
          <>
            {rects.map((r, i) => (
              <rect key={i} data-rect x={s.sx(r.x0)} width={s.sx(r.x1) - s.sx(r.x0)} y={Math.min(s.sy(r.height), s.sy(0))} height={Math.abs(s.sy(r.height) - s.sy(0))} className="fill-fact-soft stroke-fact-line" strokeWidth={n > 40 ? 0.5 : 1.5} />
            ))}
            <Graph expr={f} s={s} />
          </>
        )}
      </Frame>
      <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2">
        <Slider name="n" value={n} min={1} max={100} step={1} onChange={setN} />
        <div className="flex gap-1.5" role="group" aria-label="Where each rectangle meets the curve">
          {(["left", "midpoint", "right"] as const).map((r) => (
            <Button key={r} variant={r === rule ? "primary" : "quiet"} aria-pressed={r === rule} onClick={() => setRule(r)} className="px-2.5 py-1">
              {r}
            </Button>
          ))}
        </div>
      </div>
      <p data-sum className="lean mt-2 text-sm text-fg">
        {n} rectangle{n === 1 ? "" : "s"}: {fmt(sum, 5)}
        <span className="ml-4 text-fg-3">the integral (area below the axis counts negative): {fmt(area, 5)}</span>
      </p>
    </Shell>
  );
}

export function SequenceLimit({ params }: WidgetProps) {
  const source = str(params, "term", "1/n");
  const [t] = useState(() => parseTerm(source));
  const L = num(params, "limit", 0);
  const from = num(params, "start", 1);
  const count = num(params, "count", 40);
  const to = from + count - 1;
  const [shown] = useState(() => terms(t, from, to));
  const finite = shown.map((x) => x.value).filter(Number.isFinite);
  const [lgEps, setLgEps] = useState(Math.log10(num(params, "epsilon", 0.2)));
  const eps = 10 ** lgEps;
  const lo = Math.min(L - eps, ...finite);
  const hi = Math.max(L + eps, ...finite);
  const [frame] = useState(() => {
    const l0 = Math.min(L - 1, ...finite);
    const h0 = Math.max(L + 1, ...finite);
    const pad = (h0 - l0) * 0.08;
    return { y0: l0 - pad, y1: h0 + pad };
  });
  const view: View = { x0: from - 1, x1: to + 1, y0: Math.min(frame.y0, lo), y1: Math.max(frame.y1, hi) };
  const N = inBandFrom(t, L, eps, from, to);
  const maxLog = Math.log10(Math.max(1, frame.y1 - frame.y0));
  return (
    <Shell type="sequence-limit" caption={str(params, "caption", "")}>
      <Frame view={view} label={`The terms of a(n) = ${source} for n from ${from} to ${to}, with a band of ε = ${fmt(eps)} around ${fmt(L)}.`}>
        {(s) => (
          <>
            <rect x={s.left} width={s.right - s.left} y={s.sy(L + eps)} height={s.sy(L - eps) - s.sy(L + eps)} className="fill-accent-soft" opacity={0.7} />
            <line x1={s.left} x2={s.right} y1={s.sy(L)} y2={s.sy(L)} className="stroke-accent" strokeWidth={1} strokeDasharray="5 5" />
            {N !== null && <line data-n-line x1={s.sx(N - 0.5)} x2={s.sx(N - 0.5)} y1={s.top} y2={s.bottom} className="stroke-good" strokeWidth={2} />}
            {shown.map(({ n, value }) =>
              Number.isFinite(value) ? (
                <circle key={n} data-term={n} data-inside={Math.abs(value - L) < eps || undefined} cx={s.sx(n)} cy={s.sy(value)} r={count > 80 ? 2.5 : 4} className={Math.abs(value - L) < eps ? "fill-good" : "fill-goal"} />
              ) : null,
            )}
          </>
        )}
      </Frame>
      <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2">
        <Slider name="ε" value={lgEps} min={LOG_MIN} max={maxLog} step={0.01} onChange={setLgEps} shown={fmt(eps)} />
      </div>
      <p data-verdict className={cx("mt-2 text-sm", N !== null ? "text-good" : "text-bad")}>
        {N !== null
          ? `From n = ${N} on, every term shown is within ε = ${fmt(eps)} of ${fmt(L)}.`
          : !Number.isFinite(evaluate(t, to))
            ? `The last term shown, n = ${to}, has no value.`
            : `The last term shown, n = ${to}, is still more than ε = ${fmt(eps)} from ${fmt(L)}.`}
      </p>
      <p className="mt-1 text-xs text-fg-3">Only {count} terms are drawn. That every later term stays inside is what a proof must show.</p>
    </Shell>
  );
}
