// The whole database schema, shared by the dev server (web/server/db.ts),
// the setup CLI and the tests. drizzle-kit diffs this file against the last
// snapshot to write the SQL under ./migrations, which is what actually
// reaches a database; this file is never executed against one.
//
// Erasable TypeScript only (no enums, namespaces or parameter properties):
// Node runs it by stripping types, so `node --test` imports it directly.
//
// There are no logins. One learner row is created on first use and every
// personal row hangs off it, so a second learner later is another row, not a
// new design. The curriculum is not here: it is files under content/.
// Lesson and exercise ids are the ones in those files, which is why they
// must never change once live.

import { bigserial, boolean, index, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

const tz = (name: string) => timestamp(name, { withTimezone: true });

/** Who is learning. One row today (scripts/db/progress.ts ensureLearner). */
export const learners = pgTable("learners", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: tz("created_at").notNull().defaultNow(),
});

/**
 * Every recorded check of an exercise: each solved proof, each rejected
 * move on the proof board and each failed press of Check. The raw material
 * for mastery, review and the tutor (all to come). `body` is the learner's
 * proof text as sent; `error` is Lean's message when it refused.
 */
export const attempts = pgTable(
  "attempts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id, { onDelete: "cascade" }),
    lessonId: text("lesson_id").notNull(),
    exerciseId: text("exercise_id").notNull(),
    body: text("body").notNull(),
    solved: boolean("solved").notNull(),
    error: text("error"),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [index("attempts_learner_exercise").on(t.learnerId, t.lessonId, t.exerciseId, t.createdAt)],
);

/** The exercises a learner has solved, with the first proof that did it. */
export const solvedExercises = pgTable(
  "solved_exercises",
  {
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id, { onDelete: "cascade" }),
    lessonId: text("lesson_id").notNull(),
    exerciseId: text("exercise_id").notNull(),
    solution: text("solution").notNull(),
    solvedAt: tz("solved_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.learnerId, t.lessonId, t.exerciseId] })],
);
