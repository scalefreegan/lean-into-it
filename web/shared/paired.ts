// The informal-beside-formal widget's pairing (bead lii-53v.3): a
// textbook-style proof, sentence by sentence, each sentence tied to the
// lines of a Lean proof that say the same thing. The Lean is an exercise's
// own reference solution, which Lean already accepts (every solution is
// checked by `npm test` and `npm run check:content`), so the widget never
// shows Lean that has not been checked.
//
// A step is written `<lines>: <sentence>`, the lines 1-based in the
// solution: `2: By hQR it is enough to show Q.`, `2-4: …`, `1, 3: …`.
// The link is many-to-many: a sentence may cover several lines ("clearly"
// can be three lines of Lean) and a line may belong to several sentences.
// A line no sentence covers is shown as one the prose left unsaid.

export interface Step {
  lines: number[];
  say: string;
}

/** One step, or why it cannot be read. */
export function readStep(text: string): Step | string {
  const m = /^\s*([\d\s,-]+?)\s*:\s*(\S.*)$/s.exec(text);
  if (!m) return `“${text}” must be the line numbers, a colon, then the sentence: "2-3: To show R it is enough to show Q."`;
  const lines: number[] = [];
  for (const part of m[1].split(",")) {
    const r = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part);
    if (!r) return `“${m[1]}” is not a list of line numbers like 2, or 2-4, or 1, 3`;
    const a = Number(r[1]);
    const b = r[2] === undefined ? a : Number(r[2]);
    if (a < 1 || b < a) return `“${part.trim()}”: lines are counted from 1, and a range runs upwards`;
    for (let n = a; n <= b; n++) if (!lines.includes(n)) lines.push(n);
  }
  return { lines: lines.sort((x, y) => x - y), say: m[2].trim() };
}

/** The lines of a proof body as the widget numbers them (from 1). */
export function proofLines(solution: string): string[] {
  return solution.replace(/\s+$/, "").split("\n");
}

/** Every step read, or the problems with them; `count` (the solution's
 *  number of lines, when known) bounds the line numbers. */
export function readSteps(steps: unknown, count?: number): { steps: Step[]; problems: string[] } {
  const out: Step[] = [];
  const problems: string[] = [];
  if (!Array.isArray(steps) || !steps.length) return { steps: out, problems: ["`steps` needs at least one sentence"] };
  for (const s of steps) {
    const step = typeof s === "string" ? readStep(s) : "each step is a line of text";
    if (typeof step === "string") {
      problems.push(step);
      continue;
    }
    const past = count === undefined ? [] : step.lines.filter((n) => n > count);
    if (past.length) problems.push(`“${step.say}” names line ${past[0]}, but the solution has ${count} line${count === 1 ? "" : "s"}`);
    out.push(step);
  }
  return { steps: out, problems };
}

/** The lines (1-based) no sentence covers. */
export function unsaid(steps: Step[], count: number): number[] {
  const said = new Set(steps.flatMap((s) => s.lines));
  return [...Array(count).keys()].map((i) => i + 1).filter((n) => !said.has(n));
}
