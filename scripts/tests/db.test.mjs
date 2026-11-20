import assert from "node:assert/strict";
import { test } from "node:test";
import { attemptCount, attemptsFor, solvedSince, ensureLearner, isSolved, readerAttempts, readerAttemptsForMastery, recordAttempt, solvedFor } from "../db/progress.ts";
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

test("solvedSince: a solve on or after a time", async (t) => {
  const { db, query, close } = await freshDb();
  t.after(close);
  const me = await ensureLearner(db);
  await recordAttempt(db, me, { lessonId: "l", exerciseId: "e", body: "exact h", solved: true });
  await recordAttempt(db, me, { lessonId: "l", exerciseId: "f", body: "exact h", solved: false, error: "x" });
  await query("update attempts set created_at = '2026-01-01T10:00:00Z' where exercise_id = 'e'");
  assert.equal(await solvedSince(db, me, "l", "e", new Date("2026-01-01T00:00:00Z")), true);
  assert.equal(await solvedSince(db, me, "l", "e", new Date("2026-01-02T00:00:00Z")), false, "solved before that day only");
  assert.equal(await solvedSince(db, me, "l", "f", new Date(0)), false, "a refusal is not a solve");
});

test("a check made after rung 3 is assisted, and attemptsFor says so; the rung is kept", async (t) => {
  const { db, close } = await freshDb();
  t.after(close);
  const me = await ensureLearner(db);
  await recordAttempt(db, me, { lessonId: "l", exerciseId: "e", body: "exact h", solved: true, rung: 2 });
  await recordAttempt(db, me, { lessonId: "l", exerciseId: "e", body: "exact h", solved: true, rung: 3 });
  await recordAttempt(db, me, { lessonId: "l", exerciseId: "e", body: "exact h", solved: true });
  assert.deepEqual((await attemptsFor(db, me)).map((r) => r.assisted), [false, true, false]);
});

test("the input ladder's rung is kept apart from the hint rung, and every reader of attempts gets it", async (t) => {
  const { db, query, close } = await freshDb();
  t.after(close);
  const me = await ensureLearner(db);
  await recordAttempt(db, me, { lessonId: "l", exerciseId: "e", body: "exact h", solved: false, error: "x", inputRung: 2 });
  await recordAttempt(db, me, { lessonId: "l", exerciseId: "e", body: "exact h", solved: true, rung: 1, inputRung: 4 });
  await recordAttempt(db, me, { lessonId: "l", exerciseId: "e", body: "exact h", solved: true });
  assert.deepEqual((await attemptsFor(db, me)).map((r) => r.inputRung), [2, 4, null]);
  const q = (text, params) => query(text, params);
  assert.deepEqual((await readerAttemptsForMastery(q, me, 10)).map((r) => r.inputRung), [null, 4, 2]);
  assert.deepEqual((await readerAttempts(q, me, { limit: 10 })).map((r) => [r.rung, r.input_rung]), [[null, null], [1, 4], [null, 2]]);
});
