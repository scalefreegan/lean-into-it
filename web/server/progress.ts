// /api/progress: what the learner has solved, their mastery of each concept
// and move, and which levels are open. The attempts are written by
// /api/check (check.ts) when Lean accepts or refuses a proof. This route
// writes what opens levels: a level that is open is recorded (`earned` when
// its gate was passed, `anyway` from POST /open, `placement` from POST
// /placement, with the concepts the placement credits), so it stays open.

import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenLevelRequest, PlacementRequest, ProgressReply } from "../shared/wire.ts";
import { placementCredits, placementLevels, placementOpens } from "../shared/placement.ts";
import { levelOpen, levelStatuses, masteryFrom, reviewSession } from "../shared/progress.ts";
import { attemptsFor, creditsFor, levelOpensFor, recordCredits, recordLevelOpen, solvedFor } from "../../scripts/db/progress.ts";
import { learnerId, rawDb } from "./db.ts";
import { loadContent } from "./loader.ts";
import { HttpError, methodNotAllowed, readJsonBody, sendJson, subPath } from "./sse.ts";

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
  const content = loadContent();
  const rows = await attemptsFor(db, learner);
  const credits = await creditsFor(db, learner);
  const mastery = masteryFrom(content, rows, credits);
  const opened = await levelOpensFor(db, learner);
  const levels = levelStatuses(content, mastery, opened, rows, solved);
  // A level earned just now is kept: a concept added to the curriculum
  // later must not lock it again. Not while content/ has problems: a lesson
  // that failed to load would make its level look easier than it is.
  if (content.problems.length === 0) {
    const had = new Set(opened.map((o) => o.level));
    for (const s of levels) if (s.why === "earned" && !had.has(s.level)) await recordLevelOpen(db, learner, s.level, "earned");
  }
  return {
    solved,
    mastery,
    review: reviewSession(content, mastery, rows, new Date(), (level) => levelOpen(levels, level)),
    levels,
    // A placement whose level had already opened some other way leaves no placement row; its credits remain.
    placed: opened.some((o) => o.how === "placement") || credits.length > 0,
  };
}

/** POST /open: the learner opens a level themselves ("Open anyway" on the Path). */
async function openLevel(req: IncomingMessage): Promise<ProgressReply> {
  const body = await readJsonBody<Partial<OpenLevelRequest> | null>(req);
  const level = body?.level;
  const content = loadContent();
  const known = content.levels.find((l) => l.id === level);
  if (typeof level !== "number" || !known) throw new HttpError(400, "no such level");
  if (known.status === "outline" || !content.lessons.some((l) => l.level === level)) throw new HttpError(400, "that level has no lessons yet");
  await recordLevelOpen(rawDb(), await learnerId(), level, "anyway");
  return progressReply();
}

/** POST /placement: the placement check is over; `level` is the first level
 *  not passed (one past the last when all were). It opens that level and
 *  credits the concepts of those below. */
async function place(req: IncomingMessage): Promise<ProgressReply> {
  const body = await readJsonBody<Partial<PlacementRequest> | null>(req);
  const level = body?.level;
  const content = loadContent();
  const levels = placementLevels(content);
  if (typeof level !== "number" || !Number.isInteger(level) || !levels.length || level < levels[0] || level > levels[levels.length - 1] + 1) throw new HttpError(400, "no such level to place at");
  if (content.problems.length) throw new HttpError(409, "some lesson files could not be loaded; fix them before placing");
  const db = rawDb();
  const learner = await learnerId();
  const opens = placementOpens(content, level);
  const map = masteryFrom(content, await attemptsFor(db, learner), await creditsFor(db, learner));
  const credits = placementCredits(content, level, new Date(), map);
  // Both or neither: credits without the placement would master concepts no level was opened for.
  await db.transaction(async (tx) => {
    await recordCredits(tx, learner, credits);
    // A placement at the first level opens nothing, and is still a placement taken.
    await recordLevelOpen(tx, learner, opens ?? levels[0], "placement");
  });
  return progressReply();
}

export async function handleProgress(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const route = subPath(req);
  if (route === "open") {
    if (req.method !== "POST") return methodNotAllowed(res, "POST");
    return sendJson(res, 200, await openLevel(req));
  }
  if (route === "placement") {
    if (req.method !== "POST") return methodNotAllowed(res, "POST");
    return sendJson(res, 200, await place(req));
  }
  if (route !== "") return sendJson(res, 404, { error: "no such route" });
  if (req.method !== "GET") return methodNotAllowed(res, "GET");
  sendJson(res, 200, await progressReply());
}
