import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { MOVES } from "../shared/moves.ts";
import { reference, kindOf } from "../shared/reference.ts";
import { checkParams, exerciseBlock, EXERCISE_KEYS, EXERCISES, WIDGETS, type ExerciseKind } from "../shared/registry.ts";
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
  for (const id of Object.keys(MOVES)) assert.ok(text.includes(`| \`${id}\` | `), `move ${id}`);
  assert.equal(kindOf("enum:board|typed"), "one of `board`, `typed`");
  // A table cell never breaks its row.
  for (const line of text.split("\n").filter((l) => l.startsWith("| `"))) assert.equal(line.replaceAll("\\|", "").split("|").length, 5, line);
});

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
        const got = (exercise as unknown as Record<string, unknown>)[key];
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
