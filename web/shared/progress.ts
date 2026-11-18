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
// A placement credit (lii-zjf.4, web/shared/placement.ts) is no attempt:
// at the time it was given, a concept below PLACEMENT_BOX is put in that
// box, mastered, due on the credit's own day, and MIN_ATTEMPTS right
// answers join its recent ones, so one miss afterwards lowers its score
// rather than emptying it.
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
/** The review box a placement credit puts a concept in: past the first
 *  short gaps, since the learner showed they knew it. */
export const PLACEMENT_BOX = 2;

/** A concept the placement check credited (scripts/db/progress.ts creditsFor). */
export interface CreditLike {
  concept: string;
  creditedAt: Date | string;
  dueAt: Date | string;
}

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
  /** ISO time the placement check credited it; absent if it never did. */
  creditedAt?: string;
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

function credit(map: Record<string, Mastery>, c: CreditLike): void {
  if (!c.concept || c.concept === "__proto__") return;
  const prev = masteryFor(map, c.concept) ?? blankMastery();
  if (prev.box >= PLACEMENT_BOX) return;
  const recent = [...prev.recent, ...Array.from({ length: MIN_ATTEMPTS }, () => true)].slice(-RECENT_WINDOW);
  map[c.concept] = { ...prev, recent, mastery: masteryOf(recent), mastered: true, box: PLACEMENT_BOX, dueAt: startOfDay(new Date(c.dueAt)).toISOString(), creditedAt: new Date(c.creditedAt).toISOString() };
}

/**
 * Concept and move mastery from the attempt rows, in any order (they are
 * sorted here by time), and the placement credits, each taken at its time
 * among them. Rows for an exercise the content no longer has are skipped:
 * there is no concept to put them under.
 */
export function masteryFrom(content: Pick<Content, "lessons" | "levels">, rows: AttemptLike[], credits: CreditLike[] = []): MasteryMap {
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
  const pending = [...credits].sort((a, b) => new Date(a.creditedAt).getTime() - new Date(b.creditedAt).getTime());
  const creditUpTo = (t: number) => {
    while (pending.length && new Date(pending[0].creditedAt).getTime() <= t) credit(concepts, pending.shift()!);
  };
  for (const row of [...rows].sort((a, b) => time(a) - time(b))) {
    creditUpTo(time(row));
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
  creditUpTo(Infinity);
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

/** A lesson the placement check let the learner skip: every concept it
 *  tests was credited and none has been tried since (the placement's own
 *  questions come before the credit). "Continue" on the Path passes over
 *  it; a lesson merely mastered part way through is not passed over. */
export function lessonCredited(lesson: { exercises: { concept: string }[] }, map: MasteryMap): boolean {
  return (
    lesson.exercises.length > 0 &&
    lesson.exercises.every((e) => {
      const m = masteryFor(map.concepts, e.concept);
      return m?.creditedAt !== undefined && (m.lastSeenAt === null || Date.parse(m.lastSeenAt) <= Date.parse(m.creditedAt));
    })
  );
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
 * in all, each exercise once, never one in a level `isOpen` says is locked
 * (a review must not open a level by the back door). Only concepts are scheduled for review, not moves:
 * an exercise can be solved without the move it was offered for, and a
 * review the learner cannot clear is no use. A concept the content no
 * longer has an exercise for is never due.
 */
export function reviewSession(content: Pick<Content, "lessons">, map: MasteryMap, rows: AttemptLike[], now: Date, isOpen: (level: number) => boolean = () => true): ReviewItem[] {
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
    const options = content.lessons.filter((l) => isOpen(l.level)).flatMap((l) => l.exercises.filter((e) => e.concept === concept).map((e) => ({ lessonId: l.id, exerciseId: e.id, seen: last.get(`${l.id}\u0000${e.id}`) ?? 0 })));
    const open = options.filter((o) => !taken.has(`${o.lessonId}\u0000${o.exerciseId}`)).sort((a, b) => a.seen - b.seen);
    if (!open.length) continue;
    session.push({ lessonId: open[0].lessonId, exerciseId: open[0].exerciseId, concept });
  }
  return session;
}

/* --------------------------------- levels --------------------------------- */

/** A level opens when this share of the concepts its gate level tests are
 *  mastered (Fret Not's rule). */
export const UNLOCK_FRACTION = 0.7;

/** Why a level is open: the first written level always is; `earned`, its gate
 *  was passed; `anyway`, the learner opened it themselves; `placement`, the
 *  placement check (lii-zjf.4); `worked`, the learner has checks on record in
 *  it (it was open before levels could lock, or was opened some other way). */
export type LevelOpenReason = "first" | "earned" | "anyway" | "placement" | "worked";

export interface LevelStatus {
  level: number;
  /** Outline levels, and written levels not yet open, are `locked`. */
  state: "locked" | "open" | "done";
  /** Why it is open; null while locked. */
  why: LevelOpenReason | null;
  /** This level's own tested concepts: how many are mastered, of how many. */
  mastered: number;
  total: number;
  /** The level whose mastery opens this one: the nearest earlier level whose
   *  lessons test a concept. Null when nothing gates it. */
  gate: number | null;
  gateMastered: number;
  gateTotal: number;
  /** Concepts of the gate level still to master before this one opens; 0
   *  once the gate is passed. */
  need: number;
}

/** What the database holds about a level having opened (scripts/db/progress.ts). */
export interface LevelOpened {
  level: number;
  how: "earned" | "anyway" | "placement";
}

const needOf = (mastered: number, total: number): number => Math.max(0, Math.ceil(total * UNLOCK_FRACTION - 1e-9) - mastered);

/**
 * Where each level stands, in content.levels order. A written level (one
 * with lessons, not an outline) is open when any of these holds:
 *   - it is the first written level;
 *   - it, or a later level, is on record as opened (`opened`), or has checks
 *     on record (`rows`): levels open in order, so opening one opens every
 *     written level before it, and a level once open never locks again;
 *   - the written level before it is open and its gate is passed: of the
 *     concepts the gate level's exercises test, UNLOCK_FRACTION are mastered.
 * The gate is the nearest earlier level whose lessons test a concept; a
 * level that tests none (an outline, or lessons without exercises) asks
 * nothing, so the next level looks back past it. An open level is done when
 * every exercise in it is solved (`solved`). Mastery is sticky once a
 * concept enters review (masteryFrom), so an earned level stays earned
 * unless the curriculum gains concepts; the server records a level when it
 * is earned (`earned` in `opened`) so that does not lock it again.
 */
export function levelStatuses(
  content: Pick<Content, "levels" | "lessons">,
  map: MasteryMap,
  opened: LevelOpened[],
  rows: Pick<AttemptLike, "lessonId">[],
  solved: Record<string, Record<string, unknown>>,
): LevelStatus[] {
  const levelOfLesson = new Map(content.lessons.map((l) => [l.id, l.level]));
  const recorded = new Map<number, LevelOpenReason>();
  for (const o of opened) if (!recorded.has(o.level)) recorded.set(o.level, o.how);
  for (const r of rows) {
    const level = levelOfLesson.get(r.lessonId);
    if (level !== undefined && !recorded.has(level)) recorded.set(level, "worked");
  }
  // The reason a level below a recorded one is open: the nearest recorded level at or above it.
  const reasonAt = (id: number): LevelOpenReason | null => {
    const above = [...recorded.keys()].filter((k) => k >= id).sort((a, b) => a - b);
    return above.length ? recorded.get(above[0])! : null;
  };
  const byLevel = new Map<number, LevelStatus>();
  let first = true;
  let prevOpen = true;
  let gate: { level: number; mastered: number; total: number } | null = null;
  for (const level of [...content.levels].sort((a, b) => a.id - b.id)) {
    const lessons = content.lessons.filter((l) => l.level === level.id);
    const concepts = [...new Set(lessons.flatMap((l) => l.exercises.map((e) => e.concept)))];
    const mastered = concepts.filter((c) => masteryFor(map.concepts, c)?.mastered === true).length;
    const written = level.status !== "outline" && lessons.length > 0;
    const need = first || !gate ? 0 : needOf(gate.mastered, gate.total);
    let why: LevelOpenReason | null = null;
    if (written) why = first ? "first" : (reasonAt(level.id) ?? (prevOpen && need === 0 ? "earned" : null));
    const exercises = lessons.flatMap((l) => l.exercises.map((e) => [l.id, e.id] as const));
    const done = why !== null && exercises.length > 0 && exercises.every(([l, e]) => solvedOf(solved, l, e) !== undefined);
    byLevel.set(level.id, {
      level: level.id,
      state: why === null ? "locked" : done ? "done" : "open",
      why,
      mastered,
      total: concepts.length,
      gate: first ? null : (gate?.level ?? null),
      gateMastered: first ? 0 : (gate?.mastered ?? 0),
      gateTotal: first ? 0 : (gate?.total ?? 0),
      need,
    });
    if (written) {
      first = false;
      prevOpen = why !== null;
    }
    if (concepts.length > 0) gate = { level: level.id, mastered, total: concepts.length };
  }
  return content.levels.map((l) => byLevel.get(l.id)!);
}

/** Is the level a lesson belongs to open? A level the statuses do not list
 *  (not loaded yet, or not in the curriculum) is treated as open: the
 *  loader reports a stray lesson, not the lock. */
export function levelOpen(statuses: LevelStatus[], level: number): boolean {
  const s = statuses.find((x) => x.level === level);
  return !s || s.state !== "locked";
}
