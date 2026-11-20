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
//
// Lean's checks give their goals as data instead (web/shared/interactive.ts,
// from its RPC); this parser reads the goals an author writes (predict,
// proofstate) and stands in where Lean gave no data.

export interface Hypothesis {
  /** The names that share this type, e.g. ["P", "Q"] for `P Q : Prop`. */
  names: string[];
  type: string;
  /** A `let`-style value, for `x : ℕ := 5`. */
  value?: string;
  // What follows comes only from Lean's structured goals
  // (web/shared/interactive.ts); goals parsed from text have none of it.
  /** Added by the step just before where the goals were read. */
  inserted?: true;
  /** Taken away by the step that follows: marked only on goals read just
   *  before a step. The goals after a step list what it took in `gone`. */
  removed?: true;
  /** A typeclass instance (`inst : Add α`): Lean finds these itself. */
  instance?: true;
  /** Named by Lean, not the proof (`n✝`): no line of the proof can name it. */
  inaccessible?: true;
  /** The type as Lean's tagged text: each subexpression with its position and how the step changed it. */
  typeTagged?: TaggedText;
  valueTagged?: TaggedText;
}

export interface Goal {
  caseName?: string;
  hypotheses: Hypothesis[];
  /** What is left to prove (the text after ⊢). */
  target: string;
  /** Structured goals only: a goal the last step made, or the next takes away. */
  inserted?: true;
  removed?: true;
  /** The hypotheses the last step took away from this goal (`obtain`
   *  taking `h` apart, `clear`): not facts any more, there to show leaving. */
  gone?: Hypothesis[];
  targetTagged?: TaggedText;
}

/** How a step changed a subexpression, as Lean marks it: `was…` on the
 *  goals after the step, `will…` on the goals before it. */
export type DiffStatus = "wasChanged" | "willChange" | "wasInserted" | "willInsert" | "wasDeleted" | "willDelete";

/** Lean's pretty-printed expression with its parts marked: plain text, a
 *  run of parts, or one subexpression (`pos`: its path in the expression,
 *  as Lean writes it, `/0/1`) around its own text. */
export type TaggedText = { text: string } | { append: TaggedText[] } | { tag: [{ pos: string; diff?: DiffStatus }, TaggedText] };

/** Whether two lists of goals are the same state: the same goals, cases,
 *  facts and targets, in the same order. Lean's marks of what a step
 *  changed are about the step, not the state, and are not compared: the
 *  same state reached by another step is the same state. */
export function sameGoals(a: Goal[], b: Goal[]): boolean {
  const bare = (gs: Goal[]) => JSON.stringify(gs.map((g) => [g.caseName ?? "", g.hypotheses.map((h) => [h.names, h.type, h.value ?? null]), g.target]));
  return bare(a) === bare(b);
}

/** The text of tagged text. */
export function plainOf(t: TaggedText): string {
  if ("text" in t) return t.text;
  if ("append" in t) return t.append.map(plainOf).join("");
  return plainOf(t.tag[1]);
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
      else current.type = current.type ? `${current.type}\n${line}` : line.trim();
      continue;
    }
    // A long statement is broken straight after the colon: `h :` and then
    // the statement on indented lines.
    const bare = /^(\S.*?) :$/.exec(line);
    if (bare) {
      current = { names: bare[1].trim().split(/\s+/), type: "" };
      goal.hypotheses.push(current);
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

/** A proof state written out by hand (a `proof-state` widget), cut into its
 *  goals: one block per goal, as Lean prints them, a blank line between. */
export function stateBlocks(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split(/\n[ \t]*\n/)
    .map((block) => block.replace(/^\n+|\s+$/g, ""))
    .filter((block) => block.trim());
}

export function parseState(text: string): Goal[] {
  return parseGoals(stateBlocks(text));
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
  return /^(ℕ|Nat|List\s[^→]+)$/.test(h.type.trim()) && h.names.some((n) => !n.includes("✝"));
}

/** Goals as Lean prints them: what the Tutor is told the state is. */
export function goalsText(goals: Goal[] | null): string {
  if (!goals) return "";
  if (!goals.length) return "no goals: the proof is complete";
  return goals
    .map((g) => [...(g.caseName ? [`case ${g.caseName}`] : []), ...g.hypotheses.map((h) => `${h.names.join(" ")} : ${h.type}${h.value ? ` := ${h.value}` : ""}`), `⊢ ${g.target}`].join("\n"))
    .join("\n\n");
}

/** The goals Lean still has open when the proof ends, read from its
 *  "unsolved goals" error (which prints them). Where no goal is open at the
 *  end of the body yet a case is unfinished (a bullet proof whose other
 *  case was never started), this is the only place they are shown. Empty
 *  when there is no such error. */
export function unsolvedGoals(diagnostics: { severity: string; message: string }[]): Goal[] {
  return diagnostics.flatMap((d) => {
    const text = d.message.trimStart();
    return d.severity === "error" && /^unsolved goals\s*\n/.test(text) ? parseState(text.replace(/^unsolved goals\s*\n/, "")) : [];
  });
}

/** What a typed proof's panel shows as "Still open": the unsolved goals,
 *  only where nothing is open at this point and nothing else is wrong. Beside
 *  a real error or a refusal, an "unsolved goals" report is where Lean
 *  stopped, not a case the learner left open. */
export function stillOpenGoals(
  reply: { solved: boolean; refusal: string | null; error: unknown; diagnostics: { severity: string; message: string }[] } | null,
  goalsHere: Goal[] | null,
): Goal[] {
  if (!reply || reply.solved || reply.refusal || reply.error || goalsHere?.length !== 0) return [];
  return unsolvedGoals(reply.diagnostics);
}
