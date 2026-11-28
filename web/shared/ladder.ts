// The ladder (bead lii-8wq.1): how much help a proof's input gives, from
// clicking cards to typing Lean with nothing beside it. Pure.
//
//   1  the proof board, offering only the moves this proof needs (`moves`)
//   2  the proof board, offering every move learned so far
//   3  the editor; the moves are behind a "Show moves" control, and a click
//      only writes its line at the caret
//   4  the editor alone
//
// Rungs 1–2 are the board, 3–4 the editor. An exercise's `mode` says what
// it can be: `board`, its solution is lines the board writes, so it can be
// shown at any rung; `typed`, it needs the editor, so 3 or 4. An exercise
// may set its rung; otherwise its level's default (curriculum.yaml `ladder`)
// is used, raised to 3 for a typed one. So a board exercise in a typing
// level is typed, with its moves to hand. A learner may always step down a
// rung for one exercise (`stepDown`): that is not help that marks an attempt
// assisted, but the attempt records the rung it was made at.

import { forbiddenIn } from "./proof.ts";
import type { ProofMode } from "./content.ts";

export type Ladder = 1 | 2 | 3 | 4;

export const isLadder = (n: unknown): n is Ladder => n === 1 || n === 2 || n === 3 || n === 4;

/** Whether a rung is shown on the board. */
export const onBoard = (rung: Ladder): boolean => rung <= 2;

/** An exercise's rung: its own, or its level's, raised to 3 for a typed one. */
export function resolveLadder(own: Ladder | undefined, mode: ProofMode, levelDefault: Ladder): Ladder {
  if (own) return own;
  return mode === "typed" && levelDefault < 3 ? 3 : levelDefault;
}

/** The rung one step down, for one exercise; null at the bottom. A typed
 *  exercise stops at 3 (its proof may need more than the board's moves). */
export function stepDown(rung: Ladder, mode: ProofMode): Ladder | null {
  if (rung === 1 || (rung === 3 && mode === "typed")) return null;
  return (rung - 1) as Ladder;
}

/** Whether a check was made on the board: its recorded rung, or for a row
 *  from before rungs were recorded, the exercise's mode (then the board was
 *  every board exercise's input). */
export function attemptOnBoard(ladder: number | null | undefined, mode: ProofMode): boolean {
  return ladder === null || ladder === undefined ? mode === "board" : ladder <= 2;
}

/** The moves learned by a level: those of every level up to it, in order,
 *  then the exercise's own (a move it needs that no level lists), less any
 *  the exercise switches off (by the forbid list's own rule, so `simp`
 *  takes `simp only` and `simp_all` with it). */
export function learnedMoves(levels: { id: number; moves: string[] }[], level: number, own: string[], forbid: string[]): string[] {
  const out: string[] = [];
  for (const l of [...levels].sort((a, b) => a.id - b.id)) if (l.id <= level) for (const m of l.moves) if (!out.includes(m)) out.push(m);
  for (const m of own) if (!out.includes(m)) out.push(m);
  return out.filter((m) => !forbiddenIn(m, forbid).length);
}

/** Where a palette click's line goes in a typed proof: on the caret's line
 *  when that line is blank, else on a new line after it at the same indent
 *  (inside a bullet, at the bullet's text: `· intro h` is followed at two
 *  more spaces, so the line stays in that case). Returns the new text and
 *  the caret at the end of the line written. */
export function insertLine(text: string, caretLine: number, line: string): { text: string; caret: { line: number; character: number } } {
  const lines = text.split("\n");
  const at = Math.min(Math.max(caretLine, 0), lines.length - 1);
  if (!lines[at].trim()) {
    const indent = lines[at];
    lines[at] = indent + line;
    return { text: lines.join("\n"), caret: { line: at, character: lines[at].length } };
  }
  const bullet = /^(\s*)[·•]\s/.exec(lines[at]);
  const indent = bullet ? `${bullet[1]}  ` : /^\s*/.exec(lines[at])![0];
  lines.splice(at + 1, 0, indent + line);
  return { text: lines.join("\n"), caret: { line: at + 1, character: indent.length + line.length } };
}
