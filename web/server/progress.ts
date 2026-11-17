// /api/progress: what the learner has solved. Written by /api/check
// (check.ts) when Lean accepts a proof; this route only reads.

import type { IncomingMessage, ServerResponse } from "node:http";
import type { ProgressReply } from "../shared/wire.ts";
import { solvedFor } from "../../scripts/db/progress.ts";
import { learnerId, rawDb } from "./db.ts";
import { methodNotAllowed, sendJson } from "./sse.ts";

export async function progressReply(): Promise<ProgressReply> {
  const solved: ProgressReply["solved"] = {};
  for (const row of await solvedFor(rawDb(), await learnerId())) {
    (solved[row.lessonId] ??= {})[row.exerciseId] = { solvedAt: row.solvedAt.toISOString(), solution: row.solution };
  }
  return { solved };
}

export async function handleProgress(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "GET") return methodNotAllowed(res, "GET");
  sendJson(res, 200, await progressReply());
}
