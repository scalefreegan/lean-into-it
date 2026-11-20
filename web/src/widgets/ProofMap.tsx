import { useId, useMemo, useState } from "react";
import { buildMap, type MapEdge, type MapGoal, type MapNode, type StepGoals } from "../../shared/proofmap.ts";
import { cx } from "../ui.tsx";

// The live proof map (web/shared/proofmap.ts): facts down the left, the goals
// and the moves made on them in lanes to the right, one row per line of the
// proof. Shown under the proof board and the typed editor; clicking a node
// picks the Lean line that made it, and the picked line's nodes are ringed.

const PAD = 10;
const FACT_W = 180;
const GAP = 36;
const LANE_W = 200;
const ROW_H = 46;
const NODE_H = 26;
const CHAR_W = 7.2;

function width(n: MapNode): number {
  const max = n.kind === "fact" ? FACT_W - 8 : LANE_W - 24;
  return Math.min(max, Math.max(40, (shortLabel(n).length + (n.state === "closes" ? 2 : 0)) * CHAR_W + 18));
}

/** A label cut to fit its node; the whole is in its title. */
function shortLabel(n: MapNode): string {
  const max = Math.floor(((n.kind === "fact" ? FACT_W - 8 : LANE_W - 24) - 18) / CHAR_W);
  const one = n.label.replace(/\s+/g, " ");
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

function x(n: MapNode): number {
  return n.col < 0 ? PAD : PAD + FACT_W + GAP + n.col * LANE_W;
}

function y(n: MapNode): number {
  return PAD + n.row * ROW_H;
}

/** An arrow's path: down from a goal or move to the next, or across from the facts column. */
function path(e: MapEdge, from: MapNode, to: MapNode): string {
  if (to.kind === "fact") {
    // A move to the fact it brought in, back to the left.
    const [sx, sy] = [x(from), y(from) + NODE_H / 2];
    const [tx, ty] = [x(to) + width(to), y(to) + NODE_H / 2];
    return `M${sx},${sy} C${sx - 30},${sy} ${tx + 30},${ty} ${tx},${ty}`;
  }
  if (e.kind === "uses") {
    const [sx, sy] = [x(from) + width(from), y(from) + NODE_H / 2];
    const [tx, ty] = [x(to), y(to) + NODE_H / 2];
    return `M${sx},${sy} C${sx + 40},${sy} ${tx - 40},${ty} ${tx},${ty}`;
  }
  const [sx, sy] = [x(from) + Math.min(width(from), 60) / 2, y(from) + NODE_H];
  const [tx, ty] = [x(to) + Math.min(width(to), 60) / 2, y(to)];
  return `M${sx},${sy} C${sx},${sy + 14} ${tx},${ty - 14} ${tx},${ty}`;
}

const NODE_CLASS: Record<string, string> = {
  fact: "fill-fact-soft stroke-fact-line",
  "goal open": "fill-goal-soft stroke-goal-line",
  "goal worked": "fill-panel stroke-line-strong",
  "goal done": "fill-good-soft stroke-good-line",
  move: "fill-accent-soft stroke-accent",
  "move closes": "fill-accent-soft stroke-accent",
};

const TEXT_CLASS: Record<string, string> = {
  fact: "fill-fact",
  "goal open": "fill-goal",
  "goal worked": "fill-fg-2",
  "goal done": "fill-good",
  move: "fill-accent",
  "move closes": "fill-accent",
};

function sayNode(n: MapNode): string {
  if (n.kind === "fact") return `Fact ${n.label}`;
  if (n.kind === "move") return `Move ${n.label}${n.state === "closes" ? ", which closes its goal" : ""}, line ${(n.line ?? 0) + 1}`;
  return `Goal ${n.label}, ${n.state === "done" ? "done" : n.state === "open" ? "still open" : "worked on, not finished"}`;
}

interface Props {
  start: MapGoal[];
  steps: StepGoals[];
  /** The body line picked in the Lean beside it; its nodes are ringed. */
  picked?: number | null;
  /** A node was clicked: the body line that made it. */
  onPick?: (line: number) => void;
  /** Lean is checking a newer version: the map is of the one before. */
  stale?: boolean;
}

export function ProofMap({ start, steps, picked = null, onPick, stale = false }: Props) {
  const map = useMemo(() => buildMap(start, steps), [start, steps]);
  const [open, setOpen] = useState(true);
  const id = useId();
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const w = PAD * 2 + FACT_W + GAP + map.lanes * LANE_W;
  const h = PAD * 2 + map.rows * ROW_H;
  if (!map.nodes.length) return null;
  return (
    <div data-proof-map className="border-t border-line px-4 py-3 sm:px-5">
      <div className="mb-2 flex items-center gap-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-fg-3">Proof map</div>
        <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} className="text-xs text-accent underline-offset-2 hover:underline">
          {open ? "Hide" : "Show"}
        </button>
        {open && (
          <span className="flex flex-wrap gap-x-3 text-xs text-fg-3">
            <span className="text-fact">facts</span>
            <span className="text-goal">open goal</span>
            <span className="text-good">done</span>
            <span className="text-accent">a line of the proof</span>
          </span>
        )}
      </div>
      {open && (
        <div id={id} className={cx("overflow-x-auto", stale && "opacity-60")}>
          <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="group" aria-label="Proof map: the facts, the goals, and the line of Lean that made each">
            <defs>
              <marker id={`${id}-arrow`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L8,4 L0,8 z" className="fill-line-strong" />
              </marker>
            </defs>
            {map.edges.map((e) => {
              const from = byId.get(e.from);
              const to = byId.get(e.to);
              if (!from || !to) return null;
              return <path key={`${e.from}>${e.to}`} d={path(e, from, to)} className={cx("fill-none", e.kind === "uses" ? "stroke-fact-line" : "stroke-line-strong")} strokeWidth={1.5} strokeDasharray={e.kind === "uses" ? "4 3" : undefined} markerEnd={`url(#${id}-arrow)`} />;
            })}
            {map.nodes.map((n) => {
              const key = n.kind === "fact" ? "fact" : n.kind === "move" ? (n.state === "closes" ? "move closes" : "move") : `goal ${n.state}`;
              const ringed = picked !== null && n.line === picked;
              const can = n.line !== null && !!onPick;
              const pick = () => {
                if (can) onPick!(n.line!);
              };
              return (
                <g
                  key={n.id}
                  data-node={n.kind}
                  data-state={n.state}
                  data-line={n.line ?? undefined}
                  transform={`translate(${x(n)},${y(n)})`}
                  {...(can
                    ? {
                        role: "button",
                        tabIndex: 0,
                        onClick: pick,
                        onKeyDown: (ev: React.KeyboardEvent) => {
                          if (ev.key === "Enter" || ev.key === " ") {
                            ev.preventDefault();
                            pick();
                          }
                        },
                        className: "cursor-pointer outline-none focus-visible:[&>rect]:stroke-accent",
                      }
                    : {})}
                  aria-label={sayNode(n)}
                >
                  <title>{n.label}</title>
                  <rect width={width(n)} height={NODE_H} rx={n.kind === "move" ? NODE_H / 2 : 6} className={NODE_CLASS[key]} strokeWidth={ringed ? 3 : n.kind === "goal" && n.state === "open" ? 2 : 1.5} {...(ringed ? { stroke: "var(--color-accent)" } : {})} />
                  <text x={9} y={NODE_H / 2 + 4} className={cx("font-mono text-[12px]", TEXT_CLASS[key])}>
                    {n.state === "closes" ? "✓ " : ""}
                    {shortLabel(n)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
}
