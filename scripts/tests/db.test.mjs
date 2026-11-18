import assert from "node:assert/strict";
import { test } from "node:test";
import { attemptCount, attemptsFor, ensureLearner, isSolved, recordAttempt, solvedFor } from "../db/progress.ts";
import { freshDb } from "./testdb.mjs";

// The real migrations on an in-process PGlite: no Postgres server, and
// nothing here can reach the lean_into_it database.

test("the learner is created once and found again", async (t) => {
  const { db, query, close } = await freshDb();
  t.after(close);
  const first = await ensureLearner(db);
  const second = await ensureLearner(db);
  assert.equal(first, second);
  assert.equal((await query("select count(*)::int as n from learners"))[0].n, 1);
});

test("a failed check is an attempt but not a solve", async (t) => {
  const { db, close } = await freshDb();
  t.after(close);
  const learner = await ensureLearner(db);
  await recordAttempt(db, learner, { lessonId: "l", exerciseId: "e", body: "exact hQ", solved: false, error: "Unknown identifier `hQ`" });
  assert.equal(await attemptCount(db, learner, "l", "e"), 1);
  assert.equal(await isSolved(db, learner, "l", "e"), false);
  assert.deepEqual(await solvedFor(db, learner), []);
});

test("solving keeps the first solution; solving again adds an attempt only", async (t) => {
  const { db, close } = await freshDb();
  t.after(close);
  const learner = await ensureLearner(db);
  await recordAttempt(db, learner, { lessonId: "l", exerciseId: "e", body: "exact hP", solved: true });
  await recordAttempt(db, learner, { lessonId: "l", exerciseId: "e", body: "apply hP", solved: true });
  assert.equal(await attemptCount(db, learner, "l", "e"), 2);
  assert.equal(await isSolved(db, learner, "l", "e"), true);
  const rows = await solvedFor(db, learner);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].solution, "exact hP");
  assert.ok(rows[0].solvedAt instanceof Date);
});

test("one learner's rows are not another's", async (t) => {
  const { db, query, close } = await freshDb();
  t.after(close);
  const mine = await ensureLearner(db);
  const [{ id: other }] = await query("insert into learners (name) values ('Other') returning id");
  await recordAttempt(db, other, { lessonId: "l", exerciseId: "e", body: "exact hP", solved: true });
  assert.deepEqual(await solvedFor(db, mine), []);
  assert.equal(await isSolved(db, mine, "l", "e"), false);
  assert.equal(await attemptCount(db, mine, "l", "e"), 0);
  assert.equal((await solvedFor(db, other)).length, 1);
});

test("every check comes back for mastery, oldest first, and only the learner's own", async (t) => {
  const { db, query, close } = await freshDb();
  t.after(close);
  const mine = await ensureLearner(db);
  const [{ id: other }] = await query("insert into learners (name) values ('Other') returning id");
  await recordAttempt(db, mine, { lessonId: "l", exerciseId: "e", body: "intro h", solved: false, error: "unsolved goals" });
  await recordAttempt(db, other, { lessonId: "l", exerciseId: "e", body: "exact x", solved: true });
  await recordAttempt(db, mine, { lessonId: "l", exerciseId: "e", body: "intro h\nexact h", solved: true });
  const rows = await attemptsFor(db, mine);
  assert.deepEqual(rows.map((r) => [r.body, r.solved]), [["intro h", false], ["intro h\nexact h", true]]);
  assert.ok(rows[0].createdAt instanceof Date);
});
