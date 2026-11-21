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
import { bigserial, boolean, check, index, integer, jsonb, pgTable, primaryKey, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";

const tz = (name: string) => timestamp(name, { withTimezone: true });

/** Who is learning. One row today (scripts/db/progress.ts ensureLearner). */
export const learners = pgTable("learners", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** Listen mode: whether it is on, and the ElevenLabs voice and model it
   *  reads with. No voice until one is chosen. The model's default lives in
   *  web/server/tts-models.ts; null here means "the default". */
  listenMode: boolean("listen_mode").notNull().default(false),
  ttsVoiceId: text("tts_voice_id"),
  ttsModelId: text("tts_model_id"),
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
    /** The input ladder's rung the check was made at (web/shared/ladder.ts):
     *  1–2 the proof board, 3–4 the editor; null for other kinds, and for
     *  rows from before it was recorded. Not the hint rung above. */
    inputRung: smallint("input_rung"),
    /** Rung 3 had given them the line: the check is seen, not credited. */
    assisted: boolean("assisted").notNull().default(false),
    /** Working time before this check, in ms: how long the exercise had
     *  been on screen, with the tab showing, on this visit to the page
     *  (web/shared/clock.ts). Null when the browser sent none (or more than
     *  a day), and for rows from before it was recorded. */
    elapsedMs: integer("elapsed_ms"),
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
 * exercise it was for and its rung, for display; the record that counts is
 * `hints`. Trimmed to the newest CHAT_KEEP rows (scripts/db/progress.ts).
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

/**
 * Every hint rung the Tutor gave, kept apart from the chat so clearing or
 * trimming the chat cannot take back an assisted mark. The ladder is per
 * local day (scripts/db/progress.ts hintRung): a line seen today makes
 * every check of that exercise today assisted.
 */
export const hints = pgTable(
  "hints",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id, { onDelete: "cascade" }),
    lessonId: text("lesson_id").notNull(),
    exerciseId: text("exercise_id").notNull(),
    rung: smallint("rung").notNull(),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [check("hints_rung", sql`${t.rung} between 1 and 3`), index("hints_learner_exercise").on(t.learnerId, t.lessonId, t.exerciseId, t.createdAt)],
);

/**
 * The levels that have opened for the learner, so a level once open stays
 * open: after a missed review, and when the curriculum gains a concept the
 * learner has not met. `how`: `earned` (the level before it was mastered,
 * web/shared/progress.ts levelStatuses), `anyway` (the learner opened it
 * themselves from the Path) or `placement` (lii-zjf.4). One row per level,
 * the first way it opened.
 */
export const levelOpens = pgTable(
  "level_opens",
  {
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id, { onDelete: "cascade" }),
    level: smallint("level").notNull(),
    how: text("how").notNull(),
    openedAt: tz("opened_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.learnerId, t.level] }), check("level_opens_how", sql`${t.how} in ('earned', 'anyway', 'placement')`)],
);

/**
 * Concepts the placement check credited (lii-zjf.4): passed at a level the
 * learner tested out of, so they count as mastered without the attempts,
 * and come back for review on `due_at` (spread over the next one to two
 * weeks). The mastery replay (web/shared/progress.ts masteryFrom) reads
 * them with the attempts. One row per concept, the first credit.
 */
export const conceptCredits = pgTable(
  "concept_credits",
  {
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id, { onDelete: "cascade" }),
    concept: text("concept").notNull(),
    creditedAt: tz("credited_at").notNull().defaultNow(),
    dueAt: tz("due_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.learnerId, t.concept] })],
);

/**
 * The Tutor's research maps (Field notes, lii-2zo.4): a result in the news
 * mapped from the web, with its sources and the date it was made. `map` is
 * the map as web/shared/research.ts readMap checked it (ResearchMapBody);
 * `title` and `question` are copied out for the list. Not read by the
 * Tutor's history tools: they are not attempts.
 */
export const researchMaps = pgTable(
  "research_maps",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    title: text("title").notNull(),
    map: jsonb("map").notNull(),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [index("research_maps_learner_idx").on(t.learnerId, t.createdAt)],
);
