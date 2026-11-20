// Lean's structured goals, from the language server's RPC call
// `Lean.Widget.getInteractiveGoals` (web/server/lean/lsp.ts), turned into
// the cards' Goal. Unlike the printed goals (goals.ts parseGoal) nothing
// here is read back out of text: each hypothesis comes with its own names,
// type and value, so a type over several lines, `a b : ℕ` and `x : ℕ := 5`
// are each one hypothesis with the right names, whatever the printing.
//
// Lean also marks what a step changed: on the goals after a step (the
// position is at or after its end) new hypotheses are `isInserted` and
// changed parts of a type are tagged `wasChanged`/`wasInserted`; on the goals
// before one (the position is at its start) what it takes away is
// `isRemoved` and the parts it changes `willChange`/`willDelete`. Pure.

import { plainOf, type DiffStatus, type Goal, type Hypothesis, type TaggedText } from "./goals.ts";

/** Lean's tagged text as it comes over RPC: the tag carries a reference
 *  into the server's session (`info`), which means nothing once the reply
 *  has been read and is dropped. */
export type RawTagged = { text: string } | { append: RawTagged[] } | { tag: [{ info?: { p: string }; subexprPos?: string; diffStatus?: DiffStatus }, RawTagged] };

export interface RawHyp {
  names: string[];
  fvarIds?: string[];
  type: RawTagged;
  val?: RawTagged;
  isInstance?: boolean;
  isType?: boolean;
  isInserted?: boolean;
  isRemoved?: boolean;
}

export interface RawGoal {
  hyps: RawHyp[];
  type: RawTagged;
  userName?: string;
  goalPrefix?: string;
  mvarId?: string;
  ctx?: { p: string };
  isInserted?: boolean;
  isRemoved?: boolean;
}

/** A goal with Lean's id for it, to tell after a step which goals the step
 *  made (web/shared/interactive.ts withRemoved). The id is not sent on. */
export interface IdGoal {
  id: string | null;
  goal: Goal;
}

function tagged(t: RawTagged): TaggedText {
  if ("text" in t) return { text: t.text };
  if ("append" in t) return { append: t.append.map(tagged) };
  const [info, inner] = t.tag;
  return { tag: [{ pos: info.subexprPos ?? "", ...(info.diffStatus ? { diff: info.diffStatus } : {}) }, tagged(inner)] };
}

/** Lean leaves `✝` on a name the proof cannot write (`n✝`). */
const INACCESSIBLE = /✝/;

/** One goal from the reply. */
export function fromRaw(raw: RawGoal): IdGoal {
  const hypotheses: Hypothesis[] = raw.hyps.map((h) => {
    const type = tagged(h.type);
    const value = h.val ? tagged(h.val) : undefined;
    return {
      names: h.names,
      type: plainOf(type),
      ...(value ? { value: plainOf(value) } : {}),
      ...(h.isInserted ? { inserted: true as const } : {}),
      ...(h.isRemoved ? { removed: true as const } : {}),
      ...(h.isInstance ? { instance: true as const } : {}),
      ...(h.names.some((n) => INACCESSIBLE.test(n)) ? { inaccessible: true as const } : {}),
      typeTagged: type,
      ...(value ? { valueTagged: value } : {}),
    };
  });
  const target = tagged(raw.type);
  // An unnamed goal has no userName (the printed goals show no `case` line).
  const caseName = raw.userName;
  return {
    id: raw.mvarId ?? null,
    goal: {
      ...(caseName ? { caseName } : {}),
      hypotheses,
      target: plainOf(target),
      ...(raw.isInserted ? { inserted: true as const } : {}),
      ...(raw.isRemoved ? { removed: true as const } : {}),
      targetTagged: target,
    },
  };
}

/** The reply of `Lean.Widget.getInteractiveGoals`, or null when it is not
 *  one (no goals there: Lean answers null outside a proof). */
export function fromReply(reply: unknown): IdGoal[] | null {
  if (!reply || typeof reply !== "object" || !Array.isArray((reply as { goals?: unknown }).goals)) return null;
  return ((reply as { goals: RawGoal[] }).goals).map(fromRaw);
}

/** The session references in a reply, for the server to let go of them. */
export function refsIn(reply: unknown): { p: string }[] {
  const out: { p: string }[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        if ((k === "info" || k === "ctx") && x && typeof x === "object" && typeof (x as { p?: unknown }).p === "string") out.push({ p: (x as { p: string }).p });
        else walk(x);
      }
    }
  };
  walk(reply);
  return out;
}

/**
 * The goals after a step, with what the step took away. Lean marks a
 * hypothesis a step removes only on the goals before it (`before`, read at
 * the step's start, where the step works on the first goal): those go in
 * `gone` on each goal the step made, those whose id is not among the
 * goals before. A goal the step did not touch keeps its id and gets nothing.
 */
export function withRemoved(after: IdGoal[], before: IdGoal[] | null): Goal[] {
  if (!before?.length) return after.map((g) => g.goal);
  const gone = before[0].goal.hypotheses.filter((h) => h.removed);
  const old = new Set(before.map((g) => g.id).filter((id) => id !== null));
  if (!gone.length) return after.map((g) => g.goal);
  const left = gone.map((h) => {
    const copy = { ...h };
    delete copy.removed;
    return copy;
  });
  return after.map(({ id, goal }) => (id !== null && old.has(id) ? goal : { ...goal, gone: left }));
}
