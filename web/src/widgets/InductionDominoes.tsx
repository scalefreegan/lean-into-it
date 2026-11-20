import { useEffect, useRef, useState } from "react";
import { Button, cx } from "../ui.tsx";
import { num, str } from "./params.ts";
import type { WidgetProps } from "./types.ts";

// `induction-dominoes`: the base case pushes the first domino; the step is
// the rule "if n falls, n + 1 falls". Either can be taken away to see the
// chain stop. The row is a picture of all of ℕ, so the last domino is
// followed by an ellipsis.

const W = 30;
const H = 88;
const GAP = 22;
const PAD = 18;
const TICK = 260; // ms between one domino falling and the next
/** The angle at which a domino's top rests on the next one, still standing. */
const LEAN = Math.round((Math.asin(GAP / H) * 180) / Math.PI);

export function InductionDominoes({ params }: WidgetProps) {
  const count = num(params, "count", 8);
  const start = num(params, "start", 0);
  const gapAt = typeof params.gap === "number" ? params.gap : null;
  const claim = str(params, "claim", "");
  const caption = str(params, "caption", "");
  const [base, setBase] = useState(true);
  const [step, setStep] = useState(true);
  // How many have fallen, counted from the first.
  const [fallen, setFallen] = useState(0);
  const [running, setRunning] = useState(false);
  const [pushed, setPushed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  /** How far the chain gets: nothing without the base, one domino without
   *  the step, and up to the gap where the step fails there. */
  const reach = !base ? 0 : !step ? 1 : gapAt !== null ? gapAt - start + 1 : count;

  function push() {
    if (timer.current) clearTimeout(timer.current);
    setFallen(0);
    setRunning(true);
    setPushed(true);
    const fall = (n: number) => {
      if (n > reach) return setRunning(false);
      setFallen(n);
      timer.current = setTimeout(() => fall(n + 1), TICK);
    };
    timer.current = setTimeout(() => fall(1), 150);
  }
  const reset = () => {
    if (timer.current) clearTimeout(timer.current);
    setRunning(false);
    setPushed(false);
    setFallen(0);
  };
  const width = PAD * 2 + count * (W + GAP) + 30;
  const ground = PAD + H + 8;
  const settled = !running && pushed;
  const said = !base
    ? "Without the base case nothing starts: the step alone never says the first one falls."
    : !step
      ? "Without the step only the first falls: nothing makes it pass to the next."
      : gapAt !== null
        ? `The step fails from ${gapAt} to ${gapAt + 1}, so the chain stops there.`
        : "With both, every domino falls: the base case starts it and the step carries it on, to every n.";

  return (
    <figure data-widget="induction-dominoes" className="max-w-3xl rounded-2xl border border-line-strong bg-panel p-4 shadow-sm sm:p-5">
      {claim && (
        <p className="mb-2 text-sm text-fg-2">
          Domino n is the claim P(n): <span className="lean text-fg">{claim}</span>
        </p>
      )}
      <svg viewBox={`0 0 ${width} ${ground + 30}`} role="img" aria-label={`${count} dominoes numbered from ${start}. ${fallen} fallen.`} className="h-auto w-full">
        <line x1={PAD - 6} x2={width - 8} y1={ground} y2={ground} className="stroke-line-strong" strokeWidth={2} />
        {[...Array(count).keys()].map((i) => {
          const x = PAD + i * (W + GAP);
          const down = i < fallen;
          // Lying flat on the one after it once that one is down too; leaning on it while it stands.
          const angle = !down ? 0 : i + 1 < count && i + 1 >= fallen ? LEAN : 62;
          const stopped = settled && i === fallen - 1 && fallen < count;
          return (
            <g key={i} data-domino={start + i} data-fallen={down || undefined}>
              <rect
                x={x}
                y={ground - H}
                width={W}
                height={H}
                rx={4}
                className={cx(down ? "fill-good-soft stroke-good-line" : "fill-goal-soft stroke-goal-line", "transition-transform duration-200")}
                strokeWidth={2}
                style={{ transformBox: "fill-box", transformOrigin: "100% 100%", transform: angle ? `rotate(${angle}deg)` : "none" }}
              />
              <text x={x + W / 2} y={ground + 20} textAnchor="middle" className={cx("font-mono text-[13px]", stopped ? "fill-bad" : "fill-fg-2")}>
                {start + i}
              </text>
              {gapAt === start + i && i < count - 1 && (
                <text x={x + W + GAP / 2} y={ground - H - 6} textAnchor="middle" className="fill-bad font-mono text-[14px]">
                  ✕
                </text>
              )}
            </g>
          );
        })}
        <text x={PAD + count * (W + GAP)} y={ground - 10} className="fill-fg-3 font-mono text-[18px]">
          …
        </text>
      </svg>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-fg-2">
        <Button variant="primary" onClick={push} disabled={running}>
          Push
        </Button>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={base} onChange={(e) => (setBase(e.target.checked), reset())} className="accent-accent" />
          Base case: P({start}) holds
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={step} onChange={(e) => (setStep(e.target.checked), reset())} className="accent-accent" />
          Step: if P(n) then P(n + 1)
        </label>
      </div>
      <p aria-live="polite" className="mt-2 min-h-5 text-sm text-fg-2" data-said>
        {settled ? said : ""}
      </p>
      {caption && <figcaption className="mt-1 text-sm text-fg-3">{caption}</figcaption>}
    </figure>
  );
}
