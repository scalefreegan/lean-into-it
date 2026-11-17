// From an exercise and a learner's proof body to the Lean file that is
// checked, and from Lean's diagnostics back to a verdict in the learner's
// own line numbers. Pure: no Lean here, so the rules are tested without it.
//
// The statement is the exercise's, never the learner's: only the proof body
// comes from the browser. Lean alone decides, and three things keep the body
// from deciding for it:
//
//   1. The body sits inside one pair of brackets in the `by` block, and may
//      not close a bracket it did not open (`escapesIn`). Inside brackets
//      Lean reads tactics only, so the body cannot end the theorem and start
//      commands of its own.
//   2. The body may not name the ways a tactic block runs a program
//      (`run_tac` and its relatives, `set_option`, `#` commands): with those
//      a "proof" can add an axiom, or a theorem the kernel never checked.
//   3. After the theorem Lean is asked which axioms it rests on. Solved
//      needs that report, on its own line, naming only the three axioms of
//      ordinary mathematics. No report (Lean was stopped early) is a refusal.
//
// `solved` means: none of the above, no error, and no `sorry`.
//
// An exercise may come with definitions of its own (`given`: the functions a
// verified-programs lesson proves things about). They are the lesson file's,
// like the statement, never the learner's, and they sit between the import
// and the theorem. The loader refuses `sorry`, `admit` and `axiom` in them;
// and if the theorem came to rest on one all the same, the axiom report
// would name it.

export interface Position {
  line: number;
  character: number;
}

export interface Diagnostic {
  severity: "error" | "warning" | "info";
  message: string;
  start: Position;
  end: Position;
}

export interface BodyDiagnostic {
  severity: "error" | "warning" | "info";
  message: string;
  /** 0-based line in the learner's body; null when Lean pointed at the
   *  statement (as it does for "unsolved goals"). */
  line: number | null;
}

export const HEADER = "import Mathlib\n\n";
/** The name the exercise's statement is proved under, so Lean can be asked about it. */
export const THEOREM = "lii_exercise";
/** Lines before the body's first line: the import, a blank, the statement, the opening bracket. */
const BODY_LINE = 4;
const INDENT = "    ";

/** What an empty proof is sent as: a tactic that does nothing, so Lean still
 *  reports the opening goal. */
const PLACEHOLDER = "skip";

export function bodyLines(body: string): string[] {
  const lines = body.replace(/\r/g, "").split("\n");
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return lines;
}

/**
 * The Lean source for a statement and a proof body:
 *
 *     import Mathlib
 *
 *     <given, and a blank line, when the exercise has definitions>
 *     theorem lii_exercise <statement> := by
 *       (
 *         <body>
 *       )
 *
 *     #print axioms lii_exercise
 */
export function assemble(statement: string, body: string, given = ""): string {
  const lines = bodyLines(body);
  // Comments alone are not a tactic block: the placeholder goes in front of them.
  const shown = !lines.length ? [PLACEHOLDER] : isBlank(body) ? [`${PLACEHOLDER} ${lines[0]}`, ...lines.slice(1)] : lines;
  const before = bodyLines(given);
  return `${HEADER}${before.length ? `${before.join("\n")}\n\n` : ""}theorem ${THEOREM} ${statement.replace(/\s+/g, " ").trim()} := by\n  (\n${shown.map((l) => INDENT + l).join("\n")}\n  )\n\n#print axioms ${THEOREM}\n`;
}

/** True when a body has no tactic in it: nothing at all, or only comments. */
export function isBlank(body: string): boolean {
  return !lex(body).code.trim();
}

/** The source line of the body's first line: further down by the given definitions and their blank line. */
function bodyLine(given: string): number {
  const before = bodyLines(given).length;
  return BODY_LINE + (before ? before + 1 : 0);
}

/** The source line of the axiom report: after the body, the closing bracket and a blank. */
function auditLine(body: string, given: string): number {
  return bodyLine(given) + Math.max(bodyLines(body).length, 1) + 2;
}

/** Where, in the assembled source, a body position is. */
export function toSource(p: Position, given = ""): Position {
  return { line: p.line + bodyLine(given), character: p.character + INDENT.length };
}

/** The end of the proof: after the last tactic, where Lean reports what is left. */
export function endOfBody(body: string): Position {
  const lines = bodyLines(body);
  if (isBlank(body)) return { line: 0, character: PLACEHOLDER.length };
  return { line: lines.length - 1, character: lines[lines.length - 1].length };
}

const IDENT_CHAR = /[A-Za-z0-9_'!?\u00C0-\uFFFF]/;
const CHAR_LITERAL = /^'(\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|.)|[^\\'\n])'/;

/**
 * A body with its comments blanked (`code`), and with its string and
 * character literals blanked as well (`bare`). Same length and line breaks
 * as the body. Lean's own rules: `--` to the end of the line, `/- -/`
 * nesting, `"…"` with backslash escapes, raw strings `r"…"` and `r#"…"#`.
 * Where this and Lean could disagree it errs toward seeing more code, never
 * less: the worst a disagreement does is refuse a proof.
 */
export function lex(body: string): { code: string; bare: string; openComment: number | null } {
  const text = body.replace(/\r/g, "");
  const code = [...text];
  const bare = [...text];
  // Blank [from, to) in the given outputs, keeping line breaks.
  const blank = (from: number, to: number, outs: string[][]) => {
    for (let k = from; k < to && k < text.length; k++) if (text[k] !== "\n") for (const o of outs) o[k] = " ";
  };
  let i = 0;
  // Where a block comment that is never closed starts, if there is one.
  let openComment: number | null = null;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (c === "-" && next === "-") {
      let j = i;
      while (j < text.length && text[j] !== "\n") j++;
      blank(i, j, [code, bare]);
      i = j;
    } else if (c === "/" && next === "-") {
      let depth = 1;
      let j = i + 2;
      while (j < text.length && depth > 0) {
        const two = text.slice(j, j + 2);
        if (two === "/-") depth++;
        else if (two === "-/") depth--;
        j += two === "/-" || two === "-/" ? 2 : 1;
      }
      if (depth > 0) openComment = i;
      blank(i, j, [code, bare]);
      i = j;
    } else if (c === "r" && (i === 0 || !IDENT_CHAR.test(text[i - 1])) && /^r#*"/.test(text.slice(i, i + 40))) {
      const hashes = /^r(#*)"/.exec(text.slice(i, i + 40))![1];
      const close = text.indexOf(`"${hashes}`, i + 2 + hashes.length);
      const j = close < 0 ? text.length : close + 1 + hashes.length;
      blank(i, j, [bare]);
      i = j;
    } else if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      j = Math.min(j + 1, text.length);
      blank(i, j, [bare]);
      i = j;
    } else if (c === "'" && (i === 0 || !IDENT_CHAR.test(text[i - 1]))) {
      const m = CHAR_LITERAL.exec(text.slice(i, i + 10));
      if (m) {
        blank(i, i + m[0].length, [bare]);
        i += m[0].length;
      } else i++;
    } else i++;
  }
  return { code: code.join(""), bare: bare.join(""), openComment };
}

/** Ways a tactic block can run a program or change Lean's settings instead of proving. */
const ESCAPES: { pattern: RegExp; name: string }[] = [
  ...["run_tac", "run_cmd", "run_elab", "run_meta", "by_elab", "set_option", "native_decide", "unsafe"].map((word) => ({
    pattern: new RegExp(`(^|[^A-Za-z0-9_.'])${word}($|[^A-Za-z0-9_'])`),
    name: word,
  })),
  { pattern: /\+native($|[^A-Za-z0-9_'])/, name: "+native" },
  // Lean's own programming interface (Lean.addDecl, open Lean in …).
  { pattern: /(^|[^A-Za-z0-9_'])Lean($|[^A-Za-z0-9_'])/, name: "Lean" },
  { pattern: new RegExp(`(^|[^A-Za-z0-9_'])${THEOREM}($|[^A-Za-z0-9_'])`), name: THEOREM },
];
/** `#exit`, `#eval`, `#print` …: commands, which have no place in a proof. Not `#[1, 2]`. */
const HASH_COMMAND = /#[A-Za-z_]+/;

export interface Escape {
  /** What was found, as written. */
  name: string;
  /** 0-based body line. */
  line: number;
  /** A sentence for the learner. */
  message: string;
}

/**
 * What in a body would let it step outside a proof: see the notes at the top
 * of this file. A body with any of these is not sent to Lean at all. Strings
 * are searched too (an interpolated string holds code), so a string that
 * merely spells one of these words is refused as well; nothing is lost by it.
 */
export function escapesIn(body: string): Escape[] {
  const { code, bare } = lex(bodyLines(body).join("\n"));
  const found: Escape[] = [];
  const codeLines = code.split("\n");
  for (const [line, text] of codeLines.entries()) {
    for (const { pattern, name } of ESCAPES) {
      if (!pattern.test(text)) continue;
      const message =
        name === THEOREM
          ? `“${THEOREM}” is the name this exercise is checked under; a proof cannot use it.`
          : `“${name}” runs a program or changes Lean's settings rather than making a proof step, so it is not accepted in an exercise. The Playground will run it.`;
      found.push({ name, line, message });
    }
    const hash = HASH_COMMAND.exec(text);
    if (hash) found.push({ name: hash[0], line, message: `“${hash[0]}” is a command, not a proof step, so it is not accepted in an exercise. The Playground will run it.` });
    if (/[«»]/.test(text)) found.push({ name: "«»", line, message: "Names written in « » are not accepted in an exercise." });
  }
  let depth = 0;
  let line = 0;
  for (const c of bare) {
    if (c === "\n") line++;
    else if (c === "(") depth++;
    else if (c === ")" && --depth < 0) {
      found.push({ name: ")", line, message: "This line closes a bracket that was never opened." });
      break;
    }
  }
  return found;
}

/** The axioms ordinary mathematics in Lean rests on. Anything else (an axiom
 *  of the proof's own, `sorryAx`, the compiler's word for `native_decide`)
 *  is not a proof of the statement. */
export const ALLOWED_AXIOMS = ["propext", "Classical.choice", "Quot.sound"];

/**
 * The axioms Lean reports the theorem rests on, or null when the report is
 * missing. Only a note on the report's own line counts: a message from
 * anywhere in the body cannot stand in for it.
 */
export function axiomsOf(diagnostics: Diagnostic[], body: string, given = ""): string[] | null {
  const line = auditLine(body, given);
  for (const d of diagnostics) {
    if (d.severity !== "info" || d.start.line !== line) continue;
    if (d.message.trim() === `'${THEOREM}' does not depend on any axioms`) return [];
    const m = new RegExp(`^'${THEOREM}' depends on axioms: \\[([\\s\\S]*)\\]\\s*$`).exec(d.message.trim());
    if (m) return m[1].split(",").map((a) => a.trim()).filter(Boolean);
  }
  return null;
}

/**
 * A linter's remark: a warning or note that ends with Lean's own "this
 * linter can be disabled" line. Never an error. An error is never dropped,
 * whatever its text says: Lean quotes the learner's own names in its
 * messages, so a test on the text alone would let a proof hide its errors
 * (`exact linter.x`).
 */
const LINTER_FOOTER = /^Note: This linter can be disabled with `set_option linter\.\S+ false`\s*$/m;
export function isLinterRemark(d: { severity: string; message: string }): boolean {
  return d.severity !== "error" && LINTER_FOOTER.test(d.message);
}

const CLOSER: Record<string, string> = { "(": ")", "[": "]", "{": "}", "⟨": "⟩" };
const OPENER: Record<string, string> = { ")": "(", "]": "[", "}": "{", "⟩": "⟨" };

/** Brackets in a body that are opened and never closed, in order, each with its line. */
function unclosed(bare: string): { bracket: string; line: number }[] {
  const stack: { bracket: string; line: number }[] = [];
  const left: { bracket: string; line: number }[] = [];
  let line = 0;
  for (const c of bare) {
    if (c === "\n") line++;
    else if (c in CLOSER) stack.push({ bracket: c, line });
    else if (c in OPENER) {
      // Close the nearest bracket of this kind; anything opened inside it was never closed.
      let k = stack.length - 1;
      while (k >= 0 && stack[k].bracket !== OPENER[c]) k--;
      if (k >= 0) left.push(...stack.splice(k).slice(1));
    }
  }
  return [...left, ...stack].sort((x, y) => x.line - y.line);
}

/**
 * The body line a diagnostic belongs to. Lean reports something left open
 * where it finally gives up, which is often a later line that is fine, or
 * past the end of the body (the bracket the body sits in, the axiom line).
 * The learner needs the line that left it open.
 */
function blame(message: string, line: number, body: string): number {
  const lines = bodyLines(body);
  const count = Math.max(lines.length, 1);
  const { code, bare, openComment } = lex(lines.join("\n"));
  const open = unclosed(bare);
  // "expected ')'" and the like: the last bracket of that kind still open.
  const wanted = /expected '([)\]}⟩])'/.exec(message.split("\n")[0]);
  if (wanted) {
    const of = open.filter((o) => o.bracket === OPENER[wanted[1]]);
    if (of.length) return of[of.length - 1].line;
  }
  if (line < count) return line;
  if (/^unterminated comment/.test(message) && openComment !== null) return lines.join("\n").slice(0, openComment).split("\n").length - 1;
  if (open.length) return open[open.length - 1].line;
  const codeLines = code.split("\n");
  for (let i = codeLines.length - 1; i >= 0; i--) if (codeLines[i].trim()) return i;
  return 0;
}

/** Lean's diagnostics in body coordinates, without the linters' remarks
 *  (a learner's spacing and unused names are not the lesson) and without
 *  the axiom report, which `axiomsOf` reads. */
export function toBody(diagnostics: Diagnostic[], body: string, given = ""): BodyDiagnostic[] {
  const audit = auditLine(body, given);
  const first = bodyLine(given);
  return diagnostics
    .filter((d) => !isLinterRemark(d) && !(d.severity === "info" && d.start.line === audit))
    .map((d) => {
      const line = d.start.line - first;
      return { severity: d.severity, message: d.message, line: line < 0 ? null : blame(d.message, line, body) };
    });
}

const USES_SORRY = /declaration uses .?sorry/;
const UNSOLVED = /^unsolved goals/;

/** Whole-word uses of forbidden tactics in a body, comments removed. */
export function forbiddenIn(body: string, forbid: string[]): string[] {
  const { code } = lex(body);
  // A name with no dot in it is also found after a dot: forbidding `zero_add`
  // forbids `Nat.zero_add` and `n.zero_add`, which are the same theorem.
  return forbid.filter((word) => new RegExp(`(^|[^A-Za-z0-9_${word.includes(".") ? "." : ""}'?!])${escapeRegExp(word)}($|[^A-Za-z0-9_'])`).test(code));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface Verdict {
  /** Lean accepted the proof of the exercise's statement, with no `sorry`,
   *  resting only on the allowed axioms. */
  solved: boolean;
  /** The first real error (not "unsolved goals"): the last move was wrong. */
  error: BodyDiagnostic | null;
  /** The proof is fine so far but goals remain. */
  unfinished: boolean;
  /** Forbidden tactics that were used; a proof using one is not solved. */
  forbidden: string[];
  /** Why a proof Lean raised no error for is still not accepted: it steps
   *  outside a proof, rests on an axiom of its own, or Lean's axiom report
   *  never arrived. Null when there is nothing of the kind to say. */
  refusal: string | null;
}

/**
 * `axioms` is what `axiomsOf` read from the same check: the axioms the
 * theorem rests on, or null when Lean gave no report.
 */
export function judge(diagnostics: BodyDiagnostic[], body: string, forbid: string[], axioms: string[] | null): Verdict {
  const errors = diagnostics.filter((d) => d.severity === "error");
  const error = errors.find((d) => !UNSOLVED.test(d.message)) ?? null;
  const unfinished = !error && errors.some((d) => UNSOLVED.test(d.message));
  const sorry = diagnostics.some((d) => USES_SORRY.test(d.message));
  const forbidden = forbiddenIn(body, forbid);
  const empty = isBlank(body);
  const escapes = escapesIn(body);
  const clean = !empty && errors.length === 0 && !sorry;
  const extra = (axioms ?? []).filter((a) => !ALLOWED_AXIOMS.includes(a));
  let refusal: string | null = null;
  if (escapes.length) refusal = escapes[0].message;
  else if (clean && axioms === null) refusal = "Lean stopped before it could confirm what this proof rests on, so it is not accepted.";
  else if (clean && extra.length) refusal = `This proof rests on something that was assumed, not proved (${extra.join(", ")}), so it is not accepted.`;
  return { solved: clean && forbidden.length === 0 && refusal === null, error, unfinished, forbidden, refusal };
}
