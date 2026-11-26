// content/ → Content. Reads curriculum.yaml and every lesson file, checks
// each against the format in docs/CONTENT.md and refuses what is wrong with
// a readable reason (Content.problems) instead of serving it. What an
// exercise kind or a widget takes is not written here: it is read from the
// registry (web/shared/registry.ts). Re-read on every request: the files
// are small, and an edit shows up at once.
//
// This checks shape only. Whether an exercise's reference solution really
// proves its statement is Lean's call (web/server/lean.test.ts).

import { isLadder, onBoard, resolveLadder, type Ladder } from "../shared/ladder.ts";
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { ROOT } from "../../scripts/env.mjs";
import type { Block, Content, ContentProblem, Exercise, GalleryEntry, Lesson, Level, PlannedConcept, Track } from "../shared/content.ts";
import { sortLessons, type TrueFalse } from "../shared/content.ts";
import { splitStatement, writeAnswer, type Witness } from "../shared/truefalse.ts";
import { proofLines, readSteps } from "../shared/paired.ts";
import { moveDoes, TACTIC_EXAMPLES } from "../shared/lab.ts";
import { checkParams, EXERCISE_KEYS, EXERCISES, isExerciseKind, isWidget, WIDGET_KEYS, WIDGETS } from "../shared/registry.ts";

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
    if (l.ladder !== undefined && !isLadder(l.ladder)) problem("curriculum.yaml", `level ${l.id}: \`ladder\` must be 1, 2, 3 or 4`);
    levels.push({
      id: l.id,
      title: str(l.title),
      summary: str(l.summary),
      status: l.status === "outline" ? "outline" : "written",
      topics: strings(l.topics),
      moves: strings(l.moves),
      ladder: isLadder(l.ladder) ? l.ladder : 1,
      ...readPlan(l, `level ${l.id}`, (message) => problem("curriculum.yaml", message)),
    });
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
  checkPlan(levels, tracks, lessons, (message) => problem("curriculum.yaml", message));
  const gallery = parseGallery(dir, levels, (message) => problem("gallery.yaml", message));
  return { tracks, levels, lessons: sortLessons(lessons, tracks, levels), ...(gallery ? { gallery } : {}), problems };
}

/** A level's plan in curriculum.yaml (docs/CONTENT.md): `concepts`,
 *  `planned` and `new_widgets`, each entry checked for shape on its own;
 *  how they refer to each other is checkPlan's, once the lessons are read. */
function readPlan(l: Raw, where: string, problem: (message: string) => void): Pick<Level, "concepts" | "planned" | "newWidgets"> {
  const list = (key: string): Raw[] => {
    if (l[key] === undefined) return [];
    if (!Array.isArray(l[key])) {
      problem(`${where}: \`${key}\` must be a list`);
      return [];
    }
    return l[key].filter((x): x is Raw => {
      if (!isRecord(x)) problem(`${where}: an entry of \`${key}\` must have fields: ${JSON.stringify(x)}`);
      return isRecord(x);
    });
  };
  const KEYS: Record<string, string[]> = { concepts: ["id", "title", "needs"], planned: ["id", "title", "track", "summary", "concepts", "widgets"], new_widgets: ["id", "does"] };
  const fields = (key: string, x: Raw): boolean => {
    const unknown = Object.keys(x).filter((k) => !KEYS[key].includes(k));
    if (unknown.length) problem(`${where}: \`${unknown[0]}\` is not a field of an entry of \`${key}\` (${KEYS[key].join(", ")}): ${JSON.stringify(x)}`);
    const notList = KEYS[key].filter((k) => ["needs", "concepts", "widgets"].includes(k) && x[k] !== undefined && !(Array.isArray(x[k]) && x[k].every((v) => typeof v === "string")));
    if (notList.length) problem(`${where}: \`${notList[0]}\` must be a list of names: ${JSON.stringify(x)}`);
    return !unknown.length && !notList.length;
  };
  const concepts = list("concepts").flatMap((c) => {
    if (!fields("concepts", c)) return [];
    if (!ID.test(str(c.id)) || !str(c.title)) {
      problem(`${where}: a concept needs an id (lowercase, hyphens) and a title: ${JSON.stringify(c)}`);
      return [];
    }
    return [{ id: str(c.id), title: str(c.title), needs: strings(c.needs) }];
  });
  const planned = list("planned").flatMap((p) => {
    if (!fields("planned", p)) return [];
    if (!ID.test(str(p.id)) || !str(p.title) || !str(p.track)) {
      problem(`${where}: a planned lesson needs an id (lowercase, hyphens), a title and a track: ${JSON.stringify(p)}`);
      return [];
    }
    return [{ id: str(p.id), title: str(p.title), track: str(p.track), summary: str(p.summary), concepts: strings(p.concepts), widgets: strings(p.widgets) }];
  });
  const newWidgets = list("new_widgets").flatMap((w) => {
    if (!fields("new_widgets", w)) return [];
    if (!ID.test(str(w.id)) || !str(w.does)) {
      problem(`${where}: a new widget needs an id (lowercase, hyphens) and what it \`does\`: ${JSON.stringify(w)}`);
      return [];
    }
    return [{ id: str(w.id), does: str(w.does) }];
  });
  return { concepts, planned, newWidgets };
}

/** What the levels' plans name must exist: each concept and planned lesson
 *  once, every concept a plan names declared or taught, no concept resting
 *  on itself, every track known, every widget registered or listed as new.
 *  A planned lesson whose id a lesson has is written, and must be where it
 *  was planned. */
function checkPlan(levels: Level[], tracks: Track[], lessons: Lesson[], problem: (message: string) => void): void {
  const declared = new Map<string, PlannedConcept>();
  for (const level of levels)
    for (const c of level.concepts) {
      if (declared.has(c.id)) problem(`level ${level.id}: the concept ${c.id} is declared twice`);
      else declared.set(c.id, c);
    }
  const known = new Set([...declared.keys(), ...lessons.flatMap((l) => l.concepts)]);
  const levelOfConcept = new Map<string, number>();
  for (const level of levels) for (const c of level.concepts) if (!levelOfConcept.has(c.id)) levelOfConcept.set(c.id, level.id);
  // Where a concept first comes: the level declaring it, or the earliest lesson teaching it.
  const earliest = new Map(levelOfConcept);
  for (const lesson of lessons) for (const c of lesson.concepts) if (!(earliest.get(c)! <= lesson.level)) earliest.set(c, lesson.level);
  // A declared concept is first taught at its level; later levels may come back to it.
  const before = (c: string, level: number, who: string) => {
    const at = levelOfConcept.get(c);
    if (at !== undefined && level < at) problem(`level ${at}: the concept ${c} is declared here but taught earlier, by ${who}, at level ${level}; give one of them a new id`);
  };
  for (const lesson of lessons) for (const c of lesson.concepts) before(c, lesson.level, `the lesson ${lesson.id}`);
  const newWidgets = new Set<string>();
  for (const level of levels)
    for (const w of level.newWidgets) {
      if (isWidget(w.id)) problem(`level ${level.id}: ${w.id} is a widget already; name it in a lesson's \`widgets\`, not under \`new_widgets\``);
      else if (newWidgets.has(w.id)) problem(`level ${level.id}: the new widget ${w.id} is listed twice`);
      newWidgets.add(w.id);
    }
  const plannedIds = new Set<string>();
  for (const level of levels) {
    for (const c of level.concepts)
      for (const n of c.needs) {
        if (!known.has(n)) problem(`level ${level.id}: the concept ${c.id} needs ${n}, which no level declares and no lesson teaches`);
        else if (earliest.get(n)! > level.id) problem(`level ${level.id}: the concept ${c.id} needs ${n}, which comes later, in level ${earliest.get(n)}`);
      }
    // A written level's moves are counted and listed (web/shared/progress.ts tacticsOf), so each needs its sentence and Lab example, which are app code.
    if (level.status !== "outline")
      for (const m of level.moves)
        if (!moveDoes(m) || !Object.hasOwn(TACTIC_EXAMPLES, m))
          problem(`level ${level.id}: the move ${m} has no sentence or no Lab example in web/shared/lab.ts, which a written level's moves need; until it has, keep the level \`status: outline\``);
    for (const p of level.planned) {
      if (plannedIds.has(p.id)) problem(`level ${level.id}: the planned lesson ${p.id} is listed twice`);
      plannedIds.add(p.id);
      if (!tracks.some((t) => t.id === p.track)) problem(`level ${level.id}: the planned lesson ${p.id} has track "${p.track}", which is not in curriculum.yaml`);
      for (const c of p.concepts) before(c, level.id, `the planned lesson ${p.id}`);
      for (const c of p.concepts) if (!known.has(c)) problem(`level ${level.id}: the planned lesson ${p.id} teaches ${c}, which no level declares and no lesson teaches`);
      for (const w of p.widgets) if (!isWidget(w) && !newWidgets.has(w)) problem(`level ${level.id}: the planned lesson ${p.id} uses the widget ${w}, which is neither registered nor under any level's \`new_widgets\``);
      const written = lessons.find((l) => l.id === p.id);
      if (written && (written.level !== level.id || written.track !== p.track))
        problem(`level ${level.id}: the planned lesson ${p.id} was written as level ${written.level}, track ${written.track} (${written.file}); move the plan or the lesson`);
    }
    // A lesson the plan does not list is placed by its track's orders (sortLessons), so a track's planned lessons keep them rising in plan order.
    const inPlan = level.planned.map((p) => lessons.find((l) => l.id === p.id && l.level === level.id)).filter((l) => l !== undefined);
    inPlan.forEach((b, i) => {
      const a = inPlan.slice(0, i).findLast((x) => x.track === b.track);
      if (a && b.order <= a.order)
        problem(`level ${level.id}: the planned lesson ${b.id} comes after ${a.id} in the plan, in the same track, so its \`order\` (${b.order}) must be above ${a.id}'s (${a.order}); a lesson the plan does not list is placed by these orders`);
    });
  }
  // A concept may not rest on itself, however far round.
  const state = new Map<string, "open" | "done">();
  const visit = (id: string, path: string[]): void => {
    if (state.get(id) === "done") return;
    if (state.get(id) === "open") return problem(`the concepts rest on each other in a circle: ${[...path.slice(path.indexOf(id)), id].join(" → ")}`);
    state.set(id, "open");
    for (const n of declared.get(id)?.needs ?? []) visit(n, [...path, id]);
    state.set(id, "done");
  };
  for (const id of declared.keys()) visit(id, []);
}

const GALLERY_KEYS = ["id", "title", "says", "who", "why", "level", "statement", "solution", "steps", "formal", "mathlib"];

/** content/gallery.yaml, the Lab's Famous Proofs (docs/CONTENT.md): its
 *  entries, each checked for shape; null when there is no such file. That
 *  each proof is a proof is Lean's call (web/server/lean.test.ts). */
function parseGallery(dir: string, levels: Level[], problem: (message: string) => void): GalleryEntry[] | null {
  const file = path.join(dir, "gallery.yaml");
  if (!fs.existsSync(file)) return null;
  let raw: unknown;
  try {
    raw = parseYaml(fs.readFileSync(file, "utf8"));
  } catch (e) {
    problem(`cannot be read: ${(e as Error).message}`);
    return [];
  }
  const entries: GalleryEntry[] = [];
  const list = isRecord(raw) && Array.isArray(raw.entries) ? raw.entries : null;
  if (!list) {
    problem("needs `entries:`, a list of proofs");
    return [];
  }
  for (const e of list) {
    const id = isRecord(e) ? str(e.id) : "";
    if (!isRecord(e) || !ID.test(id)) {
      problem(`an entry needs an id (lowercase, hyphens): ${JSON.stringify(e)}`);
      continue;
    }
    const wrong: string[] = [];
    for (const key of Object.keys(e)) if (!GALLERY_KEYS.includes(key)) wrong.push(`\`${key}\` is not a field of an entry (${GALLERY_KEYS.join(", ")})`);
    for (const key of ["title", "says", "who", "why", "statement", "solution"]) if (!str(e[key])) wrong.push(`needs \`${key}\``);
    if (e.formal !== undefined && typeof e.formal !== "string") wrong.push("`formal` must be text");
    if (e.mathlib !== undefined && !/^[\p{L}_][\p{L}\p{N}_'.]*$/u.test(str(e.mathlib))) wrong.push("`mathlib` must be one Lean name, as `irrational_sqrt_two`");
    if (typeof e.level !== "number" || !levels.some((l) => l.id === e.level)) wrong.push(`\`level\` must be one of the curriculum's levels (${levels.map((l) => l.id).join(", ")})`);
    const solution = typeof e.solution === "string" ? e.solution.replace(/\s+$/, "") : "";
    const stepProblems = readSteps(e.steps, proofLines(solution).length).problems;
    wrong.push(...stepProblems.map((m) => `\`steps\`: ${m}`));
    if (entries.some((x) => x.id === id)) wrong.push("its id is already used by another entry");
    if (wrong.length) {
      for (const m of wrong) problem(`entry "${id}": ${m}`);
      continue;
    }
    entries.push({
      id,
      title: str(e.title),
      says: str(e.says),
      who: str(e.who),
      why: str(e.why),
      level: e.level as number,
      statement: str(e.statement),
      solution,
      steps: (e.steps as string[]).map((s) => s.trim()),
      formal: str(e.formal),
      ...(str(e.mathlib) ? { mathlib: str(e.mathlib) } : {}),
    });
  }
  return entries;
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

const GIVEN_FORBIDS = /\b(sorry|admit|axiom)\b/;

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
  if (front.craft !== undefined && typeof front.craft !== "boolean") problem(file, "`craft` must be true or false");
  // Definitions every exercise of the lesson is about; an exercise may add its own.
  if (front.given !== undefined && typeof front.given !== "string") problem(file, "`given` must be text: Lean code after `given: |`");
  const lessonGiven = typeof front.given === "string" ? front.given.replace(/\s+$/, "") : "";
  // The same rule the registry applies to an exercise's own `given`: these
  // definitions go in front of every theorem of the lesson.
  if (GIVEN_FORBIDS.test(lessonGiven)) problem(file, "the lesson's `given` must not contain sorry, admit or an axiom");

  const exercises: Exercise[] = [];
  for (const e of Array.isArray(front.exercises) ? front.exercises : []) {
    const levelLadder = known.levels.find((l) => l.id === level)?.ladder ?? 1;
    const ex = parseExercise(e, concepts, lessonGiven, levelLadder, (message) => problem(file, message));
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
    craft: front.craft === true,
    blocks,
    exercises,
    file,
  };
}

function parseExercise(e: unknown, concepts: string[], lessonGiven: string, levelLadder: Ladder, problem: (message: string) => void): Exercise | null {
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
  if (!isExerciseKind(kind)) {
    problem(`${where}: kind "${kind}" is not known (web/shared/registry.ts lists ${Object.keys(EXERCISES).join(", ")})`);
    return null;
  }
  let ok = true;
  const bad = (message: string) => {
    problem(`${where}: ${message}`);
    ok = false;
  };
  if (!str(e.title)) bad("needs a title");
  // What the kind takes, and what is wrong with what it was given, is the registry's to say.
  for (const message of checkParams(EXERCISES[kind], e, EXERCISE_KEYS)) bad(message);
  const concept = str(e.concept) || concepts[0] || "";
  if (!concept) bad("needs a concept (or the lesson must list concepts)");
  if (!ok) return null;

  const ownGiven = typeof e.given === "string" ? e.given.replace(/\s+$/, "") : "";
  const truefalse = kind === "truefalse" ? trueFalseOf(e) : undefined;
  // Only a `prove` exercise has a board; any other kind is not one. `mode`
  // says whether it can be done on the board; a board rung says it can.
  const own = isLadder(e.ladder) ? e.ladder : undefined;
  const mode = kind !== "prove" ? "typed" : e.mode === "typed" || e.mode === "board" ? e.mode : own && !onBoard(own) ? "typed" : "board";
  return {
    id,
    kind,
    mode,
    ladder: kind === "prove" ? resolveLadder(own, mode, levelLadder) : 4,
    title: str(e.title),
    says: str(e.says),
    statement: str(e.statement).replace(/\s+/g, " "),
    given: [lessonGiven, ownGiven].filter(Boolean).join("\n\n"),
    moves: strings(e.moves),
    forbid: strings(e.forbid),
    proof: typeof e.proof === "string" ? e.proof.replace(/\s+$/, "") : "",
    options: strings(e.options).map((o) => o.trim()),
    // A fill is one line, compared with the options as written there.
    // A match's answer is the pairs as written: each sentence with its own line.
    solution: truefalse
      ? truefalse.solution
      : kind === "match"
        ? strings(e.english).map((_, i) => i).join(",")
        : kind === "flaw"
          ? String(e.flaw)
        : typeof e.solution !== "string"
          ? ""
          : kind === "fill" || kind === "predict" || kind === "read"
            ? e.solution.trim()
            : e.solution.replace(/\s+$/, ""),
    concept,
    ...(truefalse ? { truefalse: truefalse.spec } : {}),
    ...(kind === "predict" ? { predict: { before: typeof e.before === "string" ? e.before.replace(/\s+$/, "") : "", move: str(e.move).trim() } } : {}),
    ...(kind === "match" ? { pairs: { english: strings(e.english).map((x) => x.trim()), lean: strings(e.lean).map((x) => x.trim()) } } : {}),
    ...((kind === "read" || kind === "flaw") && typeof e.why === "string" ? { why: e.why.trim() } : {}),
    ...(kind === "flaw" ? { steps: strings(e.steps).map((x) => x.trim()) } : {}),
  };
}

/** A `truefalse` exercise's own fields, and its reference answer as an
 *  answer is written (web/shared/truefalse.ts). The registry has already
 *  checked them. */
export function trueFalseOf(e: Raw): { spec: TrueFalse; solution: string } {
  const truth = e.truth === true;
  const witness: Witness = e.witness === "proof" ? "proof" : "values";
  const proof = typeof e.solution === "string" ? e.solution.replace(/\s+$/, "") : "";
  const values = truth ? [] : str(e.counterexample).split(",").map((v) => v.trim());
  return {
    spec: { truth, why: str(e.why), close: str(e.close) || "norm_num", witness, names: splitStatement(str(e.statement))?.names ?? [] },
    solution: writeAnswer({ side: truth ? "true" : "false", values, body: proof }),
  };
}

/** A line that opens or closes a code fence: three or more backticks. */
const TICKS = /^(`{3,})/;
/** The two fences the loader acts on, written exactly. */
const BLOCK = /^```(exercise|widget)[ \t]*$/;
/** A fence that means to be one of them and is not written that way:
 *  indented, capitalised, spaced, longer, or with tildes. */
const NEAR_BLOCK = /^\s*(`{3,}|~{3,})\s*(exercise|widget)\s*$/i;

/**
 * Prose with two kinds of fence in it. ```exercise (just `id: <exercise
 * id>`) places an exercise; any exercise not placed follows at the end, in
 * declared order. ```widget (`type: <widget>` and its parameters) embeds a
 * widget, checked here against the registry so that the page never has to
 * draw one it was not given what it needs.
 *
 * Read line by line, as the page's markdown reads it (web/src/markdown.tsx):
 * a fence closes at a line of at least as many backticks and nothing else,
 * so a longer fence can quote a block without it being acted on. A block
 * fence that is nearly right, or never closed, would otherwise be shown to
 * the learner as a box of YAML with nothing said: it is refused.
 */
function parseBlocks(body: string, exercises: Exercise[], problem: (message: string) => void): Block[] {
  const blocks: Block[] = [];
  const placed = new Set<string>();
  const lines = body.split(/\r?\n/);
  let buf: string[] = [];
  const flush = () => {
    const markdown = buf.join("\n").trim();
    if (markdown) blocks.push({ type: "prose", markdown });
    buf = [];
  };
  let widgets = 0;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const kind = BLOCK.exec(line)?.[1];
    const near = NEAR_BLOCK.exec(line);
    if (near && !kind) {
      const want = near[2].toLowerCase();
      problem(`the line “${line.trim()}” looks like the start of ${want === "exercise" ? "an exercise" : "a widget"} block, which is written \`\`\`${want} exactly, at the start of a line`);
      buf.push(line);
      i++;
      continue;
    }
    const ticks = TICKS.exec(line)?.[1].length;
    if (!ticks) {
      buf.push(line);
      i++;
      continue;
    }
    const closes = new RegExp(`^\`{${ticks},}[ \\t]*$`);
    let end = i + 1;
    while (end < lines.length && !closes.test(lines[end])) end++;
    if (!kind) {
      // An ordinary code block is prose, taken whole: nothing in it is a block.
      buf.push(...lines.slice(i, end + 1));
      i = end + 1;
      continue;
    }
    if (kind === "widget") widgets++;
    if (end >= lines.length) {
      problem(`${kind === "widget" ? `widget block ${widgets}` : "an exercise block"} is opened with \`\`\`${kind} and never closed`);
      break;
    }
    flush();
    const text = lines.slice(i + 1, end).join("\n");
    i = end + 1;
    let parsed: unknown;
    let unreadable = "";
    try {
      parsed = parseYaml(text);
    } catch (e) {
      unreadable = (e as Error).message.split("\n")[0];
    }
    if (kind === "widget") {
      const block = parseWidget(parsed, unreadable, widgets, problem);
      if (block?.type === "widget" && block.widget === "informal-formal") {
        const wrong = pairingProblems(block.params, exercises);
        for (const message of wrong) problem(`widget block ${widgets} (informal-formal): ${message}`);
        if (wrong.length) continue;
      }
      if (block) blocks.push(block);
      continue;
    }
    const id = isRecord(parsed) ? str(parsed.id) : "";
    if (!exercises.some((e) => e.id === id)) problem(`an exercise block names "${id}", which is not in the frontmatter's exercises`);
    else if (placed.has(id)) problem(`exercise "${id}" is placed twice`);
    else {
      placed.add(id);
      blocks.push({ type: "exercise", id });
    }
  }
  flush();
  for (const e of exercises) if (!placed.has(e.id)) blocks.push({ type: "exercise", id: e.id });
  return blocks;
}

/** An informal-formal widget's pairing, against the lesson's exercises:
 *  the exercise is here and a proof, and every line named is in its solution. */
function pairingProblems(params: Record<string, unknown>, exercises: Exercise[]): string[] {
  if (params.lesson !== undefined) return ["`lesson` is for the Gallery and the Lab; in a lesson the exercise is the lesson's own"];
  const exercise = exercises.find((e) => e.id === params.exercise);
  if (!exercise) return [`there is no exercise "${String(params.exercise)}" in this lesson's frontmatter`];
  if (exercise.kind !== "prove") return [`exercise "${exercise.id}" is a ${exercise.kind}; the Lean side must be a proof (kind prove)`];
  return readSteps(params.steps, proofLines(exercise.solution).length).problems.map((m) => `\`steps\`: ${m}`);
}

/** One ```widget fence. `n` counts the lesson's widget blocks from 1, so a
 *  refusal says which one. */
function parseWidget(parsed: unknown, unreadable: string, n: number, problem: (message: string) => void): Block | null {
  if (unreadable || !isRecord(parsed)) {
    problem(`widget block ${n}: ${unreadable ? `is not valid YAML: ${unreadable}` : "must be a set of key: value lines, starting with type:"}`);
    return null;
  }
  const type = str(parsed.type);
  const where = `widget block ${n} (${type || "no type"})`;
  if (!isWidget(type)) {
    const given = parsed.type !== undefined && parsed.type !== null;
    const why = type ? `there is no widget called "${type}"` : given ? `\`type\` must be a widget's name, not ${JSON.stringify(parsed.type)}` : "needs `type`, the widget's name";
    problem(`${where}: ${why}. web/shared/registry.ts lists ${Object.keys(WIDGETS).join(", ")}`);
    return null;
  }
  const wrong = checkParams(WIDGETS[type], parsed, WIDGET_KEYS);
  for (const message of wrong) problem(`${where}: ${message}`);
  if (wrong.length) return null;
  const params: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed)) if (!(WIDGET_KEYS as readonly string[]).includes(key) && value !== null) params[key] = value;
  return { type: "widget", widget: type, params };
}
