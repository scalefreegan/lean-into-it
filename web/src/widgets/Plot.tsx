import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { evaluate, parseExpr, type Expr } from "../../shared/expr.ts";
import { clean, curve, fitHeights, label, placesFor, roundStep, tickPlaces, ticks, type View } from "../../shared/plot.ts";
import { Button } from "../ui.tsx";
import { list, num, str } from "./params.ts";
import type { WidgetProps } from "./types.ts";

// `plot`: graphs of functions of x, drawn as plain SVG. The curves come from
// web/shared/plot.ts, which decides where one has to be broken; this file
// draws them and moves the view and the traced point.

const W = 640;
const H = 400;
const LEFT = 46;
const RIGHT = 14;
const TOP = 14;
const BOTTOM = 30;
const PW = W - LEFT - RIGHT;
const PH = H - TOP - BOTTOM;

/** One line style per curve, told apart without relying on colour alone. */
const STYLES = [
  { stroke: "stroke-accent", fill: "fill-accent", dash: undefined },
  { stroke: "stroke-fg", fill: "fill-fg", dash: undefined },
  { stroke: "stroke-accent", fill: "fill-accent", dash: "7 5" },
  { stroke: "stroke-fg", fill: "fill-fg", dash: "7 5" },
] as const;

const range = (p: Record<string, unknown>, key: string): [number, number] | null => {
  const v = p[key];
  return Array.isArray(v) && v.length === 2 && typeof v[0] === "number" && typeof v[1] === "number" ? [v[0], v[1]] : null;
};

/** An expression as it is shown: a real minus sign, and spaces left as typed. */
const shown = (source: string) => source.replace(/-/g, "−").replace(/\*/g, "·");

export function Plot({ params }: WidgetProps) {
  const sources = list<string | number>(params, "functions", []).map(String);
  const caption = str(params, "caption", "");
  const domain = range(params, "domain");
  // Parsed once: RenderWidget gives a widget a new life when its parameters change.
  const [exprs] = useState(() => sources.map((s) => parseExpr(s)));
  const [home] = useState<View>(() => {
    const [x0, x1] = range(params, "x") ?? [-5, 5];
    const [y0, y1] = range(params, "y") ?? fitHeights(exprs, Math.max(x0, domain?.[0] ?? x0), Math.min(x1, domain?.[1] ?? x1));
    return { x0, x1, y0, y1 };
  });

  const [view, setView] = useState(home);
  // The point stays where the curves are drawn: on an interval, it stops at the ends.
  const keep = (x: number) => (domain ? Math.min(Math.max(x, domain[0]), domain[1]) : x);
  const start = () => keep(num(params, "trace", clean((home.x0 + home.x1) / 2)));
  const [trace, setTraceTo] = useState(start);
  const setTrace = (x: number) => setTraceTo(keep(x));
  // The readout is announced when the keyboard moves the point, not on every mouse move.
  const [spoken, setSpoken] = useState(false);
  const drag = useRef<{ x: number; y: number; view: View; moved: boolean } | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  const sx = (x: number) => LEFT + ((x - view.x0) / (view.x1 - view.x0)) * PW;
  const sy = (y: number) => TOP + ((view.y1 - y) / (view.y1 - view.y0)) * PH;
  /** Where on the x-axis a pointer is, whatever size the picture is drawn at. */
  const xAt = (e: PointerEvent) => {
    const box = svg.current!.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    return view.x0 + ((px - LEFT) / PW) * (view.x1 - view.x0);
  };
  // About a hundredth of the width, rounded down to a round number, so the
  // point lands on values like 1.25 and not 1.32.
  const step = roundStep((view.x1 - view.x0) / 100);
  // Enough decimals for the zoom: two at first, more as the view narrows.
  const xPlaces = Math.max(2, placesFor(step));
  const yPlaces = Math.max(2, placesFor((view.y1 - view.y0) / 100));
  const snap = (x: number) => clean(Math.round(x / step) * step);

  const zoom = (factor: number) => {
    const cx = Math.min(Math.max(trace, view.x0), view.x1);
    const cy = (view.y0 + view.y1) / 2;
    // Past these the numbers stop being tellable apart, or stop meaning anything.
    const [width, height] = [(view.x1 - view.x0) * factor, (view.y1 - view.y0) * factor];
    if (Math.min(width, height) < 1e-6 || Math.max(width, height) > 1e7) return;
    setView({ x0: clean(cx + (view.x0 - cx) * factor), x1: clean(cx + (view.x1 - cx) * factor), y0: clean(cy + (view.y0 - cy) * factor), y1: clean(cy + (view.y1 - cy) * factor) });
  };
  const reset = () => {
    setView(home);
    setTraceTo(start());
  };
  /** Move the traced point, taking the view along when it would leave it. */
  const moveTrace = (target: number) => {
    const to = keep(target);
    setTraceTo(to);
    const shift = to < view.x0 ? to - view.x0 : to > view.x1 ? to - view.x1 : 0;
    if (shift) setView({ ...view, x0: clean(view.x0 + shift), x1: clean(view.x1 + shift) });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const big = e.shiftKey ? 10 : 1;
    setSpoken(true);
    if (e.key === "ArrowLeft") moveTrace(snap(trace - step * big));
    else if (e.key === "ArrowRight") moveTrace(snap(trace + step * big));
    else if (e.key === "+" || e.key === "=") zoom(0.8);
    else if (e.key === "-" || e.key === "_") zoom(1.25);
    else if (e.key === "0") reset();
    else return;
    e.preventDefault();
  };
  const onPointerDown = (e: PointerEvent) => {
    setSpoken(false);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, view, moved: false };
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) {
      // Not dragging: the point follows the pointer along the curves.
      if (spoken) setSpoken(false);
      if (e.pointerType === "mouse") setTrace(snap(Math.min(Math.max(xAt(e), view.x0), view.x1)));
      return;
    }
    const box = svg.current!.getBoundingClientRect();
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 4) d.moved = true;
    if (!d.moved) return;
    const dx = (((e.clientX - d.x) / box.width) * W * (d.view.x1 - d.view.x0)) / PW;
    const dy = (((e.clientY - d.y) / box.height) * H * (d.view.y1 - d.view.y0)) / PH;
    setView({ x0: d.view.x0 - dx, x1: d.view.x1 - dx, y0: d.view.y0 + dy, y1: d.view.y1 + dy });
  };
  const onPointerUp = (e: PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    // A press that did not drag puts the point there.
    if (d && !d.moved) setTrace(snap(Math.min(Math.max(xAt(e), view.x0), view.x1)));
  };

  const values = exprs.map((e) => evaluate(e, trace));
  const xs = ticks(view.x0, view.x1, 8);
  const ys = ticks(view.y0, view.y1, 6);
  const axisX = view.y0 <= 0 && view.y1 >= 0 ? sy(0) : null;
  const axisY = view.x0 <= 0 && view.x1 >= 0 ? sx(0) : null;
  const names = sources.map((s) => `y = ${shown(s)}`);
  const clip = `plot-clip-${useId().replace(/[^A-Za-z0-9]/g, "")}`;

  return (
    <figure data-widget="plot" className="max-w-3xl rounded-2xl border border-line-strong bg-panel p-3 shadow-sm sm:p-4">
      <div
        role="group"
        tabIndex={0}
        aria-label={`Graph of ${names.join(" and ")}. Left and right arrows move the point along the curve, plus and minus zoom, 0 resets.`}
        onKeyDown={onKeyDown}
        className="rounded-xl"
      >
        <svg
          ref={svg}
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full touch-pan-y select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (drag.current = null)}
        >
          <defs>
            <clipPath id={clip}>
              <rect x={LEFT} y={TOP} width={PW} height={PH} />
            </clipPath>
          </defs>
          <rect x={LEFT} y={TOP} width={PW} height={PH} className="fill-panel stroke-line" />
          {xs.map((x, i) => (
            <g key={`x${i}`}>
              <line x1={sx(x)} x2={sx(x)} y1={TOP} y2={TOP + PH} className="stroke-line" strokeWidth={1} />
              <text x={sx(x)} y={H - 10} textAnchor="middle" className="fill-fg-3 font-mono text-[12px]">
                {label(x, tickPlaces(xs))}
              </text>
            </g>
          ))}
          {ys.map((y, i) => (
            <g key={`y${i}`}>
              <line x1={LEFT} x2={LEFT + PW} y1={sy(y)} y2={sy(y)} className="stroke-line" strokeWidth={1} />
              <text x={LEFT - 7} y={sy(y) + 4} textAnchor="end" className="fill-fg-3 font-mono text-[12px]">
                {label(y, tickPlaces(ys))}
              </text>
            </g>
          ))}
          {axisX !== null && <line x1={LEFT} x2={LEFT + PW} y1={axisX} y2={axisX} className="stroke-line-strong" strokeWidth={1.5} />}
          {axisY !== null && <line x1={axisY} x2={axisY} y1={TOP} y2={TOP + PH} className="stroke-line-strong" strokeWidth={1.5} />}

          <g clipPath={`url(#${clip})`}>
            {exprs.map((e, i) => (
              <Curve key={i} expr={e} view={view} domain={domain} sx={sx} sy={sy} style={STYLES[i % STYLES.length]} />
            ))}
            {trace >= view.x0 && trace <= view.x1 && <line data-trace-line x1={sx(trace)} x2={sx(trace)} y1={TOP} y2={TOP + PH} className="stroke-fg-3" strokeWidth={1} strokeDasharray="3 4" />}
            {values.map((y, i) =>
              Number.isFinite(y) ? <circle key={i} data-trace-point={i} cx={sx(trace)} cy={sy(y)} r={5.5} className={`${STYLES[i % STYLES.length].fill} stroke-panel`} strokeWidth={2} /> : null,
            )}
          </g>
        </svg>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p data-plot-readout aria-live={spoken ? "polite" : "off"} className="lean text-sm text-fg">
          x = {label(trace, xPlaces)}
          {values.map((y, i) => (
            <span key={i} className="ml-4 inline-flex items-center gap-1.5">
              <Swatch style={STYLES[i % STYLES.length]} />
              {shown(sources[i])} = {label(y, yPlaces)}
            </span>
          ))}
        </p>
        <div className="flex gap-1.5">
          <Button onClick={() => zoom(0.8)} aria-label="Zoom in" className="px-2.5 py-1">
            +
          </Button>
          <Button onClick={() => zoom(1.25)} aria-label="Zoom out" className="px-2.5 py-1">
            −
          </Button>
          <Button onClick={reset} className="px-2.5 py-1">
            Reset
          </Button>
        </div>
      </div>
      {caption && <figcaption className="mt-2 border-t border-line pt-2 text-sm text-fg-3">{caption}</figcaption>}
    </figure>
  );
}

type Style = (typeof STYLES)[number];

/** A short piece of a curve's line, beside its name in the readout. */
function Swatch({ style }: { style: Style }) {
  return (
    <svg viewBox="0 0 22 8" className="h-2 w-[22px]" aria-hidden="true">
      <line x1={1} x2={21} y1={4} y2={4} className={style.stroke} strokeWidth={2.5} strokeDasharray={style.dash} strokeLinecap="round" />
    </svg>
  );
}

function Curve({ expr, view, domain, sx, sy, style }: { expr: Expr; view: View; domain: [number, number] | null; sx: (x: number) => number; sy: (y: number) => number; style: Style }) {
  const runs = curve(expr, view, 400, domain?.[0], domain?.[1]);
  const d = runs.map((run) => run.map(([x, y], i) => `${i ? "L" : "M"}${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`).join(" ")).join(" ");
  // On an interval, the two ends are marked: the curve stops there on purpose.
  const ends = domain ? domain.map((x) => [x, evaluate(expr, x)] as const).filter(([, y]) => Number.isFinite(y)) : [];
  return (
    <>
      <path data-curve d={d} fill="none" className={style.stroke} strokeWidth={2.5} strokeDasharray={style.dash} strokeLinejoin="round" strokeLinecap="round" />
      {ends.map(([x, y]) => (
        <circle key={x} cx={sx(x)} cy={sy(y)} r={3.5} className={style.fill} />
      ))}
    </>
  );
}
