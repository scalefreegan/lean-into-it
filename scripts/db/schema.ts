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

import { sql } from "drizzle-orm";
import { bigserial, boolean, check, index, pgTable, primaryKey, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
    /** The highest Tutor hint rung (1-3) the learner had climbed on this
     *  exercise when they checked it; null when they asked for none. */
    rung: smallint("rung"),
    /** Rung 3 had given them the line: the check is seen, not credited. */
    assisted: boolean("assisted").notNull().default(false),
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

/**
 * The Tutor chat, one transcript per learner. `note` lines are the app's own
 * (a turn that failed, a rung-3 line Lean refused). A hint carries the
 * exercise it was for and its rung. Trimmed to the newest CHAT_KEEP rows
 * (scripts/db/progress.ts).
 */
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    text: text("text").notNull(),
    lessonId: text("lesson_id"),
    exerciseId: text("exercise_id"),
    rung: smallint("rung"),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [
    check("chat_messages_role", sql`${t.role} in ('user', 'assistant', 'note')`),
    check("chat_messages_rung", sql`${t.rung} is null or ${t.rung} between 1 and 3`),
    index("chat_messages_learner_idx").on(t.learnerId, t.id),
  ],
);
