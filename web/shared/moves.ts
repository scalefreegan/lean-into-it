// The proof board's moves: each is one Lean tactic a click can write. The
// board never hides the Lean: the line a move produces is shown as it is
// added. A lesson's exercises name the moves they offer by id.
//
// Adding a move starts here; the board renders whatever is listed.

import { NO_PARTS, NO_PARTS_EQUATION, NOT_AN_EXISTS, NOT_SPLITTABLE, NO_NUMBER } from "./explain.ts";
import { isNatural, namesIn, type Goal } from "./goals.ts";

export interface Move {
  id: string;
  /** The tactic keyword, shown on the button. */
  label: string;
  /** `none`: the move stands alone. `fact`: click a hypothesis card to say
   *  which fact it uses. `name`: it introduces a new name, chosen for you.
   *  `text`: it needs something typed, such as the number for `use`.
   *  `object`: click one of the things the statement is about, such as the
   *  number to do induction on. */
  needs: "none" | "fact" | "name" | "text" | "object";
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
    does: "Take a fact apart. “A and B” gives two facts. “A or B” gives two cases. “There exists an x such that…” gives the x and the fact about it. False needs no taking apart: it ends the goal.",
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
  decide: {
    id: "decide",
    label: "decide",
    needs: "none",
    does: "Settle a claim about particular numbers by checking it, the way you would check 7 < 10 or that 3 does not divide 10. It cannot handle a claim with a letter in it.",
  },
  rw: {
    id: "rw",
    label: "rw",
    needs: "fact",
    does: "Rewrite with an equation. With a fact “a = b”, every a in the goal becomes b. If that leaves both sides identical, the goal is finished.",
    prompt: "Click the equation to rewrite with. Its left side is replaced by its right side.",
  },
  rw_back: {
    id: "rw_back",
    label: "rw ←",
    needs: "fact",
    does: "Rewrite with an equation, backwards. With a fact “a = b”, every b in the goal becomes a.",
    prompt: "Click the equation to rewrite with. Its right side is replaced by its left side.",
  },
  simp: {
    id: "simp",
    label: "simp",
    needs: "none",
    does: "Simplify the goal using a large library of facts already proved, such as 0 + n = n. Often that finishes it.",
  },
  omega: {
    id: "omega",
    label: "omega",
    needs: "none",
    does: "Finish a goal about whole numbers that needs only adding, comparing and multiplying by particular numbers. It uses the facts on the board.",
  },
  induction: {
    id: "induction",
    label: "induction",
    needs: "object",
    does: "Prove a claim about every natural number n in two steps: first for 0, then for n + 1, where you may use the claim for n. For a list: first for the empty list, then for a list with one more element in front.",
    prompt: "Click the number, or the list, to do induction on.",
  },
  ring: {
    id: "ring",
    label: "ring",
    needs: "none",
    does: "Finish an equation that holds by the rules of algebra alone, whatever the letters stand for, such as (a + b)² = a² + 2ab + b². It does not use the facts on the board.",
  },
  linarith: {
    id: "linarith",
    label: "linarith",
    needs: "none",
    does: "Finish an equation or inequality that follows from the facts on the board by adding them up and multiplying them by particular numbers. It does not multiply two letters together.",
  },
  nlinarith: {
    id: "nlinarith",
    label: "nlinarith",
    needs: "none",
    does: "Like linarith, but it first multiplies pairs of facts together, which sometimes gets a goal with products or squares in it.",
  },
  positivity: {
    id: "positivity",
    label: "positivity",
    needs: "none",
    does: "Finish a goal of the form 0 < A, 0 ≤ A or A ≠ 0 when A is plainly so from the way it is built: a square, a sum of things that are not negative, a product of positive things.",
  },
  field_simp: {
    id: "field_simp",
    label: "field_simp",
    needs: "none",
    does: "Clear the fractions from an equation by multiplying through. It needs to know that each thing divided by is not zero: from a fact on the board, or because it is a number.",
  },
  gcongr: {
    id: "gcongr",
    label: "gcongr",
    needs: "none",
    does: "Prove an inequality whose two sides are built the same way, by comparing them part by part: A + C ≤ B + D from A ≤ B and C ≤ D. It looks for the smaller comparisons among the facts, and leaves as goals the ones it cannot find.",
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
  if (t.startsWith("∃!")) return { kind: "other" };
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
      if ((c === "∃" || c === "∀" || c === "λ" || t.startsWith("fun ", i)) && (i === 0 || " ¬(".includes(t[i - 1]))) break;
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

/**
 * Statements that are a “there exists” by definition though they do not
 * print as one: `Even n` (∃ r, n = r + r), `Odd n` (∃ k, n = 2 * k + 1) and
 * `a ∣ b` (∃ c, b = a * c). The name Mathlib's definition gives the thing
 * that exists, or null.
 */
export function hiddenExists(type: string): string | null {
  const t = unwrap(type.replace(/\s+/g, " "));
  if (shapeOf(t).kind !== "other" || /[→¬∀∃]/.test(t)) return null;
  if (/^Even /.test(t)) return "r";
  if (/^Odd /.test(t)) return "k";
  return t.includes("∣") ? "c" : null;
}

/** A name for a fact that says `statement`: hP for P, hnP for ¬P, else the fallback. */
function factName(statement: string, fallback: string): string {
  if (ATOM.test(statement)) return `h${statement}`;
  const not = /^¬\s*([A-Za-z][A-Za-z0-9_']*)$/.exec(statement);
  return not ? `hn${not[1]}` : fallback;
}

/** The operator at bracket depth 0 of `t`, the last of them (Lean's ∩ and ∪
 *  group to the left), or -1. */
function topLevel(t: string, op: string): number {
  let depth = 0;
  let at = -1;
  for (let i = 0; i < t.length; i++) {
    if ("([{⟨".includes(t[i])) depth++;
    else if (")]}⟩".includes(t[i])) depth--;
    else if (depth === 0 && t.startsWith(op, i)) at = i;
  }
  return at;
}

/** Does a binder or an implication own the whole of `t`? Then a ∈ or an = in it is not the fact's own. */
function bound(t: string): boolean {
  return /^(∀|∃|∑|∏|λ|fun )/.test(t) || topLevel(t, " → ") >= 0;
}

/** Is every set `set` is made of with ∪ and ∩ known to be a Set: an object
 *  of type Set …, or written {x | …} or Set.…? (A Finset's or a List's ∩ and
 *  ∪ are not an “and” and an “or” by definition, and Lean refuses the pattern;
 *  Lean's printed goal does not say which it is.) */
function allSets(set: string, goal: Goal): boolean {
  for (const op of [" ∪ ", " ∩ "]) {
    const i = topLevel(set, op);
    if (i >= 0) return allSets(unwrap(set.slice(0, i)), goal) && allSets(unwrap(set.slice(i + 3)), goal);
  }
  if (/^(\{|Set\.)/.test(set)) return true;
  const type = goal.hypotheses.find((h) => h.names.includes(set))?.type.trim() ?? "";
  return /^Set\s/.test(type);
}

/**
 * Membership in an intersection or a union of Sets, `x ∈ A ∩ B` or
 * `x ∈ A ∪ B`: an “and” or an “or” about the two sets, which obtain takes
 * apart the same way. The kind and the two sets, or null.
 */
function memberOf(t: string, goal: Goal): { kind: "and" | "or"; left: string; right: string } | null {
  if (bound(t)) return null;
  const at = topLevel(t, " ∈ ");
  if (at < 0) return null;
  const set = unwrap(t.slice(at + 3));
  if (!allSets(set, goal)) return null;
  // ∪ binds looser than ∩: A ∩ B ∪ C is (A ∩ B) ∪ C.
  for (const [op, kind] of [[" ∪ ", "or"], [" ∩ ", "and"]] as const) {
    const i = topLevel(set, op);
    if (i >= 0) return { kind, left: unwrap(set.slice(0, i)), right: unwrap(set.slice(i + 3)) };
  }
  return null;
}

/**
 * The line that takes the fact `fact` apart, with names for the pieces:
 * `obtain ⟨hP, hQ⟩ := h` for “P and Q”, `obtain hP | hQ := h` for “P or Q”,
 * `obtain ⟨x, hx⟩ := h` for “there exists x”, `obtain ⟨hPQ, hQP⟩ := h` for
 * “P if and only if Q”, `obtain ⟨x, hx, huniq⟩ := h` for “there is exactly
 * one x”, `obtain ⟨hA, hB⟩ := h` for x ∈ A ∩ B (and | for ∪), and
 * `obtain ⟨⟩ := h` for False, which has no cases and so finishes the goal.
 * Null for a fact it has no pattern for (obtainMisfit says why).
 */
export function obtainPattern(goal: Goal, fact: string): string | null {
  const taken = new Set(namesIn(goal));
  const type = goal.hypotheses.find((h) => h.names.includes(fact))?.type ?? "";
  const t = unwrap(type.replace(/\s+/g, " "));
  const shape = shapeOf(type);
  const hidden = hiddenExists(type);
  if (t === "False") return `obtain ⟨⟩ := ${fact}`;
  if (t.startsWith("∃!")) {
    // ∃! x, P x is ∃ x, P x ∧ ∀ y, P y → y = x: the thing, the fact about it, and that it is the only one.
    const one = shapeOf(`∃${t.slice(2)}`);
    if (one.kind !== "exists" || one.vars.length !== 1 || one.bounded) return null;
    const v = freshIn(taken, one.vars[0]);
    return `obtain ⟨${v}, ${freshIn(taken, `h${v}`)}, ${freshIn(taken, "huniq")}⟩ := ${fact}`;
  }
  const member = shape.kind === "other" ? memberOf(t, goal) : null;
  if (member) {
    const left = freshIn(taken, factName(member.left, "h1"));
    const right = freshIn(taken, factName(member.right, "h2"));
    return member.kind === "or" ? `obtain ${left} | ${right} := ${fact}` : `obtain ⟨${left}, ${right}⟩ := ${fact}`;
  }
  if (shape.kind === "other" && !hidden) return null;
  if (hidden) {
    const v = freshIn(taken, hidden);
    return `obtain ⟨${v}, ${freshIn(taken, `h${v}`)}⟩ := ${fact}`;
  }
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

/** The line obtain writes; for a fact it has no pattern for (which the board refuses first, obtainMisfit), the two-part one. */
export function obtainLine(goal: Goal, fact: string): string {
  return obtainPattern(goal, fact) ?? `obtain ⟨h1, h2⟩ := ${fact}`;
}

/**
 * Why the board should not send obtain on this fact, as a message `explain`
 * knows, or null. On a fact obtain has no pattern for, Lean would refuse in
 * words about its internals, or do something else quietly: substitute an
 * equation away, split a ≤ between natural numbers into Lean's own cases.
 */
export function obtainMisfit(goal: Goal, fact: string): string | null {
  if (obtainPattern(goal, fact) !== null) return null;
  const type = unwrap((goal.hypotheses.find((h) => h.names.includes(fact))?.type ?? "").replace(/\s+/g, " "));
  return !bound(type) && topLevel(type, " = ") >= 0 ? NO_PARTS_EQUATION : NO_PARTS;
}

/** A name for the assumption `by_contra` makes: that the goal is false. */
export function contraName(goal: Goal): string {
  const taken = new Set(namesIn(goal));
  const target = unwrap(goal.target);
  return freshIn(taken, ATOM.test(target) && target !== "False" && target !== "True" ? `hn${target}` : "h");
}

/**
 * Why the board should not send this move to Lean on this goal, as a message
 * `explain` knows, or null. Only for a move Lean would accept and then do
 * something other than what the move's `does` says, or refuse in words about
 * its internals: `constructor` on a goal that is not an "and" or an "if and
 * only if", `use` on a goal that is not a "there exists".
 */
export function misfit(move: Move, goal: Goal): string | null {
  const kind = shapeOf(goal.target).kind;
  if (move.id === "constructor") return kind === "and" || kind === "iff" ? null : NOT_SPLITTABLE;
  // After a witness is given, a second `use` only draws errors about Lean's internals.
  if (move.id === "use") return kind === "exists" || hiddenExists(goal.target) ? null : NOT_AN_EXISTS;
  if (move.id === "induction") return goal.hypotheses.some(isNatural) ? null : NO_NUMBER;
  return null;
}

/** What was typed for a move, as one line with no way to start another. */
export function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * The line that starts an induction on `n`. The one-line form, so that the
 * board keeps to one move per line: two goals follow, the claim for 0 and
 * the claim for n + 1, the second with the induction hypothesis `ih`.
 */
export function inductionLine(goal: Goal, n: string): string {
  const taken = new Set(namesIn(goal));
  const ih = freshIn(taken, "ih");
  // A list is empty, or a first element in front of a shorter list: the
  // step's goal is about `x :: xs`, and the element needs a name too.
  const list = /^List\s/.test(goal.hypotheses.find((h) => h.names.includes(n))?.type.trim() ?? "");
  return list ? `induction' ${n} with ${freshIn(taken, "x")} ${n} ${ih}` : `induction' ${n} with ${n} ${ih}`;
}

/** The move that wrote a line of a board proof, and what was clicked or typed for it. */
export function readLine(line: string): { move: Move; arg?: string } | null {
  let m: RegExpExecArray | null;
  if ((m = /^rw \[(←\s*)?(.+)\]$/.exec(line))) return { move: MOVES[m[1] ? "rw_back" : "rw"], arg: m[2] };
  if ((m = /^induction' (\S+) with /.exec(line))) return { move: MOVES.induction, arg: m[1] };
  if ((m = /^obtain .* := (.+)$/.exec(line))) return { move: MOVES.obtain, arg: m[1] };
  const word = line.split(" ")[0];
  if (!isMove(word)) return null;
  const move = MOVES[word];
  return move.needs === "fact" || move.needs === "text" ? { move, arg: line.slice(word.length + 1) } : { move };
}

/** The shape of the line a move writes, for authors: a board exercise's
 *  `solution` must be made of such lines. `h` stands for the fact clicked,
 *  `n` for the object clicked; names the board chooses are said in words. */
export function lineShape(move: Move): string {
  if (move.id === "obtain") return "obtain ⟨…⟩ := h (the board names the parts)";
  if (move.id === "rw") return "rw [h]";
  if (move.id === "rw_back") return "rw [← h]";
  if (move.id === "induction") return "induction' n with n ih";
  if (move.needs === "name") return `${move.label} h (the board chooses the name)`;
  if (move.needs === "fact") return `${move.label} h`;
  if (move.needs === "text") return `${move.label} …what was typed`;
  return move.label;
}

/** The Lean line a move writes. `arg` is the clicked card's name, or the typed text. */
export function moveLine(move: Move, goal: Goal, arg?: string): string {
  if (move.id === "obtain") return obtainLine(goal, arg ?? "?");
  if (move.id === "rw") return `rw [${arg ?? "?"}]`;
  if (move.id === "rw_back") return `rw [← ${arg ?? "?"}]`;
  if (move.id === "induction") return inductionLine(goal, arg ?? "?");
  if (move.id === "by_contra") return `by_contra ${contraName(goal)}`;
  if (move.needs === "name") return `${move.label} ${introName(goal)}`;
  if (move.needs === "fact") return `${move.label} ${arg ?? "?"}`;
  if (move.needs === "text") return `${move.label} ${oneLine(arg ?? "")}`;
  return move.label;
}
