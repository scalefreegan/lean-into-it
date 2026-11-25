// The set-diagram widget's logic (bead lii-53v.6): a set formula read from
// text, and the regions of a Venn diagram it names. Pure, its own parser
// (never `eval`), so the page, the loader and the tests share it.
//
// Sets are single capital letters. Operations, loosest first, as in Lean:
//   ∪   union, to the left
//   ∩ \ intersection (to the left) and difference, at one level. Lean reads
//       some mixes of them and not others, and a reader may read either, so
//       a \ beside another \ or ∩ needs brackets here.
//   ᶜ   complement, written after (also ^c); binds tightest
// and ∅ and univ. Brackets group.

export type SetFormula = { op: "set"; name: string } | { op: "empty" } | { op: "univ" } | { op: "compl"; a: SetFormula } | { op: "union" | "inter" | "diff"; a: SetFormula; b: SetFormula };

/** Two or three circles are drawn. */
export const MAX_SETS = 3;

const TOKEN = /\s*(?:(univ)(?!\w)|([A-Z])(?!\w)|(∅)|(∪)|(∩)|(\\)|(ᶜ|\^c(?!\w))|(\()|(\)))/y;
type Tok = "univ" | "∅" | "∪" | "∩" | "\\" | "ᶜ" | "(" | ")" | { set: string };

function tokens(text: string): Tok[] | string {
  const out: Tok[] = [];
  const end = text.trimEnd().length;
  let at = 0;
  while (at < end) {
    TOKEN.lastIndex = at;
    const m = TOKEN.exec(text);
    if (!m) return `“${text.slice(at).trim().split(/\s/)[0]}” is not part of a set formula: sets are single capital letters, with ∪ ∩ \\ ᶜ ∅ univ and brackets`;
    if (m[2]) out.push({ set: m[2] });
    else out.push(m[7] ? "ᶜ" : ((m[1] ?? m[3] ?? m[4] ?? m[5] ?? m[6] ?? m[8] ?? m[9]) as Tok));
    at = TOKEN.lastIndex;
  }
  return out;
}

/** Read a set formula; a string says why it cannot be read. */
export function parseSet(text: string): SetFormula | string {
  const toks = tokens(text);
  if (typeof toks === "string") return toks;
  if (!toks.length) return "the formula is empty";
  let at = 0;
  const fail = (why: string): never => {
    throw new Error(why);
  };
  const union = (): SetFormula => {
    let a = meet();
    while (toks[at] === "∪") {
      at++;
      a = { op: "union", a, b: meet() };
    }
    return a;
  };
  const meet = (): SetFormula => {
    let a = post();
    let used: Tok | null = null;
    while (toks[at] === "∩" || toks[at] === "\\") {
      const t = toks[at++];
      if (used && (used === "\\" || t === "\\")) fail("put brackets round one of them: \\ beside another \\ or ∩ can be read two ways");
      used = t;
      a = { op: t === "∩" ? "inter" : "diff", a, b: post() };
    }
    return a;
  };
  const post = (): SetFormula => {
    let a = atom();
    while (toks[at] === "ᶜ") {
      at++;
      a = { op: "compl", a };
    }
    return a;
  };
  const atom = (): SetFormula => {
    const t = toks[at++];
    if (t === undefined) return fail("the formula ends too soon");
    if (typeof t === "object") return { op: "set", name: t.set };
    if (t === "∅") return { op: "empty" };
    if (t === "univ") return { op: "univ" };
    if (t === "(") {
      const inner = union();
      if (toks[at++] !== ")") fail("a bracket is not closed");
      return inner;
    }
    return fail(t === ")" ? "a closing bracket with nothing before it" : `${t} is missing the set it works on`);
  };
  try {
    const f = union();
    if (at < toks.length) return toks[at] === ")" ? "a closing bracket with nothing open" : "two sets with nothing between them";
    return f;
  } catch (e) {
    return (e as Error).message;
  }
}

/** The sets a formula names, in alphabetical order. */
export function setsOf(f: SetFormula): string[] {
  if (f.op === "set") return [f.name];
  if (f.op === "empty" || f.op === "univ") return [];
  if (f.op === "compl") return setsOf(f.a);
  return [...new Set([...setsOf(f.a), ...setsOf(f.b)])].sort();
}

/** Is a point that is in exactly the sets `inside` in the set the formula names? */
export function member(f: SetFormula, inside: ReadonlySet<string>): boolean {
  switch (f.op) {
    case "set":
      return inside.has(f.name);
    case "empty":
      return false;
    case "univ":
      return true;
    case "compl":
      return !member(f.a, inside);
    case "union":
      return member(f.a, inside) || member(f.b, inside);
    case "inter":
      return member(f.a, inside) && member(f.b, inside);
    case "diff":
      return member(f.a, inside) && !member(f.b, inside);
  }
}

/** The regions of a diagram of `sets`: region k is inside the i-th set when bit i of k is set. Region 0 is outside them all. */
export const regionCount = (sets: string[]) => 2 ** sets.length;
export const insideOf = (sets: string[], k: number) => new Set(sets.filter((_, i) => (k >> i) & 1));

/** The regions a formula names. */
export function regionsOf(f: SetFormula, sets: string[]): number[] {
  return [...Array(regionCount(sets)).keys()].filter((k) => member(f, insideOf(sets, k)));
}

/** A region in words: "in A, not in B". */
export function regionName(sets: string[], k: number): string {
  if (k === 0) return sets.length === 2 ? `in neither ${sets[0]} nor ${sets[1]}` : `in none of ${sets.join(", ")}`;
  const yes = sets.filter((_, i) => (k >> i) & 1);
  const no = sets.filter((_, i) => !((k >> i) & 1));
  const join = (xs: string[], word: string) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} ${word} ${xs[xs.length - 1]}`);
  return `in ${join(yes, "and")}${no.length ? `, not in ${join(no, "or")}` : ""}`;
}

const LEVEL = { union: 0, inter: 1, diff: 1, compl: 2, set: 3, empty: 3, univ: 3 } as const;
const SYM = { union: "∪", inter: "∩", diff: "\\" } as const;
/** A formula written back with Lean's symbols and the brackets this grammar needs, or a reader does. */
export function showSet(f: SetFormula): string {
  if (f.op === "set") return f.name;
  if (f.op === "empty") return "∅";
  if (f.op === "univ") return "univ";
  const bracket = (g: SetFormula, yes: boolean) => (yes ? `(${showSet(g)})` : showSet(g));
  if (f.op === "compl") return `${bracket(f.a, LEVEL[f.a.op] < LEVEL.compl)}ᶜ`;
  const mixes = (g: SetFormula) => LEVEL[g.op] === 1 && LEVEL[f.op] === 1 && (g.op === "diff" || f.op === "diff");
  // Lean reads `A ∪ B ∩ C` as A ∪ (B ∩ C), but a reader may not.
  const clear = (g: SetFormula) => f.op === "union" && LEVEL[g.op] === 1;
  const left = bracket(f.a, LEVEL[f.a.op] < LEVEL[f.op] || mixes(f.a) || clear(f.a));
  return `${left} ${SYM[f.op]} ${bracket(f.b, LEVEL[f.b.op] <= LEVEL[f.op] || clear(f.b))}`;
}

/** What a set-diagram block says, read; or why it cannot be drawn. */
export interface SetDiagramSpec {
  sets: string[];
  formula: SetFormula;
  against: SetFormula | null;
  /** Regions declared to hold nothing. */
  empty: number[];
}
export function readSetDiagram(p: Record<string, unknown>): SetDiagramSpec | string {
  const read = (key: string): SetFormula | null | string => {
    const v = p[key];
    if (typeof v !== "string") return null;
    const f = parseSet(v);
    return typeof f === "string" ? `\`${key}\`: ${f}` : f;
  };
  const formula = read("formula");
  if (typeof formula === "string") return formula;
  if (!formula) return "`formula` is missing";
  const against = read("against");
  if (typeof against === "string") return against;
  const empty = read("empty");
  if (typeof empty === "string") return empty;
  const named = [...new Set([formula, against, empty].flatMap((f) => (f ? setsOf(f) : [])))].sort();
  const given = Array.isArray(p.sets) ? (p.sets as unknown[]).map(String) : null;
  if (given) {
    const bad = given.find((s) => !/^[A-Z]$/.test(s));
    if (bad !== undefined) return `\`sets\`: “${bad}” is not a single capital letter`;
    if (new Set(given).size !== given.length) return "`sets` names a set twice";
    const missing = named.find((s) => !given.includes(s));
    if (missing) return `the formulas name ${missing}, which \`sets\` does not list`;
  }
  const sets = given ?? named;
  if (sets.length < 2 || sets.length > MAX_SETS) return `a diagram has two or three sets, and this one has ${sets.length}: ${sets.length < 2 ? "list the others under `sets`" : "use fewer letters"}`;
  const gone = empty ? regionsOf(empty, sets) : [];
  if (gone.length === regionCount(sets)) return "`empty` leaves no region at all";
  return { sets, formula, against, empty: gone };
}
