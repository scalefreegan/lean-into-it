// The shape of the curriculum once loaded from content/: what the server
// sends and the UI renders. The on-disk format is described in
// docs/CONTENT.md.

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

/** A "Prove it" exercise. Lean decides whether it is solved. */
export interface Exercise {
  /** Unique within its lesson; progress is keyed on lesson id + this. */
  id: string;
  kind: "prove";
  mode: ProofMode;
  title: string;
  /** The claim in plain English, as a mathematician would say it. */
  says: string;
  /** The Lean statement after the keyword: binders, a colon and the claim,
   *  e.g. `(P Q : Prop) (hP : P) (hPQ : P → Q) : Q`. */
  statement: string;
  /** Board mode: the move ids (web/shared/moves.ts) on offer. */
  moves: string[];
  /** Tactic names that may not appear in an answer (e.g. `tauto`). */
  forbid: string[];
  /** A proof body that Lean accepts; the tests check that it does. */
  solution: string;
  concept: string;
}

export type Block = { type: "prose"; markdown: string } | { type: "exercise"; id: string };

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
