import { stateBlocks } from "./goals.ts";
import { isMove } from "./moves.ts";

// The catalogue of widgets a lesson may embed and exercise kinds it may
// declare, with the parameters each accepts. This file is the single source
// of truth: the loader validates content against it, docs/CONTENT.md
// describes it for authors (human and agent), the Gallery page (#/gallery)
// lists it, and the UI implements it. Adding a widget or an exercise kind
// starts here: the two name types below are what make the UI's component
// tables (web/src/widgets/registry.tsx, web/src/exercises/registry.tsx)
// fail to compile until the new entry has a component.

/** How a parameter value is checked. `x[]` means a list of x. */
export type ParamType =
  | "string" // one line of text
  | "text" // text that may run over several lines (Lean code, a proof)
  | "number"
  | "boolean"
  | "string[]"
  | "number[]"
  | "move[]" // ids from web/shared/moves.ts: ["intro", "exact"]
  | "state" // a proof state as Lean prints it: facts, then a line starting ⊢
  | `enum:${string}` // one of a|b|c
  | `enum[]:${string}`; // a list drawn from a|b|c

export interface ParamSpec {
  type: ParamType;
  required?: boolean;
  /** Shown in the Gallery and in a refusal; keep it to one line. */
  doc: string;
  /** Bounds for a `number` (or each entry of a `number[]`), inclusive. */
  min?: number;
  max?: number;
  /** The number must be whole. */
  integer?: boolean;
}
export type ParamSpecs = Record<string, ParamSpec>;
export type Params = Record<string, unknown>;

export interface WidgetSpec {
  doc: string;
  params: ParamSpecs;
  /** Parameters the Gallery renders the widget with. Each must pass the
   *  checks (registry.test.ts), so they double as examples for authors. */
  examples: Params[];
  /** Checks that involve more than one parameter. */
  check?: (params: Params) => string[];
}

export interface ExerciseSpec {
  doc: string;
  /** The words above an exercise of this kind: "Prove it". */
  label: string;
  params: ParamSpecs;
  check?: (params: Params) => string[];
}

/** A widget block's own key: `type:` names the widget, so no parameter may
 *  be called that (YAML would refuse the duplicate key). */
export const WIDGET_KEYS = ["type"] as const;
/** What every exercise carries whatever its kind. A kind's parameters may
 *  not reuse these names. */
export const EXERCISE_KEYS = ["id", "kind", "title", "concept"] as const;

export type WidgetType = "proof-state" | "move-list";

export const WIDGETS: Record<WidgetType, WidgetSpec> = {
  "proof-state": {
    doc: "A proof state drawn as the proof board draws it: what it is about, the facts in hand on teal cards, the goal on an amber card. For showing a state in the prose where no proof is being asked for.",
    params: {
      state: { type: "state", required: true, doc: "The state as Lean prints it: one `name : statement` line per fact, then `⊢ goal`. A blank line starts another goal; `case name` may come first." },
      caption: { type: "string", doc: "One line shown under the cards." },
    },
    examples: [
      { state: "P Q R : Prop\nhPQ : P → Q\nhQR : Q → R\n⊢ P → R" },
      { state: "case left\nP Q : Prop\nhP : P\nhQ : Q\n⊢ P\n\ncase right\nP Q : Prop\nhP : P\nhQ : Q\n⊢ Q", caption: "After constructor on the goal P ∧ Q: two goals, the first one in full." },
    ],
  },
  "move-list": {
    doc: "Some of the proof board's moves, each with the sentence that says what it does. For a lesson's summary, or for introducing a move before the exercise that uses it.",
    params: {
      moves: { type: "move[]", required: true, doc: "The moves to list, by id, in the order to show them." },
    },
    examples: [{ moves: ["intro", "apply", "exact"] }, { moves: ["ring", "linarith", "positivity"] }],
  },
};

export type ExerciseKind = "prove";

export const EXERCISES: Record<ExerciseKind, ExerciseSpec> = {
  prove: {
    doc: "A statement to prove. Lean decides whether it is solved. In `board` mode the learner clicks moves on the proof board and each click writes one line of Lean; in `typed` mode they write the Lean in an editor with the goals beside it.",
    label: "Prove it",
    params: {
      mode: { type: "enum:board|typed", doc: "How the proof is entered. Default board." },
      says: { type: "string", required: true, doc: "The claim in plain English, as a mathematician would say it. Shown above the exercise." },
      statement: { type: "text", required: true, doc: "The Lean statement after the keyword: binders, a colon, the claim. Quote it: it contains colons." },
      given: { type: "text", doc: "Lean definitions the statement is about, placed before the theorem. No `sorry`, no `axiom`." },
      moves: { type: "move[]", doc: "Board mode, required there: the moves on offer. Every line of the solution must be one of them." },
      forbid: { type: "string[]", doc: "Tactic and theorem names that may not appear in an answer. Forbidding anything also forbids `try?`." },
      solution: { type: "text", required: true, doc: "A proof body, one tactic per line, that Lean accepts. `npm test` checks it against the real Lean." },
    },
    check: (p) => {
      const out: string[] = [];
      const statement = typeof p.statement === "string" ? p.statement : "";
      const given = typeof p.given === "string" ? p.given : "";
      if (statement && !statement.includes(":")) out.push("needs a Lean `statement` (binders, a colon, the claim)");
      if (/:=|\bsorry\b/.test(statement)) out.push("the statement must not contain := or sorry");
      if (/\b(sorry|admit|axiom)\b/.test(given)) out.push("`given` must not contain sorry, admit or an axiom");
      if ((p.mode ?? "board") === "board" && !(Array.isArray(p.moves) && p.moves.length)) out.push("a board exercise needs `moves`");
      return out;
    },
  },
};

export function isWidget(type: string): type is WidgetType {
  return Object.hasOwn(WIDGETS, type);
}

export function isExerciseKind(kind: string): kind is ExerciseKind {
  return Object.hasOwn(EXERCISES, kind);
}

const isText = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

/** Why `value` is not a `type`, or null when it is one. */
export function checkParam(type: ParamType, value: unknown): string | null {
  if (type.startsWith("enum:")) {
    const options = type.slice(5).split("|");
    return typeof value === "string" && options.includes(value) ? null : `must be one of ${options.join(", ")}`;
  }
  if (type.startsWith("enum[]:")) {
    const options = type.slice(7).split("|");
    if (!Array.isArray(value)) return `must be a list drawn from ${options.join(", ")}`;
    const bad = value.find((v) => typeof v !== "string" || !options.includes(v));
    return bad === undefined ? null : `${JSON.stringify(bad)} is not one of ${options.join(", ")}`;
  }
  switch (type) {
    case "string":
      if (!isText(value)) return "must be text";
      return value.trim().includes("\n") ? "must be one line of text" : null;
    case "text":
      return isText(value) ? null : "must be text";
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? null : "must be a number";
    case "boolean":
      return typeof value === "boolean" ? null : "must be true or false";
    case "string[]":
      return Array.isArray(value) && value.every(isText) ? null : "must be a list of text, like [a, b]";
    case "number[]":
      return Array.isArray(value) && value.every((v) => typeof v === "number" && Number.isFinite(v)) ? null : "must be a list of numbers, like [1, 2]";
    case "move[]": {
      if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) return "must be a list of moves, like [intro, exact]";
      const bad = value.find((v) => !isMove(v));
      return bad === undefined ? null : `move "${bad}" is not in web/shared/moves.ts`;
    }
    case "state": {
      if (!isText(value)) return "must be a proof state: lines of `name : statement`, then `⊢ goal`";
      const blocks = stateBlocks(value);
      for (const [i, block] of blocks.entries()) {
        const wrong = checkGoalText(block);
        if (wrong) return blocks.length > 1 ? `goal ${i + 1} ${wrong}` : wrong;
      }
      return null;
    }
  }
  return `has a type the registry does not know (${type})`;
}

/** One goal as Lean prints it: an optional `case` line, `name : statement`
 *  lines (a long one may continue, indented), then `⊢` and the goal. */
function checkGoalText(block: string): string | null {
  const lines = block.split("\n");
  const turnstile = lines.findIndex((l) => l.startsWith("⊢"));
  if (turnstile < 0) return "has no line starting with ⊢, which is where the goal goes";
  if (!lines[turnstile].slice(1).trim()) return "has nothing after ⊢";
  for (const [i, line] of lines.slice(0, turnstile).entries()) {
    if (i === 0 && line.startsWith("case ")) continue;
    if (i > 0 && /^\s/.test(line)) continue;
    if (!/\S : \S/.test(line)) return `has the line “${line.trim()}”, which is not \`name : statement\``;
  }
  return null;
}

function checkBounds(spec: ParamSpec, value: unknown): string | null {
  for (const n of Array.isArray(value) ? value : [value]) {
    if (typeof n !== "number") continue;
    if (spec.integer && !Number.isInteger(n)) return `${n} must be a whole number`;
    if (spec.min !== undefined && n < spec.min) return `${n} is below the least allowed, ${spec.min}`;
    if (spec.max !== undefined && n > spec.max) return `${n} is above the most allowed, ${spec.max}`;
  }
  return null;
}

/**
 * Everything wrong with `params` for an entry of the registry, one sentence
 * each: a parameter it does not take, a required one missing, a value of the
 * wrong kind, then the entry's own checks across parameters. Empty when the
 * parameters are good. `ignore` names keys that belong to the block and not
 * to the entry (`WIDGET_KEYS`, `EXERCISE_KEYS`).
 */
export function checkParams(spec: { params: ParamSpecs; check?: (params: Params) => string[] }, params: Params, ignore: readonly string[] = []): string[] {
  const out: string[] = [];
  const known = Object.keys(spec.params);
  for (const key of Object.keys(params)) {
    if (ignore.includes(key) || Object.hasOwn(spec.params, key)) continue;
    out.push(`has no parameter \`${key}\`${known.length ? ` (it takes ${known.map((k) => `\`${k}\``).join(", ")})` : ""}`);
  }
  for (const [key, p] of Object.entries(spec.params)) {
    const value = params[key];
    if (value === undefined || value === null) {
      if (p.required) out.push(`needs \`${key}\`: ${p.doc}`);
      continue;
    }
    const wrong = checkParam(p.type, value) ?? checkBounds(p, value);
    // A checker's sentence that already names what is wrong ("move …") stands alone.
    if (wrong) out.push(/^(move|goal) /.test(wrong) ? `\`${key}\`: ${wrong}` : `\`${key}\` ${wrong}`);
  }
  // Checks across parameters assume each one is of the right kind.
  if (!out.length && spec.check) out.push(...spec.check(params));
  return out;
}
