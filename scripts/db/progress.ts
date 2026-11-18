// The learner and what they have done: the only code that reads or writes
// the personal tables. Every function takes the learner id, so nothing here
// can touch rows without saying whose they are.
//
// Erasable TypeScript only, like schema.ts: `node --test` imports it as is.

import { and, asc, desc, eq, gte, lt, max } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema.ts";
import { attempts, chatMessages, hints, learners, levelOpens, solvedExercises } from "./schema.ts";

/** The server's pool-backed handle and the tests' PGlite one both fit. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export const DEFAULT_LEARNER_NAME = "Learner";

/** The one learner's id, creating the row the first time. Two requests
 *  racing on a new database could both insert; the oldest row always wins,
 *  so they still agree on who the learner is. */
export async function ensureLearner(db: Db): Promise<string> {
  const oldest = () => db.select({ id: learners.id }).from(learners).orderBy(asc(learners.createdAt), asc(learners.id)).limit(1);
  const [found] = await oldest();
  if (found) return found.id;
  await db.insert(learners).values({ name: DEFAULT_LEARNER_NAME });
  const [made] = await oldest();
  return made.id;
}

export interface AttemptInput {
  lessonId: string;
  exerciseId: string;
  body: string;
  solved: boolean;
  error?: string | null;
  /** The highest Tutor hint rung climbed on the exercise (hintRung). */
  rung?: number | null;
}

/** Record one check. Rung 3 (the Tutor gave the line) marks it assisted. A solved one also marks the exercise solved, keeping
 *  the first solution if it was solved before. */
export async function recordAttempt(db: Db, learnerId: string, a: AttemptInput): Promise<void> {
  await db.insert(attempts).values({ learnerId, lessonId: a.lessonId, exerciseId: a.exerciseId, body: a.body, solved: a.solved, error: a.error ?? null, rung: a.rung ?? null, assisted: (a.rung ?? 0) >= 3 });
  if (a.solved) {
    await db.insert(solvedExercises).values({ learnerId, lessonId: a.lessonId, exerciseId: a.exerciseId, solution: a.body }).onConflictDoNothing();
  }
}

export interface SolvedRow {
  lessonId: string;
  exerciseId: string;
  solution: string;
  solvedAt: Date;
}

export async function solvedFor(db: Db, learnerId: string): Promise<SolvedRow[]> {
  return db
    .select({ lessonId: solvedExercises.lessonId, exerciseId: solvedExercises.exerciseId, solution: solvedExercises.solution, solvedAt: solvedExercises.solvedAt })
    .from(solvedExercises)
    .where(eq(solvedExercises.learnerId, learnerId));
}

export async function isSolved(db: Db, learnerId: string, lessonId: string, exerciseId: string): Promise<boolean> {
  const rows = await db
    .select({ lessonId: solvedExercises.lessonId })
    .from(solvedExercises)
    .where(and(eq(solvedExercises.learnerId, learnerId), eq(solvedExercises.lessonId, lessonId), eq(solvedExercises.exerciseId, exerciseId)))
    .limit(1);
  return rows.length > 0;
}

export interface AttemptRow {
  lessonId: string;
  exerciseId: string;
  body: string;
  solved: boolean;
  assisted: boolean;
  createdAt: Date;
}

/** Every check on record for the learner, oldest first: what mastery is
 *  worked out from (web/shared/progress.ts). */
export async function attemptsFor(db: Db, learnerId: string): Promise<AttemptRow[]> {
  return db
    .select({ lessonId: attempts.lessonId, exerciseId: attempts.exerciseId, body: attempts.body, solved: attempts.solved, assisted: attempts.assisted, createdAt: attempts.createdAt })
    .from(attempts)
    .where(eq(attempts.learnerId, learnerId))
    .orderBy(asc(attempts.createdAt), asc(attempts.id));
}

/** Whether the exercise was solved on or after `since`. */
export async function solvedSince(db: Db, learnerId: string, lessonId: string, exerciseId: string, since: Date): Promise<boolean> {
  const rows = await db
    .select({ id: attempts.id })
    .from(attempts)
    .where(
      and(
        eq(attempts.learnerId, learnerId),
        eq(attempts.lessonId, lessonId),
        eq(attempts.exerciseId, exerciseId),
        eq(attempts.solved, true),
        gte(attempts.createdAt, since),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** How many checks of one exercise are on record. */
export async function attemptCount(db: Db, learnerId: string, lessonId: string, exerciseId: string): Promise<number> {
  const rows = await db
    .select({ id: attempts.id })
    .from(attempts)
    .where(and(eq(attempts.learnerId, learnerId), eq(attempts.lessonId, lessonId), eq(attempts.exerciseId, exerciseId)));
  return rows.length;
}

/* ------------------------------ the Tutor chat ----------------------------- */

/** The newest chat rows kept per learner; older ones are deleted on write. */
export const CHAT_KEEP = 400;

export type ChatRole = "user" | "assistant" | "note";

export interface ChatInput {
  role: ChatRole;
  text: string;
  /** A hint: the exercise it was for, and its rung (1-3). */
  lessonId?: string | null;
  exerciseId?: string | null;
  rung?: number | null;
}

export interface ChatRow {
  id: number;
  role: ChatRole;
  text: string;
  lessonId: string | null;
  exerciseId: string | null;
  rung: number | null;
  createdAt: Date;
}

const chatColumns = {
  id: chatMessages.id,
  role: chatMessages.role,
  text: chatMessages.text,
  lessonId: chatMessages.lessonId,
  exerciseId: chatMessages.exerciseId,
  rung: chatMessages.rung,
  createdAt: chatMessages.createdAt,
};

/** Add one chat line, then trim the transcript to its newest CHAT_KEEP rows. */
export async function appendChat(db: Db, learnerId: string, m: ChatInput, keep = CHAT_KEEP): Promise<ChatRow> {
  const [row] = await db
    .insert(chatMessages)
    .values({ learnerId, role: m.role, text: m.text, lessonId: m.lessonId ?? null, exerciseId: m.exerciseId ?? null, rung: m.rung ?? null })
    .returning(chatColumns);
  const [cut] = await db
    .select({ id: chatMessages.id })
    .from(chatMessages)
    .where(eq(chatMessages.learnerId, learnerId))
    .orderBy(desc(chatMessages.id))
    .offset(keep - 1)
    .limit(1);
  if (cut) await db.delete(chatMessages).where(and(eq(chatMessages.learnerId, learnerId), lt(chatMessages.id, cut.id)));
  return row as ChatRow;
}

/** The newest `limit` chat rows, oldest first. */
export async function chatFor(db: Db, learnerId: string, limit = CHAT_KEEP): Promise<ChatRow[]> {
  const rows = await db.select(chatColumns).from(chatMessages).where(eq(chatMessages.learnerId, learnerId)).orderBy(desc(chatMessages.id)).limit(limit);
  return (rows as ChatRow[]).reverse();
}

export async function clearChat(db: Db, learnerId: string): Promise<void> {
  await db.delete(chatMessages).where(eq(chatMessages.learnerId, learnerId));
}

/** Record that the Tutor gave a hint at `rung` on an exercise. */
export async function recordHint(db: Db, learnerId: string, lessonId: string, exerciseId: string, rung: number): Promise<void> {
  await db.insert(hints).values({ learnerId, lessonId, exerciseId, rung });
}

/**
 * The highest hint rung the Tutor gave on an exercise since `since` (the
 * start of the learner's local day); 0 for none. The ladder is per day: a
 * line seen today makes every check of the exercise today assisted, however
 * often it is checked; the next day, in review, it starts unaided again.
 */
export async function hintRung(db: Db, learnerId: string, lessonId: string, exerciseId: string, since: Date): Promise<number> {
  const [top] = await db
    .select({ rung: max(hints.rung) })
    .from(hints)
    .where(and(eq(hints.learnerId, learnerId), eq(hints.lessonId, lessonId), eq(hints.exerciseId, exerciseId), gte(hints.createdAt, since)));
  return top?.rung ?? 0;
}

/** How a level opened (schema.ts levelOpens). */
export type LevelOpenHow = "earned" | "anyway" | "placement";

export interface LevelOpenRow {
  level: number;
  how: LevelOpenHow;
  openedAt: Date;
}

/** Record that a level is open. A level already recorded keeps its first row. */
export async function recordLevelOpen(db: Db, learnerId: string, level: number, how: LevelOpenHow): Promise<void> {
  await db.insert(levelOpens).values({ learnerId, level, how }).onConflictDoNothing();
}

export async function levelOpensFor(db: Db, learnerId: string): Promise<LevelOpenRow[]> {
  const rows = await db.select({ level: levelOpens.level, how: levelOpens.how, openedAt: levelOpens.openedAt }).from(levelOpens).where(eq(levelOpens.learnerId, learnerId)).orderBy(asc(levelOpens.level));
  return rows.map((r) => ({ ...r, how: r.how as LevelOpenHow }));
}
