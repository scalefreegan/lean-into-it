// /api/progress: what the learner has solved, and their mastery of each
// concept and move. Written by /api/check (check.ts) when Lean accepts or
// refuses a proof; this route only reads.

import type { IncomingMessage, ServerResponse } from "node:http";
import type { ProgressReply } from "../shared/wire.ts";
import { masteryFrom } from "../shared/progress.ts";
import { attemptsFor, solvedFor } from "../../scripts/db/progress.ts";
import { learnerId, rawDb } from "./db.ts";
import { loadContent } from "./loader.ts";
import { methodNotAllowed, sendJson } from "./sse.ts";

export async function progressReply(): Promise<ProgressReply> {
  const db = rawDb();
  const learner = await learnerId();
  // Null-prototype maps: a lesson or exercise id such as `constructor` is
  // an ordinary key here, not Object's built-in (JSON carries no prototype).
  const solved: ProgressReply["solved"] = Object.create(null);
  for (const row of await solvedFor(db, learner)) {
    if (!Object.hasOwn(solved, row.lessonId)) solved[row.lessonId] = Object.create(null);
    solved[row.lessonId][row.exerciseId] = { solvedAt: row.solvedAt.toISOString(), solution: row.solution };
  }
  return { solved, mastery: masteryFrom(loadContent(), await attemptsFor(db, learner)) };
}

export async function handleProgress(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "GET") return methodNotAllowed(res, "GET");
  sendJson(res, 200, await progressReply());
}
