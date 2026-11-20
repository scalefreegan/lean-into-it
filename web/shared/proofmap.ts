// The live proof map: the proof so far as a diagram. Facts and goals are
// nodes; each line of the proof is a move node, with an arrow from the goal
// it works on, arrows from the facts its line names, and arrows to the goals
// and facts it makes. A goal no move has worked on and that is still there is
// open; a goal whose moves closed every goal they made is done.
//
// Built from Lean's goals around each line (web/server/check.ts asks for them
// with `map`): the goals at the line's start (the first is the one it works
// on) and at its end. Lean's goal ids say which goals a line made: those
// after it that were not there before it. Pure.
//
// The layout keeps every node where it was when a line is added after it:
// rows go down in proof order, a goal stays in its parent's lane, and a
// second goal made by one move takes a new lane to the right.

import { isObject, type Goal } from "./goals.ts";
import type { IdGoal } from "./interactive.ts";

/** A goal as the map needs it: Lean's id for it, and its facts one per name. */
export interface MapGoal {
  id: string | null;
  caseName?: string;
  target: string;
  facts: { name: string; type: string; inserted?: true }[];
}

/** Lean's goals around one line of the proof (0-based in the body). */
export interface StepGoals {
  line: number;
  text: string;
  before: MapGoal[];
  after: MapGoal[];
  /** Lean refused the line (sent only for the head of a block, whose lines
   *  Lean still ran: \`induction n with\` missing a case). Its goal is never done. */
  refused?: true;
}

export interface MapNode {
  id: string;
  kind: "fact" | "goal" | "move";
  label: string;
  /** The body line that wrote it; null for what the statement gives. */
  line: number | null;
  /** Goal: open (nothing has worked on it yet), worked (a move has, and
   *  something it led to is still open) or done. Move: closes (it finished
   *  its goal outright) or not. */
  state?: "open" | "worked" | "done" | "closes";
  /** Grid place: column (-1 is the facts column, then one per lane) and row. */
  col: number;
  row: number;
}

export interface MapEdge {
  from: string;
  to: string;
  /** uses: a fact a move names; acts: the goal a move works on; makes: what a move produced. */
  kind: "uses" | "acts" | "makes";
}

export interface ProofMap {
  nodes: MapNode[];
  edges: MapEdge[];
  /** Columns of goal lanes (the facts column aside) and rows, for the drawing's size. */
  lanes: number;
  rows: number;
}

/** A Goal (structured, with its id) as the map's MapGoal: objects (`P Q :
 *  Prop`, `n : ℕ`) are left out, the rest one fact per name. */
export function mapGoal({ id, goal }: IdGoal | { id: null; goal: Goal }): MapGoal {
  return {
    id,
    ...(goal.caseName ? { caseName: goal.caseName } : {}),
    target: goal.target,
    facts: goal.hypotheses.filter((h) => !isObject(h)).flatMap((h) => h.names.map((name) => ({ name, type: h.type, ...(h.inserted ? { inserted: true as const } : {}) }))),
  };
}

const IDENT = /[A-Za-z_À-ɏͰ-Ͽἀ-῿][A-Za-z0-9_'!?À-ɏͰ-Ͽἀ-῿₀-₉]*/gu;

/** The names a line of Lean writes: identifiers, whole. */
export function namesInLine(text: string): Set<string> {
  return new Set(text.replace(/--.*$/, "").match(IDENT) ?? []);
}

/**
 * The map of a proof: `start`, the goals before any line (the statement),
 * and `steps`, Lean's goals around each line it ran without an error, in
 * order (web/server/check.ts proofMapOf).
 *
 * The goal a line works on is the first at its start (inside a bullet or a
 * \`case\`, Lean shows the one in focus first); \`all_goals\` and \`<;>\` work on
 * every goal they close. A goal first seen inside a block (\`| zero => …\`
 * after \`induction n with\`, the rest of the proof after \`have h : P := by\`)
 * was made by the line that opened the block.
 */
export function buildMap(start: MapGoal[], steps: StepGoals[]): ProofMap {
  const nodes: MapNode[] = [];
  const edges: MapEdge[] = [];
  const byId = new Map<string, MapNode>();
  const add = (n: MapNode) => {
    nodes.push(n);
    byId.set(n.id, n);
    return n;
  };
  /** Each goal's node, by Lean's goal id. */
  const goalNode = new Map<string, MapNode>();
  let lanes = 0;
  /** Facts by name and type: one node for a fact, however many goals carry it. */
  const factNode = new Map<string, MapNode>();
  let factRow = 0;
  const factKey = (f: { name: string; type: string }) => `${f.name} : ${f.type}`;
  const putFact = (f: { name: string; type: string }, row: number, line: number | null): MapNode => {
    const key = factKey(f);
    const had = factNode.get(key);
    if (had) return had;
    const at = Math.max(factRow, row);
    factRow = at + 1;
    const n = add({ id: `fact:${key}`, kind: "fact", label: `${f.name} : ${f.type}`, line, col: -1, row: at });
    factNode.set(key, n);
    return n;
  };
  const putGoal = (g: MapGoal, col: number, row: number, line: number | null, key: string, named: boolean): MapNode => {
    const n = add({ id: `goal:${key}`, kind: "goal", label: `${named && g.caseName ? `${g.caseName}: ` : ""}⊢ ${g.target}`, line, state: "open", col, row });
    if (g.id) goalNode.set(g.id, n);
    return n;
  };

  // The statement: its facts, and the goal (a proof starts with one).
  for (const g of start.slice(0, 1)) for (const f of g.facts) putFact(f, 0, null);
  start.forEach((g, i) => {
    putGoal(g, lanes++, 0, null, g.id ?? `start${i}`, false);
  });

  /** What each goal node led to, to tell done from worked. */
  const children = new Map<string, string[]>();
  const worked = new Set<string>();
  /** Goals whose block Lean refused: whatever is drawn under them, not done. */
  const blocked = new Set<string>();
  let row = 1;
  /** Lines that open a block (`induction n with`, `have h : P := by`): the
   *  goals inside it are made by that line, though Lean shows them only on
   *  the lines in the block. */
  const heads: { step: StepGoals; from: MapNode; acted: MapGoal; move: MapNode | null }[] = [];

  /** A move node for a line, on the goals it works on, with arrows from the facts it names. */
  const putMove = (step: StepGoals, from: MapNode[], acted: MapGoal, closes: boolean): MapNode => {
    const move = add({ id: `move:${step.line}`, kind: "move", label: step.text.trim().replace(/^[·•]\s*/, ""), line: step.line, ...(closes ? { state: "closes" as const } : {}), col: from[0].col, row: row++ });
    for (const f of from) {
      edges.push({ from: f.id, to: move.id, kind: "acts" });
      worked.add(f.id);
    }
    const names = namesInLine(step.text);
    for (const f of acted.facts) {
      if (!names.has(f.name)) continue;
      const fact = factNode.get(factKey(f)) ?? putFact(f, 0, null);
      edges.push({ from: fact.id, to: move.id, kind: "uses" });
    }
    return move;
  };
  /** Goals a move made: each a node under it (the first in its lane, the rest
   *  in new lanes), with the facts Lean marks new on them (or, for a goal
   *  first seen inside a block, the facts not drawn yet). */
  const putMade = (move: MapNode, parents: MapNode[], made: MapGoal[], line: number, fresh: (f: MapGoal["facts"][number]) => boolean) => {
    // A case name tells apart the goals one move made (`left`, `right`); when
    // they all have the same one (`apply` names them all `a`) it is noise.
    const named = new Set(made.map((g) => g.caseName ?? "")).size > 1;
    const first = !edges.some((e) => e.from === move.id && e.kind === "makes" && byId.get(e.to)?.kind === "goal");
    const kids = made.map((g, i) => {
      const n = putGoal(g, i === 0 && first ? move.col : lanes++, row, line, g.id!, named);
      edges.push({ from: move.id, to: n.id, kind: "makes" });
      return n.id;
    });
    if (made.length) row++;
    for (const p of parents) children.set(p.id, [...(children.get(p.id) ?? []), ...kids]);
    const seen = new Set<string>();
    for (const g of made) {
      for (const f of g.facts) {
        if (!fresh(f) || seen.has(factKey(f)) || factNode.has(factKey(f))) continue;
        seen.add(factKey(f));
        edges.push({ from: move.id, to: putFact(f, row - 1, line).id, kind: "makes" });
      }
    }
  };

  for (const step of steps) {
    const acted = step.before[0];
    if (!acted?.id) continue;
    let from = goalNode.get(acted.id);
    if (!from) {
      // First seen inside a block: made by the last line before it, no more
      // indented, that opened one (for \`| succ k ih => …\`, \`induction n with\`).
      const indent = step.text.search(/\S/);
      const head = [...heads].reverse().find((h) => h.step.line < step.line && h.step.text.search(/\S/) <= indent);
      if (!head) continue;
      head.move ??= putMove(head.step, [head.from], head.acted, false);
      putMade(head.move, [head.from], [acted], head.step.line, () => true);
      from = goalNode.get(acted.id)!;
    }
    const old = new Set(step.before.map((g) => g.id));
    const made = step.after.filter((g) => g.id && !old.has(g.id) && !goalNode.has(g.id));
    const kept = step.after.some((g) => g.id === acted.id);
    // \`all_goals t\`, \`t <;> u\`: the line works on every goal before it, not the first only.
    const every = /^\s*(all_goals|any_goals)\b|<;>/.test(step.text);
    const after = new Set(step.after.map((g) => g.id));
    const on = every ? step.before.filter((g) => g.id && !after.has(g.id) && goalNode.has(g.id)).map((g) => goalNode.get(g.id!)!) : [from];
    const opens = /(\bwith|\bby|=>|:=)\s*$/.test(step.text.replace(/--.*$/, "").trimEnd());
    // A line that leaves the goal it works on as it was, and makes nothing, is
    // the head of a step written over several lines: drawn when its block shows what it made.
    if (kept && !made.length) {
      if (opens) heads.push({ step, from, acted, move: null });
      if (step.refused) blocked.add(from.id);
      continue;
    }
    const move = putMove(step, on.length ? on : [from], acted, !made.length);
    if (opens) heads.push({ step, from, acted, move });
    putMade(move, on.length ? on : [from], made, step.line, (f) => !!f.inserted);
  }

  // Done: worked on, and everything it led to done (a move that made nothing closed it).
  const memo = new Map<string, boolean>();
  const done = (id: string): boolean => {
    if (memo.has(id)) return memo.get(id)!;
    memo.set(id, false);
    const ok = worked.has(id) && !blocked.has(id) && (children.get(id) ?? []).every(done);
    memo.set(id, ok);
    return ok;
  };
  for (const n of nodes) if (n.kind === "goal") n.state = done(n.id) ? "done" : worked.has(n.id) ? "worked" : "open";

  return { nodes, edges, lanes: Math.max(lanes, 1), rows: nodes.reduce((m, n) => Math.max(m, n.row + 1), 1) };
}
