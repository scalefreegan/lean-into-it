// Kinds `predict`, `read`, `match` (bead lii-6xv.2) and `flaw` (lii-6xv.4):
// reading, not writing. Pure, so the server, the page and the tests share it.
//
// PREDICT is decided by Lean. The learner picks the state a move leaves;
// the server runs the move after the exercise's `before` lines and compares
// the goals Lean returns with the option picked. The `solution` an author
// lists is only what `npm test` and `check:content` hold Lean to: the
// exercise is refused there if Lean's state is not that option, or is also
// another one.
//
// READ and MATCH are fixed answers (the user's decision of 2026-11-19:
// recognising what a Lean statement says is marked against the author's
// answer; a proof is still solved only by Lean). Lean still checks that
// every Lean statement they show is one Lean can read. FLAW (which step of
// an argument in words is wrong) is a fixed answer with no Lean at all.

import { parseState, type Goal } from "./goals.ts";
import type { ExerciseKind } from "./registry.ts";

/** The kinds about reading, not writing: a choice, not a proof. Their
 *  answers credit no moves, and placement asks them last. */
export const isReading = (kind: ExerciseKind): boolean => kind === "predict" || isFixed(kind);
/** The kinds marked against the author's answer, without Lean. */
export const isFixed = (kind: ExerciseKind): boolean => kind === "read" || kind === "match" || kind === "flaw";

/** The option meaning that the move finishes the proof. */
export const NO_GOALS = "no goals";

/** A state option as goals: `no goals`, or one or more goals as Lean prints them. */
export function optionGoals(option: string): Goal[] {
  return option.trim().toLowerCase() === NO_GOALS ? [] : parseState(option);
}

/** Why a state option cannot be read, or null when it can. */
export function optionProblem(option: string): string | null {
  if (option.trim().toLowerCase() === NO_GOALS) return null;
  // Every goal in it ends with its ⊢ line.
  const goals = option.trim().split(/\n\s*\n/);
  return goals.every((g) => /^\s*⊢/m.test(g)) ? null : `an option must be a proof state (facts, then a line starting ⊢; each goal its own ⊢) or \`${NO_GOALS}\``;
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** A goal as one text, its facts in a fixed order, its spacing ignored. */
function goalKey(g: Goal): string {
  const facts = g.hypotheses.flatMap((h) => h.names.map((n) => `${n} : ${squash(h.type)}${h.value ? ` := ${squash(h.value)}` : ""}`)).sort();
  return `${facts.join("\n")}\n⊢ ${squash(g.target)}`;
}

/** Whether two states are the same: the same goals in the same order, each
 *  with the same facts (in any order, grouped or not) and the same target,
 *  spacing aside. Case names are not compared. */
export function sameState(a: Goal[], b: Goal[]): boolean {
  return a.length === b.length && a.every((g, i) => goalKey(g) === goalKey(b[i]));
}

/** A match answer: for each English line, in order, the index of the Lean
 *  line paired with it, as the authored lists number them: `2,0,1`. */
export function readPairing(text: string, n: number): number[] | string {
  const parts = text.split(",").map((p) => p.trim());
  if (parts.length !== n || parts.some((p) => !/^\d+$/.test(p))) return `Pair each of the ${n} sentences with one Lean statement.`;
  const picks = parts.map(Number);
  if (picks.some((p) => p >= n) || new Set(picks).size !== n) return "Each Lean statement goes with exactly one sentence.";
  return picks;
}

/** The order to show `n` items in, the same every time for one exercise and
 *  never the authored order (so the order gives nothing away). */
export function shuffled(n: number, seed: string): number[] {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const order = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const j = h % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (n > 1 && order.every((v, i) => v === i)) order.push(order.shift()!);
  return order;
}
