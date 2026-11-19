// What the Tutor wrote, judged before any of it is committed (bead
// lii-2zo.2). turn.ts is the git half: the turn writes in a worktree of its
// own. This is the other half: what must hold of that worktree's content/
// for its commit to be made at all.
//
//   1. The loader accepts it: no problem the turn introduced (turnProblems).
//   2. No id progress is keyed on has gone: lesson ids, exercise ids, and
//      the concept ids lessons teach (lostIds).
//   3. Lean accepts it (leanGate): every exercise the turn wrote or changed
//      is given to Lean with its reference solution, exactly as a learner's
//      answer would be, and every choice of a fill-the-gap exercise that is
//      not the solution must be refused; the Lean snippets of a lesson it
//      touched must compile. Lean, not the agent, vouches for what it wrote.
//
// WHICH LEAN. The Tutor's own: the sandboxed one (lean/lsp.ts tutorLean),
// since all of this is Lean the model wrote. Where there is no sandbox the
// gate cannot pass, and nothing the Tutor wrote lands.
//
// AFTER IT LANDS the lesson is the learner's like any other, and opening an
// exercise gives its statement and `given` to the learner's own Lean, which
// is not sandboxed. So before Lean is asked anything, the Lean of a lesson
// the turn touched is read by the word filter (web/shared/partner.ts
// scratchProblems): no `#eval`, no IO, no macros, nothing that runs a
// program or extends Lean. Only what the turn added counts (a person may
// have written `#eval` in a lesson; the Tutor may not add to it). That
// filter reads words and is not a sandbox: the commit is the record of what
// was written, and it is the owner's to read.

import fs from "node:fs";
import path from "node:path";
import type { Content, ContentProblem, Exercise, Lesson } from "../shared/content.ts";
import { scratchProblems } from "../shared/partner.ts";
import { checkSnippets, checkSolution, snippetsOf } from "./contentcheck.ts";
import type { LeanServer } from "./lean/lsp.ts";

/* ------------------------------ the loader's say ----------------------------- */

const key = (p: ContentProblem) => `${p.file}\u0000${p.message}`;

/** Problems in `after` that were not there before. */
export function newProblems(before: ContentProblem[], after: ContentProblem[]): ContentProblem[] {
  const had = new Set(before.map(key));
  return after.filter((p) => !had.has(key(p)));
}

export function problemList(problems: ContentProblem[]): string {
  return problems.map((p) => `- content/${p.file}: ${p.message}`).join("\n");
}

/**
 * Ids that were live before the turn and are gone after it. The loader
 * cannot see this (a renamed id is a valid file), but the learner's
 * progress is stored against lesson id + exercise id, and mastery against
 * concept ids. A lesson whose file no longer loads at all and has a loader
 * problem against it is covered by that problem.
 */
export function lostIds(before: Content, after: Content): ContentProblem[] {
  const out: ContentProblem[] = [];
  const now = new Map(after.lessons.map((l) => [l.id, l]));
  const loadedFiles = new Set(after.lessons.map((l) => l.file));
  const flagged = new Set(after.problems.map((p) => p.file));
  const kept = "The learner's progress is stored against it";
  for (const was of before.lessons) {
    const is = now.get(was.id);
    if (!is) {
      if (!loadedFiles.has(was.file) && flagged.has(was.file)) continue;
      out.push({ file: was.file, message: `lesson id "${was.id}" no longer exists (renamed or deleted). ${kept}: restore the lesson with exactly that id.` });
      continue;
    }
    const ids = new Set(is.exercises.map((e) => e.id));
    const gone = was.exercises.filter((e) => !ids.has(e.id)).map((e) => e.id);
    if (gone.length) out.push({ file: is.file, message: `exercise id${gone.length === 1 ? "" : "s"} removed or renamed: ${gone.join(", ")}. ${kept}: restore exactly ${gone.length === 1 ? "that id" : "those ids"} (add new exercises under new ids).` });
  }
  // A concept is known by the lessons that teach it and the exercises on it.
  // A lesson that no longer loads at all answers for itself (above), not for its concepts.
  const concepts = (lessons: Lesson[]) => new Set(lessons.flatMap((l) => [...l.concepts, ...l.exercises.map((e) => e.concept)]));
  const unreadable = after.lessons.length === 0 && after.problems.some((p) => p.file === "curriculum.yaml");
  if (!unreadable) {
    const have = concepts(after.lessons);
    const gone = [...concepts(before.lessons.filter((l) => loadedFiles.has(l.file) || !flagged.has(l.file)))].filter((c) => !have.has(c));
    if (gone.length) out.push({ file: "curriculum.yaml", message: `concept id${gone.length === 1 ? "" : "s"} no longer taught by any lesson: ${gone.join(", ")}. The learner's mastery is stored against ${gone.length === 1 ? "it" : "them"}: restore exactly ${gone.length === 1 ? "that id" : "those ids"}.` });
  }
  return out;
}

/** What the loader newly refuses, plus the ids the turn lost. */
export function turnProblems(before: Content, after: Content): ContentProblem[] {
  return [...newProblems(before.problems, after.problems), ...lostIds(before, after)];
}

/* --------------------------------- the filter -------------------------------- */

const indent = (text: string) => text.split("\n").map((l) => `  ${l}`).join("\n");

/** An exercise's Lean as one text the word filter can read: its `given`
 *  as written, then the statement and every answer under an `example`. */
export function exerciseLean(e: Exercise): string {
  const answers = [e.solution, e.proof, ...e.options].filter((t) => t.trim());
  return `${e.given.trim() ? `${e.given.trim()}\n` : ""}example ${e.statement.replace(/\s+/g, " ").trim()} := by\n${indent(answers.join("\n"))}`;
}

/** What the word filter refuses in a lesson: the names (`#eval`, `IO`, `macro` …), each with its reason. */
export function refusedLean(lesson: Lesson, raw: string): Map<string, string> {
  const found = new Map<string, string>();
  const note = (where: string, text: string) => {
    for (const p of scratchProblems(text)) if (!found.has(p.name)) found.set(p.name, `${where}: ${p.message}`);
  };
  for (const e of lesson.exercises) note(`exercise "${e.id}"`, exerciseLean(e));
  // Snippets Lean compiles (a fragment is only shown, never run).
  for (const s of snippetsOf(raw)) if (s.kind !== "fragment") note(`Lean snippet at line ${s.line}`, s.kind === "commands" ? s.text : indent(s.text));
  return found;
}

/* ---------------------------------- the gate --------------------------------- */

const read = (dir: string, file: string): string | null => {
  try {
    return fs.readFileSync(path.join(dir, file), "utf8");
  } catch {
    return null;
  }
};

export interface GateRun {
  before: Content;
  /** A content file's text as it was before the turn (null: it was not there). */
  beforeFile: (file: string) => Promise<string | null>;
  after: Content;
  afterDir: string;
  /** Asked between checks: a stopped turn asks Lean nothing more. */
  stopped?: () => boolean;
}

/** What the gate looked at, for the log and the tests. */
export interface GateResult {
  problems: ContentProblem[];
  lessons: number;
  solutions: number;
}

/** At most this many exercises are given to Lean in one turn: past it the turn is refused as too big to vouch for. */
export const MAX_GATED = 40;

/**
 * Lean's verdict on what the turn wrote. Only lessons whose file changed
 * are looked at, and of their exercises only those that are new or differ;
 * a lesson's snippets are compiled together, so they are checked whenever
 * its file changed.
 */
export async function leanGate(lean: LeanServer, run: GateRun): Promise<GateResult> {
  const problems: ContentProblem[] = [];
  const was = new Map(run.before.lessons.map((l) => [l.id, l]));
  let lessons = 0;
  let solutions = 0;
  const todo: { lesson: Lesson; raw: string; exercises: Exercise[] }[] = [];
  for (const lesson of run.after.lessons) {
    const raw = read(run.afterDir, lesson.file);
    const old = was.get(lesson.id);
    const oldRaw = old ? await run.beforeFile(old.file) : null;
    if (raw === null || raw === oldRaw) continue;
    // The word filter first: what it newly refuses is not given to Lean at all.
    const had = old && oldRaw !== null ? refusedLean(old, oldRaw) : new Map<string, string>();
    const refused = [...refusedLean(lesson, raw)].filter(([name]) => !had.has(name));
    if (refused.length) {
      for (const [, message] of refused) problems.push({ file: lesson.file, message: `${message} A lesson the Tutor writes may not use it.` });
      continue;
    }
    const before = new Map((old?.exercises ?? []).map((e) => [e.id, JSON.stringify(e)]));
    todo.push({ lesson, raw, exercises: lesson.exercises.filter((e) => before.get(e.id) !== JSON.stringify(e)) });
  }
  const asked = todo.reduce((n, t) => n + t.exercises.length, 0);
  if (asked > MAX_GATED) return { problems: [...problems, { file: todo[0].lesson.file, message: `this turn wrote or changed ${asked} exercises, more than Lean is asked to vouch for at once (${MAX_GATED}). Write fewer in one go.` }], lessons: 0, solutions: 0 };
  for (const { lesson, raw, exercises } of todo) {
    lessons++;
    for (const exercise of exercises) {
      if (run.stopped?.()) return { problems, lessons, solutions };
      solutions++;
      for (const message of (await checkSolution(lean, exercise)).problems) problems.push({ file: lesson.file, message });
    }
    if (run.stopped?.()) return { problems, lessons, solutions };
    for (const message of (await checkSnippets(lean, raw)).problems) problems.push({ file: lesson.file, message });
  }
  return { problems, lessons, solutions };
}

/* --------------------------------- the words --------------------------------- */

/** What the learner is told when the repair turn did not clear everything. */
export function remainingNote(problems: ContentProblem[]): string {
  const files = [...new Set(problems.map((p) => p.file))];
  return `The app could not accept ${files.length === 1 ? "one file" : `${files.length} files`} the Tutor wrote, even after a second try:\n${problemList(problems)}\nSo what it wrote in this turn was thrown away. It was written in a separate copy: content/ was never touched and nothing was committed. Ask again, naming the problem, to have another go.`;
}

/** The repair turn's ask: what the app and Lean refused. */
export function repairAsk(problems: ContentProblem[]): string {
  return `[SYSTEM]\nThe app checked content/ after your last turn and REFUSES what you wrote: the loader read every file, and Lean was given every exercise you wrote or changed with its reference solution. Problems your turn introduced:\n${problemList(problems)}\n\nFix every one now by editing the files (read docs/CONTENT.md and docs/CONTENT-REFERENCE.md again if a field is in doubt; try a statement with its solution in lean_check before writing it; do not get round a problem by deleting an exercise that was there before). This is your only follow-up turn: if anything is still refused afterwards, everything you wrote is thrown away. Then reply to the learner in one or two sentences on what you wrote and what you corrected, and end with the "Changed:" line for the whole change.`;
}
