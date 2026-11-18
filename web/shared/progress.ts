// Mastery: how well the learner knows each concept and each move, from
// what they have done. Pure, like the rest of web/shared/: the server reads
// the attempt rows and the content, and hands both in. Nothing is stored
// but the attempts themselves, so the score can never drift from them, and
// a change to how it is worked out applies to the whole history at once.
//
// The model is Fret Not's (../fret-not/web/shared/progress.ts): each
// answer is right or wrong, the last RECENT_WINDOW of them are kept, and
// newer ones weigh more. A concept or move is mastered at MASTERY_THRESHOLD
// with at least MIN_ATTEMPTS answers.
//
// What counts as an answer here:
//   - every recorded check of an exercise is one answer for the exercise's
//     concept: a proof Lean accepted is right, a refused one is wrong. A
//     check that repeats the one before it on the same exercise (the same
//     proof, the same verdict: Check pressed again) is not a new answer;
//   - an accepted proof is a right answer for each move it uses;
//   - on the proof board, a refused check is a wrong answer for the move on
//     its last line, which is the move that was just refused. A typed proof
//     that is refused counts against its concept only: where in it Lean
//     stopped is not on record, and its last line may be a move that worked.
// An assisted check (the Tutor's last hint rung gave the line) is seen but
// proves nothing: it counts as an attempt and adds no answer.
//
// Spaced review is the same replay. A concept or move that becomes mastered
// enters box 1, due the next calendar day. The first answer on or after the
// day it is due is its review: right moves it up a box (a longer gap, by
// REVIEW_INTERVAL_DAYS), wrong moves it down two boxes (not below 1) and
// makes it due tomorrow, assisted (on or before the day) keeps its box and
// makes it due tomorrow: the line was given, so it is asked again. Answers
// before it is due change its score only. Once in review it stays mastered:
// a few refused moves do not un-learn it, a missed review only brings it
// back sooner. Days are the learner's local days: server and browser are
// the same machine.
//
// Never change a concept id or a move id once live: these scores are keyed
// on them, through the lesson files.

import type { Content, Exercise } from "./content.ts";
import { lex } from "./proof.ts";

export const RECENT_WINDOW = 12;
export const MASTERY_THRESHOLD = 0.8;
export const MIN_ATTEMPTS = 4;
/** Days until the next review, by box. */
export const REVIEW_INTERVAL_DAYS = [1, 3, 7, 14, 30, 60, 120];
/** At most this many exercises in one review session. */
export const REVIEW_SIZE = 8;

/** One recorded check, as the server reads it from the attempts table. */
export interface AttemptLike {
  lessonId: string;
  exerciseId: string;
  body: string;
  solved: boolean;
  /** The Tutor gave the line (lii-2zo.1); absent until it exists. */
  assisted?: boolean;
  createdAt: Date | string;
}

export interface Mastery {
  /** 0–1, recency-weighted share right. */
  mastery: number;
  /** Checks seen, assisted ones included. */
  attempts: number;
  /** Right answers among them. */
  correct: number;
  mastered: boolean;
  /** ISO time of the last answer, or null. */
  lastSeenAt: string | null;
  /** Newest last, at most RECENT_WINDOW. */
  recent: boolean[];
  /** 0 while learning; 1+ in spaced review, a higher box a longer gap. */
  box: number;
  /** ISO start of the local day the next review falls due; null at box 0. */
  dueAt: string | null;
}

export interface MasteryMap {
  concepts: Record<string, Mastery>;
  tactics: Record<string, Mastery>;
}

/** The score for `id`, read as an OWN property: the maps are plain JSON, and
 *  a move named `constructor` must find nothing, not Object's built-in. */
export function masteryFor(map: Record<string, Mastery>, id: string): Mastery | undefined {
  return Object.hasOwn(map, id) ? map[id] : undefined;
}

/** Recency-weighted share right: the i-th oldest of n answers weighs i + 1. */
export function masteryOf(recent: boolean[]): number {
  let got = 0;
  let all = 0;
  recent.forEach((ok, i) => {
    all += i + 1;
    if (ok) got += i + 1;
  });
  return all ? got / all : 0;
}

export function blankMastery(): Mastery {
  return { mastery: 0, attempts: 0, correct: 0, mastered: false, lastSeenAt: null, recent: [], box: 0, dueAt: null };
}

/** Every move a level introduces, in curriculum order, each once. */
export function tacticsOf(content: Pick<Content, "levels">): string[] {
  return [...new Set(content.levels.flatMap((l) => l.moves))];
}

// A word stops at these, so `exact` is not found in `exact?` nor `rw` in
// `h.rw`. A trailing `'` is the primed form of the same move: the board
// writes `induction' n with n ih`.
const WORD_CHAR = "A-Za-z0-9_!?.";
const matcher = (t: string) => new RegExp(`(^|[^${WORD_CHAR}'])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'?($|[^${WORD_CHAR}'])`);

/** The moves of `tactics` a piece of Lean uses, comments and strings aside. */
export function tacticsIn(lean: string, tactics: string[]): string[] {
  const { bare } = lex(lean);
  return tactics.filter((t) => matcher(t).test(bare));
}

/** The last line of a body with code on it, strings and comments blanked:
 *  a line inside a string is not a move. */
function lastLine(body: string): string {
  const lines = lex(body).bare.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) if (lines[i].trim()) return lines[i];
  return "";
}

/** The start of the local day `d` falls on, `plus` days on. */
export function startOfDay(d: Date, plus = 0): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + plus);
}

/** Due once the local day `dueAt` names has begun. */
export function isDue(dueAt: string | null, now: Date): boolean {
  return dueAt !== null && Date.parse(dueAt) <= now.getTime();
}

const intervalFor = (box: number): number => REVIEW_INTERVAL_DAYS[Math.min(box, REVIEW_INTERVAL_DAYS.length) - 1];

function answer(map: Record<string, Mastery>, id: string, right: boolean | null, when: Date): void {
  if (!id || id === "__proto__") return;
  const prev = masteryFor(map, id) ?? blankMastery();
  const recent = right === null ? prev.recent : [...prev.recent, right].slice(-RECENT_WINDOW);
  const mastery = masteryOf(recent);
  const reached = recent.length >= MIN_ATTEMPTS && mastery >= MASTERY_THRESHOLD;
  let { box, dueAt } = prev;
  const due = (days: number) => startOfDay(when, days).toISOString();
  if (box === 0) {
    if (reached) [box, dueAt] = [1, due(intervalFor(1))];
  } else if (right === null) {
    // Assisted: the Tutor gave the line. Asked again tomorrow, whatever the box.
    if (prev.dueAt === null || Date.parse(prev.dueAt) > startOfDay(when, 1).getTime()) dueAt = due(1);
  } else if (isDue(prev.dueAt, when)) {
    if (right) {
      box = Math.min(box + 1, REVIEW_INTERVAL_DAYS.length);
      dueAt = due(intervalFor(box));
    } else [box, dueAt] = [Math.max(1, box - 2), due(1)];
  }
  map[id] = {
    mastery,
    attempts: prev.attempts + 1,
    correct: prev.correct + (right ? 1 : 0),
    mastered: box >= 1 || reached,
    lastSeenAt: when.toISOString(),
    recent,
    box,
    dueAt,
  };
}

/**
 * Concept and move mastery from the attempt rows, in any order (they are
 * sorted here by time). Rows for an exercise the content no longer has are
 * skipped: there is no concept to put them under.
 */
export function masteryFrom(content: Pick<Content, "lessons" | "levels">, rows: AttemptLike[]): MasteryMap {
  const tactics = tacticsOf(content).map((t) => ({ t, re: matcher(t) }));
  const used = (lean: string) => {
    const { bare } = lex(lean);
    return tactics.filter(({ re }) => re.test(bare)).map(({ t }) => t);
  };
  const exercises = new Map<string, Pick<Exercise, "concept" | "mode">>();
  for (const l of content.lessons) for (const e of l.exercises) exercises.set(`${l.id}\u0000${e.id}`, e);
  const concepts: Record<string, Mastery> = {};
  const byTactic: Record<string, Mastery> = {};
  const previous = new Map<string, string>();
  const time = (r: AttemptLike) => new Date(r.createdAt).getTime();
  for (const row of [...rows].sort((a, b) => time(a) - time(b))) {
    const key = `${row.lessonId}\u0000${row.exerciseId}`;
    const exercise = exercises.get(key);
    if (exercise === undefined) continue;
    // The same check again on the same day; on another day it is a review.
    const same = `${startOfDay(new Date(row.createdAt)).getTime()}\u0000${row.solved}\u0000${row.assisted ? 1 : 0}\u0000${row.body}`;
    if (previous.get(key) === same) continue;
    previous.set(key, same);
    const at = new Date(row.createdAt);
    const right = row.assisted ? null : row.solved;
    answer(concepts, exercise.concept, right, at);
    const moves = row.solved ? used(row.body) : exercise.mode === "board" ? used(lastLine(row.body)) : [];
    for (const t of moves) answer(byTactic, t, right, at);
  }
  return { concepts, tactics: byTactic };
}

/** A lesson's mastery: the mean over its exercises' concepts, each once,
 *  with concepts never tried counting 0. Null when nothing has been tried. */
export function lessonMastery(lesson: { exercises: { concept: string }[] }, map: MasteryMap): number | null {
  const ids = [...new Set(lesson.exercises.map((e) => e.concept))];
  const seen = ids.filter((id) => Object.hasOwn(map.concepts, id));
  if (!ids.length || !seen.length) return null;
  return ids.reduce((n, id) => n + (masteryFor(map.concepts, id)?.mastery ?? 0), 0) / ids.length;
}

/** The solved record of one exercise, read by own property only. */
export function solvedOf<T>(solved: Record<string, Record<string, T>>, lessonId: string, exerciseId: string): T | undefined {
  const mine = Object.hasOwn(solved, lessonId) ? solved[lessonId] : undefined;
  return mine && Object.hasOwn(mine, exerciseId) ? mine[exerciseId] : undefined;
}

/** Every one of a lesson's exercise concepts is mastered. */
export function lessonMastered(lesson: { exercises: { concept: string }[] }, map: MasteryMap): boolean {
  return lesson.exercises.length > 0 && lesson.exercises.every((e) => masteryFor(map.concepts, e.concept)?.mastered === true);
}

/** One exercise of a review session, and the due concept it reviews (an
 *  exercise has one concept, so one exercise reviews one concept). */
export interface ReviewItem {
  lessonId: string;
  exerciseId: string;
  concept: string;
}

/**
 * Today's review session: first every exercise whose latest solve was
 * assisted (the Tutor gave the line) on an earlier day, so it is tried again
 * unaided; then for each concept that is due (earliest due first), the
 * exercise testing it that was checked least recently, at most REVIEW_SIZE
 * in all, each exercise once. Only concepts are scheduled for review, not moves:
 * an exercise can be solved without the move it was offered for, and a
 * review the learner cannot clear is no use. A concept the content no
 * longer has an exercise for is never due.
 */
export function reviewSession(content: Pick<Content, "lessons">, map: MasteryMap, rows: AttemptLike[], now: Date): ReviewItem[] {
  const last = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.lessonId}\u0000${r.exerciseId}`;
    last.set(key, Math.max(last.get(key) ?? 0, new Date(r.createdAt).getTime()));
  }
  const due = Object.entries(map.concepts)
    .filter(([, m]) => m.box >= 1 && isDue(m.dueAt, now))
    .sort((a, b) => Date.parse(a[1].dueAt!) - Date.parse(b[1].dueAt!) || a[0].localeCompare(b[0]));
  const session: ReviewItem[] = [];
  const latestSolve = new Map<string, AttemptLike>();
  for (const r of rows) {
    if (!r.solved) continue;
    const key = `${r.lessonId}\u0000${r.exerciseId}`;
    const had = latestSolve.get(key);
    if (!had || new Date(r.createdAt).getTime() >= new Date(had.createdAt).getTime()) latestSolve.set(key, r);
  }
  const today = startOfDay(now).getTime();
  const taken = new Set<string>();
  const assisted = [...latestSolve.values()].filter((r) => r.assisted && new Date(r.createdAt).getTime() < today).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  for (const r of assisted) {
    if (session.length >= REVIEW_SIZE) break;
    const lesson = content.lessons.find((l) => l.id === r.lessonId);
    const exercise = lesson?.exercises.find((e) => e.id === r.exerciseId);
    if (!exercise) continue;
    taken.add(`${r.lessonId}\u0000${r.exerciseId}`);
    session.push({ lessonId: r.lessonId, exerciseId: r.exerciseId, concept: exercise.concept });
  }
  const covered = new Set(session.map((i) => i.concept));
  for (const [concept] of due) {
    if (session.length >= REVIEW_SIZE) break;
    if (covered.has(concept)) continue;
    const options = content.lessons.flatMap((l) => l.exercises.filter((e) => e.concept === concept).map((e) => ({ lessonId: l.id, exerciseId: e.id, seen: last.get(`${l.id}\u0000${e.id}`) ?? 0 })));
    const open = options.filter((o) => !taken.has(`${o.lessonId}\u0000${o.exerciseId}`)).sort((a, b) => a.seen - b.seen);
    if (!open.length) continue;
    session.push({ lessonId: open[0].lessonId, exerciseId: open[0].exerciseId, concept });
  }
  return session;
}
