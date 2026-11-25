import { useId, useMemo, useState } from "react";
import { insideOf, readSetDiagram, regionCount, regionName, regionsOf, showSet, type SetFormula } from "../../shared/setdiagram.ts";
import { Button, cx, Notice } from "../ui.tsx";
import { bool, str } from "./params.ts";
import type { WidgetProps } from "./types.ts";

// `set-diagram`: the regions of a Venn diagram that a formula names. Each
// region is one rectangle clipped to the inside of some circles and the
// outside of the others, so a press lands on the region under it.

const W = 300;
const H = 240;
const R = 72;
const CENTRES: Record<number, [number, number][]> = {
  2: [[112, 122], [188, 122]],
  3: [[112, 94], [188, 94], [150, 154]],
};
const NAMES: Record<number, [number, number][]> = {
  2: [[40, 58], [260, 58]],
  3: [[34, 44], [266, 44], [238, 212]],
};
const circlePath = ([x, y]: [number, number]) => `M ${x - R} ${y} a ${R} ${R} 0 1 0 ${2 * R} 0 a ${R} ${R} 0 1 0 ${-2 * R} 0 Z`;

interface DiagramProps {
  sets: string[];
  shaded: ReadonlySet<number>;
  empty: ReadonlySet<number>;
  wrong?: ReadonlySet<number>;
  onPress?: (k: number) => void;
  label: string;
}

function Diagram({ sets, shaded, empty, wrong, onPress, label }: DiagramProps) {
  const id = useId();
  const at = CENTRES[sets.length];
  const order = [...Array(regionCount(sets)).keys()];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="w-full max-w-sm">
      <defs>
        {at.map((c, i) => (
          <g key={i}>
            <clipPath id={`${id}in${i}`}>
              <path d={circlePath(c)} />
            </clipPath>
            <clipPath id={`${id}out${i}`}>
              <path d={`M 0 0 H ${W} V ${H} H 0 Z ${circlePath(c)}`} clipRule="evenodd" />
            </clipPath>
          </g>
        ))}
        <pattern id={`${id}x`} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="9" className="stroke-fg-3" strokeWidth="2" />
        </pattern>
      </defs>
      <rect x="1" y="1" width={W - 2} height={H - 2} rx="10" className="fill-panel stroke-line-strong" strokeWidth="1.5" />
      {order.map((k) => {
        const inside = insideOf(sets, k);
        const gone = empty.has(k);
        const paint = wrong?.has(k) ? "fill-bad" : shaded.has(k) && !gone ? "fill-accent" : "";
        const rect = (
          <g data-region={k} data-shaded={shaded.has(k) && !gone ? "" : undefined}>
            <rect x="2" y="2" width={W - 4} height={H - 4} rx="9" fillOpacity={!paint ? 0 : shaded.has(k) ? 0.45 : 0.15} className={cx(paint, onPress && !gone && "cursor-pointer")} onClick={onPress && !gone ? () => onPress(k) : undefined} />
            {gone && <rect x="2" y="2" width={W - 4} height={H - 4} fill={`url(#${id}x)`} pointerEvents="none" />}
          </g>
        );
        // Clips nest: inside this circle, and outside that one.
        return sets.reduce((inner, s, i) => <g key={k} clipPath={`url(#${id}${inside.has(s) ? "in" : "out"}${i})`}>{inner}</g>, rect);
      })}
      {at.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={R} fill="none" className="stroke-fg-2" strokeWidth="1.75" pointerEvents="none" />
      ))}
      {sets.map((s, i) => (
        <text key={s} x={NAMES[sets.length][i][0]} y={NAMES[sets.length][i][1]} textAnchor="middle" className="lean fill-fg text-[18px] font-semibold" pointerEvents="none">
          {s}
        </text>
      ))}
    </svg>
  );
}

const sayRegions = (sets: string[], ks: number[]) => (ks.length ? ks.map((k) => regionName(sets, k)).join("; ") : "no region");

export function SetDiagram({ params }: WidgetProps) {
  const spec = useMemo(() => readSetDiagram(params), [params]);
  const fill = bool(params, "fill", false);
  const caption = str(params, "caption", "");
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set());
  const [checked, setChecked] = useState(false);
  if (typeof spec === "string") return <Notice tone="warn">{`This diagram cannot be drawn: ${spec}`}</Notice>;

  const { sets, formula, against } = spec;
  const empty = new Set(spec.empty);
  const live = (f: SetFormula) => regionsOf(f, sets).filter((k) => !empty.has(k));
  const right = live(formula);
  const other = against ? live(against) : [];
  const differ = against ? [...Array(regionCount(sets)).keys()].filter((k) => right.includes(k) !== other.includes(k)) : [];
  const wrong = checked ? [...Array(regionCount(sets)).keys()].filter((k) => !empty.has(k) && picked.has(k) !== right.includes(k)) : [];
  const toggle = (k: number) => {
    setChecked(false);
    setPicked((old) => {
      const next = new Set(old);
      if (!next.delete(k)) next.add(k);
      return next;
    });
  };
  const given = empty.size ? " Crossed-out regions hold nothing." : "";
  const title = (f: SetFormula) => <p className="lean mb-2 text-center text-base font-semibold text-fg">{showSet(f)}</p>;

  return (
    <figure data-widget="set-diagram" className={cx("rounded-2xl border border-line-strong bg-panel p-4 shadow-sm sm:p-5", against ? "max-w-3xl" : "max-w-xl")}>
      <div className={cx("grid gap-4", against ? "sm:grid-cols-2" : "")}>
        <div className="flex flex-col items-center">
          {title(formula)}
          <Diagram sets={sets} empty={empty} shaded={fill ? picked : new Set(right)} wrong={new Set(wrong)} onPress={fill ? toggle : undefined} label={fill ? `A diagram of ${sets.join(", ")}, to shade` : `${showSet(formula)}: ${sayRegions(sets, right)}.${given}`} />
        </div>
        {against && (
          <div className="flex flex-col items-center">
            {title(against)}
            <Diagram sets={sets} empty={empty} shaded={new Set(other)} label={`${showSet(against)}: ${sayRegions(sets, other)}.${given}`} />
          </div>
        )}
      </div>
      {fill && (
        <>
          <p className="mt-3 text-sm text-fg-3">Press the regions of the diagram, or their names here, then check.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {[...Array(regionCount(sets)).keys()].filter((k) => !empty.has(k)).map((k) => (
              <button key={k} type="button" data-pick={k} aria-pressed={picked.has(k)} onClick={() => toggle(k)} className={cx("rounded-lg border px-2.5 py-1 text-sm", wrong.includes(k) ? cx("border-bad text-bad", picked.has(k) && "bg-accent-soft") : picked.has(k) ? "border-accent bg-accent-soft text-fg" : "border-line-strong text-fg-2 hover:bg-raised")}>
                {regionName(sets, k)}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={() => setChecked(true)}>
              Check the shading
            </Button>
            <span aria-live="polite" className="text-sm">
              {checked && (wrong.length ? <span className="text-bad">{wrong.length === 1 ? "One region is wrong" : `${wrong.length} regions are wrong`}: {sayRegions(sets, wrong)}.</span> : <span className="text-good">Every region is right.</span>)}
            </span>
          </div>
        </>
      )}
      {against && (
        <p data-verdict className={cx("mt-3 text-sm font-semibold", differ.length ? "text-bad" : "text-good")}>
          {differ.length ? `Not always equal. They differ in what is ${sayRegions(sets, differ)}.` : `The same regions${empty.size ? ", among those that can hold anything" : ""}, so the two sets are equal.`}
        </p>
      )}
      {(caption || empty.size > 0) && (
        <figcaption className="mt-3 text-sm text-fg-2">
          {caption}
          {given}
        </figcaption>
      )}
    </figure>
  );
}
