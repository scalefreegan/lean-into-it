// What `npm run check:content` does beyond loading content/ the way the app
// does: every exercise's reference solution, and every Lean snippet shown in
// a lesson, is given to the real Lean. A lesson that shows Lean which Lean
// would refuse is a lesson that teaches something false.
//
// Solutions are judged exactly as a learner's answer is (checkExercise), so
// "the reference solution passes" means the exercise can be solved in the app.

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
  /** The line of the lesson file its first line is on (1-based); 0 if not found. */
  line: number;
}

const COMMAND =
  /^(@\[|(def|theorem|lemma|example|abbrev|instance|structure|inductive|class|open|namespace|section|end|variable|universe|attribute|set_option|noncomputable|private|protected|partial|unsafe|macro|notation|infix|infixl|infixr|prefix|postfix|#eval|#check|#print|#reduce)(?![\w.']))/;
/** `abs_lt : …` or `abs_add_le a b : …`: a library name (it has a `_` or a
 *  `.`, which the names of hypotheses in these lessons never do), perhaps
 *  applied to variables, then its statement. */
const SIGNATURE = /^([A-Za-z_][\w']*(?:\.[A-Za-z_][\w']*)*)((?:\s+[A-Za-z_][\w']*)*)\s*:\s*\S/;

export function classify(text: string): SnippetKind {
  // An outline with a gap in it is not meant to compile.
  if (text.includes("…")) return "fragment";
  const lines = text.split("\n").filter((l) => l.trim() && !l.trim().startsWith("--"));
  if (!lines.length) return "fragment";
  if (COMMAND.test(lines[0]!.trim())) return "commands";
  const signature = lines.length === 1 ? SIGNATURE.exec(lines[0]!.trim()) : null;
  if (signature && /[_.]/.test(signature[1]!) && !lines[0]!.includes("⊢")) return "signature";
  return "fragment";
}

/** The ```lean blocks of a lesson's prose, in order. `raw` is the lesson
 *  file's text, used only to say which line each is on. */
export function snippetsOf(lesson: Lesson, raw = ""): Snippet[] {
  const out: Snippet[] = [];
  const rawLines = raw.split("\n");
  let from = 0;
  for (const block of lesson.blocks) {
    if (block.type !== "prose") continue;
    const lines = block.markdown.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const open = /^(`{3,})(.*)$/.exec(lines[i]!);
      if (!open) continue;
      // A code block ends at a line of at least as many backticks as opened it.
      let j = i + 1;
      while (j < lines.length && !new RegExp(`^\`{${open[1]!.length},}\\s*$`).test(lines[j]!)) j++;
      if (open[2]!.trim() === "lean") {
        const body = lines.slice(i + 1, j);
        const text = body.join("\n");
        // Find it in the file: the fence line, then the same lines.
        let line = 0;
        for (let k = from; k < rawLines.length; k++) {
          if (rawLines[k] === lines[i] && body.every((b, n) => rawLines[k + 1 + n] === b)) {
            line = k + 2;
            from = k + 1 + body.length;
            break;
          }
        }
        if (text.trim()) out.push({ text, kind: classify(text), line });
      }
      i = j;
    }
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

/** A theorem shown as a statement alone gets a placeholder proof, so that
 *  the statement itself is checked. */
function completed(text: string): string {
  return /^(theorem|lemma)\b/.test(text.trim()) && !text.includes(":=") ? `${text.replace(/\s+$/, "")} := by sorry` : text;
}

export interface SnippetSource {
  source: string;
  /** For each snippet checked: the source line (0-based) its first line is on, and how many lines it has. */
  spans: { snippet: Snippet; start: number; length: number }[];
}

/**
 * One Lean file for a lesson's snippets. The lesson's `given` goes first, in
 * a namespace of its own, so that a snippet may show a definition the
 * exercises are also given (the lesson that introduces `len` both shows it
 * and gives it) and later snippets may use either. Snippets are cumulative:
 * a later one may use what an earlier one defined.
 */
export function snippetSource(given: string, snippets: Snippet[]): SnippetSource {
  const lines = HEADER.replace(/\n+$/, "").split("\n");
  lines.push("");
  if (given.trim()) lines.push("namespace LiiGiven", ...given.split("\n"), "end LiiGiven", "open LiiGiven", "");
  lines.push("namespace LiiSnippet");
  const spans: SnippetSource["spans"] = [];
  for (const snippet of snippets) {
    if (snippet.kind === "fragment") continue;
    const text =
      snippet.kind === "signature"
        ? // The name alone: its statement is written with variables the lesson leaves unsaid.
          `#check @${SIGNATURE.exec(snippet.text.trim())![1]}`
        : completed(snippet.text);
    const body = text.split("\n");
    spans.push({ snippet, start: lines.length, length: body.length });
    lines.push(...body, "");
  }
  lines.push("end LiiSnippet", "");
  return { source: lines.join("\n"), spans };
}

/** Where a diagnostic of the snippet file belongs: a snippet and a line of the lesson file. */
function place(spans: SnippetSource["spans"], d: LeanDiagnostic): { snippet: Snippet; line: number } | null {
  for (const s of spans) {
    if (d.start.line >= s.start && d.start.line < s.start + s.length) return { snippet: s.snippet, line: s.snippet.line ? s.snippet.line + (d.start.line - s.start) : 0 };
  }
  return null;
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
  /** The folder the content was loaded from, to read lesson files for line numbers and `given`. */
  dir: string;
  /** Check only these lesson ids. */
  only?: string[];
  /** Called as each lesson finishes. */
  onLesson?: (lesson: Lesson, problems: ContentProblem[], counts: { solutions: number; snippets: number }) => void;
}

/** Check one exercise's reference solution as the app would check a learner's answer. */
export async function checkSolution(lean: LeanServer, exercise: Exercise): Promise<{ problems: string[]; options: number }> {
  const problems: string[] = [];
  const reply = await checkExercise(lean, exercise, exercise.solution);
  if (!reply.solved || reply.goals.length) problems.push(`exercise "${exercise.id}": the reference solution is not accepted: ${whyNot(reply)}`);
  let options = 0;
  // A choice that Lean also accepts would be marked right in the app, whatever the lesson says after it.
  for (const option of exercise.options.filter((o) => o !== exercise.solution)) {
    options++;
    if ((await checkExercise(lean, exercise, option)).solved) problems.push(`exercise "${exercise.id}": Lean also accepts the option \`${option}\`, so it is not a wrong answer`);
  }
  return { problems, options };
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
    let raw = "";
    try {
      raw = fs.readFileSync(path.join(opts.dir, lesson.file), "utf8");
    } catch {
      // Line numbers and the lesson's given are lost; the snippets are still checked.
    }
    const snippets = snippetsOf(lesson, raw);
    const { source, spans } = snippetSource(lessonGiven(raw), snippets);
    pass.counts.fragments += snippets.length - spans.length;
    if (spans.length) {
      const result = await lean.check("check-content", source);
      for (const d of result.diagnostics.filter((x) => x.severity === "error")) {
        const at = place(spans, d);
        // An error outside every snippet is in the lesson's given, which the solutions have already tried.
        if (!at) continue;
        problem(`${at.snippet.kind === "signature" ? "the library fact named" : "Lean snippet"}${at.line ? ` at line ${at.line}` : ""}: ${oneLine(d.message)}`);
      }
      for (const s of spans) pass.counts[s.snippet.kind === "signature" ? "signatures" : "snippets"]++;
    }
    pass.problems.push(...found);
    opts.onLesson?.(lesson, found, { solutions: lesson.exercises.length, snippets: spans.length });
  }
  return pass;
}

export interface Coverage {
  /** Concepts a lesson lists that no exercise tests. */
  untested: { concept: string; lesson: string }[];
  /** Per level: the moves it says it introduces that no exercise of that level or an earlier one uses. */
  unexercised: { level: number; moves: string[] }[];
  /** Levels with no lesson yet. */
  empty: number[];
  /** Topics the curriculum still lists as to be written. */
  topics: { level: number; topic: string }[];
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
      .flatMap((l) => l.exercises.map((e) => `${e.proof}\n${e.solution}`))
      .join("\n");
    const moves = level.moves.filter((m) => !uses(text, m));
    if (moves.length && level.status !== "outline") unexercised.push({ level: level.id, moves });
  }
  const empty = content.levels.filter((l) => !content.lessons.some((x) => x.level === l.id)).map((l) => l.id);
  const topics = content.levels.flatMap((l) => l.topics.map((topic) => ({ level: l.id, topic })));
  return { untested, unexercised, empty, topics };
}
