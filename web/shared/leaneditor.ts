// What the Lean editor (web/src/proof/LeanEditor.tsx) knows about Lean
// without asking Lean: how to colour a line, and what to offer as a
// completion. Pure, so it is tested without a browser. It is a help to the
// eye and the fingers only: what a proof means is always Lean's to say.

import { MOVES } from "./moves.ts";

export type TokenKind = "comment" | "string" | "number" | "keyword" | "tactic" | "sorry" | "type" | null;

/** Carried from one line to the next: how deep in `/- … -/` comments (they nest). */
export interface LexState {
  depth: number;
}

const KEYWORDS = new Set(
  "theorem lemma example def abbrev instance structure inductive class where by at with fun λ from in let if then else match do return import open namespace section end variable universe axiom noncomputable private protected deriving set_option termination_by decreasing_by using only generalizing".split(
    " ",
  ),
);

/** Tactics offered and coloured: the board's moves (as they are typed), and the others the lessons use. */
export const TACTICS: string[] = [
  ...new Set([
    ...Object.keys(MOVES).filter((m) => m !== "rw_back"),
    ..."have show calc cases rcases refine exact? apply? simp_all unfold specialize trivial tauto push_neg by_cases symm subst ext funext congr aesop norm_cast nth_rw rintro rename_i revert clear change conv first try repeat all_goals any_goals next case done skip assumption".split(
      " ",
    ),
  ]),
].sort();

const TACTIC_SET = new Set(TACTICS);
const TYPES = new Set(["Prop", "Type", "Sort", "ℕ", "ℤ", "ℚ", "ℝ", "ℂ", "Nat", "Int", "Rat", "Real", "List", "Set", "Finset", "Bool", "True", "False"]);

const IDENT = /[\p{L}_][\p{L}\p{N}_'!?₀-₉]*/uy;
const NUMBER = /\d+(\.\d+)?/y;

/** Skip a block comment from `pos`, counting nesting; returns where it stops on this line. */
function skipBlock(text: string, pos: number, state: LexState): number {
  while (pos < text.length && state.depth > 0) {
    if (text.startsWith("/-", pos)) {
      state.depth++;
      pos += 2;
    } else if (text.startsWith("-/", pos)) {
      state.depth--;
      pos += 2;
    } else pos++;
  }
  return pos;
}

/**
 * The token of `text` (one line) that starts at `pos`: where it ends and
 * what it is. `state` is updated for block comments. Always moves forward.
 */
export function nextToken(text: string, pos: number, state: LexState): { end: number; kind: TokenKind } {
  if (state.depth > 0) return { end: skipBlock(text, pos, state), kind: "comment" };
  if (text.startsWith("--", pos)) return { end: text.length, kind: "comment" };
  if (text.startsWith("/-", pos)) {
    state.depth = 1;
    return { end: skipBlock(text, pos + 2, state), kind: "comment" };
  }
  const c = text[pos];
  if (c === '"') {
    let end = pos + 1;
    while (end < text.length && text[end] !== '"') end += text[end] === "\\" ? 2 : 1;
    return { end: Math.min(end + 1, text.length), kind: "string" };
  }
  NUMBER.lastIndex = pos;
  const n = NUMBER.exec(text);
  if (n) return { end: pos + n[0].length, kind: "number" };
  IDENT.lastIndex = pos;
  const m = IDENT.exec(text);
  if (m) {
    // A dotted name (Nat.succ_le) is one name, and never a keyword.
    let end = pos + m[0].length;
    let dotted = false;
    while (text[end] === ".") {
      IDENT.lastIndex = end + 1;
      const more = IDENT.exec(text);
      if (!more) break;
      end += 1 + more[0].length;
      dotted = true;
    }
    const word = text.slice(pos, end);
    const kind: TokenKind = dotted ? null : word === "sorry" || word === "admit" ? "sorry" : KEYWORDS.has(word) ? "keyword" : TACTIC_SET.has(word) ? "tactic" : TYPES.has(word) ? "type" : null;
    return { end, kind };
  }
  return { end: pos + (text.codePointAt(pos)! > 0xffff ? 2 : 1), kind: null };
}

/** A whole line's tokens, for tests: [text, kind] for every token that has a kind. */
export function tokens(line: string, state: LexState = { depth: 0 }): [string, TokenKind][] {
  const out: [string, TokenKind][] = [];
  let pos = 0;
  while (pos < line.length) {
    const t = nextToken(line, pos, state);
    if (t.kind) out.push([line.slice(pos, t.end), t.kind]);
    pos = t.end;
  }
  return out;
}

export interface Completion {
  label: string;
  /** A tactic, or a name on the board (a hypothesis or an object of the current goal). */
  kind: "tactic" | "name";
}

const WORD_END = /[\p{L}_][\p{L}\p{N}_'!?₀-₉]*$/u;
/** Before the word there is nothing but a bullet, a case arm, or the end of an earlier tactic: a tactic goes here. */
const TACTIC_PLACE = /(^\s*(·\s*)*|[;(]\s*|<;>\s*|\bby\s+|=>\s*)$/u;

/**
 * What to offer for the word being typed at the end of `before` (the line up
 * to the caret): tactic names where a tactic can start, and the goal's names
 * anywhere. Only what starts with what is typed, and never the word itself
 * alone. Null when there is nothing to offer. `from` is the word's column.
 */
export function completionsFor(before: string, names: string[]): { from: number; options: Completion[] } | null {
  const m = WORD_END.exec(before);
  if (!m) return null;
  const word = m[0];
  const from = before.length - word.length;
  // Inside a comment or a string nothing is offered.
  const state = { depth: 0 };
  let pos = 0;
  while (pos < from) {
    const t = nextToken(before, pos, state);
    if ((t.kind === "comment" || t.kind === "string") && t.end > from) return null;
    pos = t.end;
  }
  // A backslash name is an abbreviation, not a word to complete.
  if (before[from - 1] === "\\") return null;
  const tactics = TACTIC_PLACE.test(before.slice(0, from)) ? TACTICS.filter((t) => t.startsWith(word)) : [];
  const seen = new Set<string>();
  const options: Completion[] = [];
  const offer = (label: string, kind: Completion["kind"]) => {
    if (seen.has(label)) return;
    seen.add(label);
    options.push({ label, kind });
  };
  for (const label of names) if (label.startsWith(word) && !label.includes("✝")) offer(label, "name");
  for (const label of tactics) offer(label, "tactic");
  if (!options.length || (options.length === 1 && options[0].label === word)) return null;
  return { from, options };
}

/** The smallest single replacement that turns `before` into `after`. */
export function changeBetween(before: string, after: string): { from: number; to: number; insert: string } {
  let start = 0;
  const max = Math.min(before.length, after.length);
  while (start < max && before[start] === after[start]) start++;
  let endB = before.length;
  let endA = after.length;
  while (endB > start && endA > start && before[endB - 1] === after[endA - 1]) {
    endB--;
    endA--;
  }
  return { from: start, to: endB, insert: after.slice(start, endA) };
}
