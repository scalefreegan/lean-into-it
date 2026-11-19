// The Tutor as proof partner (bead lii-2zo.3): the pure parts. In the
// Playground the Tutor may ask Lean about scratch Lean of its own, through
// the app (web/server/partner.ts), never the learner's file.
//
// Lean runs what it is given with this user's permissions, and the Tutor is
// otherwise a run that can only read. So its scratch Lean is searched first
// for the ways a Lean file runs a program, reads a file or reaches the
// network, and refused if it names one (`scratchProblems`). The list is a
// second wall, not a proof: the first is that nothing reaches the Tutor but
// the learner's own files and words. What is left is what a proof partner
// needs: statements, proofs, definitions, `#check`, `#print`, `#reduce`,
// `#synth`, and the search tactics (`exact?`, `apply?`, `rw?`).
//
// Also here: finding the Lean blocks in a reply, so the server can ask Lean
// about each and say under it what Lean said (`leanBlocks`, `labelled`).
// The Tutor's word that a snippet works is never the label.

import { lex } from "./proof.ts";

/** A scratch file is a few screens at most. */
export const MAX_SCRATCH = 20_000;

/** `#` commands that only look things up or work a value out inside Lean. */
export const HASH_ALLOWED = ["check", "check_failure", "print", "reduce", "synth"];

const word = (w: string) => new RegExp(`(^|[^A-Za-z0-9_.'])${w.replace(/[+?]/g, "\\$&")}($|[^A-Za-z0-9_'])`);

/** What scratch Lean may not name, and why, in the Tutor's words. */
const REFUSED: { pattern: RegExp; name: string; why: string }[] = [
  ...["run_tac", "run_cmd", "run_elab", "run_meta", "by_elab", "elab", "elab_rules", "initialize", "builtin_initialize", "unsafe", "implemented_by", "extern", "native_decide"].map((name) => ({
    pattern: word(name),
    name,
    why: "it runs a program",
  })),
  { pattern: /\+native($|[^A-Za-z0-9_'])/, name: "+native", why: "it runs a program" },
  { pattern: /(^|[^A-Za-z0-9_'])native\s*:=/, name: "native :=", why: "it runs a program" },
  { pattern: /(^|[^A-Za-z0-9_'])Lean($|[^A-Za-z0-9_'])/, name: "Lean", why: "it is Lean's own programming interface" },
  { pattern: /(^|[^A-Za-z0-9_'])IO($|[^A-Za-z0-9_'])/, name: "IO", why: "it is how a Lean program reaches files and processes" },
  { pattern: word("include_str"), name: "include_str", why: "it reads a file" },
  { pattern: word("import"), name: "import", why: "the file already imports Mathlib, and nothing else may be loaded" },
  { pattern: word("set_option"), name: "set_option", why: "it changes Lean's settings" },
  { pattern: word("polyrith"), name: "polyrith", why: "it calls a service on the internet" },
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
  const { code, braceInString } = lex(lean);
  for (const [i, text] of code.split("\n").entries()) {
    for (const r of REFUSED) if (r.pattern.test(text)) found.push({ name: r.name, line: i + 1, message: `“${r.name}” is not run for the Tutor: ${r.why}.` });
    for (const m of text.matchAll(/#([A-Za-z_]+)/g)) {
      if (!HASH_ALLOWED.includes(m[1])) found.push({ name: `#${m[1]}`, line: i + 1, message: `“#${m[1]}” is not run for the Tutor. Of the # commands only ${HASH_ALLOWED.map((h) => `#${h}`).join(", ")} are; to work a value out use #reduce, or prove it with decide or norm_num.` });
    }
  }
  if (braceInString !== null) found.push({ name: "{", line: lean.slice(0, braceInString).split("\n").length, message: "A “{” inside a string is not accepted: Lean can read what follows it as code." });
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

/** The fenced blocks of a reply that are Lean: marked `lean`, or unmarked. */
export function leanBlocks(markdown: string): LeanBlock[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out: LeanBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    const open = /^(`{3,})\s*([A-Za-z0-9]*)\s*$/.exec(lines[i]);
    if (!open) continue;
    const close = new RegExp(`^\`{${open[1].length},}[ \\t]*$`);
    const buf: string[] = [];
    let j = i + 1;
    while (j < lines.length && !close.test(lines[j])) buf.push(lines[j++]);
    if (j < lines.length && (open[2] === "" || open[2].toLowerCase() === "lean" || open[2].toLowerCase() === "lean4")) out.push({ code: buf.join("\n"), after: j + 1 });
    i = j;
  }
  return out;
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

/** Every label starts with this, so the drawer can set them apart. */
export const LABEL_MARK = "Lean:";

export function verdictLine(v: BlockVerdict): string {
  // Lean's first line, unable to end the emphasis it sits in: no backticks,
  // and a star that is not markdown's (a name keeps its underscores).
  const first = (s: string) => s.split("\n")[0].replace(/`/g, "").replace(/\*/g, "∗").slice(0, 200);
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
    if (v) lines.splice(blocks[i].after, 0, "", verdictLine(v));
  }
  return lines.join("\n");
}
