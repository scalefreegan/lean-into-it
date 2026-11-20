// The truth-table widget's logic (bead lii-53v.5): a propositional formula
// read from text and evaluated on every row. Pure and small, its own parser
// (never `eval`), so the page, the loader and the tests share it.
//
// Letters are single lowercase or uppercase letters (p, q, r, P, Q).
// Connectives, loosest first, Lean's symbols or plain ASCII:
//   ↔  <->        iff (binds loosest; it does not chain: as in Lean,
//                 p ↔ q ↔ r needs brackets)
//   →  ->         implies, to the right: p → q → r is p → (q → r)
//   ∨  \/  |      or
//   ∧  /\  &      and
//   ¬  ~  !       not (binds tightest)
// and True / False (⊤ ⊥) as constants. Brackets group.

export type Formula =
  | { op: "var"; name: string }
  | { op: "const"; value: boolean }
  | { op: "not"; a: Formula }
  | { op: "and" | "or" | "implies" | "iff"; a: Formula; b: Formula };

type Tok = { t: "var"; name: string } | { t: "const"; value: boolean } | { t: "op"; op: "not" | "and" | "or" | "implies" | "iff" } | { t: "(" } | { t: ")" };

const SYMBOLS: [string, Tok][] = [
  ["<->", { t: "op", op: "iff" }],
  ["↔", { t: "op", op: "iff" }],
  ["->", { t: "op", op: "implies" }],
  ["→", { t: "op", op: "implies" }],
  ["\\/", { t: "op", op: "or" }],
  ["∨", { t: "op", op: "or" }],
  ["|", { t: "op", op: "or" }],
  ["/\\", { t: "op", op: "and" }],
  ["∧", { t: "op", op: "and" }],
  ["&", { t: "op", op: "and" }],
  ["¬", { t: "op", op: "not" }],
  ["~", { t: "op", op: "not" }],
  ["!", { t: "op", op: "not" }],
  ["⊤", { t: "const", value: true }],
  ["⊥", { t: "const", value: false }],
  ["(", { t: "(" }],
  [")", { t: ")" }],
];

function tokens(text: string): Tok[] | string {
  const out: Tok[] = [];
  let i = 0;
  while (i < text.length) {
    if (/\s/.test(text[i])) {
      i++;
      continue;
    }
    const sym = SYMBOLS.find(([s]) => text.startsWith(s, i));
    if (sym) {
      out.push(sym[1]);
      i += sym[0].length;
      continue;
    }
    const word = /^[A-Za-z]\w*/.exec(text.slice(i));
    if (!word) return `“${text[i]}” is not part of a formula`;
    if (word[0] === "True" || word[0] === "False") out.push({ t: "const", value: word[0] === "True" });
    else if (word[0] === "T" || word[0] === "F") return `“${word[0]}” would be read as a letter, but in the table it means true or false: use another letter`;
    else if (word[0].length === 1) out.push({ t: "var", name: word[0] });
    else return `“${word[0]}” is not a letter: name each proposition with one letter`;
    i += word[0].length;
  }
  return out;
}

/** Read a formula; a string says why it cannot be read. */
export function parseFormula(text: string): Formula | string {
  const toks = tokens(text);
  if (typeof toks === "string") return toks;
  if (!toks.length) return "the formula is empty";
  let at = 0;
  const peek = () => toks[at];
  const isOp = (op: string) => {
    const t = peek();
    return t?.t === "op" && t.op === op;
  };
  const fail = (why: string): never => {
    throw new Error(why);
  };
  // Loosest to tightest, with Lean's fixities: → ∨ ∧ group to the right,
  // ↔ does not group at all.
  const iff = (): Formula => {
    const a = implies();
    if (isOp("iff")) {
      at++;
      const b = implies();
      if (isOp("iff")) fail("Lean does not read a chain of ↔: put brackets round one of them, as in (p ↔ q) ↔ r");
      return { op: "iff", a, b };
    }
    return a;
  };
  const implies = (): Formula => {
    const a = or();
    if (isOp("implies")) {
      at++;
      return { op: "implies", a, b: implies() };
    }
    return a;
  };
  const or = (): Formula => {
    const a = and();
    if (isOp("or")) {
      at++;
      return { op: "or", a, b: or() };
    }
    return a;
  };
  const and = (): Formula => {
    const a = not();
    if (isOp("and")) {
      at++;
      return { op: "and", a, b: and() };
    }
    return a;
  };
  const not = (): Formula => {
    if (isOp("not")) {
      at++;
      return { op: "not", a: not() };
    }
    return atom();
  };
  const atom = (): Formula => {
    const t = toks[at++];
    if (!t) return fail("the formula ends too soon");
    if (t.t === "var") return { op: "var", name: t.name };
    if (t.t === ")" && toks[at - 2]?.t === "(") return fail("a pair of brackets with nothing inside");
    if (t.t === "const") return { op: "const", value: t.value };
    if (t.t === "(") {
      const inner = iff();
      if (toks[at++]?.t !== ")") fail("a bracket is not closed");
      return inner;
    }
    return fail(t.t === ")" ? "a closing bracket with nothing open" : "a connective is missing what it connects");
  };
  try {
    const f = iff();
    if (at < toks.length) return toks[at].t === ")" ? "a closing bracket with nothing open" : "two parts with no connective between them";
    return f;
  } catch (e) {
    return (e as Error).message;
  }
}

/** The letters in a formula, in alphabetical order (the table's columns). */
export function lettersOf(f: Formula): string[] {
  const seen = new Set<string>();
  const walk = (g: Formula) => {
    if (g.op === "var") seen.add(g.name);
    else if (g.op === "not") walk(g.a);
    else if (g.op !== "const") {
      walk(g.a);
      walk(g.b);
    }
  };
  walk(f);
  return [...seen].sort();
}

/** The formula's value when each letter has the value given. */
export function evaluate(f: Formula, row: Record<string, boolean>): boolean {
  switch (f.op) {
    case "var":
      return row[f.name] ?? false;
    case "const":
      return f.value;
    case "not":
      return !evaluate(f.a, row);
    case "and":
      return evaluate(f.a, row) && evaluate(f.b, row);
    case "or":
      return evaluate(f.a, row) || evaluate(f.b, row);
    case "implies":
      return !evaluate(f.a, row) || evaluate(f.b, row);
    case "iff":
      return evaluate(f.a, row) === evaluate(f.b, row);
  }
}

const SYM = { and: "∧", or: "∨", implies: "→", iff: "↔" } as const;
const LEVEL = { iff: 0, implies: 1, or: 2, and: 3, not: 4, var: 5, const: 5 } as const;

/** A formula written back with Lean's symbols and only the brackets it needs. */
export function show(f: Formula): string {
  if (f.op === "var") return f.name;
  if (f.op === "const") return f.value ? "True" : "False";
  const wrap = (g: Formula, tighter: boolean) => (LEVEL[g.op] < LEVEL[f.op] || (tighter && LEVEL[g.op] === LEVEL[f.op]) ? `(${show(g)})` : show(g));
  if (f.op === "not") return `¬${wrap(f.a, false)}`;
  // → ∨ ∧ group to the right: a same-level left part needs brackets. ↔ does
  // not group, so a same-level part on either side does.
  return `${wrap(f.a, true)} ${SYM[f.op]} ${wrap(f.b, f.op === "iff")}`;
}

/** The parts worth a column of their own, innermost first, the whole last;
 *  letters and repeats left out. */
export function partsOf(f: Formula): Formula[] {
  const out: Formula[] = [];
  const seen = new Set<string>();
  const walk = (g: Formula) => {
    if (g.op === "var" || g.op === "const") return;
    if (g.op === "not") walk(g.a);
    else {
      walk(g.a);
      walk(g.b);
    }
    const key = show(g);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(g);
    }
  };
  walk(f);
  return out;
}

/** Every row, in the usual order: all true first, the last letter changing fastest. */
export function rowsOf(letters: string[]): Record<string, boolean>[] {
  const n = letters.length;
  return [...Array(2 ** n).keys()].map((k) => Object.fromEntries(letters.map((l, i) => [l, ((k >> (n - 1 - i)) & 1) === 0])));
}

/** At most this many letters: 2⁵ = 32 rows. */
export const MAX_LETTERS = 5;
