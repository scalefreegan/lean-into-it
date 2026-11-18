import { checkExpr } from "./expr.ts";
import { stateBlocks } from "./goals.ts";
import { isMove } from "./moves.ts";
import { readInterval, readPoint } from "./numberline.ts";
import { escapesIn, fillBody, fillProblem, GAP, lex } from "./proof.ts";

// The catalogue of widgets a lesson may embed and exercise kinds it may
// declare, with the parameters each accepts. This file is the single source
// of truth: the loader validates content against it, docs/CONTENT.md
// describes it for authors (human and agent), the Gallery page (#/gallery)
// lists it, and the UI implements it. Adding a widget or an exercise kind
// starts here: the two name types below are what make the UI's component
// tables (web/src/widgets/registry.ts, web/src/exercises/registry.ts)
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
  | "expr[]" // expressions in x: ["2x + 1", "x^2"] (web/shared/expr.ts)
  | "range" // two numbers, the smaller first: [-5, 5]
  | "point[]" // numbers on a line, each optionally labelled: [0, "1/2", "sqrt(2): √2"]
  | "interval[]" // ["(2, 4)", "[0, 1]", "(-inf, 3]"]
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
  /** Whole exercises of this kind, for authors (docs/CONTENT-REFERENCE.md
   *  prints them). Each must pass the checks and load (reference.test.ts),
   *  and Lean must accept it, a board example line by line as the board
   *  writes it (lean.test.ts). */
  examples: Params[];
  check?: (params: Params) => string[];
}

/** A widget block's own key: `type:` names the widget, so no parameter may
 *  be called that (YAML would refuse the duplicate key). */
export const WIDGET_KEYS = ["type"] as const;
/** What every exercise carries whatever its kind. A kind's parameters may
 *  not reuse these names. */
export const EXERCISE_KEYS = ["id", "kind", "title", "concept"] as const;

export type WidgetType = "proof-state" | "move-list" | "plot" | "number-line" | "square-of-sum";

/** At most this many curves on one plot: each has its own line style. */
export const MAX_CURVES = 4;

const pair = (v: unknown): [number, number] | null => (Array.isArray(v) && v.length === 2 ? (v as [number, number]) : null);

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
  plot: {
    doc: "The graph of one or more functions of x. A point can be moved along the curves to read off values; the view can be dragged, zoomed and reset.",
    params: {
      functions: { type: "expr[]", required: true, doc: `The functions to draw, at most ${MAX_CURVES}: \`["2x + 1", "x^2"]\`. Arithmetic, powers, abs or |…|, sqrt, sin, cos, tan, exp, log, pi, e.` },
      x: { type: "range", doc: "The stretch of the x-axis shown at first. Default [-5, 5]." },
      y: { type: "range", doc: "The stretch of the y-axis shown at first. Default: fitted to the curves." },
      domain: { type: "range", doc: "Draw the curves only for x between these two numbers, as for a function looked at on an interval." },
      trace: { type: "number", doc: "Where the movable point starts on the x-axis. Default: the middle of the view." },
      caption: { type: "string", doc: "One line shown under the graph." },
    },
    examples: [
      { functions: ["2x + 1"], x: [-3, 3] },
      { functions: ["x^2", "|x|"], x: [-3, 3], trace: -1, caption: "Two functions that come down on the left of 0 and go up on the right." },
      { functions: ["2x + 1", "3"], x: [-1, 2], y: [-1, 5], domain: [0, 1], caption: "Between x = 0 and x = 1 the line stays under height 3." },
      { functions: ["1/x"], x: [-4, 4], y: [-4, 4] },
    ],
    check: (p) => {
      const out: string[] = [];
      if (Array.isArray(p.functions) && p.functions.length > MAX_CURVES) out.push(`\`functions\` has ${p.functions.length} functions, and a plot can tell at most ${MAX_CURVES} apart`);
      const x = pair(p.x) ?? [-5, 5];
      const domain = pair(p.domain);
      if (domain && (domain[1] <= x[0] || domain[0] >= x[1])) out.push(`\`domain\` [${domain.join(", ")}] is outside the part of the x-axis shown, [${x.join(", ")}]`);
      if (typeof p.trace === "number" && (p.trace < x[0] || p.trace > x[1])) out.push(`\`trace\` ${p.trace} is outside the part of the x-axis shown, [${x.join(", ")}]`);
      else if (typeof p.trace === "number" && domain && (p.trace < domain[0] || p.trace > domain[1])) out.push(`\`trace\` ${p.trace} is outside \`domain\` [${domain.join(", ")}], where the curves are drawn`);
      return out;
    },
  },
  "number-line": {
    doc: "A number line with points, intervals and distances marked on it. With `probe`, a point x that can be moved along the line, with a readout of where it is.",
    params: {
      range: { type: "range", doc: "The stretch of the line shown. Default [-5, 5]." },
      points: { type: "point[]", doc: 'Points to mark: a number, or text giving a number and the label to write above it, as in `[0, 1, "1/2", "sqrt(2): √2"]`.' },
      intervals: { type: "interval[]", doc: 'Stretches to shade, in interval notation: `["(2, 4)", "[0, 1]", "(-inf, 3]"]`. A round bracket leaves the end out, a square one includes it.' },
      distance: { type: "range", doc: "Two numbers a and b: draws the distance between them and labels it |a − b|." },
      via: { type: "number", doc: "With `distance`: a third point b. Also draws the distances from a to b and from b to c, the detour of the triangle inequality." },
      near: { type: "number[]", doc: "A centre c and a radius r, as `[3, 1]`: shades the points within r of c, the window |x − c| < r." },
      probe: { type: "number", doc: "Where a movable point x starts. The readout says where x is, which intervals it is in, and how far it is from the centre of `near`." },
      caption: { type: "string", doc: "One line shown under the line." },
    },
    examples: [
      { range: [-3, 4], points: [0, 1, "1/2", "sqrt(2): √2", "pi: π", "-7/3"] },
      { range: [0, 6], distance: [2, 5], points: ["2: a", "5: b"], caption: "The distance from 2 to 5 is 3, whichever way you subtract." },
      { range: [0, 8], distance: [1, 3], via: 6, points: ["1: a", "3: c", "6: b"], caption: "From a to c directly, and by way of b." },
      { range: [0, 6], near: [3, 1], probe: 3.4, caption: "The points within 1 of 3." },
      { range: [-5, 5], intervals: ["(-inf, -1]", "(2, 4)"], probe: 0 },
    ],
    check: (p) => {
      const out: string[] = [];
      const [lo, hi] = pair(p.range) ?? [-5, 5];
      const on = (v: number) => v >= lo && v <= hi;
      const off = (what: string) => `${what} is off the line, which runs from ${lo} to ${hi}`;
      for (const source of Array.isArray(p.points) ? p.points : []) {
        const point = readPoint(source);
        if (point && !on(point.value)) out.push(off(`the point ${JSON.stringify(source)}`));
      }
      for (const source of Array.isArray(p.intervals) ? p.intervals : []) {
        const i = readInterval(source);
        // Off the line unless some point of it is on the line: an end on the edge counts only if it is included.
        if (typeof i !== "string" && (i.hi < lo || i.lo > hi || (i.hi === lo && !i.hiClosed) || (i.lo === hi && !i.loClosed))) out.push(off(`the interval ${source}`));
      }
      const distance = pair(p.distance);
      if (distance && !(on(distance[0]) && on(distance[1]))) out.push(off(`\`distance\` [${distance.join(", ")}]`));
      if (typeof p.via === "number") {
        if (!distance) out.push("`via` needs `distance`: it is the point the detour between those two goes through");
        else if (!on(p.via)) out.push(off(`\`via\` ${p.via}`));
      }
      if (p.near !== undefined && p.near !== null) {
        const near = pair(p.near);
        if (!near) out.push("`near` must be two numbers, a centre and a radius, like [3, 1]");
        else if (!(near[1] > 0)) out.push("`near`: the radius must be more than 0");
        else if (!(on(near[0] - near[1]) && on(near[0] + near[1]))) out.push(off(`the window of \`near\`, from ${near[0] - near[1]} to ${near[0] + near[1]},`));
      }
      if (typeof p.probe === "number" && !on(p.probe)) out.push(off(`\`probe\` ${p.probe}`));
      return out;
    },
  },
  "square-of-sum": {
    doc: "A square of side a + b cut into a square of side a, a square of side b and two a-by-b rectangles, with sliders for a and b: the picture behind (a + b)² = a² + 2ab + b².",
    params: {
      a: { type: "number", min: 0.5, max: 10, doc: "The first length at the start. Default 3." },
      b: { type: "number", min: 0.5, max: 10, doc: "The second length at the start. Default 2." },
    },
    examples: [{}, { a: 1, b: 4 }],
  },
};

export type ExerciseKind = "prove" | "fill";

/** What is wrong with a statement and its definitions, whatever the kind. */
function statementProblems(p: Params): string[] {
  const out: string[] = [];
  const statement = typeof p.statement === "string" ? p.statement : "";
  const given = typeof p.given === "string" ? p.given : "";
  if (statement && !statement.includes(":")) out.push("needs a Lean `statement` (binders, a colon, the claim)");
  if (/:=|\bsorry\b/.test(statement)) out.push("the statement must not contain := or sorry");
  if (/\b(sorry|admit|axiom)\b/.test(given)) out.push("`given` must not contain sorry, admit or an axiom");
  return out;
}

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
    examples: [
      {
        mode: "board",
        says: "Suppose P is true, and suppose that if P then Q. Then Q is true.",
        statement: "(P Q : Prop) (hP : P) (hPQ : P → Q) : Q",
        moves: ["apply", "exact"],
        solution: "apply hPQ\nexact hP",
      },
      {
        mode: "typed",
        says: "For every natural number n, double n = 2 * n.",
        statement: "(n : ℕ) : double n = 2 * n",
        given: "def double (n : ℕ) : ℕ := n + n",
        forbid: ["simp", "grind"],
        solution: "unfold double\nomega",
      },
    ],
    check: (p) => {
      const out = statementProblems(p);
      if ((p.mode ?? "board") === "board" && !(Array.isArray(p.moves) && p.moves.length)) out.push("a board exercise needs `moves`");
      return out;
    },
  },
  fill: {
    doc: `A proof that is written out except for one step, marked \`${GAP}\`. The learner supplies the step: by typing one line, or, when \`options\` are given, by choosing one of them. Lean checks the completed proof either way; a choice is not compared with a stored answer.`,
    label: "Fill the gap",
    params: {
      says: { type: "string", required: true, doc: "The claim in plain English. Shown above the exercise." },
      statement: { type: "text", required: true, doc: "The Lean statement after the keyword: binders, a colon, the claim. Quote it: it contains colons." },
      given: { type: "text", doc: "Lean definitions the statement is about, placed before the theorem. No `sorry`, no `axiom`." },
      proof: { type: "text", required: true, doc: `The proof body with \`${GAP}\` exactly once, where the missing step goes: a whole line, or part of one.` },
      solution: { type: "string", required: true, doc: "What goes in the gap: one line. `npm test` checks the completed proof against the real Lean." },
      options: { type: "string[]", doc: "The choice form: two to five fills to choose from, the solution among them. `npm test` checks that Lean accepts the solution and refuses every other option." },
      forbid: { type: "string[]", doc: "Names that may not appear in what is typed into the gap (the proof around it may use them)." },
    },
    examples: [
      {
        says: "For any real number x, |x + 1| ≤ |x| + 1.",
        statement: "(x : ℝ) : |x + 1| ≤ |x| + 1",
        proof: `calc |x + 1| ≤ |x| + |1| := ${GAP}\n  _ = |x| + 1 := by rw [abs_one]`,
        forbid: ["grind", "simp", "gcongr"],
        solution: "abs_add_le x 1",
      },
      {
        says: "Suppose a ≤ b and b ≤ c. Then a ≤ c.",
        statement: "(a b c : ℝ) (h1 : a ≤ b) (h2 : b ≤ c) : a ≤ c",
        proof: `calc a ≤ b := h1\n  _ ≤ c := ${GAP}`,
        options: ["h1", "h2", "le_refl c"],
        solution: "h2",
      },
    ],
    check: (p) => {
      const out = statementProblems(p);
      const proof = typeof p.proof === "string" ? p.proof : "";
      if (proof && proof.split(GAP).length !== 2) out.push(`\`proof\` must contain ${GAP} exactly once (it has ${proof.split(GAP).length - 1})`);
      else if (proof && !lex(proof).bare.includes(GAP)) out.push(`\`proof\` has its ${GAP} inside a comment or a string, where Lean would never read what is put there`);
      if (/\b(sorry|admit)\b/.test(proof)) out.push("`proof` must not contain sorry or admit");
      // What every answer would be refused for is refused here, where the author sees it.
      if (typeof p.solution === "string" && !fillProblem(p.solution)) for (const e of escapesIn(fillBody(proof, p.solution))) out.push(`\`proof\` line ${e.line + 1}: ${e.message}`);
      const fills = [...(typeof p.solution === "string" ? [p.solution] : []), ...(Array.isArray(p.options) ? p.options.filter((o) => typeof o === "string") : [])];
      for (const fill of new Set(fills)) {
        const wrong = fillProblem(fill);
        if (wrong) out.push(`${JSON.stringify(fill)} cannot go in a gap: ${wrong}`);
      }
      if (Array.isArray(p.options)) {
        const options = p.options.map((o) => String(o).trim());
        if (options.length < 2 || options.length > 5) out.push("`options` must offer two to five choices");
        if (new Set(options).size !== options.length) out.push("`options` lists the same choice twice");
        if (typeof p.solution === "string" && !options.includes(p.solution.trim())) out.push("`options` must include the `solution`");
      }
      return out;
    },
  },
};

/** A value as YAML that reads back as itself, on one line. Text is written
 *  bare only where YAML cannot take it for anything else. */
function yamlScalar(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(yamlScalar).join(", ")}]`;
  if (typeof value !== "string") return String(value);
  return /^[A-Za-z][A-Za-z0-9 .()'-]*$/.test(value) && !/^(true|false|null|yes|no|on|off|y|n)$/i.test(value) && value === value.trim() ? value : JSON.stringify(value);
}

/** Text that can be written as a YAML block (`key: |`): more than one
 *  line, and a first line that is not indented, which YAML would take for
 *  the indentation of the whole block. */
const asBlock = (value: string) => value.includes("\n") && !/^\s/.test(value);

/** A widget block as it is written in a lesson file. The Gallery prints
 *  each example this way, to be copied; registry.test.ts checks that what
 *  it prints loads back as the same parameters. */
export function widgetBlock(type: WidgetType, params: Params): string {
  const lines = [`type: ${type}`];
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && asBlock(value)) lines.push(`${key}: |`, ...value.replace(/\n+$/, "").split("\n").map((l) => (l ? `  ${l}` : "")));
    else lines.push(`${key}: ${yamlScalar(value)}`);
  }
  return ["```widget", ...lines, "```"].join("\n");
}

/** An exercise as it is written under `exercises:` in a lesson's frontmatter. */
export function exerciseBlock(kind: ExerciseKind, id: string, title: string, params: Params): string {
  const lines = [`  - id: ${yamlScalar(id)}`, `    kind: ${kind}`, `    title: ${yamlScalar(title)}`];
  for (const [key, value] of Object.entries(params)) {
    const text = EXERCISES[kind].params[key]?.type === "text" && key !== "statement";
    if (typeof value === "string" && (asBlock(value) || (text && !/^\s/.test(value)))) {
      lines.push(`    ${key}: |`, ...value.replace(/\n+$/, "").split("\n").map((l) => (l ? `      ${l}` : "")));
    } else lines.push(`    ${key}: ${yamlScalar(value)}`);
  }
  return lines.join("\n");
}

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
    case "expr[]": {
      if (!Array.isArray(value) || !value.length) return "must be a list of expressions in x, like [\"2x + 1\", \"x^2\"]";
      for (const v of value) {
        const wrong = checkExpr(typeof v === "number" ? String(v) : v);
        if (wrong) return wrong;
      }
      return null;
    }
    case "range": {
      if (!Array.isArray(value) || value.length !== 2 || !value.every((v) => typeof v === "number" && Number.isFinite(v))) return "must be two numbers, like [-5, 5]";
      if (value.some((v) => Math.abs(v) > 1e6)) return "must stay between -1000000 and 1000000";
      return value[0] < value[1] ? null : `must have the smaller number first: [${value[1]}, ${value[0]}]`;
    }
    case "point[]": {
      if (!Array.isArray(value)) return "must be a list of points, like [0, \"1/2\", \"sqrt(2): √2\"]";
      const bad = value.find((v) => !readPoint(v));
      return bad === undefined ? null : `${JSON.stringify(bad)} is not a point: write a number, or a number and a label as "sqrt(2): √2"`;
    }
    case "interval[]": {
      if (!Array.isArray(value)) return "must be a list of intervals, like [\"(2, 4)\", \"[0, 1]\"]";
      for (const v of value) {
        const read = readInterval(v);
        if (typeof read === "string") return read;
      }
      return null;
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
    // `h :` alone is how Lean starts a statement too long for one line; it
    // goes on, indented, on the lines below.
    const goesOn = /\S :$/.test(line) && /^\s+\S/.test(lines[i + 1] ?? "");
    if (!/\S : \S/.test(line) && !goesOn) return `has the line “${line.trim()}”, which is not \`name : statement\``;
  }
  // Lean indents a goal that runs over a line. Anything else after ⊢ is a
  // second goal with no blank line before it, or something that is not a state.
  const after = lines.slice(turnstile + 1).find((line) => !/^\s/.test(line));
  if (after !== undefined) return `has the line “${after.trim()}” after the goal. A blank line starts another goal, and a goal that runs on is indented`;
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
    // A required list with nothing in it is as good as missing.
    if (value === undefined || value === null || (p.required && Array.isArray(value) && !value.length)) {
      if (p.required) out.push(`needs \`${key}\`: ${p.doc}`);
      continue;
    }
    const wrong = checkParam(p.type, value) ?? checkBounds(p, value);
    // A checker's sentence that already names what is wrong ("move …") stands alone.
    if (wrong) out.push(/^(move|goal) |^[“"]/.test(wrong) ? `\`${key}\`: ${wrong}` : `\`${key}\` ${wrong}`);
  }
  // Checks across parameters assume each one is of the right kind.
  if (!out.length && spec.check) out.push(...spec.check(params));
  return out;
}
