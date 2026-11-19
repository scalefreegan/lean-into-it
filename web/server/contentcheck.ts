// What `npm run check:content` does beyond loading content/ the way the app
// does: every exercise's reference solution, and every Lean snippet shown in
// a lesson, is given to the real Lean. A lesson that shows Lean which Lean
// would refuse is a lesson that teaches something false.
//
// Solutions are judged exactly as a learner's answer is (checkExercise), so
// "the reference solution passes" means the exercise can be solved in the app.

import { spokenGaps, unsaidSymbols } from "../shared/tts/speakable.ts";
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { Content, ContentProblem, Exercise, Lesson } from "../shared/content.ts";
import { HEADER } from "../shared/proof.ts";
import type { CheckReply } from "../shared/wire.ts";
import { checkExercise } from "./check.ts";
import type { LeanDiagnostic, LeanServer } from "./lean/lsp.ts";

/** What a ```lean block in a lesson is, which decides how it is checked.
 *  `commands`: whole declarations (def, theorem, #eval…), compiled.
 *  `signature`: one line `name : statement` naming a library fact; the name
 *  is looked up. `fragment`: anything else (a proof state, a few tactic
 *  lines, a term, an outline with …), which cannot be compiled alone. */
export type SnippetKind = "commands" | "signature" | "fragment";

export interface Snippet {
  text: string;
  kind: SnippetKind;
  /** The line of the lesson file its first line is on (1-based). */
  line: number;
}

/** Lean text with its comments blanked out (line breaks kept, so lines still count). */
export function withoutComments(text: string): string {
  let out = "";
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const two = text.slice(i, i + 2);
    if (two === "/-") {
      depth++;
      i++;
    } else if (depth && two === "-/") {
      depth--;
      i++;
    } else if (!depth && two === "--") {
      while (i + 1 < text.length && text[i + 1] !== "\n") i++;
    } else if (!depth || text[i] === "\n") out += text[i];
  }
  return out;
}

const WORD = String.raw`(?![\p{L}\p{N}_.'])`;
/** Words that begin a declaration or a command. Any `#word` is one too. */
const KEYWORDS =
  "def|theorem|lemma|example|abbrev|instance|structure|inductive|class|opaque|axiom|mutual|deriving|open|export|namespace|section|end|variable|universe|attribute|set_option|omit|include|noncomputable|private|protected|partial|unsafe|local|scoped|macro|macro_rules|syntax|elab|notation|infix|infixl|infixr|prefix|postfix";
const COMMAND = new RegExp(String.raw`^(@\[|#[a-z_]+|(${KEYWORDS})${WORD})`, "u");
/** `abs_lt : …` or `abs_add_le a b : …`: a name, perhaps applied to
 *  variables, then its statement. */
const SIGNATURE = /^([\p{L}_][\p{L}\p{N}_'!?]*(?:\.[\p{L}_][\p{L}\p{N}_'!?]*)*)((?:\s+[\p{L}_][\p{L}\p{N}_']*)*)\s*:\s*\S/u;
/** A hypothesis written the Mathlib way (`h_pos`, `hx_pos`, `h1_le`), which is not a library name. */
const HYPOTHESIS = /^h[a-z]{0,2}\d*_/;

/** The library name a one-line block quotes, or null. A library name has a
 *  `_` or a `.` in it, which a hypothesis such as `hP` or `hxy` has not. */
export function signatureName(text: string): string | null {
  const lines = withoutComments(text).split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length !== 1 || lines[0]!.includes("⊢")) return null;
  const name = SIGNATURE.exec(lines[0]!)?.[1];
  return name && /[_.]/.test(name) && !HYPOTHESIS.test(name) ? name : null;
}

export function classify(text: string): SnippetKind {
  const code = withoutComments(text);
  // An outline with a gap in it is not meant to compile.
  if (code.includes("…")) return "fragment";
  const first = code.split("\n").map((l) => l.trim()).find(Boolean);
  if (!first) return "fragment";
  if (COMMAND.test(first)) return "commands";
  return signatureName(text) ? "signature" : "fragment";
}

/** The ```lean blocks (also ```lean4, or with words after it) of a lesson
 *  file, in order. A block quoted inside a longer fence is not one. Fences
 *  are read as the loader and the page read them. */
export function snippetsOf(raw: string): Snippet[] {
  const out: Snippet[] = [];
  const lines = raw.split(/\r?\n/);
  // Past the frontmatter, whose YAML may hold anything.
  let i = 0;
  if (lines[0] === "---") {
    i = lines.indexOf("---", 1) + 1;
    if (i === 0) return out;
  }
  for (; i < lines.length; i++) {
    const open = /^(`{3,})(.*)$/.exec(lines[i]!);
    if (!open) continue;
    // A code block ends at a line of at least as many backticks as opened it.
    const close = new RegExp(`^\`{${open[1]!.length},}\\s*$`);
    let j = i + 1;
    while (j < lines.length && !close.test(lines[j]!)) j++;
    if (/^lean4?$/.test(open[2]!.trim().split(/\s+/)[0]!)) {
      const text = lines.slice(i + 1, j).join("\n");
      if (text.trim()) out.push({ text, kind: classify(text), line: i + 2 });
    }
    i = j;
  }
  return out;
}

/** The lesson-wide `given` of a lesson file (the definitions its exercises
 *  are about), or "". The loader has already refused a file it cannot read. */
export function lessonGiven(raw: string): string {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  if (!m) return "";
  try {
    const front = parseYaml(m[1]!) as { given?: unknown } | null;
    return typeof front?.given === "string" ? front.given.replace(/\s+$/, "") : "";
  } catch {
    return "";
  }
}

export interface Declaration {
  /** The name declared, or "" (an example, a command). */
  name: string;
  /** The declaration's lines. */
  text: string;
}

const DECLARES = new RegExp(String.raw`^(?:@\[[^\]]*\]\s*)*(?:(?:private|protected|noncomputable|partial|unsafe)\s+)*(def|theorem|lemma|abbrev|instance|structure|inductive|class|opaque|axiom|example)${WORD}\s*([\p{L}_][\p{L}\p{N}_.'!?]*)?`, "u");

/** A block of Lean cut into its declarations and commands: each begins at a
 *  line that starts, unindented, with a keyword, an attribute or a `#`. A
 *  comment directly above belongs to what follows it. */
export function declarations(text: string): Declaration[] {
  const lines = text.split("\n");
  const code = withoutComments(text).split("\n");
  const starts: number[] = [];
  for (let i = 0; i < lines.length; i++) if (COMMAND.test(code[i]!)) starts.push(i);
  // An attribute on a line of its own belongs to the declaration under it.
  const heads = starts.filter((s, k) => k === 0 || !/^@\[[^\]]*\]\s*$/.test(code[starts[k - 1]!]!.trim()) || starts[k - 1] !== s - 1);
  const out: Declaration[] = [];
  for (let k = 0; k < heads.length; k++) {
    const from = k === 0 ? 0 : heads[k]!;
    const to = k + 1 < heads.length ? heads[k + 1]! : lines.length;
    const body = lines.slice(from, to).join("\n");
    const m = DECLARES.exec(withoutComments(body).trim().replace(/\s+/g, " "));
    out.push({ name: m && m[1] !== "example" ? (m[2] ?? "") : "", text: body });
  }
  return out;
}

/** A declaration as compared between a lesson's prose and its `given`:
 *  without comments, attributes or differences of spacing. */
const shape = (text: string) =>
  withoutComments(text)
    .replace(/@\[[^\]]*\]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** A theorem shown as a statement alone gets a placeholder proof, so that
 *  the statement itself is checked. */
function completed(text: string): string {
  return declarations(text)
    .map((d) => {
      const code = withoutComments(d.text);
      const m = DECLARES.exec(code.trim().replace(/\s+/g, " "));
      const bare = m && /^(theorem|lemma|example)$/.test(m[1]!) && !code.includes(":=") && !/^\s*\|/m.test(code);
      // The placeholder goes on the declaration's last line of code, so no line moves.
      if (!bare) return d.text;
      const lines = d.text.split("\n");
      const codeLines = code.split("\n");
      let last = lines.length - 1;
      while (last > 0 && !codeLines[last]!.trim()) last--;
      lines[last] = `${codeLines[last]!.replace(/\s+$/, "")} := by sorry`;
      return lines.join("\n");
    })
    .join("\n");
}

export interface SnippetSource {
  source: string;
  /** The source lines (0-based) the lesson's given is on. */
  given: { start: number; length: number } | null;
  /** For each snippet checked: the source line (0-based) its first line is on, and how many lines it has. */
  spans: { snippet: Snippet; start: number; length: number; skip?: number }[];
  /** What is wrong before Lean is asked: a shown definition that is not the one the exercises are given. */
  problems: { snippet: Snippet; message: string }[];
}

/**
 * One Lean file for a lesson's snippets, laid out as a learner's own file
 * would be: the lesson's `given` first, at the top level as the exercises
 * have it, then the snippets in order, so a later one may use what an
 * earlier one or the given defines, and a name the library already has is
 * refused as it would be in the Playground.
 *
 * A lesson may show a definition its exercises are also given (the lesson
 * that introduces `len` both shows it and gives it). Such a snippet must
 * show it as it is given; it is compiled in a namespace of its own, since
 * the name is taken.
 */
export function snippetSource(given: string, snippets: Snippet[]): SnippetSource {
  const lines = HEADER.replace(/\n+$/, "").split("\n");
  lines.push("");
  let givenSpan: SnippetSource["given"] = null;
  if (given.trim()) {
    const body = given.split("\n");
    givenSpan = { start: lines.length, length: body.length };
    lines.push(...body, "");
  }
  const givenDecls = new Map(declarations(given).filter((d) => d.name).map((d) => [d.name, shape(d.text)]));
  const spans: SnippetSource["spans"] = [];
  const problems: SnippetSource["problems"] = [];
  snippets.forEach((snippet, n) => {
    if (snippet.kind === "fragment") return;
    if (snippet.kind === "signature") {
      // The name alone: its statement is written with variables the lesson leaves unsaid.
      // `skip`: the comment lines above the name, so the problem is put on the name's own line.
      const skip = withoutComments(snippet.text).split("\n").findIndex((l) => l.trim());
      spans.push({ snippet, start: lines.length, length: 1, skip });
      lines.push(`#check @${signatureName(snippet.text)}`, "");
      return;
    }
    const shown = declarations(snippet.text).filter((d) => d.name && givenDecls.has(d.name));
    for (const d of shown) {
      if (shape(d.text) !== givenDecls.get(d.name)) problems.push({ snippet, message: `\`${d.name}\` is shown differently from the lesson's \`given\`, which is what the exercises use` });
    }
    const body = completed(snippet.text).split("\n");
    if (shown.length) lines.push(`namespace LiiShown${n}`);
    spans.push({ snippet, start: lines.length, length: body.length });
    lines.push(...body);
    if (shown.length) lines.push(`end LiiShown${n}`);
    lines.push("");
  });
  return { source: lines.join("\n"), given: givenSpan, spans, problems };
}

/** Where a diagnostic of the snippet file belongs. One that is on no
 *  snippet's own lines (an unclosed comment is reported at the end of the
 *  file) is put to the snippet before it: nothing Lean said is dropped. */
function place(src: SnippetSource, d: LeanDiagnostic): { where: string; snippet: Snippet | null } {
  const line = d.start.line;
  const at = (s: Snippet, n: number) => `${s.kind === "signature" ? "the library fact named" : "Lean snippet"} at line ${n}`;
  for (const s of src.spans) if (line >= s.start && line < s.start + s.length) return { where: at(s.snippet, s.snippet.line + (line - s.start) + (s.skip ?? 0)), snippet: s.snippet };
  const before = src.spans.filter((s) => s.start <= line).pop();
  if (before) return { where: `after the Lean snippet at line ${before.snippet.line} (what follows it in the lesson may not have been checked)`, snippet: before.snippet };
  return { where: src.given && line >= src.given.start ? "the lesson's `given`" : "before the lesson's first Lean snippet", snippet: null };
}

const oneLine = (message: string) => message.trim().replace(/\s*\n\s*/g, " ⏎ ");

/** Why a reply to the reference solution is not "solved", in a sentence. */
export function whyNot(reply: CheckReply): string {
  if (reply.forbidden.length) return `it uses ${reply.forbidden.map((f) => `\`${f}\``).join(", ")}, which the exercise forbids`;
  if (reply.refusal) return reply.refusal;
  if (reply.error) return `Lean says${reply.error.line === null ? "" : `, at line ${reply.error.line + 1} of the solution`}: ${oneLine(reply.error.message)}`;
  if (reply.goals.length) return `it leaves ${reply.goals.length === 1 ? "a goal" : `${reply.goals.length} goals`} unproved: ⊢ ${reply.goals[0]!.target}`;
  return "Lean did not accept it";
}

export interface LeanPass {
  problems: ContentProblem[];
  counts: { lessons: number; solutions: number; options: number; snippets: number; signatures: number; fragments: number };
}

export interface LeanPassOptions {
  /** The folder the content was loaded from: lesson files are read again for their snippets. */
  dir: string;
  /** Check only these lesson ids. */
  only?: string[];
  /** Called as each lesson finishes. */
  onLesson?: (lesson: Lesson, problems: ContentProblem[], counts: { solutions: number; snippets: number; signatures: number }) => void;
}

/** Lean itself failing on one item (out of time, crashed, stopped) is that item's problem; the run goes on. */
const failure = (e: unknown) => `Lean could not check it: ${oneLine((e as Error).message)}`;

/** Check one exercise's reference solution as the app would check a learner's answer. */
export async function checkSolution(lean: LeanServer, exercise: Exercise): Promise<{ problems: string[]; options: number }> {
  const problems: string[] = [];
  try {
    const reply = await checkExercise(lean, exercise, exercise.solution);
    if (!reply.solved || reply.goals.length) problems.push(`exercise "${exercise.id}": the reference solution is not accepted: ${whyNot(reply)}`);
  } catch (e) {
    problems.push(`exercise "${exercise.id}": the reference solution: ${failure(e)}`);
  }
  let options = 0;
  // A choice that Lean also accepts would be marked right in the app, whatever the lesson says after it.
  for (const option of exercise.options.filter((o) => o !== exercise.solution)) {
    options++;
    try {
      if ((await checkExercise(lean, exercise, option)).solved) problems.push(`exercise "${exercise.id}": Lean also accepts the option \`${option}\`, so it is not a wrong answer`);
    } catch (e) {
      problems.push(`exercise "${exercise.id}": the option \`${option}\`: ${failure(e)}`);
    }
  }
  return { problems, options };
}

/** A lesson's snippets against Lean. `raw` is the lesson file's text. */
export async function checkSnippets(lean: LeanServer, raw: string): Promise<{ problems: string[]; snippets: number; signatures: number; fragments: number }> {
  const snippets = snippetsOf(raw);
  const src = snippetSource(lessonGiven(raw), snippets);
  const problems = src.problems.map((p) => `Lean snippet at line ${p.snippet.line}: ${p.message}`);
  const signatures = src.spans.filter((s) => s.snippet.kind === "signature").length;
  const counts = { snippets: src.spans.length - signatures, signatures, fragments: snippets.length - src.spans.length };
  if (!src.spans.length) return { problems, ...counts };
  try {
    // The exercises' own document: its library is already loaded.
    const result = await lean.check("exercise", src.source);
    for (const d of result.diagnostics.filter((x) => x.severity === "error")) problems.push(`${place(src, d).where}: ${oneLine(d.message)}`);
  } catch (e) {
    problems.push(`the lesson's Lean snippets (they are compiled together): ${failure(e)}`);
  }
  return { problems, ...counts };
}

/** The Lean pass: every reference solution and every compilable snippet. */
export async function checkWithLean(lean: LeanServer, content: Content, opts: LeanPassOptions): Promise<LeanPass> {
  const pass: LeanPass = { problems: [], counts: { lessons: 0, solutions: 0, options: 0, snippets: 0, signatures: 0, fragments: 0 } };
  for (const lesson of content.lessons) {
    if (opts.only?.length && !opts.only.includes(lesson.id)) continue;
    const found: ContentProblem[] = [];
    const problem = (message: string) => void found.push({ file: lesson.file, message });
    pass.counts.lessons++;
    for (const exercise of lesson.exercises) {
      const { problems, options } = await checkSolution(lean, exercise);
      problems.forEach(problem);
      pass.counts.solutions++;
      pass.counts.options += options;
    }
    let seen = { snippets: 0, signatures: 0 };
    try {
      const result = await checkSnippets(lean, fs.readFileSync(path.join(opts.dir, lesson.file), "utf8"));
      result.problems.forEach(problem);
      pass.counts.snippets += result.snippets;
      pass.counts.signatures += result.signatures;
      pass.counts.fragments += result.fragments;
      seen = result;
    } catch (e) {
      problem(`its Lean snippets were not checked: ${(e as Error).message}`);
    }
    pass.problems.push(...found);
    opts.onLesson?.(lesson, found, { solutions: lesson.exercises.length, snippets: seen.snippets, signatures: seen.signatures });
  }
  return pass;
}

export interface Coverage {
  /** Concepts a lesson lists that no exercise tests. */
  untested: { concept: string; lesson: string }[];
  /** Per level: the moves it says it introduces whose word appears in no
   *  solution of that level or an earlier one (`induction'` counts as
   *  `induction`; a word used as a term, as in `exact rfl`, counts too). */
  unexercised: { level: number; moves: string[] }[];
  /** Levels with no lesson yet. */
  empty: number[];
  /** Topics the curriculum still lists as to be written. */
  topics: { level: number; topic: string }[];
}

/** What Listen mode cannot say well yet (web/shared/tts/say.ts): the `code`
 *  spans of each lesson's prose with no written spoken form that the tables
 *  are not sure of, and the symbols in its prose, titles and claims that no
 *  table has. Never a failure: a list to write from. */
export function spokenCoverage(content: Content): { formulas: { lesson: string; code: string; said: string }[]; symbols: { lesson: string; symbols: string[] }[] } {
  const formulas: { lesson: string; code: string; said: string }[] = [];
  const symbols: { lesson: string; symbols: string[] }[] = [];
  for (const lesson of content.lessons) {
    const read = [...lesson.blocks.flatMap((b) => (b.type === "prose" ? [b.markdown] : [])), ...lesson.exercises.flatMap((e) => [e.title, e.says])];
    const seen = new Set<string>();
    for (const text of read) {
      for (const gap of spokenGaps(text)) {
        if (seen.has(gap.code)) continue;
        seen.add(gap.code);
        formulas.push({ lesson: lesson.id, ...gap });
      }
    }
    const unsaid = [...new Set(read.flatMap(unsaidSymbols))];
    if (unsaid.length) symbols.push({ lesson: lesson.id, symbols: unsaid });
  }
  return { formulas, symbols };
}

/** What the curriculum promises and does not yet deliver. Never a failure: a list to write from. */
export function coverage(content: Content): Coverage {
  const tested = new Set(content.lessons.flatMap((l) => l.exercises.map((e) => e.concept)));
  const untested = content.lessons.flatMap((l) => l.concepts.filter((c) => !tested.has(c)).map((concept) => ({ concept, lesson: l.id })));
  const uses = (text: string, move: string) => new RegExp(`(^|[^\\w'?!.])${move.replace(/[?]/g, "\\?")}(?![\\w?!])`, "m").test(text);
  const unexercised: Coverage["unexercised"] = [];
  for (const level of content.levels) {
    const text = content.lessons
      .filter((l) => l.level <= level.id)
      .flatMap((l) => l.exercises.map((e) => withoutComments(`${e.proof}\n${e.solution}`)))
      .join("\n");
    const moves = level.moves.filter((m) => !uses(text, m));
    if (moves.length && level.status !== "outline") unexercised.push({ level: level.id, moves });
  }
  const empty = content.levels.filter((l) => !content.lessons.some((x) => x.level === l.id)).map((l) => l.id);
  const topics = content.levels.flatMap((l) => l.topics.map((topic) => ({ level: l.id, topic })));
  return { untested, unexercised, empty, topics };
}
