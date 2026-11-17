// Lean's plain-text goals turned into cards. Lean prints a goal as
//
//   case inl
//   P Q : Prop
//   h : P
//   ⊢ Q ∨ P
//
// an optional case name, one line per hypothesis (several names may share a
// type, and a long type continues on indented lines), then the claim after
// the turnstile. Pure: runs in the browser, the server and the tests.

export interface Hypothesis {
  /** The names that share this type, e.g. ["P", "Q"] for `P Q : Prop`. */
  names: string[];
  type: string;
  /** A `let`-style value, for `x : ℕ := 5`. */
  value?: string;
}

export interface Goal {
  caseName?: string;
  hypotheses: Hypothesis[];
  /** What is left to prove (the text after ⊢). */
  target: string;
}

/** Parse one goal as Lean prints it. Never throws: text it cannot read ends
 *  up in `target`, so nothing Lean said is hidden. */
export function parseGoal(text: string): Goal {
  const goal: Goal = { hypotheses: [], target: "" };
  const lines = text.replace(/\r/g, "").split("\n");
  let inTarget = false;
  let current: Hypothesis | null = null;
  for (const [i, line] of lines.entries()) {
    if (inTarget) {
      goal.target += `\n${line}`;
      continue;
    }
    if (line.startsWith("⊢")) {
      goal.target = line.slice(1).trimStart();
      inTarget = true;
      continue;
    }
    if (i === 0 && line.startsWith("case ")) {
      goal.caseName = line.slice(5).trim();
      continue;
    }
    if (/^\s/.test(line) && current) {
      // A continuation of the previous hypothesis's type (or value).
      if (current.value !== undefined) current.value += `\n${line}`;
      else current.type += `\n${line}`;
      continue;
    }
    const colon = line.indexOf(" : ");
    if (colon < 0) {
      if (line.trim()) goal.target += (goal.target ? "\n" : "") + line;
      continue;
    }
    const names = line.slice(0, colon).trim().split(/\s+/);
    let type = line.slice(colon + 3);
    let value: string | undefined;
    const assign = type.indexOf(" := ");
    if (assign >= 0) {
      value = type.slice(assign + 4);
      type = type.slice(0, assign);
    }
    current = { names, type, ...(value !== undefined ? { value } : {}) };
    goal.hypotheses.push(current);
  }
  goal.target = goal.target.trim();
  return goal;
}

export function parseGoals(texts: string[]): Goal[] {
  return texts.map(parseGoal);
}

/** Every hypothesis name in a goal, in order. */
export function namesIn(goal: Goal): string[] {
  return goal.hypotheses.flatMap((h) => h.names);
}

/** Types that say "this is a thing", not "this is a fact": the cards for
 *  them are drawn as objects, and they are never offered to `exact`/`apply`. */
const SORT = /^(Prop|Type(\s+\S+)?|Sort(\s+\S+)?|ℕ|ℤ|ℚ|ℝ|ℂ|Nat|Int|Rat|Real|Bool|Set\s.+|List\s.+)$/;

/** True for `P : Prop`, `n : ℕ` or `f : ℕ → ℕ` (an object), false for `h : P` (a fact). */
export function isObject(h: Hypothesis): boolean {
  return h.type.split("→").every((part) => SORT.test(part.trim()));
}

/** True for `n : ℕ` or `xs : List ℕ`: something the board can do induction on. */
export function isNatural(h: Hypothesis): boolean {
  // A name Lean made up and marked with a dagger cannot be written in a proof.
  return /^(ℕ|Nat|List\s.+)$/.test(h.type.trim()) && h.names.some((n) => !n.includes("✝"));
}
