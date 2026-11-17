// Typing Lean's symbols without a special keyboard: a backslash name
// followed by a space or Tab becomes the symbol, as in Lean's own editors
// (\to → , \forall ∀). The ASCII spellings Lean accepts (->, /\, \/) are
// left alone: they already work. Pure, so the table is tested.

export const ABBREVIATIONS: Record<string, string> = {
  to: "→",
  r: "→",
  imp: "→",
  l: "←",
  iff: "↔",
  and: "∧",
  or: "∨",
  not: "¬",
  neg: "¬",
  forall: "∀",
  all: "∀",
  exists: "∃",
  ex: "∃",
  ne: "≠",
  le: "≤",
  ge: "≥",
  in: "∈",
  notin: "∉",
  sub: "⊆",
  cap: "∩",
  cup: "∪",
  N: "ℕ",
  Z: "ℤ",
  Q: "ℚ",
  R: "ℝ",
  times: "×",
  x: "×",
  lam: "λ",
  fun: "λ",
  mapsto: "↦",
  "|-": "⊢",
  vdash: "⊢",
  a: "α",
  b: "β",
  e: "ε",
  d: "δ",
  eps: "ε",
  delta: "δ",
  "<": "⟨",
  ">": "⟩",
  sum: "∑",
  "|": "∣",
  dvd: "∣",
  inf: "∞",
  comp: "∘",
};

/**
 * Called when a space or Tab is typed at `caret`. If the text just before
 * the caret is a backslash name in the table, returns the text with it
 * replaced and the new caret; otherwise null (type the key as usual).
 */
export function expandAt(text: string, caret: number): { text: string; caret: number } | null {
  const before = text.slice(0, caret);
  const m = /\\([^\s\\]+)$/.exec(before);
  if (!m || !Object.hasOwn(ABBREVIATIONS, m[1])) return null;
  const symbol = ABBREVIATIONS[m[1]];
  const start = caret - m[0].length;
  return { text: text.slice(0, start) + symbol + text.slice(caret), caret: start + symbol.length };
}

/** A caret offset as a line and a character within it. */
export function positionAt(text: string, caret: number): { line: number; character: number } {
  const before = text.slice(0, caret);
  const line = before.split("\n").length - 1;
  return { line, character: caret - (before.lastIndexOf("\n") + 1) };
}
