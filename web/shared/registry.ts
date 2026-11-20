import { checkExpr } from "./expr.ts";
import { stateBlocks } from "./goals.ts";
import { isMove } from "./moves.ts";
import { readInterval, readPoint } from "./numberline.ts";
import { escapesIn, fillBody, fillProblem, GAP, lex } from "./proof.ts";
import { splitStatement, valuesProblem } from "./truefalse.ts";
import { lettersOf, MAX_LETTERS, parseFormula } from "./truthtable.ts";
import { optionProblem } from "./recognize.ts";

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

export type WidgetType = "proof-state" | "move-list" | "plot" | "number-line" | "square-of-sum" | "truth-table" | "induction-dominoes";

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
  "truth-table": {
    doc: "The truth table of a formula built from letters with and, or, not, implies and iff: one row for every way of making the letters true or false. With `fill`, the learner fills in the formula's column and checks it. A table checks every case, one by one; a proof argues once for all of them.",
    params: {
      formula: { type: "string", required: true, doc: "The formula: one-letter propositions (not T or F) with `∧ ∨ ¬ → ↔`, or `/\\ \\/ ~ -> <->`, `True`, `False` and brackets, as in `(p → q) ∧ ¬q → ¬p`. At least one connective, at most five letters. As in Lean, a chain of ↔ needs brackets." },
      steps: { type: "boolean", doc: "Show a column for each part of the formula, innermost first, before the whole. Default true." },
      fill: { type: "boolean", doc: "The learner fills in the formula's own column (each cell T or F), then checks it against the table. Default false: the table is shown complete." },
      caption: { type: "string", doc: "One line shown under the table." },
    },
    examples: [
      { formula: "p → q", steps: false, caption: "An implication is false in one row only: true, then false." },
      { formula: "(p → q) ∧ ¬q → ¬p", caption: "True in every row: modus tollens holds whatever p and q are." },
      { formula: "¬(p ∧ q) ↔ ¬p ∨ ¬q", fill: true },
    ],
    check: (p) => {
      if (typeof p.formula !== "string") return [];
      const f = parseFormula(p.formula);
      if (typeof f === "string") return [`\`formula\`: ${f}`];
      if (f.op === "var" || f.op === "const") return ["`formula` needs at least one connective: a single letter's table is just the letter"];
      const letters = lettersOf(f);
      return letters.length > MAX_LETTERS ? [`\`formula\` has ${letters.length} letters; at most ${MAX_LETTERS} (${2 ** MAX_LETTERS} rows) fit`] : [];
    },
  },
  "induction-dominoes": {
    doc: "Induction as a row of dominoes. The base case knocks over the first; the step is the rule that if domino n falls, so does domino n + 1. The learner can take either away and push again: without the base nothing falls, without the step only the first does.",
    params: {
      count: { type: "number", integer: true, min: 4, max: 12, doc: "How many dominoes are drawn (the row stands for all of ℕ). Default 8." },
      claim: { type: "string", doc: "What P(n) says, shown with the dominoes: `2⁰ + … + 2ⁿ = 2ⁿ⁺¹ − 1`." },
      start: { type: "number", integer: true, min: 0, max: 5, doc: "The number on the first domino, where the base case is. Default 0." },
      gap: { type: "number", integer: true, min: 0, max: 16, doc: "Leave the step out at this domino only: the one numbered `gap` falls but does not knock the next. For a proof whose step fails at one n." },
      caption: { type: "string", doc: "One line shown under the dominoes." },
    },
    examples: [
      { claim: "0 + 1 + … + n = n(n + 1)/2", caption: "Push the first. Then take away the base case, or the step, and push again." },
      { count: 6, start: 1, gap: 2, caption: "A step that holds everywhere but from 2 to 3: the chain stops at 2." },
    ],
    check: (p) => {
      const count = typeof p.count === "number" ? p.count : 8;
      const start = typeof p.start === "number" ? p.start : 0;
      return typeof p.gap === "number" && (p.gap < start || p.gap >= start + count - 1) ? [`\`gap\` must be the number of a domino with another after it: ${start} to ${start + count - 2}`] : [];
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

export type ExerciseKind = "prove" | "fill" | "truefalse" | "predict" | "read" | "match" | "flaw";

/** Two to `max` distinct choices, the solution among them. */
function choiceProblems(p: Params, max = 5): string[] {
  const out: string[] = [];
  if (!Array.isArray(p.options)) return out;
  const options = p.options.map((o) => String(o).trim());
  if (options.length < 2 || options.length > max) out.push(`\`options\` must offer two to ${max} choices`);
  if (new Set(options).size !== options.length) out.push("`options` lists the same choice twice");
  if (typeof p.solution === "string" && !options.includes(p.solution.trim())) out.push("`options` must include the `solution`");
  return out;
}

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
  truefalse: {
    doc: "A claim to decide. The learner says whether it is true or false, then backs that up: a proof when it is true, a counterexample when it is false (a value for each variable of the statement, which Lean checks by proving the claim's negation). Picking the side Lean has not backed up is answered at once with `why`. Lean decides either way.",
    label: "True or false",
    params: {
      says: { type: "string", required: true, doc: "The claim in plain English, as a mathematician would say it. Shown above the exercise." },
      statement: { type: "text", required: true, doc: "The claim in Lean: binder groups, a colon, the claim. A false claim's conditions go in the claim (`n > 0 → …`), not in binders: a counterexample gives a value for every `( )` binder." },
      given: { type: "text", doc: "Lean definitions the statement is about, placed before the theorem. No `sorry`, no `axiom`." },
      truth: { type: "boolean", required: true, doc: "Whether the claim holds. `npm test` checks the reference answer on that side against the real Lean." },
      why: { type: "text", required: true, doc: "Said to a learner who picks the other side: why the claim is true, or where it fails, in a sentence or two." },
      solution: { type: "text", doc: "The reference proof: required when `truth` is true (a proof of the statement), and with `witness: proof` (a proof of False from hc, the claim at the counterexample's values)." },
      counterexample: { type: "string", doc: "Required when `truth` is false: a value for each variable, in order, separated by commas, like `1` or `2, 3`. Numbers only." },
      close: { type: "string", doc: "With `witness: values`: the tactic that shows the claim fails at the values given. Default norm_num; decide for small cases." },
      witness: { type: "enum:values|proof", doc: "What a counterexample takes from the learner: only the values (default; `close` does the rest), or the values and the proof that they work." },
      forbid: { type: "string[]", doc: "Names that may not appear in what the learner writes." },
    },
    examples: [
      {
        says: "For every natural number n, n² is at least 2n.",
        statement: "(n : ℕ) : n ^ 2 ≥ 2 * n",
        truth: false,
        why: "At n = 1, n² is 1 and 2n is 2. (From n = 2 on it does hold.)",
        counterexample: "1",
      },
      {
        says: "For every natural number n, n² + n is even.",
        statement: "(n : ℕ) : Even (n ^ 2 + n)",
        truth: true,
        why: "n² + n = n(n + 1), and one of two numbers in a row is even.",
        solution: "have h : n ^ 2 + n = n * (n + 1) := by ring\nrw [h]\nexact Nat.even_mul_succ_self n",
      },
      {
        says: "For all whole numbers a and b, (a + b)² = a² + b².",
        statement: "(a b : ℤ) : (a + b) ^ 2 = a ^ 2 + b ^ 2",
        truth: false,
        why: "(a + b)² = a² + 2ab + b², so it fails whenever ab is not 0: at a = b = 1 the left side is 4 and the right side 2.",
        counterexample: "1, 1",
        witness: "proof",
        solution: "norm_num at hc",
      },
    ],
    check: (p) => {
      const out = statementProblems(p);
      const statement = typeof p.statement === "string" ? p.statement : "";
      const split = statement ? splitStatement(statement) : null;
      if (statement && !split) out.push("the `statement` must be binder groups like `(n : ℕ)`, then a colon, then the claim");
      const witness = p.witness === "proof" ? "proof" : "values";
      const solution = typeof p.solution === "string" ? p.solution.trim() : "";
      if (p.truth === true) {
        if (!solution) out.push("a true claim needs a `solution`: the proof of the statement");
        if (p.counterexample !== undefined) out.push("a true claim has no `counterexample`");
      }
      if (p.truth === false) {
        if (typeof p.counterexample !== "string") out.push("a false claim needs a `counterexample`: a value for each variable");
        else if (split) {
          if (!split.names.length) out.push("a false claim needs variables in `( )` binders for a counterexample to give values to");
          const wrong = valuesProblem(p.counterexample.split(",").map((v) => v.trim()), split.names);
          if (split.names.length && wrong) out.push(`\`counterexample\`: ${wrong}`);
        }
        if (witness === "proof" && !solution) out.push("with `witness: proof` a `solution` is needed: the proof of False from hc");
        if (witness === "values" && solution) out.push("with `witness: values` there is no `solution`: `close` shows the values work");
      }
      if (typeof p.close === "string" && (p.truth !== false || witness === "proof")) out.push("`close` is only for a false claim with `witness: values`");
      return out;
    },
  },
  predict: {
    doc: "Before a move runs, say what the goal becomes. The learner sees the state, the move, and states to choose from; Lean decides, by running the move and comparing the state it leaves with the one chosen. `npm test` holds the `solution` to Lean: it must be the state Lean leaves, and no other option may be.",
    label: "Predict the goal",
    params: {
      says: { type: "string", required: true, doc: "What the proof is about, in plain English. Shown above the exercise." },
      statement: { type: "text", required: true, doc: "The Lean statement after the keyword: binders, a colon, the claim." },
      given: { type: "text", doc: "Lean definitions the statement is about, placed before the theorem. No `sorry`, no `axiom`." },
      before: { type: "text", doc: "Proof lines that run first, to reach the state shown. Default: none, so the state is the statement's own." },
      move: { type: "string", required: true, doc: "The one tactic line whose effect is predicted, like `intro h` or `apply hpq`." },
      options: { type: "string[]", required: true, doc: "Two to five states, each as Lean prints it (facts, then a line starting ⊢; several goals one after another), or `no goals`. Write the misreadings learners make." },
      solution: { type: "text", required: true, doc: "The option Lean leaves. Facts may be in any order and spacing does not matter, but names and types must be as Lean prints them." },
    },
    examples: [
      {
        says: "Using an implication to change what is left to prove.",
        statement: "(p q : Prop) (hp : p) (hpq : p → q) : q",
        move: "apply hpq",
        options: ["p q : Prop\nhp : p\nhpq : p → q\n⊢ p", "p q : Prop\nhp : p\nhpq : p → q\n⊢ q", "p q : Prop\nhp : p\nhpq : p → q\n⊢ p → q"],
        solution: "p q : Prop\nhp : p\nhpq : p → q\n⊢ p",
      },
      {
        says: "Taking a conjunction apart.",
        statement: "(P Q : Prop) : P ∧ Q → Q ∧ P",
        before: "intro h",
        move: "obtain ⟨hp, hq⟩ := h",
        options: ["P Q : Prop\nhp : P\nhq : Q\n⊢ Q ∧ P", "P Q : Prop\nh : P ∧ Q\nhp : P\nhq : Q\n⊢ Q ∧ P", "P Q : Prop\nhp : P\nhq : Q\n⊢ Q\n\nP Q : Prop\nhp : P\nhq : Q\n⊢ P"],
        solution: "P Q : Prop\nhp : P\nhq : Q\n⊢ Q ∧ P",
      },
    ],
    check: (p) => {
      const out = statementProblems(p);
      if (typeof p.move === "string" && (p.move.includes("\n") || !p.move.trim())) out.push("`move` is one line of Lean");
      for (const o of Array.isArray(p.options) ? p.options : []) {
        const wrong = optionProblem(String(o));
        if (wrong) out.push(`${JSON.stringify(o)}: ${wrong}`);
      }
      for (const text of [p.before, p.move].filter((t): t is string => typeof t === "string")) if (/\b(sorry|admit)\b/.test(text)) out.push("`before` and `move` must not contain sorry or admit");
      // What the server would refuse to run is refused here, where the author sees it.
      const lines = [p.before, p.move].filter((t): t is string => typeof t === "string" && t.trim() !== "").join("\n");
      for (const e of escapesIn(lines)) out.push(`\`before\`/\`move\` line ${e.line + 1}: ${e.message}`);
      out.push(...choiceProblems(p));
      return out;
    },
  },
  read: {
    doc: "A Lean statement and sentences that say what it might claim; the learner chooses the one that says what it does. A fixed answer: marked against `solution`. Lean checks that the statement is one it can read.",
    label: "Read the Lean",
    params: {
      statement: { type: "text", required: true, doc: "The Lean statement to read: binders, a colon, the claim." },
      given: { type: "text", doc: "Lean definitions the statement is about, placed before it. No `sorry`, no `axiom`." },
      options: { type: "string[]", required: true, doc: "Two to five sentences, one of them right. Write the misreadings learners make: a quantifier order swapped, an implication reversed." },
      solution: { type: "string", required: true, doc: "The sentence that says what the statement claims." },
      why: { type: "text", doc: "Shown after the answer, right or wrong: how to read the statement." },
    },
    examples: [
      {
        statement: "(f : ℕ → ℕ) : ∀ n, ∃ m, f m > n",
        options: ["Whatever number you name, f takes a value above it somewhere.", "There is one place where f is larger than every number.", "f is increasing."],
        solution: "Whatever number you name, f takes a value above it somewhere.",
        why: "∀ n, ∃ m: the m may depend on n. With ∃ m, ∀ n one m would have to beat every n at once.",
      },
    ],
    check: (p) => [...statementProblems(p), ...choiceProblems(p)],
  },
  flaw: {
    doc: "A plausible argument with one wrong step; the learner says which. A fixed answer: marked against `flaw`, and `why` is shown once the right step is found. For an argument written in words, where Lean has nothing to check.",
    label: "Spot the flaw",
    params: {
      says: { type: "string", required: true, doc: "What the argument claims to show. Shown above it." },
      steps: { type: "string[]", required: true, doc: "The argument, two to eight steps in order, each a sentence or two. Exactly one is wrong." },
      flaw: { type: "number", required: true, integer: true, min: 1, max: 8, doc: "The number of the wrong step, counting from 1." },
      why: { type: "text", required: true, doc: "What is wrong with that step, shown once the learner finds it (after a wrong pick they are only told that step holds up)." },
    },
    examples: [
      {
        says: "A proof that 2 = 1.",
        steps: ["Let a and b be numbers with a = b.", "Multiply both sides by a: a² = ab.", "Subtract b² from both sides: a² − b² = ab − b².", "Factor both sides: (a + b)(a − b) = b(a − b).", "Divide both sides by a − b: a + b = b.", "Since a = b, that says 2b = b, and dividing by b gives 2 = 1."],
        flaw: 5,
        why: "Since a = b, a − b is 0, and dividing by 0 is not allowed: it turns the true 0 = 0 into the false a + b = b. (Step 6 divides by b, which is fine as long as b is not 0; the trouble is already there.)",
      },
    ],
    check: (p) => {
      const out: string[] = [];
      const steps = Array.isArray(p.steps) ? p.steps : [];
      if (steps.length < 2 || steps.length > 8) out.push("`steps` must have two to eight steps");
      if (typeof p.flaw === "number" && p.flaw > steps.length) out.push(`\`flaw\` is step ${p.flaw}, but there are only ${steps.length} steps`);
      return out;
    },
  },
  match: {
    doc: "Sentences and Lean statements to pair up, each sentence with the statement that says it. A fixed answer: the pairs as written are the right ones, and the Lean is shown in another order. Lean checks that every statement is one it can read.",
    label: "Match them up",
    params: {
      says: { type: "string", required: true, doc: "What to look for, in a sentence. Shown above the pairs." },
      english: { type: "string[]", required: true, doc: "Two to six sentences, in order." },
      lean: { type: "string[]", required: true, doc: "The Lean proposition for each sentence, in the same order: `∀ n : ℕ, ∃ m, m > n`. Lean checks each can be read, as a theorem's statement after `given`." },
      given: { type: "text", doc: "Lean definitions the statements are about. No `sorry`, no `axiom`." },
    },
    examples: [
      {
        says: "Quantifier order changes what is claimed.",
        english: ["Every natural number has a larger one.", "Some natural number is at least every natural number.", "Every natural number is at least 0."],
        lean: ["∀ n : ℕ, ∃ m, m > n", "∃ m : ℕ, ∀ n, n ≤ m", "∀ n : ℕ, 0 ≤ n"],
      },
    ],
    check: (p) => {
      const out = statementProblems(p);
      const en = Array.isArray(p.english) ? p.english : [];
      const ln = Array.isArray(p.lean) ? p.lean : [];
      if (en.length < 2 || en.length > 6) out.push("`english` must have two to six sentences");
      if (ln.length !== en.length) out.push("`lean` must have one statement for each sentence of `english`, in the same order");
      if (new Set(ln.map((l) => String(l).trim())).size !== ln.length) out.push("`lean` lists the same statement twice");
      for (const l of ln) if (/:=|\bsorry\b/.test(String(l))) out.push("a `lean` statement must not contain := or sorry");
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
