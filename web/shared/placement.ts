// The placement check (lii-zjf.4): a few exercises from each level in
// order, so a learner who already knows some of this can skip it. Pure, like
// the rest of web/shared/; the page (web/src/pages/Placement.tsx) asks the
// questions, each answer is judged as it is anywhere else (Lean, or the
// author's answer for the reading kinds read and match), and the server
// (web/server/progress.ts, POST /api/progress/placement) records the result.
//
// A level is passed when PLACEMENT_PASS of its questions are solved. A
// question skipped ("I don't know this yet"), or solved with the Tutor's
// line, is a miss. A level stops as soon as its outcome is settled either
// way, and the first level not passed is where the path starts: it opens,
// with every level below it, and every concept the passed levels test is
// credited (masteryFrom, PLACEMENT_BOX), due for review spread over the
// one to two weeks after, not all on one day.
//
// Placement is by level, not by track. The levels follow the tracks closely
// enough (Level 1 is the logic, Levels 2 and 3 the maths refresher) that a
// learner strong in logic and rusty in algebra places between the two.

import type { Content, Exercise } from "./content.ts";
import { masteryFor, PLACEMENT_BOX, startOfDay, type MasteryMap, type ReviewItem } from "./progress.ts";

export const PLACEMENT_PASS = 0.75;
/** At most this many questions per level, one concept each. */
export const PLACEMENT_PER_LEVEL = 6;
/** A credited concept is first due this many days after the placement… */
export const PLACEMENT_DUE_DAYS = 7;
/** …plus 0 to this many days less one, in turn, so they do not all come back at once. */
export const PLACEMENT_SPREAD_DAYS = 7;

type PlacementContent = Pick<Content, "levels" | "lessons">;

/** The levels a placement can ask about, in order: written, with lessons
 *  whose exercises test a concept. */
export function placementLevels(content: PlacementContent): number[] {
  return [...content.levels]
    .sort((a, b) => a.id - b.id)
    .filter((l) => l.status !== "outline" && content.lessons.some((x) => x.level === l.id && x.exercises.length > 0))
    .map((l) => l.id);
}

/** Quickest first: choosing a fill, typing one, clicking a board proof, typing a whole proof. */
function effort(e: Pick<Exercise, "kind" | "mode" | "options" | "solution">): number {
  // The reading kinds come last: their few choices can be clicked through
  // until one is right, which says little about what a learner knows.
  const kind = e.kind === "predict" || e.kind === "read" || e.kind === "match" ? 9 : e.kind === "fill" ? (e.options.length ? 0 : 1) : e.mode === "board" ? 2 : 3;
  return kind * 1000 + Math.min(999, e.solution.split("\n").filter((l) => l.trim()).length);
}

/** A deterministic shuffle by `seed` (a linear congruential generator). */
function shuffled<T>(xs: T[], seed: number): T[] {
  const out = [...xs];
  let a = (Math.floor(seed) ^ 0x9e3779b9) >>> 0;
  for (let i = out.length - 1; i > 0; i--) {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    const j = a % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The questions for one level: up to PLACEMENT_PER_LEVEL of the concepts its
 * exercises test, chosen by `seed`, each asked through its quickest exercise
 * (one not solved before, when there is one; then the shortest solution).
 * In curriculum order of the concepts' first lessons.
 */
export function placementItems(content: PlacementContent, level: number, seed: number, solved: Record<string, Record<string, unknown>> = {}): ReviewItem[] {
  const seen = (lessonId: string, exerciseId: string) => Object.hasOwn(solved, lessonId) && Object.hasOwn(solved[lessonId], exerciseId);
  const options = new Map<string, { lessonId: string; exercise: Exercise; order: number }[]>();
  let order = 0;
  for (const l of content.lessons.filter((x) => x.level === level))
    for (const e of l.exercises) {
      if (!options.has(e.concept)) options.set(e.concept, []);
      options.get(e.concept)!.push({ lessonId: l.id, exercise: e, order: order++ });
    }
  const chosen = shuffled([...options.keys()], seed).slice(0, PLACEMENT_PER_LEVEL);
  return chosen
    .map((concept) => {
      const best = [...options.get(concept)!].sort(
        (a, b) => Number(seen(a.lessonId, a.exercise.id)) - Number(seen(b.lessonId, b.exercise.id)) || effort(a.exercise) - effort(b.exercise) || a.order - b.order,
      )[0];
      return { item: { lessonId: best.lessonId, exerciseId: best.exercise.id, concept }, first: options.get(concept)![0].order };
    })
    .sort((a, b) => a.first - b.first)
    .map((x) => x.item);
}

/** How many of `total` questions must be solved to pass. */
export const toPass = (total: number): number => Math.ceil(total * PLACEMENT_PASS - 1e-9);

/** Settled as soon as it can be: passed once enough are solved, failed once
 *  too many are missed for a pass to be possible. */
export function placementVerdict(right: number, wrong: number, total: number): "passed" | "failed" | "going" {
  if (total <= 0) return "passed";
  if (right >= toPass(total)) return "passed";
  if (total - wrong < toPass(total)) return "failed";
  return "going";
}

/**
 * What a placement at `placedAt` credits: every concept tested in a written
 * level below it, each first due PLACEMENT_DUE_DAYS on plus 0 to
 * PLACEMENT_SPREAD_DAYS - 1 days in turn (curriculum order), from `now`.
 * A concept already in PLACEMENT_BOX or past it (in `map`) keeps its own
 * schedule and takes no day of the spread (masteryFrom would ignore a
 * credit for it anyway).
 */
export function placementCredits(content: PlacementContent, placedAt: number, now: Date, map?: MasteryMap): { concept: string; dueAt: Date }[] {
  const below = new Set(placementLevels(content).filter((l) => l < placedAt));
  const concepts = [...new Set(content.lessons.filter((l) => below.has(l.level)).flatMap((l) => l.exercises.map((e) => e.concept)))].filter(
    (c) => !map || (masteryFor(map.concepts, c)?.box ?? 0) < PLACEMENT_BOX,
  );
  return concepts.map((concept, n) => ({ concept, dueAt: startOfDay(now, PLACEMENT_DUE_DAYS + (n % PLACEMENT_SPREAD_DAYS)) }));
}

/** The level a placement at `placedAt` opens: that level, or the last one
 *  there is when every level was passed. Null when it opens nothing new. */
export function placementOpens(content: PlacementContent, placedAt: number): number | null {
  const levels = placementLevels(content);
  if (!levels.length || placedAt <= levels[0]) return null;
  const at = levels.find((l) => l >= placedAt);
  return at ?? levels[levels.length - 1];
}
