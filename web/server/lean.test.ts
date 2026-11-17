import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { Readable } from "node:stream";
import { after, before, test } from "node:test";
import { attemptCount, ensureLearner, solvedFor } from "../../scripts/db/progress.ts";
import { freshDb } from "../../scripts/tests/testdb.mjs";
import type { CheckReply, CheckRequest } from "../shared/wire.ts";
import { checkExercise, handleCheck } from "./check.ts";
import { setDb, type Db } from "./db.ts";
import { leanProblem, leanServer } from "./lean/lsp.ts";
import { loadContent } from "./loader.ts";

// The tests that need a real Lean: they start `lake serve` in lean/ and
// check real proofs, so the first one waits for Mathlib to load (tens of
// seconds). Skipped, loudly, where Lean is not installed
// (`npm run lean:setup`). The database is an in-process PGlite.

const problem = leanProblem();
const skip = problem ? `Lean is not installed: ${problem}` : false;
if (skip) console.warn(`[lean.test] SKIPPED, nothing here was checked. ${skip}`);

const content = loadContent(path.resolve(import.meta.dirname, "../../content"));
const lesson = content.lessons.find((l) => l.id === "logic-1-if-then")!;
const exercise = (id: string) => lesson.exercises.find((e) => e.id === id)!;

let db: Db;
let closeDb: () => Promise<void>;

before(async () => {
  const fresh = await freshDb();
  db = fresh.db;
  closeDb = fresh.close;
  setDb(db);
});

after(async () => {
  leanServer().stop();
  setDb(null);
  await closeDb();
});

/** Call the /api/check handler as the dev server would, minus HTTP. */
async function post(body: Partial<CheckRequest>): Promise<{ status: number; reply: CheckReply }> {
  const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), { method: "POST", headers: {}, url: "/" }) as unknown as IncomingMessage;
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
  await handleCheck(req, res);
  return { status, reply: JSON.parse(text) as CheckReply };
}

test("every exercise's reference solution is accepted by Lean", { skip }, async () => {
  assert.deepEqual(content.problems, []);
  let checked = 0;
  for (const l of content.lessons) {
    for (const e of l.exercises) {
      const reply = await checkExercise(leanServer(), e, e.solution);
      assert.equal(reply.solved, true, `${l.id}/${e.id}: ${JSON.stringify(reply.diagnostics)}`);
      assert.deepEqual(reply.goals, [], `${l.id}/${e.id} leaves no goal`);
      checked++;
    }
  }
  assert.ok(checked >= 5, `checked ${checked} exercises`);
});

test("an empty proof is not solved, and Lean reports the opening goal", { skip }, async () => {
  const reply = await checkExercise(leanServer(), exercise("use-it"), "");
  assert.equal(reply.solved, false);
  assert.equal(reply.error, null);
  assert.equal(reply.goals.length, 1);
  assert.equal(reply.goals[0].target, "Q");
  assert.deepEqual(
    reply.goals[0].hypotheses.map((h) => `${h.names.join(" ")} : ${h.type}`),
    ["P Q : Prop", "hP : P", "hPQ : P → Q"],
  );
});

test("a right move changes the goal; a wrong move is an error on its line", { skip }, async () => {
  const right = await checkExercise(leanServer(), exercise("use-it"), "apply hPQ");
  assert.equal(right.solved, false);
  assert.equal(right.error, null);
  assert.equal(right.goals[0].target, "P");

  const wrong = await checkExercise(leanServer(), exercise("use-it"), "apply hPQ\nexact hPQ");
  assert.equal(wrong.solved, false);
  assert.equal(wrong.error?.line, 1);
  assert.match(wrong.error?.message ?? "", /mismatch/i);
});

test("sorry is refused, though Lean reports no error for it", { skip }, async () => {
  for (const body of ["sorry", "apply hPQ\nsorry", "exact sorry"]) {
    const reply = await checkExercise(leanServer(), exercise("use-it"), body);
    assert.equal(reply.solved, false, body);
    assert.equal(reply.error, null, body);
  }
});

test("a forbidden tactic is refused even where Lean accepts the proof", { skip }, async () => {
  const typed = exercise("typed");
  assert.ok(typed.forbid.includes("tauto"));
  const banned = await checkExercise(leanServer(), typed, "tauto");
  assert.deepEqual(banned.forbidden, ["tauto"]);
  assert.equal(banned.solved, false);
  // The guard is what refused it: the same proof passes with the ban lifted.
  const lifted = await checkExercise(leanServer(), { ...typed, forbid: [] }, "tauto");
  assert.equal(lifted.solved, true);
});

test("the goals at the cursor are those before the line the caret starts", { skip }, async () => {
  const reply = await checkExercise(leanServer(), exercise("chain"), "intro hP\napply hQR\napply hPQ\nexact hP", { line: 1, character: 0 });
  assert.equal(reply.solved, true);
  assert.equal(reply.cursorGoals?.[0].target, "R");
  assert.ok(reply.cursorGoals?.[0].hypotheses.some((h) => h.names.includes("hP")));
});

test("/api/check records a rejected move and the first solve, and nothing for a live re-check", { skip }, async () => {
  const learner = await ensureLearner(db);
  const base = { lessonId: lesson.id, exerciseId: "prove-it" };
  const count = () => attemptCount(db, learner, lesson.id, "prove-it");

  // A valid step on the board: not finished, not a failure, not recorded.
  assert.equal((await post({ ...base, body: "intro hP", record: "rejected" })).reply.solved, false);
  assert.equal(await count(), 0);
  // A wrong move on the board is recorded.
  const wrong = await post({ ...base, body: "exact hP", record: "rejected" });
  assert.equal(wrong.status, 200);
  assert.ok(wrong.reply.error);
  assert.equal(await count(), 1);
  // A live check of an unfinished proof (no `record`) is not.
  await post({ ...base, body: "intro hP" });
  assert.equal(await count(), 1);
  // Pressing Check on an unfinished proof is.
  await post({ ...base, body: "intro hP", record: "submitted" });
  assert.equal(await count(), 2);
  // The first solve is recorded and marks the exercise solved...
  assert.equal((await post({ ...base, body: "intro hP\nexact hP" })).reply.solved, true);
  assert.equal(await count(), 3);
  assert.deepEqual((await solvedFor(db, learner)).map((r) => [r.exerciseId, r.solution]), [["prove-it", "intro hP\nexact hP"]]);
  // ...and a live re-check of the solved proof adds nothing.
  await post({ ...base, body: "intro hP\nexact hP" });
  assert.equal(await count(), 3);
});

test("/api/check refuses an exercise that does not exist", { skip }, async () => {
  await assert.rejects(post({ lessonId: lesson.id, exerciseId: "nope", body: "" }), /no such exercise/);
  await assert.rejects(post({ lessonId: lesson.id, exerciseId: "use-it" }), /required/);
});
