// From an exercise and a learner's proof body to the Lean file that is
// checked, and from Lean's diagnostics back to a verdict in the learner's
// own line numbers. Pure: no Lean here, so the rules are tested without it.
//
// The statement is the exercise's, never the learner's: only the proof body
// comes from the browser, and every line of it is indented into the `by`
// block. Lean alone decides; `solved` means Lean reported no error and no
// `sorry` for exactly this statement.

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
/** Lines before the body's first line: the import, a blank, the statement. */
const BODY_LINE = 3;
const INDENT = "  ";

/** What an empty proof is sent as: a tactic that does nothing, so Lean still
 *  reports the opening goal. */
const PLACEHOLDER = "skip";

export function bodyLines(body: string): string[] {
  const lines = body.replace(/\r/g, "").split("\n");
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return lines;
}

/** The Lean source for a statement and a proof body. */
export function assemble(statement: string, body: string): string {
  const lines = bodyLines(body);
  const shown = lines.length ? lines : [PLACEHOLDER];
  return `${HEADER}example ${statement.replace(/\s+/g, " ").trim()} := by\n${shown.map((l) => INDENT + l).join("\n")}\n`;
}

/** Where, in the assembled source, a body position is. */
export function toSource(p: Position): Position {
  return { line: p.line + BODY_LINE, character: p.character + INDENT.length };
}

/** The end of the proof: after the last tactic, where Lean reports what is left. */
export function endOfBody(body: string): Position {
  const lines = bodyLines(body);
  if (!lines.length) return { line: 0, character: PLACEHOLDER.length };
  return { line: lines.length - 1, character: lines[lines.length - 1].length };
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

/** Lean's diagnostics in body coordinates, without the linters' remarks
 *  (a learner's spacing and unused names are not the lesson). */
export function toBody(diagnostics: Diagnostic[], body: string): BodyDiagnostic[] {
  const count = Math.max(bodyLines(body).length, 1);
  return diagnostics
    .filter((d) => !isLinterRemark(d))
    .map((d) => {
      const line = d.start.line - BODY_LINE;
      return { severity: d.severity, message: d.message, line: line >= 0 && line < count ? line : null };
    });
}

const USES_SORRY = /declaration uses .?sorry/;
const UNSOLVED = /^unsolved goals/;

/** Whole-word uses of forbidden tactics in a body, comments removed. */
export function forbiddenIn(body: string, forbid: string[]): string[] {
  const code = body.replace(/\/-[\s\S]*?-\//g, " ").replace(/--.*$/gm, " ");
  return forbid.filter((word) => new RegExp(`(^|[^A-Za-z0-9_.'?!])${escapeRegExp(word)}($|[^A-Za-z0-9_'])`).test(code));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface Verdict {
  /** Lean accepted the proof of the exercise's statement, with no `sorry`. */
  solved: boolean;
  /** The first real error (not "unsolved goals"): the last move was wrong. */
  error: BodyDiagnostic | null;
  /** The proof is fine so far but goals remain. */
  unfinished: boolean;
  /** Forbidden tactics that were used; a proof using one is not solved. */
  forbidden: string[];
}

export function judge(diagnostics: BodyDiagnostic[], body: string, forbid: string[] = []): Verdict {
  const errors = diagnostics.filter((d) => d.severity === "error");
  const error = errors.find((d) => !UNSOLVED.test(d.message)) ?? null;
  const unfinished = !error && errors.some((d) => UNSOLVED.test(d.message));
  const sorry = diagnostics.some((d) => USES_SORRY.test(d.message));
  const forbidden = forbiddenIn(body, forbid);
  const empty = bodyLines(body).length === 0;
  return { solved: !empty && errors.length === 0 && !sorry && forbidden.length === 0, error, unfinished, forbidden };
}
