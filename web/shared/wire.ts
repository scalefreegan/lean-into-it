// What the API sends and accepts, shared by the server routes and the
// client so the two cannot drift.

import type { LevelStatus, MasteryMap, ReviewItem } from "./progress.ts";
import type { Goal } from "./goals.ts";
import type { BodyDiagnostic, Position } from "./proof.ts";

export interface ErrorReply {
  error: string;
  code?: string;
}

/** POST /api/check: check an answer to an exercise. Lean judges it against
 *  the exercise's own statement. */
export interface CheckRequest {
  lessonId: string;
  exerciseId: string;
  /** The answer. Kind `prove`: the proof body, tactic lines, unindented.
   *  Kind `fill`: what goes in the gap, one line. */
  body: string;
  /** A typed proof: where the caret is, to show the goals there. Not used
   *  for `fill`, where the server reads the goals at the gap. */
  cursor?: Position;
  /** Whether this check is an attempt, and which of its outcomes are kept.
   *  `rejected`: a move on the board; kept if Lean refuses it, or if it
   *  finishes a proof not solved yet today. `submitted`: the Check button;
   *  always kept. `live`: a typed proof re-checked as it is edited; kept only
   *  as a solve, and only if the exercise was not solved yet today. Omitted:
   *  not an attempt (re-checking a stored solution when an exercise opens),
   *  never kept, so opening a lesson is never a review passed. */
  record?: "rejected" | "submitted" | "live";
}

export interface CheckReply {
  solved: boolean;
  /** Goals after the last line of the body. Not meaningful when `error` is set. */
  goals: Goal[];
  /** Goals at the cursor, when one was sent and it is inside the proof.
   *  Kind `fill`: what the missing step has to prove (the goals where the
   *  gap starts, or at the start of its line when the gap is part of a term). */
  cursorGoals: Goal[] | null;
  /** The first real error: the body does not hold up to this line. */
  error: BodyDiagnostic | null;
  diagnostics: BodyDiagnostic[];
  /** Forbidden tactics the body used. */
  forbidden: string[];
  /** Why a proof with no error is still not accepted (it steps outside a
   *  proof, rests on an axiom of its own, or Lean's axiom report never
   *  came), in plain words. */
  refusal: string | null;
}

/** POST /api/playground: check any Lean source, nothing scored. */
export interface PlaygroundRequest {
  source: string;
  cursor?: Position;
}

export interface PlaygroundDiagnostic {
  severity: "error" | "warning" | "info";
  message: string;
  line: number;
  /** The span Lean pointed at, in the file's own lines and columns. */
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
}

export interface PlaygroundReply {
  diagnostics: PlaygroundDiagnostic[];
  cursorGoals: Goal[] | null;
}

/** GET /api/lean (also /api/lean/status), and the reply of POST
 *  /api/lean/restart: whether Lean can check a proof now. */
export interface LeanStatus {
  /** `starting`: loading its library for the first time, which takes a
   *  while. `restarting`: the same, after a stop. `down`: not installed, or
   *  not running and not on its way (it failed to start, or stopped twice
   *  in a row); POST /api/lean/restart starts it. */
  state: "starting" | "ready" | "restarting" | "down";
  /** False when Lean or its libraries are not on this machine at all. */
  installed: boolean;
  /** The Lean version the project pins, e.g. `leanprover/lean4:v4.36.0`. */
  toolchain: string | null;
  /** What to do when it cannot. */
  problem: string | null;
}

export interface SolvedExercise {
  solvedAt: string;
  /** The body that solved it, shown again when the lesson is reopened. */
  solution: string;
}

/** GET /api/progress: lesson id → exercise id → when and how it was solved. */
export interface ProgressReply {
  solved: Record<string, Record<string, SolvedExercise>>;
  /** Per concept and per move, from every check on record (web/shared/progress.ts). */
  mastery: MasteryMap;
  /** Today's review session; its length is the count due. */
  review: ReviewItem[];
  /** Every level in content.levels order: locked, open or done, and what opens it. */
  levels: LevelStatus[];
  /** The placement check has been taken (it may be taken again). */
  placed: boolean;
}

/** POST /api/progress/placement: the first level not passed (web/shared/placement.ts). The reply is the progress after. */
export interface PlacementRequest {
  level: number;
}

/** POST /api/progress/open: the learner opens a locked level themselves. The reply is the progress after. */
export interface OpenLevelRequest {
  level: number;
}

/** What the page tells the Tutor about itself (web/server/tutor.ts rebuilds
 *  it field by field; the lesson and exercise are looked up by id). */
export interface TutorContext {
  page: "path" | "lesson" | "review" | "moves" | "playground" | "lab";
  lessonId?: string;
  /** The exercise in view, with the learner's work on it. */
  exerciseId?: string;
  /** Their proof so far (a fill: what is in the gap). */
  body?: string;
  /** Lean's goals now, as text. */
  goals?: string;
  /** Lean's last error, as text. */
  error?: string;
  /** A free Lean file: the Playground's, or the example open in the Lab. */
  source?: string;
}

/** POST /api/tutor: a question (`message`), or a hint at rung 1-3 on the
 *  exercise in the context. Rungs are climbed in order, one request each. */
export interface TutorRequest {
  message?: string;
  hint?: 1 | 2 | 3;
  context: TutorContext;
}

export interface TutorMessage {
  id: number;
  role: "user" | "assistant" | "note";
  text: string;
  lessonId: string | null;
  exerciseId: string | null;
  /** A hint's rung; null for anything else. */
  rung: number | null;
  at: string;
}

/** The rows the turn added (the ask, then the reply or a note). `line`:
 *  rung 3's line, which Lean accepted as the next step. */
export interface TutorReply {
  messages: TutorMessage[];
  line: string | null;
}

/** GET /api/tutor/history. `busy`: a turn is running now. */
export interface TutorHistoryReply {
  messages: TutorMessage[];
  busy: boolean;
}

/** GET /api/tutor/ladder: the highest rung given on an exercise since it
 *  was last solved (0: none yet). */
export interface TutorLadderReply {
  rung: number;
}
