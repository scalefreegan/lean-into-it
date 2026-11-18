import assert from "node:assert/strict";
import { test } from "node:test";
import { parseState } from "./goals.ts";
import { parse as parseYaml } from "yaml";
import { checkParam, checkParams, EXERCISE_KEYS, EXERCISES, isExerciseKind, isWidget, WIDGET_KEYS, widgetBlock, WIDGETS, type WidgetType } from "./registry.ts";

test("no parameter name collides with the block's own keys", () => {
  // A widget block's `type:` names the widget, so a parameter called `type`
  // could never be written (YAML refuses the duplicate key). An exercise's
  // id, kind, title and concept belong to every exercise.
  for (const [name, w] of Object.entries(WIDGETS)) for (const key of WIDGET_KEYS) assert.ok(!(key in w.params), `widget ${name} has a parameter called ${key}`);
  for (const [name, e] of Object.entries(EXERCISES)) for (const key of EXERCISE_KEYS) assert.ok(!(key in e.params), `exercise kind ${name} has a parameter called ${key}`);
});

test("every entry says what it is, documents each parameter, and its examples pass its own checks", () => {
  for (const [name, w] of Object.entries(WIDGETS)) {
    assert.ok(w.doc.length > 20, `widget ${name} needs a doc`);
    assert.ok(w.examples.length > 0, `widget ${name} needs an example for the Gallery`);
    for (const [key, p] of Object.entries(w.params)) assert.ok(p.doc, `widget ${name}.${key} needs a doc`);
    for (const example of w.examples) assert.deepEqual(checkParams(w, example), [], `widget ${name}: ${JSON.stringify(example)}`);
  }
  for (const [name, e] of Object.entries(EXERCISES)) {
    assert.ok(e.doc.length > 20 && e.label, `exercise kind ${name} needs a doc and a label`);
    for (const [key, p] of Object.entries(e.params)) assert.ok(p.doc, `exercise kind ${name}.${key} needs a doc`);
  }
  assert.ok(isWidget("proof-state") && !isWidget("toString") && !isWidget("nope"));
  assert.ok(isExerciseKind("prove") && !isExerciseKind("constructor"));
});

test("parameter checks accept good values and explain bad ones", () => {
  assert.equal(checkParam("string", "one line"), null);
  assert.match(checkParam("string", "two\nlines") ?? "", /one line/);
  assert.match(checkParam("string", "  ") ?? "", /must be text/);
  assert.equal(checkParam("text", "intro h\nexact h"), null);
  assert.match(checkParam("text", 3) ?? "", /must be text/);
  assert.equal(checkParam("number", 2.5), null);
  assert.ok(checkParam("number", "2"));
  assert.ok(checkParam("number", Number.NaN));
  assert.equal(checkParam("boolean", false), null);
  assert.ok(checkParam("boolean", "yes"));
  assert.equal(checkParam("string[]", ["a", "b"]), null);
  assert.ok(checkParam("string[]", ["a", 2]));
  assert.ok(checkParam("string[]", "a"));
  assert.equal(checkParam("number[]", [1, 2]), null);
  assert.ok(checkParam("number[]", [1, "2"]));
  assert.equal(checkParam("enum:a|b", "a"), null);
  assert.match(checkParam("enum:a|b", "c") ?? "", /one of a, b/);
  assert.equal(checkParam("enum[]:a|b", ["a", "b"]), null);
  assert.match(checkParam("enum[]:a|b", ["a", "c"]) ?? "", /"c" is not one of/);
  assert.equal(checkParam("move[]", ["intro", "exact"]), null);
  assert.match(checkParam("move[]", ["intro", "teleport"]) ?? "", /move "teleport"/);
  assert.ok(checkParam("move[]", "intro"));
});

test("a proof state is read the way Lean prints one, and a state with no goal is refused", () => {
  const one = "P Q : Prop\nhP : P\nhPQ : P → Q\n⊢ Q";
  assert.equal(checkParam("state", one), null);
  assert.equal(checkParam("state", `${one}\n`), null, "YAML's `|` leaves a newline at the end");
  const two = "case left\nP : Prop\nhP : P\n⊢ P\n\ncase right\nP : Prop\nhP : P\n⊢ P";
  assert.equal(checkParam("state", two), null);
  assert.deepEqual(parseState(two).map((g) => [g.caseName, g.target]), [["left", "P"], ["right", "P"]]);
  // A long statement continues on an indented line, as Lean prints it.
  assert.equal(checkParam("state", "f : ℕ → ℕ\nh : ∀ n,\n    f n = n\n⊢ f 2 = 2"), null);
  assert.equal(checkParam("state", "⊢ 2 + 2 = 4"), null);

  assert.match(checkParam("state", "P : Prop\nhP : P") ?? "", /no line starting with ⊢/);
  assert.match(checkParam("state", "hP : P\n⊢ ") ?? "", /nothing after ⊢/);
  assert.match(checkParam("state", "P is a statement\n⊢ P") ?? "", /“P is a statement”, which is not `name : statement`/);
  assert.match(checkParam("state", `${one}\n\nhP : P`) ?? "", /^goal 2 has no line starting with ⊢/);
  assert.ok(checkParam("state", 7));
});

test("a proof state exactly as Lean 4.36 prints a long one", () => {
  // Lean breaks a long hypothesis straight after its colon and indents the rest.
  const long = "f : Nat → Nat\nh :\n  ∀ (n : Nat),\n    f (n + 1) + f (n + 2) =\n      f n + f (n + 3)\n⊢ f 1 + f 2 =\n    f 0 + f 3";
  assert.equal(checkParam("state", long), null);
  const [goal] = parseState(long);
  assert.deepEqual(goal.hypotheses.map((h) => h.names), [["f"], ["h"]]);
  assert.equal(goal.hypotheses[1].type, "∀ (n : Nat),\n    f (n + 1) + f (n + 2) =\n      f n + f (n + 3)");
  assert.equal(goal.target, "f 1 + f 2 =\n    f 0 + f 3");
  assert.equal(checkParam("state", "x : ℕ := 5\na✝ : x < 3\n⊢ False"), null);
  // `h :` with nothing under it is not a fact.
  assert.match(checkParam("state", "h :\n⊢ P") ?? "", /“h :”, which is not/);
  // After the goal only its own indented continuation may come.
  assert.match(checkParam("state", "P : Prop\n⊢ P\nQ : Prop\nhQ : Q\n⊢ Q") ?? "", /“Q : Prop” after the goal/);
  assert.match(checkParam("state", "⊢ P\nhP : P") ?? "", /“hP : P” after the goal/);
  assert.match(checkParam("state", "⊢ P\nand that is all") ?? "", /after the goal/);
});

test("the block the Gallery prints for each example loads back as that example", () => {
  for (const [type, w] of Object.entries(WIDGETS)) {
    for (const example of w.examples) {
      const printed = widgetBlock(type as WidgetType, example);
      const lines = printed.split("\n");
      assert.equal(lines[0], "```widget");
      assert.equal(lines.at(-1), "```");
      const { type: readType, ...params } = parseYaml(lines.slice(1, -1).join("\n")) as Record<string, unknown>;
      assert.equal(readType, type);
      // YAML's `|` ends a block of text with a newline; the checks and the widgets ignore it.
      const tidy = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "string" ? v.replace(/\n+$/, "") : v]));
      assert.deepEqual(tidy(params), tidy(example), printed);
      assert.deepEqual(checkParams(w, params), [], printed);
    }
  }
  // Text YAML would read as something else is quoted.
  const tricky = widgetBlock("proof-state", { state: "⊢ P", caption: "P ∧ Q: two goals # not a comment" });
  assert.deepEqual(parseYaml(tricky.split("\n").slice(1, -1).join("\n")), { type: "proof-state", state: "⊢ P", caption: "P ∧ Q: two goals # not a comment" });
  for (const text of ["yes", "null", "3", " padded ", "- item", "[a]", "it's: here"]) {
    const block = widgetBlock("proof-state", { state: "⊢ P", caption: text });
    assert.equal((parseYaml(block.split("\n").slice(1, -1).join("\n")) as Record<string, unknown>).caption, text, block);
  }
});

test("a whole set of parameters: unknown, missing, out of bounds, and the checks across them", () => {
  const spec = { params: { n: { type: "number" as const, required: true, min: 1, max: 9, integer: true, doc: "How many." }, label: { type: "string" as const, doc: "A label." } } };
  assert.deepEqual(checkParams(spec, { n: 3 }), []);
  assert.match(checkParams(spec, {}).join(), /needs `n`: How many\./);
  assert.match(checkParams(spec, { n: 3, colour: "red" }).join(), /has no parameter `colour` \(it takes `n`, `label`\)/);
  assert.match(checkParams(spec, { n: 0 }).join(), /`n` 0 is below the least allowed, 1/);
  assert.match(checkParams(spec, { n: 10 }).join(), /above the most allowed, 9/);
  assert.match(checkParams(spec, { n: 2.5 }).join(), /whole number/);
  assert.equal(checkParams(spec, { n: "x", label: 4, extra: 1 }).length, 3, "every problem is reported, not only the first");
  // The block's own keys are not parameters.
  assert.deepEqual(checkParams(spec, { n: 3, type: "anything" }, WIDGET_KEYS), []);

  const prove = EXERCISES.prove;
  const good = { says: "P gives P.", statement: "(P : Prop) (hP : P) : P", moves: ["exact"], solution: "exact hP" };
  assert.deepEqual(checkParams(prove, { id: "a", title: "A", ...good }, EXERCISE_KEYS), []);
  assert.deepEqual(checkParams(prove, { ...good, mode: "typed", moves: undefined }), []);
  assert.match(checkParams(prove, { ...good, moves: undefined }).join(), /a board exercise needs `moves`/);
  assert.match(checkParams(prove, { ...good, moves: [] }).join(), /a board exercise needs `moves`/);
  assert.match(checkParams(prove, { ...good, statement: "(P : Prop) : P := sorry" }).join(), /must not contain := or sorry/);
  assert.match(checkParams(prove, { ...good, statement: "P" }).join(), /needs a Lean `statement`/);
  assert.match(checkParams(prove, { ...good, given: "axiom cheat : False" }).join(), /`given` must not contain/);
  assert.match(checkParams(prove, { ...good, mode: "spoken" }).join(), /`mode` must be one of board, typed/);
  assert.match(checkParams(prove, { ...good, moves: ["teleport"] }).join(), /`moves`: move "teleport" is not in/);
  assert.match(checkParams(prove, { ...good, solution: undefined }).join(), /needs `solution`/);

  assert.match(checkParams(WIDGETS["proof-state"], {}).join(), /needs `state`/);
  assert.match(checkParams(WIDGETS["move-list"], { moves: [] }).join(), /needs `moves`/, "a required list with nothing in it");
  assert.match(checkParams(WIDGETS["move-list"], { moves: ["intro"], title: "x" }).join(), /has no parameter `title`/);
});
