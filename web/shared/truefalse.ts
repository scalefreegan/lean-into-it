// Kind `truefalse` (bead lii-6xv.3): decide whether a claim holds, then back
// it up. If it is true, prove it; if it is false, give a counterexample.
// Lean checks either. Pure, so the server, the page and the tests share it.
//
// THE ANSWER is one text, which is what is checked, kept in an attempt row
// and shown again when the exercise is reopened:
//
//   true                    false: 1, 2
//   <proof lines>           [<proof lines>]
//
// The first line is the side. On the true side the rest is a proof of the
// exercise's own statement. On the false side it names a value for each of
// the statement's variables, in order, and the rest (only where the
// exercise asks for it, `witness: proof`) proves that the claim fails for
// them.
//
// THE COUNTEREXAMPLE is checked as a proof of the claim's negation, which
// the server writes from the statement, never the browser:
//
//   theorem _ : ¬ (∀ (n : ℕ) (m : ℕ), <claim>) := by
//     intro hall
//     have hc := hall (1) (2)
//     revert hc            ┐ `witness: values` (the default): the exercise's
//     norm_num             ┘ own `close` shows the claim fails for them
//
// With `witness: proof` the learner writes those last lines: the goal is
// False, with hc, the claim at their values, among the facts.
//
// THE WRONG SIDE. Lean has accepted the exercise's reference answer on its
// own side (npm test checks it), so the other side cannot be proved: a
// learner who picks it is told so at once, with the exercise's `why`,
// instead of being left to try something impossible. That is not a grade:
// nothing is solved except by Lean.

/** The statement split into its binders and its claim. */
export interface Split {
  /** Every binder group as written, in order: `(n m : ℕ)`, `{α : Type}`. */
  groups: string[];
  /** The explicit variables, in order: a value is given for each. */
  names: string[];
  /** What comes after the colon. */
  claim: string;
}

const OPEN = "([{⦃⟨";
const CLOSE = ")]}⦄⟩";

/**
 * `(n m : ℕ) (h : 0 < n) : P n` → its groups, explicit names and claim.
 * Null when it is not binder groups, a colon and a claim (the loader says so).
 */
export function splitStatement(statement: string): Split | null {
  const s = statement.trim();
  const groups: string[] = [];
  const names: string[] = [];
  let i = 0;
  while (i < s.length) {
    while (/\s/.test(s[i] ?? "")) i++;
    if (s[i] === ":") {
      const claim = s.slice(i + 1).trim();
      return claim ? { groups, names, claim } : null;
    }
    if (!OPEN.includes(s[i] ?? "\u0000") || s[i] === "⟨") return null;
    const start = i;
    let depth = 0;
    for (; i < s.length; i++) {
      if (OPEN.includes(s[i])) depth++;
      else if (CLOSE.includes(s[i])) depth--;
      if (depth === 0) break;
    }
    if (depth !== 0) return null;
    const group = s.slice(start, i + 1);
    i++;
    groups.push(group);
    if (group[0] === "(") {
      const inner = group.slice(1, -1);
      const colon = inner.indexOf(":");
      if (colon < 0) return null;
      for (const n of inner.slice(0, colon).trim().split(/\s+/)) if (n) names.push(n);
    }
  }
  return null;
}

/** The claim's negation, as the part of a statement after the theorem's name. */
export function negation(split: Split): string {
  return split.groups.length ? `: ¬ (∀ ${split.groups.join(" ")}, ${split.claim})` : `: ¬ (${split.claim})`;
}

/** A value a learner may give for a variable: a number, a negative one, a decimal or a fraction. */
const VALUE = /^-?\d{1,12}(\.\d{1,12})?(\/-?\d{1,12})?$/;

/** Why `value` cannot stand for a variable, or null when it can. */
export function valueProblem(value: string): string | null {
  const v = value.replace(/\s+/g, "");
  if (!v) return "a value is missing";
  return VALUE.test(v) ? null : `“${value.trim()}” is not a number. A value here is a number, like 3, -2, 0.5 or 1/2.`;
}

export type Side = "true" | "false";

export interface Answer {
  side: Side;
  /** The false side: a value for each variable, as written. */
  values: string[];
  /** The proof lines after the first line. */
  body: string;
}

/** Read an answer; a string when it is not one (the reason, in words). */
export function readAnswer(text: string): Answer | string {
  const lines = text.replace(/\r/g, "").split("\n");
  const first = (lines[0] ?? "").trim();
  const body = lines.slice(1).join("\n");
  if (first === "true") return { side: "true", values: [], body };
  const m = /^false\s*(?::(.*))?$/.exec(first);
  if (!m) return "Choose a side first: true or false.";
  const values = (m[1] ?? "").trim() ? m[1].split(",").map((v) => v.trim()) : [];
  return { side: "false", values, body };
}

/** An answer as text (the inverse of readAnswer). */
export function writeAnswer(a: Answer): string {
  const head = a.side === "true" ? "true" : a.values.length ? `false: ${a.values.map((v) => v.trim()).join(", ")}` : "false";
  return a.body.replace(/\s+$/, "") ? `${head}\n${a.body.replace(/\s+$/, "")}` : head;
}

/** Nothing written yet but the side: choosing it is asked about, not an attempt at the claim. */
export function bareAnswer(a: Answer, witness: Witness): boolean {
  return a.side === "true" ? !a.body.trim() : !a.values.length && (witness === "values" || !a.body.trim());
}

export type Witness = "values" | "proof";

/** Lines the server writes above a counterexample's own proof lines. */
export const COUNTER_PREFIX = 2;

/** The proof body of the negation for a counterexample: see the top of this file. */
export function counterBody(values: string[], close: string, witness: Witness, written: string): string {
  const args = values.map((v) => `(${v.replace(/\s+/g, "")})`).join(" ");
  const head = ["intro hall", args ? `have hc := hall ${args}` : "have hc := hall"];
  const rest = witness === "proof" ? written.replace(/\s+$/, "") : `revert hc\n${close}`;
  return `${head.join("\n")}\n${rest}`;
}

/** Why the values given do not fit the statement, or null when they do. */
export function valuesProblem(values: string[], names: string[]): string | null {
  if (values.length !== names.length) {
    const want = names.length === 1 ? `one variable, ${names[0]}` : `${names.length} variables, ${names.join(", ")}`;
    return `This claim has ${want}: give ${names.length === 1 ? "a value for it" : "a value for each, in that order"}.`;
  }
  for (const v of values) {
    const wrong = valueProblem(v);
    if (wrong) return wrong;
  }
  return null;
}

/** What the learner is told on picking the side that cannot be backed up. */
export function wrongSide(truth: boolean, why: string): string {
  return truth
    ? `This claim is true, so no counterexample can exist and Lean would refuse every one. ${why}`
    : `This claim is false, so it cannot be proved: every attempt would leave something Lean cannot show. ${why}`;
}
