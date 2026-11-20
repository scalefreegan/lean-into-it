import { useId, type ReactNode } from "react";
import { curve, label, tickPlaces, ticks, type View } from "../../shared/plot.ts";
import type { Expr } from "../../shared/expr.ts";

// A fixed graph for the limit explorers: axes, grid and labels for a view,
// and the drawing inside it clipped to the plot. Unlike `plot` it does not
// pan or zoom: the sliders are what move.

const FW = 640;
const FH = 360;
const LEFT = 46;
const RIGHT = 14;
const TOP = 14;
const BOTTOM = 30;
const PW = FW - LEFT - RIGHT;
const PH = FH - TOP - BOTTOM;

export interface Scale {
  sx: (x: number) => number;
  sy: (y: number) => number;
  view: View;
  /** The plot area's edges, in picture units. */
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function scaleFor(view: View): Scale {
  return {
    sx: (x) => LEFT + ((x - view.x0) / (view.x1 - view.x0)) * PW,
    sy: (y) => TOP + ((view.y1 - y) / (view.y1 - view.y0)) * PH,
    view,
    left: LEFT,
    right: LEFT + PW,
    top: TOP,
    bottom: TOP + PH,
  };
}

export function Frame({ view, label: aria, children }: { view: View; label: string; children: (s: Scale) => ReactNode }) {
  const s = scaleFor(view);
  const xs = ticks(view.x0, view.x1, 8);
  const ys = ticks(view.y0, view.y1, 6);
  const clip = `frame-clip-${useId().replace(/[^A-Za-z0-9]/g, "")}`;
  return (
    <svg viewBox={`0 0 ${FW} ${FH}`} role="img" aria-label={aria} className="block h-auto w-full select-none">
      <defs>
        <clipPath id={clip}>
          <rect x={LEFT} y={TOP} width={PW} height={PH} />
        </clipPath>
      </defs>
      <rect x={LEFT} y={TOP} width={PW} height={PH} className="fill-panel stroke-line" />
      {xs.map((x, i) => (
        <g key={`x${i}`}>
          <line x1={s.sx(x)} x2={s.sx(x)} y1={TOP} y2={TOP + PH} className="stroke-line" strokeWidth={1} />
          <text x={s.sx(x)} y={FH - 10} textAnchor="middle" className="fill-fg-3 font-mono text-[12px]">
            {label(x, tickPlaces(xs))}
          </text>
        </g>
      ))}
      {ys.map((y, i) => (
        <g key={`y${i}`}>
          <line x1={LEFT} x2={LEFT + PW} y1={s.sy(y)} y2={s.sy(y)} className="stroke-line" strokeWidth={1} />
          <text x={LEFT - 7} y={s.sy(y) + 4} textAnchor="end" className="fill-fg-3 font-mono text-[12px]">
            {label(y, tickPlaces(ys))}
          </text>
        </g>
      ))}
      {view.y0 <= 0 && view.y1 >= 0 && <line x1={LEFT} x2={LEFT + PW} y1={s.sy(0)} y2={s.sy(0)} className="stroke-line-strong" strokeWidth={1.5} />}
      {view.x0 <= 0 && view.x1 >= 0 && <line x1={s.sx(0)} x2={s.sx(0)} y1={TOP} y2={TOP + PH} className="stroke-line-strong" strokeWidth={1.5} />}
      <g clipPath={`url(#${clip})`}>{children(s)}</g>
    </svg>
  );
}

/** A function's graph in the frame, broken where it has no value. */
export function Graph({ expr, s, className = "stroke-accent" }: { expr: Expr; s: Scale; className?: string }) {
  const d = curve(expr, s.view, 400)
    .map((run) => run.map(([x, y], i) => `${i ? "L" : "M"}${s.sx(x).toFixed(1)} ${s.sy(y).toFixed(1)}`).join(" "))
    .join(" ");
  return <path data-curve d={d} fill="none" className={className} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />;
}

/** A labelled slider, its value shown beside it. */
export function Slider({ name, value, min, max, step, onChange, shown }: { name: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; shown?: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-fg-2">
      <span className="lean w-6 text-fg">{name}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-40 accent-accent" aria-label={name} aria-valuetext={shown ?? String(value)} />
      <span className="lean w-20 text-fg" data-value={name}>
        {shown ?? String(value)}
      </span>
    </label>
  );
}
