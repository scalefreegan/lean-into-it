// How Lean and maths are said aloud. A formula or a Lean name in a lesson
// is read from the spoken form its author wrote (docs/CONTENT.md, "Spoken
// forms"); when there is none, from the tables here. The tables are sure of
// themselves only for simple things (a name, a tactic line, a formula of
// names, numbers and common symbols); anything else is still said as well
// as the tables can, and `npm run check:content -- --gaps` lists it so an
// author can write it out. Pure: no DOM, no network.

import { TACTICS } from "../leaneditor.ts";

/** Names said differently from how a voice would read their letters. */
export const NAMES: Record<string, string> = {
  rfl: "refl",
  rw: "rewrite",
  simp: "simp",
  linarith: "lin arith",
  nlinarith: "N lin arith",
  gcongr: "G congr",
  norm: "norm",
  num: "num",
  exfalso: "ex falso",
  contra: "contra",
  rcases: "R cases",
  rintro: "R intro",
  ih: "I H",
  xs: "x's",
  ys: "y's",
  zs: "z's",
  succ: "suck",
  Nat: "nat",
  Int: "int",
  Finset: "fin set",
  abs: "abs",
  len: "len",
  nil: "nil",
  calc: "calc",
  sq: "square",
  nonneg: "non neg",
  pos: "pos",
  le: "L E",
  lt: "L T",
  ne: "N E",
  eq: "eq",
  comm: "comm",
  assoc: "assoc",
  mul: "mul",
  Prop: "prop",
  dvd: "D V D",
  nf: "N F",
  mp: "M P",
  mpr: "M P R",
  inl: "in L",
  inr: "in R",
  _: "blank",
};

/** Whole spans said as a phrase. */
const WHOLE: Record<string, string> = {
  "⊢": "the goal symbol",
  "[]": "the empty list",
  "⟨ ⟩": "angle brackets",
  "⟨⟩": "angle brackets",
  "⟨": "a left angle bracket",
  "⟩": "a right angle bracket",
  "|": "a bar",
  ":=": "colon equals",
  ":= by": "colon equals by",
  _: "an underscore",
  "<-": "a less than sign and a hyphen",
  "->": "a hyphen and a greater than sign",
  "exact?": "exact question mark",
  "apply?": "apply question mark",
  "·": "a dot",
  "...": "dot dot dot",
  "…": "dot dot dot",
  "++": "plus plus",
  "@[simp]": "the simp attribute",
  "#eval": "hash eval",
  "#check": "hash check",
  "Nat.": "nat dot",
};

/** Symbols the tables read with confidence. */
export const SYMBOLS: Record<string, string> = {
  "=": "equals",
  "+": "plus",
  "-": "minus",
  "−": "minus",
  "*": "times",
  "×": "times",
  "·": "times",
  "/": "over",
  "^": "to the power",
  "²": "squared",
  "³": "cubed",
  "<": "is less than",
  ">": "is greater than",
  "≤": "is at most",
  "≥": "is at least",
  "≠": "is not equal to",
  "∧": "and",
  "∨": "or",
  "¬": "not",
  "→": "implies",
  "↔": "if and only if",
  "∣": "divides",
  "∈": "in",
  "∉": "not in",
  "⊆": "is a subset of",
  "∪": "union",
  "∩": "intersection",
  "∅": "the empty set",
  // Aᶜ: the complement, written after its set. A \ B: what is in A and not in B.
  "ᶜ": "complement",
  "\\": "minus",
  "::": "followed by",
  "++": "appended to",
  "[]": "the empty list",
  "ℕ": "the natural numbers",
  "ℤ": "the integers",
  "ℚ": "the rationals",
  "ℝ": "the real numbers",
  "π": "pi",
  "ε": "epsilon",
  "δ": "delta",
  "√": "the square root of",
  True: "true",
  False: "false",
};

/** Symbols said as well as can be, but whose reading depends on what is
 *  around them: a span that comes to one of these wants a written spoken form. */
const LOOSE: Record<string, string> = {
  ":": ",",
  ":=": "colon equals",
  "∀": "for every",
  "∃": "there exists",
  "∑": "the sum of",
  "Σ": "the sum of",
  "λ": "the function taking",
  "↦": "to",
  "=>": "gives",
  "←": "backwards",
  "|": "bar",
  ",": ",",
  ";": ",",
  "%": "mod",
  "∘": "after",
  "⁻¹": "inverse",
  "#": "hash",
  ".": "dot",
};

/** A kind of number, or Prop, as what one thing of it is. */
const ONE_OF: Record<string, string> = { "ℕ": "a natural number", "ℤ": "an integer", "ℚ": "a rational number", "ℝ": "a real number", Prop: "a proposition" };

const TACTIC_SET = new Set(TACTICS);
const FACT_LISTS = new Set(["rw", "nth_rw", "simp", "simp_all", "dsimp", "norm_num", "field_simp", "linarith", "nlinarith", "ring_nf", "unfold"]);
/** What makes a bracket matter: with one of these inside, taking the bracket away can change the meaning. */
const OPERATORS = new Set(["\\", "=", "+", "-", "−", "*", "×", "·", "/", "^", "<", ">", "≤", "≥", "≠", "∧", "∨", "¬", "→", "↔", "∣", "∈", "∉", "⊆", "∪", "∩", "::", "++", "↑"]);

/** One name as it is said: `Nat.add_comm` is "nat add comm", `h1` "h 1", `hPQ` "h P Q", `x'` "x prime". */
export function sayName(name: string): string {
  if (Object.hasOwn(NAMES, name)) return NAMES[name];
  // A fact named for one thing: ha is "h a".
  if (/^h[a-z]$/.test(name)) return `h ${name[1]}`;
  // x.succ and h.1 are a thing and what is taken from it: the dot is said.
  // Nat.add_comm is one name in a namespace: it is not.
  const dotted = /^([\p{Ll}][\p{N}']*|[^.]*(?=\.\d))\.(.+)$/u.exec(name);
  if (dotted) return `${sayName(dotted[1])} dot ${sayName(dotted[2])}`;
  if (/^\d+$/.test(name)) return name;
  return name
    .replace(/[₀-₉]/g, (d) => ` ${"₀₁₂₃₄₅₆₇₈₉".indexOf(d)}`)
    .split(/[._\s]+/)
    .filter(Boolean)
    .map((piece) => {
      const primes = /'+$/.exec(piece)?.[0].length ?? 0;
      const bare = primes ? piece.slice(0, -primes) : piece;
      const said = Object.hasOwn(NAMES, bare)
        ? NAMES[bare]
        : bare
            // h1 -> h 1, hPQ -> h P Q, addZero -> add Zero
            .replace(/([A-Za-z])(\d)/g, "$1 $2")
            .replace(/([a-z])([A-Z])/g, "$1 $2")
            .replace(/([A-Z])(?=[A-Z])/g, "$1 ")
            .split(" ")
            .map((w) => (Object.hasOwn(NAMES, w) ? NAMES[w] : w))
            .join(" ");
      return said + " prime".repeat(primes);
    })
    .join(" ");
}

// ᶜ is a letter to Unicode, but Aᶜ is A's complement, not a name: it is a token of its own.
const TOKEN = /\s+|\+\+|(?!ᶜ)[\p{L}_](?:(?!ᶜ)[\p{L}\p{N}_'.])*(?!ᶜ)[\p{L}\p{N}_']|(?!ᶜ)[\p{L}_]|\d+(?:\.\d+)?|::|:=|=>|\[\]|⁻¹|./gu;
const IS_NAME = /^[\p{L}_]/u;

/** Whether a word is a move's name (a tactic the lessons or the editor know). */
export function isTactic(word: string): boolean {
  return TACTIC_SET.has(word);
}

export interface Said {
  /** The words to say; may be empty when nothing in the span can be said. */
  text: string;
  /** Whether the tables are sure of it. False: worth a written spoken form. */
  sure: boolean;
}

/** A `code` span of a lesson, as it is said when its author wrote no spoken form. */
export function sayCode(code: string): Said {
  const whole = code.trim();
  if (Object.hasOwn(WHOLE, whole)) return { text: WHOLE[whole], sure: true };
  // What is typed to get a symbol: \not, \<.
  if (/^\\\S+$/.test(whole)) {
    const rest = whole.slice(1);
    // Two backslashes are two backslashes, not a difference.
    if (rest === "\\") return { text: "backslash backslash", sure: true };
    return { text: `backslash ${Object.hasOwn(SYMBOLS, rest) ? SYMBOLS[rest].replace(/^is /, "") : rest === "|" ? "bar" : rest.length === 1 ? rest.toUpperCase() : rest}`, sure: true };
  }
  if (whole === "\\") return { text: "backslash", sure: true };
  // A \ B is a difference only with a space each side: \to in a longer span is something typed, and not for the tables.
  const typedBackslash = /\\(?=\S)|(?<=\S)\\|^\\|\\$/.test(whole);
  // A binder by itself, (n : ℕ), is a declaration, not a cast.
  const binder = /^\((.*)\)$/.exec(whole);
  if (binder && !/[()]/.test(binder[1]) && binder[1].includes(":")) return sayCode(binder[1]);
  const bars = /^\|([^|]+)\|$/.exec(whole);
  if (bars) {
    const inner = sayCode(bars[1]);
    return { text: `the absolute value of ${inner.text}`, sure: inner.sure };
  }
  const tokens = (whole.match(TOKEN) ?? []).filter((t) => t.trim());
  const isName = (t: string | undefined) => t !== undefined && IS_NAME.test(t) && !Object.hasOwn(SYMBOLS, t);
  const tactic = TACTIC_SET.has(tokens[0] ?? "") && tokens.length > 1;
  // After these the square brackets hold the facts to use, and are punctuation; anywhere else they are a list.
  const takesFacts = tactic && FACT_LISTS.has(tokens[0]);
  // Round brackets with an operator inside change what a formula means, so
  // they are said; round a single thing or an application they are not.
  const saidBrackets = new Set<number>();
  const open: number[] = [];
  tokens.forEach((t, i) => {
    if (t === "(") open.push(i);
    else if (t === ")" && open.length) {
      const from = open.pop()!;
      if (tokens.slice(from + 1, i).some((x) => OPERATORS.has(x))) saidBrackets.add(from).add(i);
    }
  });
  // Between kinds of number the arrow is a function's: "the real numbers to the real numbers".
  const types = tokens.some((t) => "ℕℤℚℝ".includes(t));
  const out: string[] = [];
  let sure = true;
  /** Where the bracket being read opened (-1: none), for "(n : ℝ)". */
  let opened = -1;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const next = tokens[i + 1];
    if (t === "(") opened = i;
    else if (t === ")") opened = -1;
    if (t === "→" && types) out.push("to");
    else if (t === "⊢") out.push("the goal");
    else if (t === "…" || (t === "." && next === "." && tokens[i + 2] === ".")) {
      out.push("dot dot dot");
      if (t === ".") i += 2;
    } else if (t === ":" && Object.hasOwn(ONE_OF, next ?? "") && (i + 2 === tokens.length || tokens[i + 2] === ")")) {
      // n : ℕ is "n, a natural number"; (n : ℝ) is "n as a real number"; P Q : Prop is "P Q, each a proposition".
      const from = opened + 1;
      const names = tokens.slice(from, i);
      if (!names.length || !names.every((n) => isName(n) || /^\d/.test(n))) sure = false;
      out.push(names.length > 1 ? ", each" : opened >= 0 ? "as" : ",", ONE_OF[next!]);
      i++;
    } else if (t === ":" && i === 1 && isName(tokens[0]) && /^h/.test(tokens[0])) out.push(", which says");
    else if (t === ":" && i === 1 && isName(tokens[0]) && tokens.slice(2).every((x) => "ℕℤℚℝ→".includes(x))) out.push(", a function from");
    else if ((t === "∀" || t === "∃") && isName(next)) {
      // ∀ x y, … : names up to the comma.
      let j = i + 1;
      while (isName(tokens[j])) j++;
      if (tokens[j] !== ",") sure = false;
      out.push(t === "∀" ? "for every" : "there exists", ...tokens.slice(i + 1, j).map(sayName));
      if (tokens[j] === ",") {
        out.push(t === "∀" ? "," : "such that");
        i = j;
      } else i = j - 1;
    } else if (t === "fun" && isName(next)) out.push("the function taking");
    else if (t === "=>" && tokens[0] === "fun") out.push("to");
    else if (t === "|" && i === 0) out.push("case");
    else if (t === "=>" && tokens[0] === "|") {
      if (next !== undefined) out.push(",");
    } else if (t === "↑") out.push("up arrow");
    else if (saidBrackets.has(i)) out.push(t === "(" ? "open bracket" : "close bracket");
    else if (t === "*" && tokens[i - 1] === "at") out.push("everything");
    else if (t === "[" && !takesFacts) out.push("the list");
    else if (t === "]" && !takesFacts) continue;
    else if (t === "," && (tactic || tokens.includes("[") || tokens.includes("⟨"))) out.push(",");
    else if (t === "⟨") {
      if (!tactic) out.push("the pair");
    } else if (t === "⟩") continue;
    else if (tactic && t === ":=" && (tokens[0] === "obtain" || tokens[0] === "rcases")) out.push("from");
    else if (tactic && t === "|" && tokens[0] === "obtain") out.push("or");
    else if (t === "\\" && typedBackslash) sure = false;
    else if (Object.hasOwn(SYMBOLS, t)) out.push(SYMBOLS[t]);
    else if (isName(t) && !Object.hasOwn(LOOSE, t)) out.push(sayName(t));
    else if (/^\d/.test(t)) out.push(t);
    else if (t === "(" || t === ")") continue;
    else if (t === "[" || t === "]") continue;
    else if (tactic && t === "←") out.push("backwards");
    else {
      sure = false;
      if (Object.hasOwn(LOOSE, t)) out.push(LOOSE[t]);
    }
  }
  const text = out.join(" ").replace(/ ,/g, ",").replace(/,+/g, ",").replace(/^,\s*|,$/g, "").trim();
  return { text, sure: sure && text !== "" };
}

/** Symbols read inside running text. ASCII `-` and `/` are left alone
 *  there: a hyphen is not a minus. */
const IN_PROSE: Record<string, string> = {
  ...Object.fromEntries(Object.entries(SYMBOLS).filter(([k]) => [...k].length === 1 && !/[-/*^A-Za-z\\]/.test(k))),
  "∀": "for every",
  "∃": "there exists",
  "Σ": "sigma",
  "∑": "the sum",
  "⇒": "left to right",
  "⇐": "right to left",
  "←": "backwards",
  "⊢": "the goal symbol",
  "≈": "is about",
  "^": "to the power",
  "∞": "infinity",
};

/** One run of running text with no space in it ("a²", "≤", "(a−b)²,"), as
 *  it is said; `unknown` are the characters no table has. */
export function sayText(run: string): { text: string; unknown: string[] } {
  if (run === "…") return { text: "and so on", unknown: [] };
  // A \ B, set difference; a backslash inside a word is not one.
  if (run === "\\") return { text: "minus", unknown: [] };
  // A Lean name written out in the text: norm_num.
  const name = /^([\p{L}]+(?:_[\p{L}\p{N}]+)+)([.,;:!?)]*)$/u.exec(run);
  if (name) return { text: sayName(name[1]) + name[2], unknown: [] };
  const unknown: string[] = [];
  const chars = [...run];
  let out = "";
  chars.forEach((ch, i) => {
    const next = chars[i + 1];
    if (ch === "…") return; // trailing off: the voice pauses at the space
    if (ch === "|") {
      // |x| is the absolute value of x: a bar with something after it opens, one before a stop or the end closes.
      if (chars.length === 1) unknown.push(ch);
      else if (next !== undefined && !/[|,.;:!?)\]]/.test(next)) out += " the absolute value of ";
      return;
    }
    if (ch === "[") out += next === "]" ? " the empty list " : " the list ";
    else if (ch === "]") return;
    else if (Object.hasOwn(IN_PROSE, ch)) out += ` ${IN_PROSE[ch]} `;
    else if (ch.codePointAt(0)! > 0x2000 && !/[\u2010-\u2027\u2032\u2033]/.test(ch)) unknown.push(ch);
    else if (/[\\{}~_]/.test(ch)) unknown.push(ch);
    // Letters with accents, quotes and dashes are the voice's own business.
    else out += ch;
  });
  // "(a + b) squared": a bracket or a comma goes back against its word.
  const text = out.replace(/\s+/g, " ").trim().replace(/ ([,.;:!?)"”’])/g, "$1").replace(/([("“‘]) /g, "$1");
  return { text, unknown };
}
