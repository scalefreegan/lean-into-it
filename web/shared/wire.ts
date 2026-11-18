import type { MasteryMap } from "./progress.ts";

// What the API sends and accepts, shared by the server routes and the
// client so the two cannot drift.

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
  /** Which failed checks are kept as attempts. `rejected`: only a body Lean
   *  refuses (a wrong move on the board). `submitted`: any unsolved body (the
   *  Check button). Omitted: none. The first solved check is always kept. */
  record?: "rejected" | "submitted";
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
}
