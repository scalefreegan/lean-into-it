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
//   4. Then every constant the file added (the given, the theorem, anything
//      the proof added on the way) goes through Lean's kernel again, renamed
//      (`#lii_replay`, lean/LeanIntoIt/Replay.lean). The axiom report cannot
//      see a theorem a metaprogram added without the kernel's check; this
//      can. Solved needs its "ok", on its own line. It catches a
//      metaprogram that added a constant without the kernel's check. It
//      runs in the same Lean process as the proof, so a metaprogram written
//      to defeat the replay itself could still try: 2 stays the first
//      layer, and this one is under it, not instead of it.
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
  /** Where in the body Lean pointed, for an editor to underline. Only when
   *  `line` is the line Lean named (not one the blame was moved to). */
  range?: { start: Position; end: Position };
}

/** One line, so that adding the replay's import moved no line number. */
export const HEADER = "import Mathlib import LeanIntoIt.Replay\n\n";
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
 *     #lii_replay
 */
export function assemble(statement: string, body: string, given = ""): string {
  const lines = bodyLines(body);
  // Comments alone are not a tactic block: the placeholder goes in front of them.
  const shown = !lines.length ? [PLACEHOLDER] : isBlank(body) ? [`${PLACEHOLDER} ${lines[0]}`, ...lines.slice(1)] : lines;
  const before = bodyLines(given);
  return `${HEADER}${before.length ? `${before.join("\n")}\n\n` : ""}theorem ${THEOREM} ${statement.replace(/\s+/g, " ").trim()} := by\n  (\n${shown.map((l) => INDENT + l).join("\n")}\n  )\n\n#print axioms ${THEOREM}\n#lii_replay\n`;
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

/** The source line of the kernel replay: the line after the axiom report. */
function replayLine(body: string, given: string): number {
  return auditLine(body, given) + 1;
}

/**
 * What the kernel replay on its own line reported: "ok", the kernel's
 * refusal, or null when there is no report (Lean stopped before it). As with
 * the axiom report, nothing from the body's lines can stand in for it.
 */
export function replayOf(diagnostics: Diagnostic[], body: string, given = ""): string | null {
  const line = replayLine(body, given);
  const here = diagnostics.filter((d) => d.start.line === line);
  const refused = here.find((d) => d.severity === "error" && /^lii-replay: /.test(d.message));
  if (refused) return refused.message;
  return here.some((d) => d.severity === "info" && /^lii-replay: ok, \d+ constants$/.test(d.message.trim())) ? "ok" : null;
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
 * less: the worst a disagreement does is refuse a proof. The one place it
 * cannot know is a string Lean reads as interpolated (after `s!`, `m!`,
 * `throwError` …), where `{…}` is code with strings of its own: so
 * `braceInString` says where a `{` stands inside a string, and `escapesIn`
 * refuses such a body outright.
 */
export function lex(body: string): { code: string; bare: string; openComment: number | null; openString: boolean; braceInString: number | null } {
  const text = body.replace(/\r/g, "");
  // UTF-16 units, as `text[i]` indexes: a character such as 𝓝 is two of them.
  const code = text.split("");
  const bare = text.split("");
  // Blank [from, to) in the given outputs, keeping line breaks.
  const blank = (from: number, to: number, outs: string[][]) => {
    for (let k = from; k < to && k < text.length; k++) if (text[k] !== "\n") for (const o of outs) o[k] = " ";
  };
  let i = 0;
  // Where a block comment that is never closed starts, if there is one.
  let openComment: number | null = null;
  // Whether a string is opened and never closed.
  let openString = false;
  // Where the first unescaped `{` inside a "…" string is, if there is one.
  let braceInString: number | null = null;
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
      if (close < 0) openString = true;
      blank(i, j, [bare]);
      i = j;
    } else if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') {
        if (text[j] === "{" && braceInString === null) braceInString = j;
        j += text[j] === "\\" ? 2 : 1;
      }
      if (j >= text.length) openString = true;
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
  return { code: code.join(""), bare: bare.join(""), openComment, openString, braceInString };
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
  const text = bodyLines(body).join("\n");
  const { code, bare, braceInString } = lex(text);
  const found = escapesOf(code, bare);
  // A `{` in a string may be the start of code inside an interpolated
  // string, which this reading would take for text. Nothing in a proof
  // needs one; `\{` is a brace and is fine.
  if (braceInString !== null) {
    const line = text.slice(0, braceInString).split("\n").length - 1;
    found.push({ name: "{", line, message: "A “{” inside a string is not accepted in an exercise: Lean can read what follows it as code. Write \\{ for the character itself." });
  }
  // The option spelling of native evaluation, which may run over two lines.
  const native = /(^|[^A-Za-z0-9_'])native\s*:=/.exec(code);
  if (native && !found.some((f) => f.name === "native :=")) {
    found.push({ name: "native :=", line: code.slice(0, native.index + native[1].length).split("\n").length - 1, message: "“native :=” runs a program or changes Lean's settings rather than making a proof step, so it is not accepted in an exercise. The Playground will run it." });
  }
  return found.sort((x, y) => x.line - y.line);
}

function escapesOf(code: string, bare: string): Escape[] {
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

/*
 * Fill the gap. The exercise file holds a proof with one step missing,
 * marked `<gap>`; the learner supplies what goes there and nothing else.
 * The proof Lean checks is the file's with the gap filled, and it is judged
 * exactly as a whole proof is: everything above applies to it.
 *
 * The marker is not Lean, so a proof whose gap was never filled cannot be
 * accepted, and it is not `sorry`, so a stray `sorry` is still a `sorry`.
 *
 * A fill is one line with its own brackets and strings closed and no
 * comment. That keeps it in its place for a learner's sake: it cannot close
 * a bracket of the proof around it, or comment out the lines after it.
 * Nothing rests on that for soundness. Whatever a fill manages to do to the
 * proof around it, Lean checks the whole of the result against the
 * exercise's own statement, and the three rules at the top still hold.
 */
export const GAP = "<gap>";

/** The 0-based line of a proof that holds the gap, or -1. */
export function gapLine(proof: string): number {
  return bodyLines(proof).findIndex((l) => l.includes(GAP));
}

/** Why `fill` cannot go in a gap, in a sentence for the learner, or null. */
export function fillProblem(fill: string): string | null {
  const text = fill.replace(/\r/g, "").trim();
  if (text.includes("\n")) return "The gap takes one line.";
  const { code, bare, openString } = lex(text);
  if (code !== text) return "A comment cannot go in the gap.";
  if (openString) return "A string is opened with \" and never closed.";
  const stack: string[] = [];
  for (const c of bare) {
    if (c in CLOSER) stack.push(c);
    else if (c in OPENER && stack.pop() !== OPENER[c]) return `“${c}” closes a bracket that the gap did not open.`;
  }
  if (stack.length) return `“${stack[stack.length - 1]}” opens a bracket that is not closed.`;
  return null;
}

/** The proof with its gap filled. */
export function fillBody(proof: string, fill: string): string {
  return proof.replace(GAP, () => fill.replace(/\r/g, "").trim());
}

/** Where the gap starts, as a position in the proof: the place to ask
 *  Lean what the missing step has to prove. Null when there is no gap. */
export function gapPosition(proof: string): Position | null {
  const line = gapLine(proof);
  return line < 0 ? null : { line, character: bodyLines(proof)[line].indexOf(GAP) };
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
  const replay = replayLine(body, given);
  const first = bodyLine(given);
  // The axiom report and the replay are the server's questions, judged on their own (judge).
  return diagnostics
    .filter((d) => !isLinterRemark(d) && !(d.severity === "info" && d.start.line === audit) && !(d.start.line === replay && /^lii-replay: /.test(d.message)))
    .map((d): BodyDiagnostic => {
      const line = d.start.line - first;
      const at = line < 0 ? null : blame(d.message, line, body);
      const range = at !== null && at === line ? bodyRange(d, first, body) : null;
      return { severity: d.severity, message: d.message, line: at, ...(range ? { range } : {}) };
    });
}

/** A diagnostic's span in the body's own lines and columns, cut off at the body's end. */
function bodyRange(d: Diagnostic, first: number, body: string): { start: Position; end: Position } | null {
  // A body with no tactic is sent behind a placeholder, so its columns are not the learner's.
  if (isBlank(body)) return null;
  const lines = bodyLines(body);
  const line = d.start.line - first;
  if (line >= lines.length) return null;
  const column = (c: number) => Math.max(0, c - INDENT.length);
  const start = { line, character: Math.min(column(d.start.character), lines[line].length) };
  const last = d.end.line - first;
  const end = last >= lines.length ? { line: lines.length - 1, character: lines[lines.length - 1].length } : { line: last, character: Math.min(column(d.end.character), lines[last].length) };
  if (end.line < start.line || (end.line === start.line && end.character < start.character)) return null;
  return { start, end };
}

/*
 * `ring` on an equation it cannot prove raises no error. Mathlib's `ring`
 * is "try `ring1`, and if that fails run `ring_nf` and say so in a note":
 * the note is the same whether `ring_nf` then closed the goal or only
 * rewrote it into a standard form and left it. Left as a note, the second
 * case looks like progress on the board, when the move has failed.
 *
 * The note alone cannot tell the two apart; the goals can. `/api/check`
 * asks Lean for the goals just before and just after each such `ring`
 * (`ringNotes` says where), and `ringFailures` turns the note into an error,
 * in Lean's own sentence, where the goal `ring` ran on is still open.
 *
 * Only in a proof Lean has not accepted: where Lean raised no error, a later
 * line finished from the standard form, the proof is a proof, and nothing
 * here may say otherwise.
 */
const RING_FAILED = /The `ring` tactic failed to close the goal\./;

/** The notes of a `ring` that fell back to `ring_nf`, in a proof Lean has
 *  raised an error in. Empty for a proof with no error. */
export function ringNotes(diagnostics: Diagnostic[]): Diagnostic[] {
  if (!diagnostics.some((d) => d.severity === "error")) return [];
  return diagnostics.filter((d) => d.severity !== "error" && RING_FAILED.test(d.message));
}

/**
 * `diagnostics` with each of `notes` made an error where its `ring` left its
 * goal open. `goals` holds, for each note in turn, Lean's goals at the note's
 * start and then at its end. A `ring` that closed its goal leaves one goal
 * fewer; where Lean could not say (null), the note stays a note.
 */
export function ringFailures(diagnostics: Diagnostic[], notes: Diagnostic[], goals: (string[] | null)[]): Diagnostic[] {
  const failed = new Set(
    notes.filter((_, i) => {
      const before = goals[2 * i];
      const after = goals[2 * i + 1];
      return !!before && !!after && before.length > 0 && after.length >= before.length;
    }),
  );
  return diagnostics.map((d): Diagnostic => (failed.has(d) ? { ...d, severity: "error", message: RING_FAILED.exec(d.message)![0] } : d));
}

const USES_SORRY = /declaration uses .?sorry/;
const UNSOLVED = /^unsolved goals/;

/** `try?` runs whatever closes the goal, the forbidden tactics and theorems
 *  among them, so a list that forbids anything forbids it too. */
const SEARCHES_EVERYTHING = "try?";

/** Whole-word uses of forbidden tactics in a body, comments removed. */
export function forbiddenIn(body: string, forbidden: string[]): string[] {
  // A body with a `{` in a string is refused by escapesIn, so one reading is enough here.
  const { code } = lex(body);
  const forbid = forbidden.length && !forbidden.includes(SEARCHES_EVERYTHING) ? [...forbidden, SEARCHES_EVERYTHING] : forbidden;
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
 * theorem rests on, or null when Lean gave no report. `written` is the part
 * of the body that is the learner's own, when that is not all of it.
 */
export function judge(diagnostics: BodyDiagnostic[], body: string, forbid: string[], axioms: string[] | null, replay: string | null, written = body): Verdict {
  const errors = diagnostics.filter((d) => d.severity === "error");
  const error = errors.find((d) => !UNSOLVED.test(d.message)) ?? null;
  const unfinished = !error && errors.some((d) => UNSOLVED.test(d.message));
  const sorry = diagnostics.some((d) => USES_SORRY.test(d.message));
  // The forbid list is about what the learner wrote: in a fill-the-gap
  // exercise that is the fill (`written`), not the proof around it.
  const forbidden = forbiddenIn(written, forbid);
  const empty = isBlank(body);
  const escapes = escapesIn(body);
  const clean = !empty && errors.length === 0 && !sorry;
  const extra = (axioms ?? []).filter((a) => !ALLOWED_AXIOMS.includes(a));
  let refusal: string | null = null;
  if (escapes.length) refusal = escapes[0].message;
  else if (clean && axioms === null) refusal = "Lean stopped before it could confirm what this proof rests on, so it is not accepted.";
  else if (clean && extra.length) refusal = `This proof rests on something that was assumed, not proved (${extra.join(", ")}), so it is not accepted.`;
  else if (clean && replay === null) refusal = "Lean stopped before its kernel could check this proof a second time, so it is not accepted.";
  else if (clean && replay !== "ok") refusal = "Lean's kernel checked everything this proof added a second time, from the start, and refused part of it, so it is not accepted.";
  return { solved: clean && forbidden.length === 0 && refusal === null, error, unfinished, forbidden, refusal };
}
