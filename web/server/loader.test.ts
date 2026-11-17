import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { loadContent } from "./loader.ts";

// Fixtures are written to a temp dir; only the first test reads the real
// content/, and it only reads.

const CURRICULUM = `
tracks:
  - { id: logic, title: Logic, summary: s }
levels:
  - { id: 1, title: One, summary: s }
  - { id: 2, title: Two, summary: s, status: outline, topics: [a, b] }
`;

const LESSON = `---
id: logic-1-a
title: A
track: logic
level: 1
order: 1
concepts: [implication]
summary: s
exercises:
  - id: first
    title: First
    mode: board
    says: If P then P.
    statement: "(P : Prop) : P → P"
    moves: [intro, exact]
    solution: |
      intro hP
      exact hP
  - id: second
    title: Second
    mode: typed
    says: P gives P.
    statement: "(P : Prop) (hP : P) : P"
    forbid: [tauto]
    solution: exact hP
---

Opening prose.

\`\`\`exercise
id: second
\`\`\`

Closing prose.
`;

function fixture(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lii-content-"));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}

test("the real content/ loads with no problems, and every level is there", () => {
  const content = loadContent(path.resolve(import.meta.dirname, "../../content"));
  assert.deepEqual(content.problems, []);
  assert.deepEqual(content.levels.map((l) => l.id), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(content.tracks.map((t) => t.id), ["logic", "math", "lean", "programs"]);
  assert.ok(content.lessons.length >= 1);
  for (const lesson of content.lessons) assert.ok(lesson.exercises.length > 0, `${lesson.id} has exercises`);
});

test("a lesson's exercises are placed where the file puts them, the rest after", () => {
  const content = loadContent(fixture({ "curriculum.yaml": CURRICULUM, "lessons/logic/a.md": LESSON }));
  assert.deepEqual(content.problems, []);
  const [lesson] = content.lessons;
  assert.deepEqual(lesson.blocks, [
    { type: "prose", markdown: "Opening prose." },
    { type: "exercise", id: "second" },
    { type: "prose", markdown: "Closing prose." },
    { type: "exercise", id: "first" },
  ]);
  assert.equal(lesson.exercises[0].solution, "intro hP\nexact hP");
  assert.equal(lesson.exercises[0].concept, "implication");
  assert.deepEqual(lesson.exercises[1].forbid, ["tauto"]);
  assert.equal(content.levels[1].status, "outline");
});

test("a widget block becomes a block with its checked parameters, in its place", () => {
  const withWidgets = LESSON.replace(
    "Closing prose.",
    "```widget\ntype: proof-state\nstate: |\n  P : Prop\n  hP : P\n  ⊢ P\ncaption: Where the proof starts.\n```\n\nBetween.\n\n```widget\ntype: move-list\nmoves: [intro, exact]\n```",
  );
  const content = loadContent(fixture({ "curriculum.yaml": CURRICULUM, "lessons/logic/a.md": withWidgets }));
  assert.deepEqual(content.problems, []);
  assert.deepEqual(content.lessons[0].blocks, [
    { type: "prose", markdown: "Opening prose." },
    { type: "exercise", id: "second" },
    { type: "widget", widget: "proof-state", params: { state: "P : Prop\nhP : P\n⊢ P\n", caption: "Where the proof starts." } },
    { type: "prose", markdown: "Between." },
    { type: "widget", widget: "move-list", params: { moves: ["intro", "exact"] } },
    { type: "exercise", id: "first" },
  ]);
});

const broken: [string, (lesson: string) => string, RegExp][] = [
  ["an unknown track", (l) => l.replace("track: logic", "track: music"), /track "music" is not in curriculum/],
  ["an unknown level", (l) => l.replace("level: 1", "level: 9"), /level 9 is not in curriculum/],
  ["an unknown move", (l) => l.replace("moves: [intro, exact]", "moves: [intro, teleport]"), /move "teleport"/],
  ["a board exercise with no moves", (l) => l.replace("    moves: [intro, exact]\n", ""), /needs `moves`/],
  ["no reference solution", (l) => l.replace("    solution: exact hP\n", ""), /exercise "second": needs `solution`/],
  ["an exercise field that does not exist", (l) => l.replace("    forbid: [tauto]\n", "    forbids: [tauto]\n"), /exercise "second": has no parameter `forbids`/],
  ["an unknown exercise kind", (l) => l.replace("    mode: typed\n", "    mode: typed\n    kind: guess\n"), /kind "guess" is not known/],
  ["an unknown widget", (l) => l.replace("Closing prose.", "```widget\ntype: hologram\n```"), /widget block 1 \(hologram\): there is no widget called "hologram".*proof-state/],
  ["a widget block with no type", (l) => l.replace("Closing prose.", "```widget\nstate: x\n```"), /widget block 1 \(no type\): needs `type`/],
  ["a widget missing what it needs", (l) => l.replace("Closing prose.", "```widget\ntype: proof-state\ncaption: A state.\n```"), /widget block 1 \(proof-state\): needs `state`/],
  ["a widget parameter of the wrong kind", (l) => l.replace("Closing prose.", "```widget\ntype: move-list\nmoves: [intro, teleport]\n```"), /widget block 1 \(move-list\): `moves`: move "teleport"/],
  ["a widget parameter that does not exist", (l) => l.replace("Closing prose.", "```widget\ntype: move-list\nmoves: [intro]\ncolour: red\n```"), /widget block 1 \(move-list\): has no parameter `colour`/],
  ["a proof state with no goal", (l) => l.replace("Closing prose.", "```widget\ntype: proof-state\nstate: |\n  hP : P\n```"), /widget block 1 \(proof-state\): `state` has no line starting with ⊢/],
  ["a second widget that is wrong", (l) => l.replace("Closing prose.", "```widget\ntype: move-list\nmoves: [intro]\n```\n\n```widget\ntype: move-list\n```"), /widget block 2 \(move-list\): needs `moves`/],
  ["a widget block that is not YAML", (l) => l.replace("Closing prose.", "```widget\ntype: [unclosed\n```"), /widget block 1: is not valid YAML/],
  ["a statement that smuggles in a proof", (l) => l.replace('"(P : Prop) (hP : P) : P"', '"(P : Prop) : P := sorry"'), /must not contain := or sorry/],
  ["a duplicate exercise id", (l) => l.replace("id: second\n    title", "id: first\n    title"), /used twice|not in the frontmatter/],
  ["a block naming no exercise", (l) => l.replace("```exercise\nid: second", "```exercise\nid: nope"), /names "nope"/],
  ["no frontmatter", () => "Just prose.\n", /no frontmatter/],
];

for (const [name, mutate, expected] of broken) {
  test(`a lesson with ${name} is refused with a reason, not served`, () => {
    const mutated = mutate(LESSON);
    assert.notEqual(mutated, LESSON, "the mutation changed the file");
    const content = loadContent(fixture({ "curriculum.yaml": CURRICULUM, "lessons/logic/a.md": mutated }));
    assert.deepEqual(content.lessons, []);
    assert.ok(content.problems.some((p) => p.file === "lessons/logic/a.md" && expected.test(p.message)), JSON.stringify(content.problems));
  });
}

test("a lesson filed under the wrong track folder, and a reused lesson id, are refused", () => {
  const content = loadContent(
    fixture({
      "curriculum.yaml": CURRICULUM.replace("  - { id: logic, title: Logic, summary: s }", "  - { id: logic, title: Logic, summary: s }\n  - { id: math, title: Math, summary: s }"),
      "lessons/logic/a.md": LESSON,
      "lessons/logic/b.md": LESSON,
      "lessons/math/c.md": LESSON.replace("id: logic-1-a", "id: other"),
    }),
  );
  assert.deepEqual(content.lessons.map((l) => l.file), ["lessons/logic/a.md"]);
  assert.ok(content.problems.some((p) => /already used/.test(p.message)));
  assert.ok(content.problems.some((p) => /says track: logic/.test(p.message)));
});

test("a missing curriculum.yaml is a problem, not a crash", () => {
  const content = loadContent(fixture({}));
  assert.equal(content.lessons.length, 0);
  assert.match(content.problems[0].message, /cannot be read/);
});
