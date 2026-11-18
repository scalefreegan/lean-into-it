// The learner and what they have done: the only code that reads or writes
// the personal tables. Every function takes the learner id, so nothing here
// can touch rows without saying whose they are.
//
// Erasable TypeScript only, like schema.ts: `node --test` imports it as is.

import { and, asc, eq, gte } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema.ts";
import { attempts, learners, solvedExercises } from "./schema.ts";

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
}

/** Record one check. A solved one also marks the exercise solved, keeping
 *  the first solution if it was solved before. */
export async function recordAttempt(db: Db, learnerId: string, a: AttemptInput): Promise<void> {
  await db.insert(attempts).values({ learnerId, lessonId: a.lessonId, exerciseId: a.exerciseId, body: a.body, solved: a.solved, error: a.error ?? null });
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
  createdAt: Date;
}

/** Every check on record for the learner, oldest first: what mastery is
 *  worked out from (web/shared/progress.ts). */
export async function attemptsFor(db: Db, learnerId: string): Promise<AttemptRow[]> {
  return db
    .select({ lessonId: attempts.lessonId, exerciseId: attempts.exerciseId, body: attempts.body, solved: attempts.solved, createdAt: attempts.createdAt })
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
