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
   *  which fact it uses. `name`: it introduces a new name, chosen for you.
   *  `text`: it needs something typed, such as the number for `use`. */
  needs: "none" | "fact" | "name" | "text";
  /** One line: what the move does, in plain words. */
  does: string;
  /** Shown when the move is picked and waiting for a card or for text. */
  prompt?: string;
}

const CONSTRUCTOR: Move = {
  id: "constructor",
  label: "constructor",
  needs: "none",
  does: "Split a goal “A and B” (or “A if and only if B”) into its two parts, to be proved one after the other.",
};

export const MOVES: Record<string, Move> = {
  rfl: {
    id: "rfl",
    label: "rfl",
    needs: "none",
    does: "Finish an equation whose two sides are the same thing once worked out, like 2 + 2 = 4.",
  },
  norm_num: {
    id: "norm_num",
    label: "norm_num",
    needs: "none",
    does: "Calculate. Settles a claim about particular numbers, such as an equation or whether a number is prime, by working it out.",
  },
  intro: {
    id: "intro",
    label: "intro",
    needs: "name",
    does: "To prove “if A then B”, assume A. To prove “not A”, assume A. To prove “for all x”, take an arbitrary x. What was assumed or taken joins your facts.",
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
    does: "Use a fact of the form “if A then B” on the goal B. The goal becomes A: it is now enough to prove A. Also uses a “for all” fact on a particular case, and a “not A” fact on the goal False.",
    prompt: "Click the fact whose conclusion is the goal.",
  },
  // "constructor" is also the name of a property every JavaScript object
  // has, which confuses the type checker: hence the separate constant.
  constructor: CONSTRUCTOR,
  obtain: {
    id: "obtain",
    label: "obtain",
    needs: "fact",
    does: "Take a fact apart. “A and B” gives two facts. “A or B” gives two cases. “There exists an x such that…” gives the x and the fact about it.",
    prompt: "Click the fact to take apart.",
  },
  left: {
    id: "left",
    label: "left",
    needs: "none",
    does: "To prove “A or B”, choose to prove A.",
  },
  right: {
    id: "right",
    label: "right",
    needs: "none",
    does: "To prove “A or B”, choose to prove B.",
  },
  exfalso: {
    id: "exfalso",
    label: "exfalso",
    needs: "none",
    does: "Replace the goal by False. Useful when your facts contradict each other: from a contradiction anything follows.",
  },
  contradiction: {
    id: "contradiction",
    label: "contradiction",
    needs: "none",
    does: "Finish any goal when two of your facts flatly contradict each other, such as A and not A.",
  },
  by_contra: {
    id: "by_contra",
    label: "by_contra",
    needs: "name",
    does: "Argue by contradiction: assume the goal is false, and aim for False.",
  },
  use: {
    id: "use",
    label: "use",
    needs: "text",
    does: "To prove “there exists an x such that…”, say which x. What remains is to show it works.",
    prompt: "Type the thing that works, for example a number, then press Enter.",
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
  // “not P” is “if P then False”: intro assumes P.
  const negated = /^¬\s*([A-Za-z][A-Za-z0-9_']*)$/.exec(target);
  if (negated) return fresh(`h${negated[1]}`);
  return fresh("h");
}

const ATOM = /^[A-Za-z][A-Za-z0-9_']*$/;

/** A name not yet on the board, and from now on counted as taken. */
function freshIn(taken: Set<string>, base: string): string {
  let name = base;
  for (let i = 1; taken.has(name); i++) name = `${base}${i}`;
  taken.add(name);
  return name;
}

/** `(A)` → `A`, when the brackets wrap the whole of it. */
function unwrap(text: string): string {
  let t = text.trim();
  for (;;) {
    if (!t.startsWith("(") || !t.endsWith(")")) return t;
    let depth = 0;
    let wraps = true;
    for (let i = 0; i < t.length; i++) {
      if (t[i] === "(") depth++;
      else if (t[i] === ")" && --depth === 0 && i < t.length - 1) wraps = false;
    }
    if (!wraps) return t;
    t = t.slice(1, -1).trim();
  }
}

export type Shape =
  | { kind: "and" | "or" | "iff"; left: string; right: string }
  | { kind: "exists"; vars: string[]; bounded: boolean }
  | { kind: "other" };

/**
 * The outermost connective of a statement as Lean prints it. Lean's
 * precedences, loosest first: ↔, →, ∨, ∧; ∨ and ∧ group to the right; a
 * binder (∃, ∀, fun) takes everything after it.
 */
export function shapeOf(type: string): Shape {
  const t = unwrap(type.replace(/\s+/g, " "));
  if (t.startsWith("∃")) {
    // "∃ x, …", "∃ x y, …", "∃ (x : ℕ), …", "∃ x > 0, …"
    let depth = 0;
    let comma = -1;
    for (let i = 1; i < t.length && comma < 0; i++) {
      if ("([{⟨".includes(t[i])) depth++;
      else if (")]}⟩".includes(t[i])) depth--;
      else if (t[i] === "," && depth === 0) comma = i;
    }
    if (comma < 0) return { kind: "other" };
    const binder = t.slice(1, comma).trim();
    const bounded = /[<>≤≥≠∈]/.test(binder);
    const vars = binder
      .replace(/[<>≤≥≠∈].*$/, "")
      .replace(/:[^()]*/g, "")
      .replace(/[()]/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return vars.length ? { kind: "exists", vars, bounded } : { kind: "other" };
  }
  // Operators at bracket depth 0, up to the first binder (which owns the rest).
  const found: Record<string, number> = {};
  let depth = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if ("([{⟨".includes(c)) depth++;
    else if (")]}⟩".includes(c)) depth--;
    else if (depth === 0) {
      if ((c === "∃" || c === "∀" || c === "λ" || t.startsWith("fun ", i)) && (i === 0 || t[i - 1] === " ")) break;
      if ("↔→∨∧".includes(c) && found[c] === undefined) found[c] = i;
    }
  }
  if (found["↔"] !== undefined) return { kind: "iff", left: unwrap(t.slice(0, found["↔"])), right: unwrap(t.slice(found["↔"] + 1)) };
  if (found["→"] !== undefined) return { kind: "other" };
  for (const [op, kind] of [["∨", "or"], ["∧", "and"]] as const) {
    const at = found[op];
    if (at !== undefined) return { kind, left: unwrap(t.slice(0, at)), right: unwrap(t.slice(at + 1)) };
  }
  return { kind: "other" };
}

/** A name for a fact that says `statement`: hP for P, hnP for ¬P, else the fallback. */
function factName(statement: string, fallback: string): string {
  if (ATOM.test(statement)) return `h${statement}`;
  const not = /^¬\s*([A-Za-z][A-Za-z0-9_']*)$/.exec(statement);
  return not ? `hn${not[1]}` : fallback;
}

/**
 * The line that takes the fact `fact` apart, with names for the pieces:
 * `obtain ⟨hP, hQ⟩ := h` for “P and Q”, `obtain hP | hQ := h` for “P or Q”,
 * `obtain ⟨x, hx⟩ := h` for “there exists x”, `obtain ⟨hPQ, hQP⟩ := h` for
 * “P if and only if Q”.
 */
export function obtainLine(goal: Goal, fact: string): string {
  const taken = new Set(namesIn(goal));
  const type = goal.hypotheses.find((h) => h.names.includes(fact))?.type ?? "";
  const shape = shapeOf(type);
  if (shape.kind === "exists") {
    // The variable keeps Lean's name where it is free; the fact about it is h + that name.
    const vars = shape.vars.map((v) => freshIn(taken, v));
    const about = vars.length === 1 ? `h${vars[0]}` : "h";
    const facts = shape.bounded ? [freshIn(taken, about), freshIn(taken, `${about}'`)] : [freshIn(taken, about)];
    return `obtain ⟨${[...vars, ...facts].join(", ")}⟩ := ${fact}`;
  }
  if (shape.kind === "iff") {
    const both = ATOM.test(shape.left) && ATOM.test(shape.right);
    const there = freshIn(taken, both ? `h${shape.left}${shape.right}` : "h1");
    const back = freshIn(taken, both ? `h${shape.right}${shape.left}` : "h2");
    return `obtain ⟨${there}, ${back}⟩ := ${fact}`;
  }
  const left = freshIn(taken, factName(shape.kind === "other" ? "" : shape.left, "h1"));
  const right = freshIn(taken, factName(shape.kind === "other" ? "" : shape.right, "h2"));
  return shape.kind === "or" ? `obtain ${left} | ${right} := ${fact}` : `obtain ⟨${left}, ${right}⟩ := ${fact}`;
}

/** A name for the assumption `by_contra` makes: that the goal is false. */
export function contraName(goal: Goal): string {
  const taken = new Set(namesIn(goal));
  const target = unwrap(goal.target);
  return freshIn(taken, ATOM.test(target) ? `hn${target}` : "h");
}

/** What was typed for a move, as one line with no way to start another. */
export function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** The Lean line a move writes. `arg` is the clicked hypothesis name, or the typed text. */
export function moveLine(move: Move, goal: Goal, arg?: string): string {
  if (move.id === "obtain") return obtainLine(goal, arg ?? "?");
  if (move.id === "by_contra") return `by_contra ${contraName(goal)}`;
  if (move.needs === "name") return `${move.label} ${introName(goal)}`;
  if (move.needs === "fact") return `${move.label} ${arg ?? "?"}`;
  if (move.needs === "text") return `${move.label} ${oneLine(arg ?? "")}`;
  return move.label;
}
