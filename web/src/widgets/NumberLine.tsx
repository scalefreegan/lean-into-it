import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { inInterval, intervalLabel, readInterval, readPoint, type Interval, type Point } from "../../shared/numberline.ts";
import { clean, label, ticks } from "../../shared/plot.ts";
import { list, str } from "./params.ts";
import type { WidgetProps } from "./types.ts";

// `number-line`: points, intervals and distances on a line, and optionally
// a point x that can be moved, with a sentence saying where it is.

const W = 640;
const H = 150;
const PAD = 30;
const AXIS = 86;

const pair = (v: unknown): [number, number] | null => (Array.isArray(v) && v.length === 2 && typeof v[0] === "number" && typeof v[1] === "number" ? [v[0], v[1]] : null);

export function NumberLine({ params }: WidgetProps) {
  const [lo, hi] = pair(params.range) ?? [-5, 5];
  const points = list<unknown>(params, "points", []).flatMap((p) => readPoint(p) ?? []) as Point[];
  const intervals = list<unknown>(params, "intervals", []).flatMap((s) => {
    const i = readInterval(s);
    return typeof i === "string" ? [] : [i];
  });
  const distance = pair(params.distance);
  const near = pair(params.near);
  const caption = str(params, "caption", "");
  const hasProbe = typeof params.probe === "number";
  const [probe, setProbe] = useState(hasProbe ? (params.probe as number) : 0);
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  const sx = (x: number) => PAD + ((x - lo) / (hi - lo)) * (W - 2 * PAD);
  const step = hi - lo <= 20 ? 0.1 : 1;
  const put = (x: number) => setProbe(clean(Math.min(hi, Math.max(lo, Math.round(x / step) * step))));
  const xAt = (e: PointerEvent) => {
    const box = svg.current!.getBoundingClientRect();
    return lo + ((((e.clientX - box.left) / box.width) * W - PAD) / (W - 2 * PAD)) * (hi - lo);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    const big = e.shiftKey ? 10 : 1;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") put(probe - step * big);
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") put(probe + step * big);
    else if (e.key === "PageDown") put(probe - step * 10);
    else if (e.key === "PageUp") put(probe + step * 10);
    else if (e.key === "Home") put(lo);
    else if (e.key === "End") put(hi);
    else return;
    e.preventDefault();
  };

  const window: Interval | null = near ? { lo: near[0] - near[1], hi: near[0] + near[1], loClosed: false, hiClosed: false } : null;
  const shaded = [...intervals, ...(window ? [window] : [])];
  const readout: string[] = [];
  if (hasProbe) {
    readout.push(`x = ${label(probe)}.`);
    if (near) {
      const d = clean(Math.abs(probe - near[0]));
      readout.push(`|x − ${label(near[0])}| = ${label(d)}, which is ${d < near[1] ? "" : "not "}less than ${label(near[1])}.`);
    }
    for (const i of intervals) readout.push(`x is ${inInterval(probe, i) ? "" : "not "}in ${intervalLabel(i)}.`);
  }
  const summary = [
    points.length ? `points at ${points.map((p) => p.label).join(", ")}` : "",
    shaded.length ? `shaded: ${shaded.map(intervalLabel).join(", ")}` : "",
    distance ? `the distance from ${label(distance[0])} to ${label(distance[1])}` : "",
  ].filter(Boolean);

  return (
    <figure data-widget="number-line" className="max-w-3xl rounded-2xl border border-line-strong bg-panel p-3 shadow-sm sm:p-4">
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`A number line from ${label(lo)} to ${label(hi)}${summary.length ? `, with ${summary.join("; ")}` : ""}.`}
        className={`block h-auto w-full select-none ${hasProbe ? "touch-none" : ""}`}
        onPointerDown={(e) => {
          if (!hasProbe) return;
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          dragging.current = true;
          put(xAt(e));
        }}
        onPointerMove={(e) => dragging.current && put(xAt(e))}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        {/* The line, with an arrowhead at each end: it goes on. */}
        <line x1={8} x2={W - 8} y1={AXIS} y2={AXIS} className="stroke-fg-2" strokeWidth={1.5} />
        <path d={`M8 ${AXIS} l8 -5 v10 z M${W - 8} ${AXIS} l-8 -5 v10 z`} className="fill-fg-2" />
        {ticks(lo, hi, 10).map((t) => (
          <g key={t}>
            <line x1={sx(t)} x2={sx(t)} y1={AXIS - 5} y2={AXIS + 5} className="stroke-fg-2" strokeWidth={1.5} />
            <text x={sx(t)} y={AXIS + 22} textAnchor="middle" className="fill-fg-3 font-mono text-[13px]">
              {label(t)}
            </text>
          </g>
        ))}

        {shaded.map((i, k) => (
          <Stretch key={k} interval={i} lo={lo} hi={hi} sx={sx} />
        ))}

        {distance && (
          <g data-distance>
            <path
              d={`M${sx(distance[0])} ${AXIS - 30} v-12 M${sx(distance[1])} ${AXIS - 30} v-12 M${sx(distance[0])} ${AXIS - 36} H${sx(distance[1])}`}
              fill="none"
              className="stroke-fg"
              strokeWidth={1.5}
            />
            <text x={(sx(distance[0]) + sx(distance[1])) / 2} y={AXIS - 46} textAnchor="middle" className="fill-fg font-mono text-[14px]">
              |{label(distance[0])} − {label(distance[1])}| = {label(clean(distance[1] - distance[0]))}
            </text>
          </g>
        )}

        {near && (
          <g data-near>
            <line x1={sx(near[0])} x2={sx(near[0])} y1={AXIS - 9} y2={AXIS + 9} className="stroke-accent" strokeWidth={2} />
            <text x={sx(near[0])} y={AXIS - 16} textAnchor="middle" className="fill-accent font-mono text-[13px]">
              {label(near[0])}
            </text>
          </g>
        )}

        {points.map((p) => (
          <g key={`${p.value}:${p.label}`} data-point={p.label}>
            <circle cx={sx(p.value)} cy={AXIS} r={5} className="fill-fg" />
            <text x={sx(p.value)} y={AXIS - 13} textAnchor="middle" className="fill-fg font-mono text-[14px]">
              {p.label}
            </text>
          </g>
        ))}

        {hasProbe && (
          <g
            data-probe
            role="slider"
            tabIndex={0}
            aria-label="x"
            aria-valuemin={lo}
            aria-valuemax={hi}
            aria-valuenow={probe}
            aria-valuetext={readout.join(" ")}
            onKeyDown={onKeyDown}
            className="cursor-grab outline-none focus-visible:[&>circle]:stroke-fg"
          >
            <line x1={sx(probe)} x2={sx(probe)} y1={AXIS + 28} y2={AXIS + 36} className="stroke-accent" strokeWidth={1.5} />
            <circle cx={sx(probe)} cy={AXIS} r={8} className="fill-accent stroke-panel" strokeWidth={2.5} />
            <text x={sx(probe)} y={AXIS + 50} textAnchor="middle" className="fill-accent font-mono text-[14px] font-semibold">
              x
            </text>
          </g>
        )}
      </svg>
      {hasProbe && (
        <p data-line-readout aria-live="polite" className="lean mt-1 text-sm text-fg">
          {readout.join(" ")} <span className="font-sans text-fg-3">Drag x, or use the arrow keys.</span>
        </p>
      )}
      {caption && <figcaption className="mt-2 border-t border-line pt-2 text-sm text-fg-3">{caption}</figcaption>}
    </figure>
  );
}

/** A shaded stretch of the line. A filled end belongs to it, a hollow end
 *  does not; an end beyond the picture is simply not drawn. */
function Stretch({ interval, lo, hi, sx }: { interval: Interval; lo: number; hi: number; sx: (x: number) => number }) {
  const from = Math.max(interval.lo, lo);
  const to = Math.min(interval.hi, hi);
  const left = interval.lo < lo ? 10 : sx(from);
  const right = interval.hi > hi ? W - 10 : sx(to);
  return (
    <g data-interval={intervalLabel(interval)}>
      <line x1={left} x2={right} y1={AXIS} y2={AXIS} className="stroke-accent" strokeWidth={7} strokeOpacity={0.45} />
      {interval.lo >= lo && <circle cx={sx(from)} cy={AXIS} r={6} className={interval.loClosed ? "fill-accent stroke-accent" : "fill-panel stroke-accent"} strokeWidth={2.5} />}
      {interval.hi <= hi && <circle cx={sx(to)} cy={AXIS} r={6} className={interval.hiClosed ? "fill-accent stroke-accent" : "fill-panel stroke-accent"} strokeWidth={2.5} />}
    </g>
  );
}
