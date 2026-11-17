import assert from "node:assert/strict";
import { test } from "node:test";
import { parseState } from "./goals.ts";
import { checkParam, checkParams, EXERCISE_KEYS, EXERCISES, isExerciseKind, isWidget, WIDGET_KEYS, WIDGETS } from "./registry.ts";

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
  assert.match(checkParams(WIDGETS["move-list"], { moves: ["intro"], title: "x" }).join(), /has no parameter `title`/);
});
