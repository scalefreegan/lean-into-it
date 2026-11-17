// What the API sends and accepts, shared by the server routes and the
// client so the two cannot drift.

import type { Goal } from "./goals.ts";
import type { BodyDiagnostic, Position } from "./proof.ts";

export interface ErrorReply {
  error: string;
  code?: string;
}

/** POST /api/check: check a proof body against an exercise's statement. */
export interface CheckRequest {
  lessonId: string;
  exerciseId: string;
  /** The proof body: tactic lines, unindented. */
  body: string;
  /** Typed mode: where the caret is, to show the goals there. */
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
  /** Goals at the cursor, when one was sent and it is inside the proof. */
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

/** GET /api/lean: whether Lean can run here. */
export interface LeanStatus {
  ready: boolean;
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
}
