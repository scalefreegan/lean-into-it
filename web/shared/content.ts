// The shape of the curriculum once loaded from content/: what the server
// sends and the UI renders. The on-disk format is described in
// docs/CONTENT.md.

import type { ExerciseKind, WidgetType } from "./registry.ts";

export interface Track {
  id: string; // "logic", "math", "lean", "programs"
  title: string;
  summary: string;
}

export interface Level {
  id: number;
  title: string;
  summary: string;
  /** `written` levels have lessons; `outline` levels only list their topics. */
  status: "written" | "outline";
  topics: string[];
  /** The Lean moves this level introduces, for the Path page. */
  moves: string[];
}

/** How a proof is entered: clicking moves on the proof board, or typing Lean. */
export type ProofMode = "board" | "typed";

/** An exercise: a statement and, from the learner, an answer that Lean
 *  judges. For kind `prove` the answer is the whole proof body; for `fill`
 *  it is what goes in the gap of the proof the exercise comes with.
 *  web/shared/registry.ts lists each kind's fields for authors. */
export interface Exercise {
  /** Unique within its lesson; progress is keyed on lesson id + this. */
  id: string;
  kind: ExerciseKind;
  mode: ProofMode;
  title: string;
  /** The claim in plain English, as a mathematician would say it. */
  says: string;
  /** The Lean statement after the keyword: binders, a colon and the claim,
   *  e.g. `(P Q : Prop) (hP : P) (hPQ : P → Q) : Q`. */
  statement: string;
  /** Lean definitions the statement is about (the functions of a
   *  verified-programs lesson), placed before the theorem. Empty for most. */
  given: string;
  /** Board mode: the move ids (web/shared/moves.ts) on offer. */
  moves: string[];
  /** Tactic names that may not appear in an answer (e.g. `tauto`). */
  forbid: string[];
  /** Kind `fill`: the proof with its missing step marked `<gap>`
   *  (web/shared/proof.ts). Empty for `prove`. */
  proof: string;
  /** Kind `fill`: the choices on offer, when the gap is filled by choosing
   *  and not by typing. Lean judges the one chosen; no answer key is kept. */
  options: string[];
  /** An answer Lean accepts (a proof body, or a fill); the tests check that it does. */
  solution: string;
  concept: string;
}

/** A lesson's body in order: prose, the place of an exercise, or a widget
 *  with the parameters the loader has checked against the registry. */
export type Block = { type: "prose"; markdown: string } | { type: "exercise"; id: string } | { type: "widget"; widget: WidgetType; params: Record<string, unknown> };

export interface Lesson {
  id: string;
  title: string;
  track: string;
  level: number;
  /** Position within its track and level. */
  order: number;
  concepts: string[];
  summary: string;
  blocks: Block[];
  exercises: Exercise[];
  /** Path relative to content/, for error messages. */
  file: string;
}

export interface ContentProblem {
  file: string;
  message: string;
}

export interface Content {
  tracks: Track[];
  levels: Level[];
  lessons: Lesson[];
  /** What the loader refused, and why. A file with a problem is not served. */
  problems: ContentProblem[];
}

/** Lessons in path order: level, then the order tracks are declared in, then `order`. */
export function sortLessons(lessons: Lesson[], tracks: Track[]): Lesson[] {
  const trackIndex = new Map(tracks.map((t, i) => [t.id, i]));
  return [...lessons].sort(
    (a, b) => a.level - b.level || (trackIndex.get(a.track) ?? 99) - (trackIndex.get(b.track) ?? 99) || a.order - b.order || a.id.localeCompare(b.id),
  );
}
