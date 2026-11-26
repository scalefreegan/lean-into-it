// The shape of the curriculum once loaded from content/: what the server
// sends and the UI renders. The on-disk format is described in
// docs/CONTENT.md.

import type { Ladder } from "./ladder.ts";
import type { ExerciseKind, WidgetType } from "./registry.ts";
import type { Witness } from "./truefalse.ts";

export interface Track {
  id: string; // "logic", "math", "lean", "programs"
  title: string;
  summary: string;
}

export interface Level {
  id: number;
  title: string;
  summary: string;
  /** `written` levels have lessons; an `outline` level has a plan (below) and never opens. */
  status: "written" | "outline";
  topics: string[];
  /** The Lean moves this level introduces, for the Path page. */
  moves: string[];
  /** The ladder rung its proofs default to (web/shared/ladder.ts). */
  ladder: Ladder;
  /** The concepts the level will teach, each with what it builds on. An
   *  outline's plan; a written level's concepts are its lessons'. */
  concepts: PlannedConcept[];
  /** The level's lessons, in order (sortLessons). One whose id a lesson now has is written. */
  planned: PlannedLesson[];
  /** Widgets its planned lessons need that the registry does not have yet. */
  newWidgets: NewWidget[];
}

export interface PlannedConcept {
  id: string;
  title: string;
  /** Concept ids it builds on: declared in curriculum.yaml, or taught by a lesson. */
  needs: string[];
}

export interface PlannedLesson {
  /** The id the lesson will have once written. */
  id: string;
  title: string;
  track: string;
  summary: string;
  concepts: string[];
  /** Registered widgets, or ones a level lists under `new_widgets`. */
  widgets: string[];
}

export interface NewWidget {
  id: string;
  /** What it would show, in a sentence. */
  does: string;
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
  /** Kind `prove`: how much help its input gives, 1 (cards, its own moves)
   *  to 4 (the editor alone); its own or its level's (web/shared/ladder.ts). */
  ladder: Ladder;
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
  /** An answer Lean accepts (a proof body, a fill, or for `truefalse` the
   *  side and its backing, web/shared/truefalse.ts); the tests check that it does. */
  solution: string;
  concept: string;
  /** Kind `truefalse` only. */
  truefalse?: TrueFalse;
  /** Kind `predict` only: the lines that run first, and the move predicted. */
  predict?: { before: string; move: string };
  /** Kind `match` only: the sentences and their Lean, paired by position. */
  pairs?: { english: string[]; lean: string[] };
  /** Kinds `read` and `flaw`: shown after an answer. */
  why?: string;
  /** Kind `flaw` only: the argument's steps (its `solution` is the wrong step's number). */
  steps?: string[];
}

/** What a `truefalse` exercise says beyond its statement. */
export interface TrueFalse {
  /** Which side Lean has backed up with the reference answer. */
  truth: boolean;
  /** Shown to a learner who picks the other side: why it cannot be backed up. */
  why: string;
  /** The tactic that shows the claim fails at the values given (`witness: values`). */
  close: string;
  witness: Witness;
  /** The statement's explicit variables, in order: a counterexample gives a value for each. */
  names: string[];
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
  /** A proof-craft lesson: how mathematicians work, round one worked problem. */
  craft: boolean;
  blocks: Block[];
  exercises: Exercise[];
  /** Path relative to content/, for error messages. */
  file: string;
}

/** One classic proof in the Lab's Famous Proofs gallery (content/gallery.yaml):
 *  the proof in words beside a Lean proof Lean accepts, with its proof map. */
export interface GalleryEntry {
  id: string;
  title: string;
  /** The claim in plain words. */
  says: string;
  /** Who proved it, and when. */
  who: string;
  /** Why it matters. */
  why: string;
  /** The level whose moves are enough to follow its Lean. */
  level: number;
  /** The Lean statement after the keyword, as in an exercise. */
  statement: string;
  /** The Lean proof (a body, as an exercise's solution); the tests check Lean accepts it. */
  solution: string;
  /** The sentences of the proof in words, each `<lines>: <sentence>` (web/shared/paired.ts). */
  steps: string[];
  /** How the Lean statement says the theorem, where it says less or says it differently. */
  formal: string;
  /** Mathlib's own name for the theorem, when it has one. */
  mathlib?: string;
}

/** A gallery entry as an exercise, to be checked the way an exercise's proof is. */
export function galleryExercise(entry: GalleryEntry): Exercise {
  return {
    id: entry.id,
    kind: "prove",
    mode: "typed",
    ladder: 4,
    title: entry.title,
    says: entry.says,
    statement: entry.statement,
    given: "",
    moves: [],
    forbid: [],
    proof: "",
    options: [],
    solution: entry.solution,
    concept: "",
  };
}

export interface ContentProblem {
  file: string;
  message: string;
}

export interface Content {
  tracks: Track[];
  levels: Level[];
  lessons: Lesson[];
  /** The Famous Proofs gallery, in file order (absent where there is no gallery.yaml). */
  gallery?: GalleryEntry[];
  /** What the loader refused, and why. A file with a problem is not served. */
  problems: ContentProblem[];
}

/** Lessons in path order: level, then the level's plan (`planned`) where it
 *  has one, whatever the tracks; without a plan, the order tracks are
 *  declared in, then `order`. A lesson its level's plan does not list (a
 *  proof-craft one, say) goes after the last lesson of its track with an
 *  `order` no greater than its own, else before the first of its track, else last. */
export function sortLessons(lessons: Lesson[], tracks: Track[], levels: Pick<Level, "id" | "planned">[] = []): Lesson[] {
  const trackIndex = new Map(tracks.map((t, i) => [t.id, i]));
  const byTrack = [...lessons].sort(
    (a, b) => a.level - b.level || (trackIndex.get(a.track) ?? 99) - (trackIndex.get(b.track) ?? 99) || a.order - b.order || a.id.localeCompare(b.id),
  );
  return [...new Set(byTrack.map((l) => l.level))].flatMap((id) => {
    const inLevel = byTrack.filter((l) => l.level === id);
    const plan = (levels.find((l) => l.id === id)?.planned ?? []).map((p) => p.id);
    if (!plan.length) return inLevel;
    const out = inLevel.filter((l) => plan.includes(l.id)).sort((a, b) => plan.indexOf(a.id) - plan.indexOf(b.id));
    for (const l of inLevel.filter((x) => !plan.includes(x.id))) {
      const after = out.findLastIndex((x) => x.track === l.track && x.order <= l.order);
      const first = out.findIndex((x) => x.track === l.track);
      out.splice(after >= 0 ? after + 1 : first >= 0 ? first : out.length, 0, l);
    }
    return out;
  });
}
