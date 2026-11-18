import assert from "node:assert/strict";
import { test } from "node:test";
import { ensureLearner, recordAttempt } from "../../scripts/db/progress.ts";
import { freshDb } from "../../scripts/tests/testdb.mjs";
import { loadContent } from "./loader.ts";
import { setDb } from "./db.ts";
import { progressReply } from "./progress.ts";

// /api/progress on PGlite with the real migrations and the real content/
// (read only): mastery is worked out from the attempt rows.

test("/api/progress carries mastery per concept and per move, from the checks on record", async (t) => {
  const { db, close } = await freshDb();
  setDb(db);
  t.after(async () => {
    setDb(null);
    await close();
  });
  const lesson = loadContent().lessons.find((l) => l.exercises.length)!;
  const exercise = lesson.exercises[0];
  const learner = await ensureLearner(db);
  await recordAttempt(db, learner, { lessonId: lesson.id, exerciseId: exercise.id, body: "exact nope", solved: false, error: "Unknown identifier" });
  await recordAttempt(db, learner, { lessonId: lesson.id, exerciseId: exercise.id, body: "exact h", solved: true });
  const reply = await progressReply();
  assert.ok(reply.solved[lesson.id][exercise.id]);
  const concept = reply.mastery.concepts[exercise.concept];
  assert.equal(concept.attempts, 2);
  assert.equal(concept.correct, 1);
  assert.deepEqual(reply.mastery.tactics.exact.recent, [false, true]);
});
