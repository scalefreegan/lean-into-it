import { useId, useState } from "react";
import { clean, label } from "../../shared/plot.ts";
import { num } from "./params.ts";
import type { WidgetProps } from "./types.ts";

// `square-of-sum`: the square of side a + b in four pieces. The picture is
// the identity (a + b)² = a² + 2ab + b² for positive lengths; the lesson
// then proves it for every real number.

const SIDE = 300;
const PAD = 26;

export function SquareOfSum({ params }: WidgetProps) {
  const [a, setA] = useState(num(params, "a", 3));
  const [b, setB] = useState(num(params, "b", 2));
  const id = useId();
  const unit = SIDE / (a + b);
  const A = a * unit;
  const B = b * unit;
  const piece = (x: number, y: number, w: number, h: number, fill: string, name: string, area: number) => (
    <g data-piece={name}>
      <rect x={PAD + x} y={PAD + y} width={w} height={h} className={`${fill} stroke-fg-2`} strokeWidth={1.5} />
      {w > 44 && h > 30 && (
        <text x={PAD + x + w / 2} y={PAD + y + h / 2 + 5} textAnchor="middle" className="fill-fg font-mono text-[14px]">
          {name}
          {w > 84 ? ` = ${label(area)}` : ""}
        </text>
      )}
    </g>
  );
  const side = "fill-fg-2 font-mono text-[14px] italic";
  const slider = (name: string, value: number, set: (v: number) => void) => (
    <label htmlFor={`${id}-${name}`} className="flex items-center gap-3 text-sm text-fg-2">
      <span className="lean w-16 text-fg">
        {name} = {label(value)}
      </span>
      <input id={`${id}-${name}`} type="range" min={0.5} max={10} step={0.5} value={value} onChange={(e) => set(Number(e.target.value))} className="w-44 accent-accent" />
    </label>
  );
  const total = clean((a + b) ** 2);
  return (
    <figure data-widget="square-of-sum" className="flex max-w-3xl flex-wrap items-center gap-x-8 gap-y-4 rounded-2xl border border-line-strong bg-panel p-4 shadow-sm sm:p-5">
      <svg
        viewBox={`0 0 ${SIDE + 2 * PAD} ${SIDE + 2 * PAD}`}
        role="img"
        aria-label={`A square of side a + b, with a = ${label(a)} and b = ${label(b)}, cut into a square of side a, a square of side b and two a by b rectangles.`}
        className="h-auto w-full max-w-[21rem] shrink-0"
      >
        {piece(0, 0, A, A, "fill-accent-soft", "a²", clean(a * a))}
        {piece(A, 0, B, A, "fill-raised", "ab", clean(a * b))}
        {piece(0, A, A, B, "fill-raised", "ab", clean(a * b))}
        {piece(A, A, B, B, "fill-panel", "b²", clean(b * b))}
        <text x={PAD + A / 2} y={PAD - 9} textAnchor="middle" className={side}>
          a
        </text>
        <text x={PAD + A + B / 2} y={PAD - 9} textAnchor="middle" className={side}>
          b
        </text>
        <text x={PAD - 12} y={PAD + A / 2 + 5} textAnchor="middle" className={side}>
          a
        </text>
        <text x={PAD - 12} y={PAD + A + B / 2 + 5} textAnchor="middle" className={side}>
          b
        </text>
      </svg>
      <div className="flex min-w-0 flex-col gap-3">
        {slider("a", a, setA)}
        {slider("b", b, setB)}
        <div data-square-readout aria-live="polite" className="lean mt-1 text-base leading-7 text-fg">
          <div>
            (a + b)² = {label(clean(a + b))}² = {label(total)}
          </div>
          <div>
            a² + 2ab + b² = {label(clean(a * a))} + 2·{label(clean(a * b))} + {label(clean(b * b))} = {label(total)}
          </div>
        </div>
      </div>
    </figure>
  );
}
