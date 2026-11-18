// A small, safe language for the functions a lesson plots: `2x + 1`,
// `x^2`, `abs(x - 3)`, `(x^2 + x) / x`. Parsed into a tree and evaluated by
// walking it. Nothing here is ever handed to `eval` or `Function`: lesson
// files are data, and a widget parameter must not be able to run code.
//
//   expression := term (("+" | "-") term)*
//   term       := factor (("*" | "/") factor | factor)*      2x, 2(x+1), x sin(x)
//   factor     := ("-" | "+") factor | power
//   power      := atom ("^" factor)?                         right to left; -x^2 is -(x^2)
//   atom       := number | "x" | "pi" | "e" | name "(" expression ")"
//                 | "(" expression ")" | "|" expression "|"
//
// Also read: − for minus, · and × for times, ÷ for divide, ² and ³, π, √(…).

export type Expr =
  | { kind: "number"; value: number }
  | { kind: "x" }
  | { kind: "negate"; of: Expr }
  | { kind: "binary"; op: "+" | "-" | "*" | "/" | "^"; left: Expr; right: Expr }
  | { kind: "call"; fn: FunctionName; of: Expr };

const FUNCTIONS = {
  abs: Math.abs,
  sqrt: Math.sqrt,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  exp: Math.exp,
  log: Math.log, // the natural logarithm, as in Lean's Real.log
  ln: Math.log,
} as const;
export type FunctionName = keyof typeof FUNCTIONS;

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

/** Why an expression could not be read, in a sentence for a lesson author. */
export class ExprError extends Error {}

type Token = { type: "number"; value: number } | { type: "name"; name: string } | { type: "symbol"; symbol: string };

const SYMBOLS: Record<string, string> = { "−": "-", "–": "-", "·": "*", "×": "*", "÷": "/", "²": "^2", "³": "^3", π: "pi", "√": "sqrt" };

function tokens(source: string): Token[] {
  const text = source.replace(/[−–·×÷²³π√]/g, (c) => ` ${SYMBOLS[c]} `).replace(/\^\s*(\d)\s/g, "^$1 ");
  const out: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    const space = /^\s+/.exec(rest);
    if (space) {
      i += space[0].length;
      continue;
    }
    const number = /^(\d+(\.\d+)?|\.\d+)/.exec(rest);
    if (number) {
      out.push({ type: "number", value: Number(number[0]) });
      i += number[0].length;
      continue;
    }
    const name = /^[A-Za-z]+/.exec(rest);
    if (name) {
      out.push(...names(name[0]));
      i += name[0].length;
      continue;
    }
    if ("+-*/^()|".includes(rest[0])) {
      out.push({ type: "symbol", symbol: rest[0] });
      i++;
      continue;
    }
    throw new ExprError(`“${rest[0]}” is not something an expression can contain`);
  }
  return out;
}

/** A run of letters: one known name, or known names and x written side by
 *  side (`xsin`, `pix`). Anything else is refused whole, by name. */
function names(word: string): Token[] {
  const known = ["x", ...Object.keys(CONSTANTS), ...Object.keys(FUNCTIONS)].sort((a, b) => b.length - a.length);
  const out: Token[] = [];
  let rest = word.toLowerCase();
  while (rest) {
    const next = known.find((k) => rest.startsWith(k));
    if (!next) throw new ExprError(`“${word}” is not a name it knows. The variable is x, the constants are pi and e, and the functions are ${Object.keys(FUNCTIONS).join(", ")}`);
    out.push({ type: "name", name: next });
    rest = rest.slice(next.length);
  }
  return out;
}

/** Deep enough for anything a person writes, shallow enough that a file of
 *  ten thousand brackets cannot exhaust the stack. */
const MAX_DEPTH = 60;
const MAX_LENGTH = 200;

export function parseExpr(source: string): Expr {
  if (typeof source !== "string" || !source.trim()) throw new ExprError("is empty");
  if (source.length > MAX_LENGTH) throw new ExprError(`is longer than ${MAX_LENGTH} characters`);
  const toks = tokens(source);
  let at = 0;
  let depth = 0;
  let bars = 0;
  const peek = () => toks[at];
  const isSymbol = (s: string) => {
    const t = toks[at];
    return !!t && t.type === "symbol" && t.symbol === s;
  };
  const expect = (s: string, after: string) => {
    if (!isSymbol(s)) throw new ExprError(`needs “${s}” ${after}`);
    at++;
  };
  const deeper = <T>(run: () => T): T => {
    if (++depth > MAX_DEPTH) throw new ExprError("is nested too deeply");
    try {
      return run();
    } finally {
      depth--;
    }
  };

  const expression = (): Expr =>
    deeper(() => {
      let left = term();
      while (isSymbol("+") || isSymbol("-")) {
        const op = (toks[at++] as { symbol: "+" | "-" }).symbol;
        left = { kind: "binary", op, left, right: term() };
      }
      return left;
    });

  /** Can a factor start here? Then two factors side by side are a product. */
  const startsFactor = () => {
    const t = peek();
    if (!t) return false;
    // `x2`, `2 3` and `1e5` are more likely slips than products.
    if (t.type === "number") throw new ExprError(`has the number ${t.value} straight after something else. Write * between them, or put the number first`);
    if (t.type !== "symbol") return true;
    // A bar after a factor closes an absolute value if one is open.
    return t.symbol === "(" || (t.symbol === "|" && bars === 0);
  };

  const term = (): Expr => {
    let left = factor();
    for (;;) {
      if (isSymbol("*") || isSymbol("/")) {
        const op = (toks[at++] as { symbol: "*" | "/" }).symbol;
        left = { kind: "binary", op, left, right: factor() };
      } else if (startsFactor()) {
        left = { kind: "binary", op: "*", left, right: power() };
      } else return left;
    }
  };

  const factor = (): Expr =>
    deeper(() => {
      if (isSymbol("-")) {
        at++;
        return { kind: "negate", of: factor() };
      }
      if (isSymbol("+")) {
        at++;
        return factor();
      }
      return power();
    });

  const power = (): Expr => {
    const base = atom();
    if (!isSymbol("^")) return base;
    at++;
    return { kind: "binary", op: "^", left: base, right: factor() };
  };

  const atom = (): Expr => {
    const t = toks[at];
    if (!t) throw new ExprError("stops where a number or x was expected");
    at++;
    if (t.type === "number") return { kind: "number", value: t.value };
    if (t.type === "name") {
      if (t.name === "x") return { kind: "x" };
      if (Object.hasOwn(CONSTANTS, t.name)) return { kind: "number", value: CONSTANTS[t.name] };
      expect("(", `after ${t.name}: write ${t.name}(…)`);
      const outer = bars;
      bars = 0;
      const of = expression();
      expect(")", `to close ${t.name}(`);
      bars = outer;
      return { kind: "call", fn: t.name as FunctionName, of };
    }
    if (t.symbol === "(") {
      const outer = bars;
      bars = 0;
      const inner = expression();
      expect(")", "to close a bracket");
      bars = outer;
      return inner;
    }
    if (t.symbol === "|") {
      bars++;
      const of = expression();
      expect("|", "to close an absolute value");
      bars--;
      return { kind: "call", fn: "abs", of };
    }
    throw new ExprError(`has “${t.symbol}” where a number or x was expected`);
  };

  const result = expression();
  const extra = toks[at];
  if (extra) throw new ExprError(`has ${extra.type === "symbol" ? `“${extra.symbol}”` : "something"} left over that does not fit`);
  return result;
}

/** The value at x. NaN or ±Infinity where the function has none (1/0,
 *  sqrt(-1)); the plot leaves a gap there. */
export function evaluate(e: Expr, x: number): number {
  switch (e.kind) {
    case "number":
      return e.value;
    case "x":
      return x;
    case "negate":
      return -evaluate(e.of, x);
    case "call":
      return FUNCTIONS[e.fn](evaluate(e.of, x));
    case "binary": {
      const a = evaluate(e.left, x);
      const b = evaluate(e.right, x);
      if (e.op === "+") return a + b;
      if (e.op === "-") return a - b;
      if (e.op === "*") return a * b;
      if (e.op === "/") return a / b;
      return Math.pow(a, b);
    }
  }
}

export function usesX(e: Expr): boolean {
  if (e.kind === "x") return true;
  if (e.kind === "number") return false;
  if (e.kind === "binary") return usesX(e.left) || usesX(e.right);
  return usesX(e.of);
}

/** Why `source` is not an expression in x, or null when it is one. */
export function checkExpr(source: unknown): string | null {
  if (typeof source !== "string") return "must be an expression in x, written as text, like \"2x + 1\"";
  try {
    parseExpr(source);
    return null;
  } catch (e) {
    if (e instanceof ExprError) return `“${source}” ${e.message}`;
    throw e;
  }
}

/** A particular number written as an expression: `1/2`, `sqrt(2)`, `-pi`.
 *  Null when it is not one (it mentions x, or has no finite value). */
export function constantValue(source: unknown): number | null {
  if (typeof source === "number") return Number.isFinite(source) ? source : null;
  if (typeof source !== "string") return null;
  try {
    const e = parseExpr(source);
    if (usesX(e)) return null;
    const v = evaluate(e, 0);
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}
