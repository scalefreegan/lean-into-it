// What the API sends and accepts, shared by the server routes and the
// client so the two cannot drift.

import type { LevelStatus, MasteryMap, ReviewItem } from "./progress.ts";
import type { Goal } from "./goals.ts";
import type { MapGoal, StepGoals } from "./proofmap.ts";
import type { SpokenWord } from "./tts/alignment.ts";
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
   *  `rejected`: a move on the board; kept if Lean refuses it, if Lean takes
   *  it but it gets nowhere (`unchanged`), or if it finishes a proof not
   *  solved yet today. `submitted`: the Check button;
   *  always kept. `live`: a typed proof re-checked as it is edited; kept only
   *  as a solve, and only if the exercise was not solved yet today. Omitted:
   *  not an attempt (re-checking a stored solution when an exercise opens),
   *  never kept, so opening a lesson is never a review passed. */
  record?: "rejected" | "submitted" | "live";
  /** Kind `prove`: the input ladder's rung the learner is at (1–4,
   *  web/shared/ladder.ts), kept on the attempt row. */
  ladder?: number;
  /** Kind `prove`: also send Lean's goals around every line, for the proof
   *  map (web/shared/proofmap.ts). */
  map?: boolean;
  /** With `record`: the working time on the exercise before this check, in
   *  ms (web/shared/clock.ts), kept on the attempt row. */
  elapsedMs?: number;
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
  /** Asked for with `map`: the goals before the first line, and around each
   *  line up to the first Lean refused. */
  map?: { start: MapGoal[]; steps: StepGoals[] };
  /** The goals after the body's last line are the goals before it: on the
   *  board, whose last line is the one tactic just played, a step Lean took
   *  that got nowhere (norm_num on a goal it cannot touch). The board says
   *  so, and a board move (`record: "rejected"`) is kept as a stumble. Set
   *  on other checks too, where nothing reads it: a typed proof's last line
   *  may be a comment, and a true/false reply may add a refusal after it. */
  unchanged?: true;
}

/** POST /api/gallery: a Famous Proofs entry (content/gallery.yaml) checked:
 *  with no cursor, its proof map in the reply; with one, the goals there. */
export interface GalleryRequest {
  id: string;
  cursor?: Position;
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
  /** Kind `prove`: the ladder's rung the learner is on (1–4, web/shared/ladder.ts). */
  ladder?: number;
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
  /** The turn wrote lessons and its commit is on the branch: content/ has changed. */
  commit?: { hash: string; summary: string } | null;
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

/* ----------------------------- proof partner ----------------------------- */

/** POST /api/tutor/lean: the Tutor's own tool asks Lean about scratch Lean
 *  (scripts/lean-mcp.mjs). `token` is the running Playground turn's. */
export interface PartnerRequest {
  token: string;
  /** Lean to go under `import Mathlib` in a scratch file. */
  lean: string;
  /** 1-based line of `lean`: also report the goals at the end of it. */
  goalsAfterLine?: number;
}

export interface PartnerMessage {
  severity: "error" | "warning" | "info";
  /** 1-based line of the scratch text. */
  line: number;
  message: string;
}

export interface PartnerReply {
  /** False when the text was refused unread (`refused` says why). */
  ran: boolean;
  refused: string[];
  /** Lean raised no error. With `sorry` true, a proof is still left open. */
  accepted: boolean;
  sorry: boolean;
  /** Everything Lean said, in line order: errors, `#check` output, what `exact?` found. */
  messages: PartnerMessage[];
  /** Messages left out past the cap. */
  more?: number;
  /** The goals after `goalsAfterLine`, as Lean prints them ([] : none left); null when not asked, or not inside a proof there. */
  goals: string[] | null;
}

/* ------------------------------ Listen mode ------------------------------ */

export interface TtsModel {
  id: string;
  label: string;
  note: string;
}

/** GET /api/tts/settings, and the reply to PUT. `voiceId` is null until one
 *  is chosen; `configured` says whether the server has an ElevenLabs key at
 *  all (the key itself never leaves the server). */
export interface ListenSettings {
  on: boolean;
  voiceId: string | null;
  modelId: string;
  models: TtsModel[];
  configured: boolean;
}

/** PUT /api/tts/settings: only the fields given change. */
export interface ListenSettingsPatch {
  on?: boolean;
  voiceId?: string;
  modelId?: string;
}

export interface TtsVoice {
  id: string;
  name: string;
}

/** GET /api/tts/voices: the account's ElevenLabs voices. */
export interface TtsVoicesReply {
  voices: TtsVoice[];
}

/** POST /api/tts/speak: the voice and model are the stored ones. */
export interface TtsSpeakRequest {
  text: string;
}

/** The audio to play (a URL on this server) and when each word sounds. */
export interface TtsSpeakReply {
  audioUrl: string;
  words: SpokenWord[];
}
