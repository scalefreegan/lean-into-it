import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { braces, collisions, image, injectiveSaid, missed, preimage, readArrows, surjectiveSaid } from "../../shared/arrows.ts";
import { Button, cx, Notice } from "../ui.tsx";
import { bool, list, str } from "./params.ts";
import type { WidgetProps } from "./types.ts";

// `function-arrows`: a function between two small finite sets. Arrows that
// meet and elements nothing reaches are where injectivity and surjectivity
// fail. With `image` or `preimage` it follows a set across instead.

const W = 340;
const ROW = 46;
const PAD = 34;
const LEFT = 70;
const RIGHT = W - 70;
const DOT = 17;

export function FunctionArrows({ params }: WidgetProps) {
  const id = useId();
  const start = useMemo(() => readArrows(params), [params]);
  const mode = params.image !== undefined ? "image" : params.preimage !== undefined ? "preimage" : "judge";
  const show = str(params, "show", "both");
  const edit = bool(params, "edit", true);
  const caption = str(params, "caption", "");
  const ok = typeof start !== "string";
  const firstSet = () => new Set(ok && mode !== "judge" ? list(params, mode, []).map((x) => (mode === "image" ? start.from : start.to).indexOf(String(x))) : []);
  const [map, setMap] = useState<number[]>(() => (ok ? start.map : []));
  const [aim, setAim] = useState<number | null>(null);
  const [set, setSet] = useState<ReadonlySet<number>>(firstSet);
  if (!ok) return <Notice tone="warn">{`This function cannot be drawn: ${start}`}</Notice>;

  const f = { ...start, map };
  const judging = mode === "judge";
  const askInj = judging && show !== "surjective";
  const askSur = judging && show !== "injective";
  const meet = askInj ? collisions(f) : [];
  const none = askSur ? missed(f) : [];
  const inj = injectiveSaid(f);
  const sur = surjectiveSaid(f);
  const result = new Set(mode === "image" ? image(f, set) : mode === "preimage" ? preimage(f, set) : []);
  const litLeft = mode === "image" ? set : mode === "preimage" ? result : new Set<number>();
  const litRight = mode === "image" ? result : mode === "preimage" ? set : new Set<number>();
  const height = PAD * 2 + (Math.max(f.from.length, f.to.length) - 1) * ROW;
  const yOf = (n: number, i: number) => height / 2 + (i - (n - 1) / 2) * ROW;
  const changed = mode === "judge" ? map.some((m, i) => m !== start.map[i]) : [...set].sort().join() !== [...firstSet()].sort().join();
  const toggle = (i: number) =>
    setSet((old) => {
      const next = new Set(old);
      if (!next.delete(i)) next.add(i);
      return next;
    });
  const pressLeft = !edit ? null : judging ? (i: number) => setAim((a) => (a === i ? null : i)) : mode === "image" ? toggle : null;
  const pressRight = !edit ? null : judging ? (j: number) => {
    if (aim === null) return;
    setMap((m) => m.map((x, i) => (i === aim ? j : x)));
    setAim(null);
  } : mode === "preimage" ? toggle : null;

  const node = (side: "from" | "to", i: number) => {
    const left = side === "from";
    const xs = left ? f.from : f.to;
    const press = left ? pressLeft : pressRight;
    const active = !!press && (left || !judging || aim !== null);
    const lit = (left ? litLeft : litRight).has(i);
    const bad = !left && (meet.includes(i) || none.includes(i));
    const x = left ? LEFT : RIGHT;
    const y = yOf(xs.length, i);
    const pressed = judging ? (left ? aim === i : undefined) : lit;
    return (
      <g
        key={`${side}${i}`}
        data-node={`${side}:${xs[i]}`}
        {...(active
          ? {
              role: "button",
              tabIndex: 0,
              "aria-pressed": pressed,
              "aria-label": judging ? (left ? `${xs[i]}, goes to ${f.to[map[i]]}. Select to re-aim its arrow.` : `Send ${f.from[aim ?? 0]} to ${xs[i]}`) : `${xs[i]}, ${lit ? "in" : "not in"} the set`,
              onClick: () => press(i),
              onKeyDown: (e: KeyboardEvent) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                press(i);
              },
              className: "cursor-pointer",
            }
          : {})}
      >
        <circle cx={x} cy={y} r={DOT} strokeWidth={lit || bad || (left && aim === i) ? 2.5 : 1.5} strokeDasharray={!left && none.includes(i) ? "4 3" : undefined} className={cx(bad ? "fill-bad-soft stroke-bad" : lit || (left && aim === i) ? "fill-accent-soft stroke-accent" : "fill-panel stroke-line-strong")} />
        <text x={x} y={y + 5} textAnchor="middle" className="lean fill-fg text-[14px]" pointerEvents="none">
          {xs[i]}
        </text>
      </g>
    );
  };

  const names = (xs: string[], s: ReadonlySet<number>) => braces(xs.filter((_, i) => s.has(i)));
  return (
    <figure data-widget="function-arrows" className="max-w-xl rounded-2xl border border-line-strong bg-panel p-4 shadow-sm sm:p-5">
      <svg viewBox={`0 0 ${W} ${height}`} role="group" aria-label={`A function: ${f.from.map((x, i) => `${x} goes to ${f.to[map[i]]}`).join(", ")}`} className="mx-auto block w-full max-w-md">
        <defs>
          {(["line", "bad", "accent"] as const).map((k) => (
            <marker key={k} id={`${id}${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 Z" className={k === "bad" ? "fill-bad" : k === "accent" ? "fill-accent" : "fill-fg-3"} />
            </marker>
          ))}
        </defs>
        {map.map((j, i) => {
          const [x1, y1, x2, y2] = [LEFT, yOf(f.from.length, i), RIGHT, yOf(f.to.length, j)];
          const d = Math.hypot(x2 - x1, y2 - y1);
          const [ux, uy] = [(x2 - x1) / d, (y2 - y1) / d];
          const kind = meet.includes(j) ? "bad" : litLeft.has(i) || aim === i ? "accent" : "line";
          return <line key={i} data-arrow={`${f.from[i]}:${f.to[j]}`} x1={x1 + ux * DOT} y1={y1 + uy * DOT} x2={x2 - ux * (DOT + 3)} y2={y2 - uy * (DOT + 3)} strokeWidth={kind === "line" ? 1.5 : 2.25} className={kind === "bad" ? "stroke-bad" : kind === "accent" ? "stroke-accent" : "stroke-fg-3"} markerEnd={`url(#${id}${kind})`} />;
        })}
        {f.from.map((_, i) => node("from", i))}
        {f.to.map((_, j) => node("to", j))}
      </svg>
      <div aria-live="polite" className="mt-3 flex flex-col gap-1 text-sm">
        {askInj && <p data-injective={inj.holds} className={inj.holds ? "text-good" : "text-bad"}>{`${inj.holds ? "Injective" : "Not injective"}: ${inj.why}.`}</p>}
        {askSur && <p data-surjective={sur.holds} className={sur.holds ? "text-good" : "text-bad"}>{`${sur.holds ? "Surjective" : "Not surjective"}: ${sur.why}.`}</p>}
        {askInj && askSur && inj.holds && sur.holds && <p className="font-semibold text-good">Both, so bijective: each element on the right comes from exactly one on the left.</p>}
        {mode === "image" && <p data-result className="text-fg-2">The image of <span className="lean">{names(f.from, set)}</span> is <span className="lean">{names(f.to, result)}</span>.</p>}
        {mode === "preimage" && <p data-result className="text-fg-2">The preimage of <span className="lean">{names(f.to, set)}</span> is <span className="lean">{names(f.from, result)}</span>.</p>}
      </div>
      {edit && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button disabled={!changed && aim === null} onClick={() => { setMap(start.map); setAim(null); setSet(firstSet()); }}>
            Reset
          </Button>
          <span className="text-sm text-fg-3">
            {judging ? (aim === null ? "Select an element on the left to re-aim its arrow." : `Now select where ${f.from[aim]} should go.`) : `Press elements on the ${mode === "image" ? "left" : "right"} to change the set.`}
          </span>
        </div>
      )}
      {caption && <figcaption className="mt-3 text-sm text-fg-2">{caption}</figcaption>}
    </figure>
  );
}
