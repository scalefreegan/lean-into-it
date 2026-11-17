// content/ → Content. Reads curriculum.yaml and every lesson file, checks
// each against the format in docs/CONTENT.md and refuses what is wrong with
// a readable reason (Content.problems) instead of serving it. Re-read on
// every request: the files are small, and an edit shows up at once.
//
// This checks shape only. Whether an exercise's reference solution really
// proves its statement is Lean's call (web/server/lean.test.ts).

import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { ROOT } from "../../scripts/env.mjs";
import type { Block, Content, ContentProblem, Exercise, Lesson, Level, Track } from "../shared/content.ts";
import { sortLessons } from "../shared/content.ts";
import { isMove } from "../shared/moves.ts";

/** LEAN_INTO_IT_CONTENT_DIR lets tests point at a fixture; else <repo>/content. */
export function contentDir(): string {
  return process.env.LEAN_INTO_IT_CONTENT_DIR ? path.resolve(process.env.LEAN_INTO_IT_CONTENT_DIR) : path.join(ROOT, "content");
}

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

type Raw = Record<string, unknown>;
const isRecord = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim()) : []);

export function loadContent(dir = contentDir()): Content {
  const problems: ContentProblem[] = [];
  const problem = (file: string, message: string) => void problems.push({ file, message });

  let raw: unknown;
  try {
    raw = parseYaml(fs.readFileSync(path.join(dir, "curriculum.yaml"), "utf8"));
  } catch (e) {
    problem("curriculum.yaml", `cannot be read: ${(e as Error).message}`);
    return { tracks: [], levels: [], lessons: [], problems };
  }
  const root = isRecord(raw) ? raw : {};

  const tracks: Track[] = [];
  for (const t of Array.isArray(root.tracks) ? root.tracks : []) {
    if (!isRecord(t) || !ID.test(str(t.id)) || !str(t.title)) {
      problem("curriculum.yaml", `a track needs an id (lowercase, hyphens) and a title: ${JSON.stringify(t)}`);
      continue;
    }
    tracks.push({ id: str(t.id), title: str(t.title), summary: str(t.summary) });
  }

  const levels: Level[] = [];
  for (const l of Array.isArray(root.levels) ? root.levels : []) {
    if (!isRecord(l) || typeof l.id !== "number" || !Number.isInteger(l.id) || !str(l.title)) {
      problem("curriculum.yaml", `a level needs a whole-number id and a title: ${JSON.stringify(l)}`);
      continue;
    }
    if (levels.some((x) => x.id === l.id)) {
      problem("curriculum.yaml", `level ${l.id} is listed twice`);
      continue;
    }
    levels.push({ id: l.id, title: str(l.title), summary: str(l.summary), status: l.status === "outline" ? "outline" : "written", topics: strings(l.topics), moves: strings(l.moves) });
  }
  levels.sort((a, b) => a.id - b.id);

  const lessons: Lesson[] = [];
  const lessonsDir = path.join(dir, "lessons");
  for (const rel of lessonFiles(lessonsDir)) {
    const file = path.join("lessons", rel);
    let text: string;
    try {
      text = fs.readFileSync(path.join(lessonsDir, rel), "utf8");
    } catch (e) {
      problem(file, `cannot be read: ${(e as Error).message}`);
      continue;
    }
    const before = problems.length;
    const lesson = parseLesson(text, file, { tracks, levels }, problem);
    if (!lesson || problems.length > before) continue;
    if (path.dirname(rel) !== lesson.track) {
      problem(file, `is in lessons/${path.dirname(rel)}/ but says track: ${lesson.track}`);
      continue;
    }
    if (lessons.some((x) => x.id === lesson.id)) {
      problem(file, `the id ${lesson.id} is already used by another lesson`);
      continue;
    }
    lessons.push(lesson);
  }
  return { tracks, levels, lessons: sortLessons(lessons, tracks), problems };
}

/** lessons/<track>/<name>.md, as paths relative to lessons/, sorted. */
function lessonFiles(lessonsDir: string): string[] {
  const out: string[] = [];
  let tracks: fs.Dirent[];
  try {
    tracks = fs.readdirSync(lessonsDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const t of tracks) {
    if (!t.isDirectory() || t.name.startsWith(".")) continue;
    for (const f of fs.readdirSync(path.join(lessonsDir, t.name), { withFileTypes: true })) {
      if (f.isFile() && f.name.endsWith(".md") && !f.name.startsWith(".")) out.push(path.join(t.name, f.name));
    }
  }
  return out.sort();
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** One lesson file. Reports through `problem` and returns null (or a lesson
 *  the caller drops) when anything is wrong. */
export function parseLesson(
  text: string,
  file: string,
  known: { tracks: Track[]; levels: Level[] },
  problem: (file: string, message: string) => void,
): Lesson | null {
  const m = FRONTMATTER.exec(text);
  if (!m) {
    problem(file, "has no frontmatter (a block between --- lines at the top)");
    return null;
  }
  let front: unknown;
  try {
    front = parseYaml(m[1]);
  } catch (e) {
    problem(file, `frontmatter is not valid YAML: ${(e as Error).message}`);
    return null;
  }
  if (!isRecord(front)) {
    problem(file, "frontmatter must be a set of key: value lines");
    return null;
  }
  const id = str(front.id);
  const title = str(front.title);
  const track = str(front.track);
  const level = front.level;
  if (!ID.test(id)) problem(file, "needs an id (lowercase letters, digits and hyphens)");
  if (!title) problem(file, "needs a title");
  if (!known.tracks.some((t) => t.id === track)) problem(file, `track "${track}" is not in curriculum.yaml`);
  if (typeof level !== "number" || !known.levels.some((l) => l.id === level)) problem(file, `level ${JSON.stringify(level)} is not in curriculum.yaml`);
  const concepts = strings(front.concepts);

  const exercises: Exercise[] = [];
  for (const e of Array.isArray(front.exercises) ? front.exercises : []) {
    const ex = parseExercise(e, concepts, (message) => problem(file, message));
    if (!ex) continue;
    if (exercises.some((x) => x.id === ex.id)) {
      problem(file, `exercise id "${ex.id}" is used twice`);
      continue;
    }
    exercises.push(ex);
  }

  const blocks = parseBlocks(m[2], exercises, (message) => problem(file, message));
  return {
    id,
    title,
    track,
    level: typeof level === "number" ? level : 0,
    order: typeof front.order === "number" ? front.order : 0,
    concepts,
    summary: str(front.summary),
    blocks,
    exercises,
    file,
  };
}

function parseExercise(e: unknown, concepts: string[], problem: (message: string) => void): Exercise | null {
  if (!isRecord(e)) {
    problem("an exercise must be a set of key: value lines");
    return null;
  }
  const id = str(e.id);
  const where = `exercise "${id || "?"}"`;
  if (!ID.test(id)) {
    problem(`an exercise needs an id (lowercase letters, digits and hyphens): ${JSON.stringify(e.id)}`);
    return null;
  }
  const kind = str(e.kind) || "prove";
  if (kind !== "prove") {
    problem(`${where}: kind "${kind}" is not known (only "prove" so far)`);
    return null;
  }
  const mode = str(e.mode) || "board";
  if (mode !== "board" && mode !== "typed") {
    problem(`${where}: mode must be board or typed`);
    return null;
  }
  const statement = str(e.statement).replace(/\s+/g, " ");
  const solution = typeof e.solution === "string" ? e.solution.replace(/\s+$/, "") : "";
  const moves = strings(e.moves);
  let ok = true;
  const bad = (message: string) => {
    problem(`${where}: ${message}`);
    ok = false;
  };
  if (!str(e.title)) bad("needs a title");
  if (!str(e.says)) bad("needs `says`, the claim in plain English");
  if (!statement.includes(":")) bad("needs a Lean `statement` (binders, a colon, the claim)");
  if (/:=|\bsorry\b/.test(statement)) bad("the statement must not contain := or sorry");
  if (!solution.trim()) bad("needs a reference `solution`");
  for (const move of moves) if (!isMove(move)) bad(`move "${move}" is not in web/shared/moves.ts`);
  if (mode === "board" && !moves.length) bad("a board exercise needs `moves`");
  const concept = str(e.concept) || concepts[0] || "";
  if (!concept) bad("needs a concept (or the lesson must list concepts)");
  if (!ok) return null;
  return { id, kind: "prove", mode, title: str(e.title), says: str(e.says), statement, moves, forbid: strings(e.forbid), solution, concept };
}

const FENCE = /^```exercise[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/gm;

/** Prose with ```exercise fences (each just `id: <exercise id>`) placing the
 *  exercises. Any exercise not placed follows at the end, in declared order. */
function parseBlocks(body: string, exercises: Exercise[], problem: (message: string) => void): Block[] {
  const blocks: Block[] = [];
  const placed = new Set<string>();
  const prose = (markdown: string) => {
    if (markdown.trim()) blocks.push({ type: "prose", markdown: markdown.trim() });
  };
  let last = 0;
  for (const m of body.matchAll(FENCE)) {
    prose(body.slice(last, m.index));
    last = m.index + m[0].length;
    let id = "";
    try {
      const parsed: unknown = parseYaml(m[1]);
      id = isRecord(parsed) ? str(parsed.id) : "";
    } catch {
      /* reported below */
    }
    if (!exercises.some((e) => e.id === id)) problem(`an exercise block names "${id}", which is not in the frontmatter's exercises`);
    else if (placed.has(id)) problem(`exercise "${id}" is placed twice`);
    else {
      placed.add(id);
      blocks.push({ type: "exercise", id });
    }
  }
  prose(body.slice(last));
  for (const e of exercises) if (!placed.has(e.id)) blocks.push({ type: "exercise", id: e.id });
  return blocks;
}
