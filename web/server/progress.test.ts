import assert from "node:assert/strict";
import { test } from "node:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { creditsFor, ensureLearner, levelOpensFor, recordAttempt } from "../../scripts/db/progress.ts";
import { placementLevels } from "../shared/placement.ts";
import { freshDb } from "../../scripts/tests/testdb.mjs";
import { loadContent } from "./loader.ts";
import { setDb } from "./db.ts";
import { handleProgress, progressReply } from "./progress.ts";
import type { ProgressReply } from "../shared/wire.ts";

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

test("/api/progress offers a mastered concept for review from the next day, and a solve today clears it", async (t) => {
  const { db, query, close } = await freshDb();
  setDb(db);
  t.after(async () => {
    setDb(null);
    await close();
  });
  const lesson = loadContent().lessons.find((l) => l.exercises.length)!;
  const exercise = lesson.exercises[0];
  const learner = await ensureLearner(db);
  for (let i = 0; i < 4; i++) await recordAttempt(db, learner, { lessonId: lesson.id, exerciseId: exercise.id, body: `proof ${i}`, solved: true });
  assert.deepEqual((await progressReply()).review, [], "learned today: not due today");
  await query("update attempts set created_at = created_at - interval '3 days'");
  const due = (await progressReply()).review;
  assert.ok(due.some((d) => d.concept === exercise.concept));
  await recordAttempt(db, learner, { lessonId: lesson.id, exerciseId: exercise.id, body: "proof 0", solved: true });
  assert.ok(!(await progressReply()).review.some((d) => d.concept === exercise.concept));
});

function call(method: string, url: string, body?: unknown): Promise<{ status: number; reply: ProgressReply & { error?: string } }> {
  const req = Object.assign(Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]), { method, headers: {}, url }) as unknown as IncomingMessage;
  let status = 0;
  let text = "";
  const res = {
    writeHead(code: number) {
      status = code;
      return this;
    },
    end(chunk?: string) {
      text = chunk ?? "";
    },
  } as unknown as ServerResponse;
  return handleProgress(req, res).then(
    () => ({ status, reply: JSON.parse(text) }),
    (e: { status?: number; message: string }) => ({ status: e.status ?? 500, reply: { error: e.message } as ProgressReply & { error?: string } }),
  );
}

test("/api/progress: the first level is open and the next locked; Open anyway opens it and is recorded", async (t) => {
  const { db, close } = await freshDb();
  setDb(db);
  t.after(async () => {
    setDb(null);
    await close();
  });
  const content = loadContent();
  const written = content.levels.filter((l) => l.status !== "outline" && content.lessons.some((x) => x.level === l.id)).map((l) => l.id);
  const outline = content.levels.find((l) => l.status === "outline")!;
  const fresh = (await call("GET", "/")).reply.levels;
  assert.equal(fresh.find((s) => s.level === written[0])!.state, "open");
  assert.equal(fresh.find((s) => s.level === written[1])!.state, "locked");
  assert.ok(fresh.find((s) => s.level === written[1])!.need > 0);

  assert.equal((await call("POST", "/open", { level: 99 })).status, 400);
  assert.equal((await call("POST", "/open", { level: outline.id })).status, 400, "an outline has nothing to open");
  assert.equal((await call("POST", "/open", { level: "1" })).status, 400);
  assert.equal((await call("GET", "/open")).status, 405);
  assert.equal((await call("GET", "/nope")).status, 404);

  const opened = await call("POST", "/open", { level: written[2] });
  assert.equal(opened.status, 200);
  for (const id of written.slice(0, 3)) assert.notEqual(opened.reply.levels.find((s) => s.level === id)!.state, "locked", `level ${id} is open`);
  assert.equal(opened.reply.levels.find((s) => s.level === written[2])!.why, "anyway");
  const learner = await ensureLearner(db);
  assert.deepEqual((await levelOpensFor(db, learner)).map((r) => [r.level, r.how]), [[written[2], "anyway"]]);
});

test("/api/progress records a level when it is earned, so it stays open", async (t) => {
  const { db, close } = await freshDb();
  setDb(db);
  t.after(async () => {
    setDb(null);
    await close();
  });
  const content = loadContent();
  const first = content.lessons[0].level;
  const exercises = content.lessons.filter((l) => l.level === first).flatMap((l) => l.exercises.map((e) => ({ lessonId: l.id, e })));
  const learner = await ensureLearner(db);
  // Four solves of each concept of the first level masters every one of them.
  const seen = new Set<string>();
  for (const { lessonId, e } of exercises) {
    if (seen.has(e.concept)) continue;
    seen.add(e.concept);
    for (let i = 0; i < 4; i++) await recordAttempt(db, learner, { lessonId, exerciseId: e.id, body: `proof ${i}`, solved: true });
  }
  const levels = (await progressReply()).levels;
  const next = levels.find((s) => s.level > first && s.state !== "locked")!;
  assert.equal(next.why, "earned");
  assert.deepEqual(await levelOpensFor(db, learner).then((r) => r.map((x) => [x.level, x.how])), [[next.level, "earned"]]);
  // Once recorded, it is open on the record alone.
  assert.equal((await progressReply()).levels.find((s) => s.level === next.level)!.why, "earned");
});

test("/api/progress/placement opens the first level not passed and credits the levels below it", async (t) => {
  const { db, close } = await freshDb();
  setDb(db);
  t.after(async () => {
    setDb(null);
    await close();
  });
  const content = loadContent();
  const levels = placementLevels(content);
  assert.equal((await call("GET", "/")).reply.placed, false);
  assert.equal((await call("POST", "/placement", { level: levels[0] - 1 })).status, 400);
  assert.equal((await call("POST", "/placement", { level: levels.at(-1)! + 2 })).status, 400);
  assert.equal((await call("POST", "/placement", { level: 1.5 })).status, 400);
  assert.equal((await call("GET", "/placement")).status, 405);

  const placed = await call("POST", "/placement", { level: levels[2] });
  assert.equal(placed.status, 200);
  assert.equal(placed.reply.placed, true);
  const state = (id: number) => placed.reply.levels.find((s) => s.level === id)!.state;
  for (const id of levels.slice(0, 3)) assert.notEqual(state(id), "locked", `level ${id} is open`);
  assert.equal(state(levels[3]), "locked");
  const learner = await ensureLearner(db);
  const below = new Set(content.lessons.filter((l) => l.level < levels[2]).flatMap((l) => l.exercises.map((e) => e.concept)));
  const credits = await creditsFor(db, learner);
  assert.deepEqual(new Set(credits.map((c) => c.concept)), below);
  for (const c of below) assert.equal(placed.reply.mastery.concepts[c].mastered, true);
  assert.deepEqual(placed.reply.review, [], "nothing credited is due today");
  assert.deepEqual((await levelOpensFor(db, learner)).find((r) => r.how === "placement")?.level, levels[2]);
  // Taken again: the first credits stand.
  await call("POST", "/placement", { level: levels.at(-1)! + 1 });
  const again = await creditsFor(db, learner);
  for (const c of credits) assert.equal(again.find((x) => x.concept === c.concept)!.dueAt.getTime(), c.dueAt.getTime());
  assert.ok(again.length > credits.length);
});

test("/api/progress/placement at the first level opens nothing new, credits nothing, and is a placement taken", async (t) => {
  const { db, close } = await freshDb();
  setDb(db);
  t.after(async () => {
    setDb(null);
    await close();
  });
  const levels = placementLevels(loadContent());
  const r = await call("POST", "/placement", { level: levels[0] });
  assert.equal(r.status, 200);
  assert.equal(r.reply.placed, true);
  const learner = await ensureLearner(db);
  assert.deepEqual(await creditsFor(db, learner), []);
  assert.deepEqual((await levelOpensFor(db, learner)).map((x) => [x.level, x.how]), [[levels[0], "placement"]]);
  assert.equal(r.reply.levels.find((s) => s.level === levels[1])!.state, "locked");
});
