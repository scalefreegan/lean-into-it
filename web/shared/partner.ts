// The Tutor as proof partner (bead lii-2zo.3): the pure parts. In the
// Playground the Tutor may ask Lean about scratch Lean of its own, through
// the app (web/server/partner.ts), never the learner's file.
//
// Lean runs what it is given with this user's permissions, and the Tutor is
// otherwise a run that can only read. So its scratch Lean is searched first
// and refused unread unless it is plainly statements, proofs and look-ups
// (`scratchProblems`):
//
//   1. Every line that starts in the first column must start a kind of
//      command on a short list (theorem, example, def, #check …): the
//      scratch file is for stating and proving, not for extending Lean.
//   2. Nowhere may it name what makes Lean run code written in the file:
//      `#eval` and every other `#` command off a list of five, `IO` and
//      its relatives, metaprograms (`elab`, `macro`, `syntax`, `simproc`,
//      anything of `Lean`'s own interface), attributes off a list of four
//      (an attribute can register code that a tactic then runs), tactics
//      that evaluate a term or start a process (`plausible`, a `config :=`,
//      `native_decide`, `bv_decide`, `polyrith`), `import`, `include_str`.
//   3. Nor `axiom` or `opaque`: "no errors" must not rest on an assumption
//      the scratch file made up.
//
// THIS IS NOT THE SANDBOX. It reads words, and Lean is a language that can
// be extended from inside a file in more ways than a list can name: a
// clever enough text could get past it. The wall that holds by itself is
// under it: the Tutor's Lean runs in an OS sandbox that cannot read the
// user's files, write, start a program or reach the network
// (web/server/lean/sandbox.ts). This filter is the outer layer: it turns
// most such text away before any Lean sees it, with a reason the Tutor can
// read, and it is what decides whether a block gets an Insert button (the
// learner's own Lean is NOT sandboxed). Do not loosen the lists lightly.
//
// Also here: finding the Lean blocks in a reply, so the server can ask Lean
// about each and say under it what Lean said (`leanBlocks`, `labelled`).
// The Tutor's word that a snippet works is never the label.

import { lex } from "./proof.ts";

/** A scratch file is a few screens at most. */
export const MAX_SCRATCH = 20_000;

/** `#` commands that only look things up or work a value out inside Lean. */
export const HASH_ALLOWED = ["check", "check_failure", "print", "reduce", "synth"];

/** What a line in the first column may start with: the commands a scratch
 *  file is for, and the ways a declaration carries on. */
export const COMMAND_STARTS = [
  "theorem", "lemma", "example", "def", "abbrev", "structure", "inductive", "class", "instance",
  "variable", "universe", "open", "namespace", "section", "end", "mutual",
  "noncomputable", "private", "protected",
  "where", "termination_by", "decreasing_by", "deriving", "with",
];

/** Attributes a declaration may carry: ones that only file a lemma for a tactic already there. */
export const ATTRIBUTES_ALLOWED = ["simp", "ext", "reducible", "norm_cast"];

const word = (w: string) => new RegExp(`(^|[^A-Za-z0-9_.'])${w.replace(/[+?]/g, "\\$&")}($|[^A-Za-z0-9_'])`);
/** A name wherever it stands, also after a dot (`System.FilePath`, `Lean.Meta`). */
const name = (w: string) => new RegExp(`(^|[^A-Za-z0-9_'])${w}($|[^A-Za-z0-9_'])`);
const all = (words: string[], why: string, pattern = word) => words.map((w) => ({ pattern: pattern(w), name: w, why }));

/** What scratch Lean may not name, and why, in the Tutor's words. */
const REFUSED: { pattern: RegExp; name: string; why: string }[] = [
  ...all(["run_tac", "run_cmd", "run_elab", "run_meta", "by_elab", "initialize", "builtin_initialize", "unsafe", "implemented_by", "extern", "native_decide", "bv_decide", "plausible", "slim_check"], "it runs a program"),
  ...all(["native", "config"], "it can make a tactic run a program", name),
  ...all(["elab", "elab_rules", "macro", "macro_rules", "syntax", "notation", "infix", "infixl", "infixr", "prefix", "postfix", "declare_syntax_cat", "simproc", "dsimproc", "simproc_decl", "binder_predicate", "attribute"], "it extends Lean with code of the file's own"),
  ...all(["Lean", "Meta", "Elab", "Macro", "Syntax", "Expr", "MetaM", "TacticM", "CoreM", "SimpM", "MacroM", "evalExpr", "Testable", "NormNumExt", "PositivityExt"], "it is Lean's own programming interface", name),
  ...all(["IO", "BaseIO", "EIO", "System", "FilePath", "Process"], "it is how a Lean program reaches files and processes", name),
  ...all(["include_str"], "it reads a file"),
  ...all(["import"], "the file already imports Mathlib, and nothing else may be loaded"),
  ...all(["set_option"], "it changes Lean's settings"),
  ...all(["polyrith"], "it calls a service on the internet"),
  ...all(["axiom", "opaque"], "what Lean then accepts would rest on an assumption made up here"),
  { pattern: /[«»]/, name: "«»", why: "names written in « » are not accepted" },
];

export interface ScratchProblem {
  name: string;
  /** 1-based line of the scratch text. */
  line: number;
  message: string;
}

/**
 * Why scratch Lean is not sent to Lean at all; empty when it may be. Strings
 * are searched as well as code (an interpolated string holds code), comments
 * are not.
 */
export function scratchProblems(lean: string): ScratchProblem[] {
  const found: ScratchProblem[] = [];
  if (lean.length > MAX_SCRATCH) return [{ name: "length", line: 1, message: `The scratch file is too long (${lean.length} characters; at most ${MAX_SCRATCH}).` }];
  const { code, bare, braceInString, openComment, openString } = lex(lean.replace(/\r/g, ""));
  const bareLines = bare.split("\n");
  for (const [i, text] of code.split("\n").entries()) {
    const line = i + 1;
    for (const r of REFUSED) if (r.pattern.test(text)) found.push({ name: r.name, line, message: `“${r.name}” is not run for the Tutor: ${r.why}.` });
    for (const m of text.matchAll(/#([A-Za-z_]+)/g)) {
      if (!HASH_ALLOWED.includes(m[1])) found.push({ name: `#${m[1]}`, line, message: `“#${m[1]}” is not run for the Tutor. Of the # commands only ${HASH_ALLOWED.map((h) => `#${h}`).join(", ")} are; to work a value out use #reduce, or prove it with decide or norm_num.` });
    }
    // An attribute can register code that a tactic later runs: only the plain ones.
    for (const m of text.matchAll(/@\[([^\]]*)(\]?)/g)) {
      const names = m[1].split(",").map((a) => a.trim());
      const odd = m[2] ? names.find((a) => !ATTRIBUTES_ALLOWED.includes(a)) : (names[0] || "@[");
      if (odd !== undefined) found.push({ name: `@[${odd}]`, line, message: `The attribute “${odd}” is not accepted in the Tutor's scratch Lean; only ${ATTRIBUTES_ALLOWED.join(", ")} are, written on one line.` });
    }
    // The first column is for commands a scratch file is for.
    const start = /^(\S+)/.exec(bareLines[i] ?? "")?.[1];
    if (start !== undefined && !/^[|)\]}⟩·]/.test(start) && !/^@\[/.test(start) && !/^#[A-Za-z_]+/.test(start)) {
      const first = /^[A-Za-z_]+/.exec(start)?.[0] ?? start;
      if (!COMMAND_STARTS.includes(first)) found.push({ name: first, line, message: `A line that starts in the first column must begin a theorem, lemma, example, def, abbrev, structure, inductive, class, instance, variable, open, namespace, section or one of the # commands; “${first}” does not. Indent the lines that carry a proof or a definition on.` });
    }
  }
  if (braceInString !== null) found.push({ name: "{", line: lean.slice(0, braceInString).split("\n").length, message: "A “{” inside a string is not accepted: Lean can read what follows it as code." });
  if (openComment !== null) found.push({ name: "/-", line: lean.slice(0, openComment).split("\n").length, message: "A comment is opened and never closed." });
  if (openString) found.push({ name: "\"", line: 1, message: "A string is opened and never closed." });
  return found;
}

/** The file Lean is given: Mathlib, a blank line, the scratch text. */
export function scratchSource(lean: string): string {
  return `import Mathlib\n\n${lean.replace(/\r/g, "").replace(/\s+$/, "")}\n`;
}
/** Lines the scratch text sits below in `scratchSource`. */
export const SCRATCH_OFFSET = 2;

/* ---------------------------- blocks in a reply ---------------------------- */

export interface LeanBlock {
  code: string;
  /** Index of the line after the closing fence, where a label goes. */
  after: number;
}

/**
 * The fenced blocks of a reply that are Lean: marked `lean`, or unmarked.
 * Fences are read as the drawer reads them (web/src/markdown.tsx): any line
 * that starts with three backticks opens one, whatever follows on the line
 * (```lean say: … too), and a line of at least as many backticks and
 * nothing else closes it. A block of another language is skipped whole.
 */
export function leanBlocks(markdown: string): LeanBlock[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out: LeanBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    const open = /^(`{3,})\s*([A-Za-z0-9]*)/.exec(lines[i]);
    if (!open) continue;
    const close = new RegExp(`^\`{${open[1].length},}[ \\t]*$`);
    const buf: string[] = [];
    let j = i + 1;
    while (j < lines.length && !close.test(lines[j])) buf.push(lines[j++]);
    if (j < lines.length && isLean(open[2])) out.push({ code: buf.join("\n"), after: j + 1 });
    i = j;
  }
  return out;
}

/** Whether a fence's language word means Lean (none given counts). */
export function isLean(lang: string | undefined): boolean {
  return lang === undefined || lang === "" || /^lean4?$/i.test(lang);
}

/** Whether the learner may be offered a block to put in their own file:
 *  Lean, and nothing the Tutor's own scratch Lean would be refused for.
 *  Their file is theirs and Lean runs all of it; a block that would run a
 *  program is for them to type, not one click away. */
export function insertable(code: string, lang?: string): boolean {
  return isLean(lang) && code.trim() !== "" && fragmentProblems(code).length === 0;
}

/** `scratchProblems` for a block that may be part of a proof: tactic lines
 *  in the first column are no fault there. */
function fragmentProblems(code: string): ScratchProblem[] {
  return scratchProblems(code).filter((p) => !/must begin a theorem/.test(p.message));
}

/** Whether a block is something Lean can be asked about by itself: it has a
 *  declaration or a command of its own, not just tactic lines. */
export function standsAlone(code: string): boolean {
  return /^\s*(?:(?:private|protected|noncomputable|@\[[^\]]*\])\s+)*(theorem|lemma|example|def|abbrev|instance|structure|inductive|#check|#print|#reduce|#synth)\b/m.test(lex(code).bare);
}

/** What Lean said of one block, as the line shown under it. */
export type BlockVerdict =
  | { kind: "accepted" }
  | { kind: "open" } // accepted, with `sorry` standing in for a proof
  | { kind: "refused"; error: string }
  | { kind: "fragment" }
  | { kind: "not-run"; why: string }
  | { kind: "unasked"; why: string };

/** Every label is a line of its own, in emphasis, starting with this. The
 *  server takes any such line out of what the Tutor wrote (`withoutLabels`)
 *  before it writes its own, so a label in a stored reply is the app's. */
export const LABEL_MARK = "Lean:";

/** A reply without the lines that look like labels: only the app writes those. */
export function withoutLabels(markdown: string): string {
  return markdown
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((l) => !/^\s*[*_]{1,3}\s*Lean:/i.test(l))
    .join("\n");
}

export function verdictLine(v: BlockVerdict): string {
  // Lean's first line, unable to end the emphasis it sits in: no backticks,
  // and a times sign for a star (a name keeps its underscores).
  const first = (s: string) => s.split("\n")[0].replace(/`/g, "").replace(/\*/g, "×").slice(0, 200);
  switch (v.kind) {
    case "accepted":
      return `*${LABEL_MARK} checked, no errors.*`;
    case "open":
      return `*${LABEL_MARK} the statement is accepted; the proof is left open (sorry).*`;
    case "refused":
      return `*${LABEL_MARK} a sketch, not accepted as written (${first(v.error)}).*`;
    case "fragment":
      return `*${LABEL_MARK} not checked; this is part of a proof, not a whole example.*`;
    case "not-run":
      return `*${LABEL_MARK} not checked (${first(v.why)}).*`;
    case "unasked":
      return `*${LABEL_MARK} not checked; Lean could not be asked (${first(v.why)}).*`;
  }
}

/** The reply with a verdict line under each Lean block (`verdicts[i]` for
 *  `leanBlocks(markdown)[i]`; a missing one adds nothing). */
export function labelled(markdown: string, verdicts: (BlockVerdict | undefined)[]): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks = leanBlocks(markdown);
  for (let i = blocks.length - 1; i >= 0; i--) {
    const v = verdicts[i];
    // A paragraph of its own: a blank line before, and one after unless there is one.
    if (v) lines.splice(blocks[i].after, 0, "", verdictLine(v), ...(lines[blocks[i].after]?.trim() ? [""] : []));
  }
  return lines.join("\n");
}
