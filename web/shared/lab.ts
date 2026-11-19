// The Lab (web/src/pages/Lab.tsx): the open side of the app, where nothing is
// scored. Here, as data: one small Lean example for every move the
// curriculum teaches, to run and change, and the explorers on offer, each a
// registered widget with the parameters the Lab starts it with. Pure, so the
// tests can hold it to the curriculum (every move has an example), to the
// registry (every explorer's parameters are ones its widget takes) and to
// Lean (every example is accepted).

import { MOVES } from "./moves.ts";
import type { Params, WidgetType } from "./registry.ts";

/** Moves typed in a proof and not on the board, so not in MOVES. */
export const TYPED_ONLY: Record<string, string> = {
  calc: "Prove a chain of equations or inequalities one link at a time, each with its own reason.",
  have: "State a new fact in the middle of a proof, prove it, and add it to your facts.",
  "exact?": "Ask Lean to search the library for a fact that finishes the goal.",
};

/** One line on what a move does, in plain words; empty when nothing is written for it. */
export function moveDoes(tactic: string): string {
  return Object.hasOwn(MOVES, tactic) ? MOVES[tactic].does : Object.hasOwn(TYPED_ONLY, tactic) ? TYPED_ONLY[tactic] : "";
}

export interface TacticExample {
  /** A whole `example … := by …` that Lean accepts, using the move. */
  lean: string;
  /** What to look at when it is run. */
  watch: string;
}

/** An example for every move in content/curriculum.yaml (lab.test.ts holds it to that list; lean.test.ts gives each to Lean). */
export const TACTIC_EXAMPLES: Record<string, TacticExample> = {
  exact: {
    lean: "example (P : Prop) (hP : P) : P := by\n  exact hP",
    watch: "The goal is P and the fact hP says P, so hP finishes it.",
  },
  rfl: {
    lean: "example : 2 + 2 = 4 := by\n  rfl",
    watch: "Both sides work out to 4. Change the 4 and Lean refuses.",
  },
  norm_num: {
    lean: "example : (7 : ℝ) * 8 < 60 := by\n  norm_num",
    watch: "Lean calculates 56 and compares. Try 50 in place of 60.",
  },
  intro: {
    lean: "example (P : Prop) : P → P := by\n  intro hP\n  exact hP",
    watch: "Put the cursor at the start of the intro line, and then at the start of the line after it: P leaves the goal and joins the facts as hP.",
  },
  apply: {
    lean: "example (P Q : Prop) (hP : P) (hPQ : P → Q) : Q := by\n  apply hPQ\n  exact hP",
    watch: "After apply the goal is P, not Q: with “if P then Q” in hand, it is enough to prove P.",
  },
  constructor: {
    lean: "example (P Q : Prop) (hP : P) (hQ : Q) : P ∧ Q := by\n  constructor\n  · exact hP\n  · exact hQ",
    watch: "After constructor there are two goals, P and Q. Each · line proves one.",
  },
  obtain: {
    lean: "example (P Q : Prop) (h : P ∧ Q) : Q ∧ P := by\n  obtain ⟨hP, hQ⟩ := h\n  constructor\n  · exact hQ\n  · exact hP",
    watch: "The fact h, “P and Q”, becomes two facts, hP and hQ.",
  },
  left: {
    lean: "example (P Q : Prop) (hP : P) : P ∨ Q := by\n  left\n  exact hP",
    watch: "The goal “P or Q” becomes P. With right here, you would be stuck: there is no proof of Q.",
  },
  right: {
    lean: "example (P Q : Prop) (hQ : Q) : P ∨ Q := by\n  right\n  exact hQ",
    watch: "The goal “P or Q” becomes Q.",
  },
  exfalso: {
    lean: "example (P : Prop) (h : False) : P := by\n  exfalso\n  exact h",
    watch: "The goal P becomes False, and the fact h is exactly that.",
  },
  contradiction: {
    lean: "example (P Q : Prop) (hP : P) (hnP : ¬P) : Q := by\n  contradiction",
    watch: "hP and hnP cannot both hold, so any goal follows, Q included.",
  },
  by_contra: {
    lean: "example (P : Prop) (h : ¬¬P) : P := by\n  by_contra hnP\n  apply h\n  exact hnP",
    watch: "After by_contra you hold hnP, “not P”, and the goal is False.",
  },
  use: {
    lean: "example : ∃ n : ℕ, n * n = 49 := by\n  use 7",
    watch: "You name the number. Lean checks 7 * 7 = 49 itself; with use 6 the goal 6 * 6 = 49 is left, and it is false.",
  },
  decide: {
    lean: "example : ¬ (3 ∣ 10) := by\n  decide",
    watch: "Lean checks that 3 does not divide 10 by trying it.",
  },
  rw: {
    lean: "example (a b : ℕ) (h : a = b) : a + 1 = b + 1 := by\n  rw [h]",
    watch: "Every a in the goal becomes b. Both sides are then the same, and that finishes it.",
  },
  simp: {
    lean: "example (n : ℕ) : 0 + n = n * 1 := by\n  simp",
    watch: "simp knows 0 + n = n and n * 1 = n, and uses both.",
  },
  induction: {
    lean: "example (n : ℕ) : 0 + n = n := by\n  induction n with\n  | zero => rfl\n  | succ n ih => rw [← Nat.add_assoc, ih]",
    watch: "Two cases: 0, and n + 1. Put the cursor on the last line, after the =>, to see ih, the claim for n, among the facts.",
  },
  omega: {
    lean: "example (a b : ℕ) (h : a < b) : a + 1 ≤ b := by\n  omega",
    watch: "A fact about whole numbers that needs only adding and comparing. It uses h.",
  },
  calc: {
    lean: "example (a b : ℝ) (h : a = 2 * b) (hb : b = 3) : a = 6 := by\n  calc a = 2 * b := h\n    _ = 2 * 3 := by rw [hb]\n    _ = 6 := by norm_num",
    watch: "Three links, each with its reason after :=. The _ stands for the right side of the line before.",
  },
  "exact?": {
    lean: "example (a b : ℕ) : a + b = b + a := by\n  exact?",
    watch: "Lean finds the fact in its library and tells you its name, under Messages.",
  },
  ring: {
    lean: "example (a b : ℝ) : (a + b)^2 = a^2 + 2*a*b + b^2 := by\n  ring",
    watch: "True by algebra alone. Change a coefficient and ring fails.",
  },
  linarith: {
    lean: "example (x y : ℝ) (h1 : x < y) (h2 : y < 3) : x < 3 := by\n  linarith",
    watch: "It adds h1 and h2. Take h2 out of the statement and it cannot.",
  },
  field_simp: {
    lean: "example (x : ℝ) (hx : x ≠ 0) : (x^2 + x) / x = x + 1 := by\n  field_simp",
    watch: "It multiplies through by x, which it may do because hx says x is not zero.",
  },
  nlinarith: {
    lean: "example (x y : ℝ) : 2 * x * y ≤ x^2 + y^2 := by\n  nlinarith [sq_nonneg (x - y)]",
    watch: "The hint in brackets is the fact it needs: (x - y)² is not negative.",
  },
  positivity: {
    lean: "example (x : ℝ) : 0 < x^2 + 1 := by\n  positivity",
    watch: "A square plus 1 is positive from the way it is built.",
  },
  have: {
    lean: "example (a : ℝ) (h : 0 < a) : 0 < a * a + a := by\n  have h2 : 0 < a * a := by positivity\n  linarith",
    watch: "On the last line h2 is among the facts, and linarith adds it to h.",
  },
  gcongr: {
    lean: "example (a b c : ℝ) (h : a ≤ b) : a + c ≤ b + c := by\n  gcongr",
    watch: "Both sides are “something + c”, so it is enough that a ≤ b, and h says so.",
  },
};

/** The file the Lab gives Lean for an example: the same shape as a Playground file. */
export function labSource(lean: string): string {
  return `import Mathlib\n\n${lean}\n`;
}

/** Where the example's first line is in `labSource`, for the cursor to start in the proof. */
export const LAB_FIRST_LINE = 2;

export interface Explorer {
  id: string;
  title: string;
  blurb: string;
  /** Registered widgets, each started with these parameters. */
  widgets: { type: WidgetType; params: Params; note: string }[];
}

/** The explorers there are so far. One is added here as its widget is built. */
export const EXPLORERS: Explorer[] = [
  {
    id: "functions",
    title: "Functions",
    blurb: "Graphs to drag, zoom and read values from.",
    widgets: [
      { type: "plot", params: { functions: ["x^2", "2x + 1"], x: [-4, 4], trace: 1 }, note: "A parabola and a line. Move the point along them and read both values; find where they cross." },
      { type: "plot", params: { functions: ["1/x"], x: [-4, 4], y: [-6, 6], trace: 2 }, note: "A function with no value at 0. Zoom in near 0 on either side." },
      { type: "plot", params: { functions: ["sin(x)", "x", "x - x^3/6"], x: [-4, 4], y: [-3, 3], trace: 0.5 }, note: "Near 0, sin x is close to x, and closer still to x − x³/6. Zoom in to see how close." },
      { type: "plot", params: { functions: ["|x|", "sqrt(x^2 + 0.05)"], x: [-2, 2], y: [-0.5, 2.5], trace: 0 }, note: "|x| has a corner at 0. The second curve is nearly the same and has none." },
    ],
  },
  {
    id: "numbers",
    title: "The number line",
    blurb: "Points, intervals and distance.",
    widgets: [
      { type: "number-line", params: { range: [-3, 4], points: [0, 1, "1/2", "sqrt(2): √2", "pi: π", "-7/3"] }, note: "Whole numbers, fractions and two numbers that are neither, on one line." },
      { type: "number-line", params: { range: [0, 6], distance: [2, 5], points: ["2: a", "5: b"] }, note: "The distance between two numbers is |a − b|, whichever is larger." },
      { type: "number-line", params: { range: [0, 8], distance: [1, 3], via: 6, points: ["1: a", "3: c", "6: b"] }, note: "Going from a to c by way of b is never shorter than going directly: the triangle inequality." },
    ],
  },
  {
    id: "algebra",
    title: "Algebra you can see",
    blurb: "An identity as a picture.",
    widgets: [{ type: "square-of-sum", params: { a: 3, b: 2 }, note: "Why (a + b)² is a² + 2ab + b² and not a² + b²: move the sliders and watch the two rectangles." }],
  },
];
