import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { Exercise } from "../shared/content.ts";
import { readAnswer } from "../shared/truefalse.ts";
import { parse as parseYaml } from "yaml";
import { lineShape, moveLine, MOVES, readLine } from "../shared/moves.ts";
import { kindOf, reference, shown } from "../shared/reference.ts";
import { checkParams, exerciseBlock, EXERCISE_KEYS, EXERCISES, widgetBlock, WIDGETS, type ExerciseKind } from "../shared/registry.ts";
import { documentedLesson } from "./doclesson.ts";
import { loadContent } from "./loader.ts";

// docs/CONTENT-REFERENCE.md is generated; these keep it true.

const FILE = path.resolve(import.meta.dirname, "../../docs/CONTENT-REFERENCE.md");

test("docs/CONTENT-REFERENCE.md is what the registry says (run `npm run gen:reference` if not)", () => {
  assert.equal(fs.readFileSync(FILE, "utf8"), reference(), "docs/CONTENT-REFERENCE.md is stale: run `npm run gen:reference` and commit it");
});

test("the reference has every widget, exercise kind, parameter and move, and no parameter type left unexplained", () => {
  const text = reference();
  for (const [name, w] of Object.entries(WIDGETS)) {
    assert.ok(text.includes(`### \`${name}\``), name);
    for (const [param, spec] of Object.entries(w.params)) {
      assert.ok(text.includes(`| \`${param}\`${spec.required ? " (required)" : ""} | `), `${name}.${param}`);
      assert.notEqual(kindOf(spec.type), spec.type, `${name}.${param}: the type ${spec.type} has no description`);
    }
  }
  for (const [name, e] of Object.entries(EXERCISES)) {
    assert.ok(text.includes(`### \`${name}\` (shown as “${e.label}”)`), name);
    assert.ok(e.examples.length > 0, `${name} has no example`);
    for (const spec of Object.values(e.params)) assert.notEqual(kindOf(spec.type), spec.type);
  }
  for (const m of Object.values(MOVES)) assert.ok(text.includes(`| \`${m.id}\` | `) && text.includes(` | ${shown(lineShape(m))} | ${m.does.replaceAll("|", "\\|")} |`), `move ${m.id}`);
  // The exercise keys every kind shares are the ones the registry reserves.
  for (const key of EXERCISE_KEYS) assert.ok(new RegExp(`Every exercise takes .*\`${key}\``).test(text), key);
  assert.equal(kindOf("enum:board|typed"), "one of `board`, `typed`");
  // A table cell never breaks its row.
  const [params, moves] = text.split("\n## Moves\n");
  for (const line of params!.split("\n").filter((l) => l.startsWith("| `"))) assert.equal(line.replaceAll("\\|", "").split("|").length, 5, line);
  for (const line of moves!.split("\n").filter((l) => l.startsWith("| `"))) assert.equal(line.replaceAll("\\|", "").split("|").length, 6, line);
  assert.equal(shown("intro h (the board chooses the name)"), "`intro h` (the board chooses the name)");
});

/** What an exercise holds for a key of its block. A true-or-false keeps its
 *  own fields apart, and its reference answer as an answer is written. */
function fieldOf(exercise: Exercise, key: string): unknown {
  const tf = exercise.truefalse;
  if (tf && ["truth", "why", "witness", "close"].includes(key)) return (tf as unknown as Record<string, unknown>)[key];
  const answer = tf ? readAnswer(exercise.solution) : null;
  if (answer && typeof answer !== "string" && key === "counterexample") return answer.values.join(", ");
  if (answer && typeof answer !== "string" && key === "solution") return answer.body;
  if (exercise.predict && (key === "before" || key === "move")) return exercise.predict[key];
  if (exercise.pairs && (key === "english" || key === "lean")) return exercise.pairs[key];
  if (exercise.kind === "flaw" && key === "flaw") return Number(exercise.solution);
  return (exercise as unknown as Record<string, unknown>)[key];
}

test("every exercise example passes its kind's checks and loads from the block the reference prints", () => {
  const blocks: string[] = [];
  const want: Record<string, Record<string, unknown>> = {};
  for (const [kind, e] of Object.entries(EXERCISES)) {
    e.examples.forEach((example, i) => {
      assert.deepEqual(checkParams(e, example, EXERCISE_KEYS), [], `${kind} example ${i + 1}`);
      const id = `${kind}-example-${i + 1}`;
      blocks.push(exerciseBlock(kind as ExerciseKind, id, "An example", example));
      want[id] = { kind, ...example };
    });
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lii-ref-"));
  try {
    fs.writeFileSync(path.join(dir, "curriculum.yaml"), "tracks:\n  - id: logic\n    title: Logic\n    summary: s\nlevels:\n  - id: 1\n    title: One\n    summary: s\n");
    fs.mkdirSync(path.join(dir, "lessons", "logic"), { recursive: true });
    fs.writeFileSync(path.join(dir, "lessons", "logic", "x.md"), `---\nid: examples\ntitle: Examples\ntrack: logic\nlevel: 1\norder: 1\nconcepts: [c]\nsummary: s\nexercises:\n${blocks.join("\n")}\n---\n\nProse.\n`);
    const content = loadContent(dir);
    assert.deepEqual(content.problems, []);
    const loaded = content.lessons[0]!.exercises;
    assert.equal(loaded.length, Object.keys(want).length);
    for (const exercise of loaded) {
      for (const [key, value] of Object.entries(want[exercise.id]!)) {
        const got = fieldOf(exercise, key);
        assert.deepEqual(typeof got === "string" ? got.trimEnd() : got, value, `${exercise.id}.${key}`);
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the complete lesson in docs/CONTENT.md loads as written", () => {
  const { dir } = documentedLesson();
  try {
    const content = loadContent(dir);
    assert.deepEqual(content.problems, []);
    const lesson = content.lessons[0]!;
    assert.equal(lesson.id, "logic-1-chains-of-reasons");
    assert.deepEqual(lesson.exercises.map((e) => [e.id, e.kind, e.mode]), [["two-steps", "prove", "board"], ["which-fact", "fill", "typed"]]);
    assert.deepEqual(lesson.blocks.map((b) => (b.type === "widget" ? b.widget : b.type === "exercise" ? b.id : "prose")), ["prose", "proof-state", "prose", "two-steps", "prose", "which-fact", "prose", "move-list"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the line the reference says a move writes is the line the board writes", () => {
  const goal = { hypotheses: [{ names: ["h"], type: "P" }], target: "Q" } as unknown as Parameters<typeof moveLine>[1];
  for (const move of Object.values(MOVES)) {
    const shape = lineShape(move);
    // What does not depend on the goal is written exactly as shown.
    if (move.needs === "none") assert.equal(moveLine(move, goal), shape, move.id);
    if (move.needs === "fact" && move.id !== "obtain") assert.equal(moveLine(move, goal, "h"), shape, move.id);
    // And a line of that shape is read back as that move.
    const line = shape.replace(/ \(.*\)$/, "").replace("…what was typed", "2").replace("⟨…⟩", "⟨a, b⟩");
    assert.equal(readLine(line)?.move.id, move.id, `${move.id}: ${line}`);
  }
});

test("a block printed for a lesson file reads back as the same values, whatever the text", () => {
  const texts = ["one line", "two\nlines", "  indented first\nthen not", "calc a ≤ b := h1\n  _ ≤ c := <gap>", "ends in a colon:\n  - and a dash", "|x| ≤ 1", "007", "true"];
  for (const text of texts) {
    const widget = parseYaml(widgetBlock("proof-state", { state: text, caption: text.split("\n")[0] }).split("\n").slice(1, -1).join("\n")) as Record<string, string>;
    assert.equal(widget.state.replace(/\n$/, ""), text, JSON.stringify(text));
    const exercise = (parseYaml(exerciseBlock("fill", "007", text.split("\n")[0]!, { says: text.split("\n")[0], statement: ": True", proof: text, solution: "trivial" })) as Record<string, string>[])[0]!;
    assert.equal(exercise.id, "007");
    assert.equal(exercise.title, text.split("\n")[0]);
    assert.equal(exercise.proof.replace(/\n$/, ""), text, JSON.stringify(text));
  }
});
