import assert from "node:assert/strict";
import { test } from "node:test";
import { checkExpr, constantValue, evaluate, parseExpr } from "./expr.ts";

const at = (source: string, x: number) => evaluate(parseExpr(source), x);
const near = (a: number, b: number, what: string) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} is not ${b}`);

test("arithmetic binds the way it is written on paper", () => {
  near(at("1 + 2 * 3", 0), 7, "times before plus");
  near(at("(1 + 2) * 3", 0), 9, "brackets");
  near(at("8 / 4 / 2", 0), 1, "division goes left to right");
  near(at("8 - 4 - 2", 0), 2, "subtraction goes left to right");
  near(at("2 ^ 3 ^ 2", 0), 512, "powers go right to left");
  near(at("2 * x ^ 2", 3), 18, "power before times");
  near(at("-x ^ 2", 3), -9, "a minus sign in front applies after the power");
  near(at("(-x) ^ 2", 3), 9, "unless bracketed");
  near(at("2 ^ -1", 0), 0.5, "a negative exponent");
  near(at("- - x", 3), 3, "two minus signs");
  near(at("3 - -x", 2), 5, "minus a negative");
  near(at("1.5 + .5", 0), 2, "decimals");
});

test("a product can be written with nothing between its factors", () => {
  near(at("2x + 1", 3), 7, "2x");
  near(at("2x^2", 3), 18, "2x^2 is 2(x^2)");
  near(at("2(x + 1)", 3), 8, "2(…)");
  near(at("(x + 1)(x - 1)", 3), 8, "(…)(…)");
  near(at("x(x + 1)", 3), 12, "x(…)");
  near(at("2 pi", 0), 2 * Math.PI, "2 pi");
  near(at("x sin(x)", 2), 2 * Math.sin(2), "x sin(x)");
  near(at("(1/2)x", 4), 2, "half of x");
  near(at("1/(2x)", 4), 1 / 8, "one over 2x");
  near(at("x/2*x", 3), 4.5, "with the * written, left to right");
  near(at("2x/x", 5), 2, "2x/x");
});

test("the functions, the constants, absolute value bars and the symbols a lesson is typed with", () => {
  near(at("abs(x - 3)", 1), 2, "abs");
  near(at("|x - 3|", 1), 2, "bars");
  near(at("|x| + |x - 1|", -2), 5, "two pairs of bars");
  near(at("2|x|", -3), 6, "a number times bars");
  near(at("||x| - 1|", -0.25), 0.75, "bars inside bars");
  near(at("|(x - 1)|x", -2), -6, "bars around a bracket, then a factor");
  near(at("sqrt(x)", 9), 3, "sqrt");
  near(at("√(x)", 9), 3, "√");
  near(at("sin(pi / 2) + cos(0)", 0), 2, "sin, cos, pi");
  near(at("exp(1) - e", 0), 0, "exp and e");
  near(at("log(e^2)", 0), 2, "log is the natural logarithm");
  near(at("ln(e)", 0), 1, "ln");
  near(at("x² − 2·x + 1", 3), 4, "², − and ·");
  near(at("x³ ÷ x", 2), 4, "³ and ÷");
  near(at("2π", 0), 2 * Math.PI, "π");
  near(at("X + 1", 2), 3, "capital X");
});

test("where a function has no value the result is not a number, and nothing throws", () => {
  assert.ok(!Number.isFinite(at("1 / x", 0)));
  assert.ok(Number.isNaN(at("sqrt(x)", -1)));
  assert.ok(Number.isNaN(at("log(x)", -1)));
  assert.ok(!Number.isFinite(at("(x^2 + x) / x", 0)));
});

test("anything else is refused, with a reason", () => {
  const refused: [string, RegExp][] = [
    ["", /is empty/],
    ["   ", /is empty/],
    ["2 +", /stops where/],
    ["* 2", /“\*” where a number or x was expected/],
    ["(x + 1", /needs “\)”/],
    ["x + 1)", /“\)” left over/],
    ["|x", /needs “\|” to close an absolute value/],
    ["sin x", /needs “\(” after sin/],
    ["y + 1", /“y”, which is not a name it knows/],
    ["foo(x)", /“foo”, which is not a name it knows/],
    ["x; alert(1)", /contains “;”/],
    ["x = 2", /contains “=”/],
    ["constructor", /is not a name it knows/],
    ["__proto__", /contains “_”/],
    ["x.toString()", /contains “\.”|is not a name/],
    ["2 ** 3", /where a number or x was expected/],
    ["1e5", /exponent letter/],
    ["1e-5", /exponent letter/],
    ["2.5E+3", /exponent letter/],
    ["x2", /the number 2 straight after/],
    ["1/2x", /straight after a division/],
    ["x/2x", /straight after a division/],
    ["1/2(x + 1)", /straight after a division/],
    ["x2", /the number 2 straight after/],
    ["2 3", /the number 3 straight after/],
    ["x".repeat(201), /longer than 200/],
    ["(".repeat(70) + "x" + ")".repeat(70), /nested too deeply/],
    ["-".repeat(150) + "x", /nested too deeply/],
  ];
  for (const [source, why] of refused) {
    assert.throws(() => parseExpr(source), why, JSON.stringify(source));
    assert.match(checkExpr(source) ?? "", why);
  }
  assert.equal(checkExpr("2x + 1"), null);
  assert.match(checkExpr(7) ?? "", /written as text/);
  assert.match(checkExpr("y") ?? "", /^“y” uses “y”, which is not a name/);
});

test("a particular number can be written as an expression", () => {
  assert.equal(constantValue("1/2"), 0.5);
  assert.equal(constantValue(3), 3);
  near(constantValue("sqrt(2)") ?? 0, Math.SQRT2, "sqrt(2)");
  near(constantValue("-pi") ?? 0, -Math.PI, "-pi");
  assert.equal(constantValue("x + 1"), null);
  assert.equal(constantValue("1/0"), null);
  assert.equal(constantValue("nonsense"), null);
  assert.equal(constantValue(Number.NaN), null);
  assert.equal(constantValue(null), null);
});
