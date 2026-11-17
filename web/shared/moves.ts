// The proof board's moves: each is one Lean tactic a click can write. The
// board never hides the Lean: the line a move produces is shown as it is
// added. A lesson's exercises name the moves they offer by id.
//
// Adding a move starts here; the board renders whatever is listed.

import { namesIn, type Goal } from "./goals.ts";

export interface Move {
  id: string;
  /** The tactic keyword, shown on the button. */
  label: string;
  /** `none`: the move stands alone. `fact`: click a hypothesis card to say
   *  which fact it uses. `name`: it introduces a new name, chosen for you. */
  needs: "none" | "fact" | "name";
  /** One line: what the move does, in plain words. */
  does: string;
  /** Shown when the move is picked and waiting for a card. */
  prompt?: string;
}

export const MOVES: Record<string, Move> = {
  intro: {
    id: "intro",
    label: "intro",
    needs: "name",
    does: "To prove “if A then B”, assume A. A becomes a fact you can use, and the goal becomes B.",
  },
  exact: {
    id: "exact",
    label: "exact",
    needs: "fact",
    does: "Finish the goal with a fact that says exactly what the goal says.",
    prompt: "Click the fact that matches the goal exactly.",
  },
  apply: {
    id: "apply",
    label: "apply",
    needs: "fact",
    does: "Use a fact of the form “if A then B” on the goal B. The goal becomes A: it is now enough to prove A.",
    prompt: "Click the “if… then” fact whose conclusion is the goal.",
  },
};

export function isMove(id: string): boolean {
  return Object.hasOwn(MOVES, id);
}

/**
 * A name for what `intro` brings in. For “∀ x, …” Lean's own binder name is
 * kept; for “A → B” the name is h followed by A when A is a single letter or
 * word (hP), which is how Lean users name such facts; otherwise h, h1, h2 ….
 * Never a name already in the goal.
 */
export function introName(goal: Goal): string {
  const taken = new Set(namesIn(goal));
  const target = goal.target.trim();
  const fresh = (base: string): string => {
    if (!taken.has(base)) return base;
    for (let i = 1; ; i++) if (!taken.has(`${base}${i}`)) return `${base}${i}`;
  };
  const binder = /^∀\s*\(?\s*([^\s,:()]+)/.exec(target);
  if (binder) return fresh(binder[1]);
  const antecedent = /^([A-Za-z][A-Za-z0-9_']*)\s*→/.exec(target);
  if (antecedent) return fresh(`h${antecedent[1]}`);
  return fresh("h");
}

/** The Lean line a move writes. `fact` is the clicked hypothesis name. */
export function moveLine(move: Move, goal: Goal, fact?: string): string {
  if (move.needs === "name") return `${move.label} ${introName(goal)}`;
  if (move.needs === "fact") return `${move.label} ${fact ?? "?"}`;
  return move.label;
}
