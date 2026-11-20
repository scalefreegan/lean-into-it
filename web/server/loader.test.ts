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

test("a proof-craft lesson is marked; others are not, and `craft` must be true or false", () => {
  const craft = LESSON.replace("order: 1", "order: 1.5\ncraft: true").replace("id: logic-1-a", "id: logic-1-craft");
  const content = loadContent(fixture({ "curriculum.yaml": CURRICULUM, "lessons/logic/a.md": LESSON, "lessons/logic/b.md": craft }));
  assert.deepEqual(content.problems, []);
  assert.deepEqual(content.lessons.map((l) => [l.id, l.order, l.craft]), [["logic-1-a", 1, false], ["logic-1-craft", 1.5, true]]);
  const bad = loadContent(fixture({ "curriculum.yaml": CURRICULUM, "lessons/logic/a.md": LESSON.replace("order: 1", 'order: 1\ncraft: "yes"') }));
  assert.deepEqual(bad.problems.map((p) => p.message), ["`craft` must be true or false"]);
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

test("a longer fence quotes a block without it being acted on; line endings and the end of the file do not matter", () => {
  const quoted = LESSON.replace("Closing prose.", "How a widget is written:\n\n````\n```widget\ntype: hologram\n```\n````\n\n```lean\nexample : True := trivial\n```\n\nClosing prose.");
  const content = loadContent(fixture({ "curriculum.yaml": CURRICULUM, "lessons/logic/a.md": quoted }));
  assert.deepEqual(content.problems, []);
  assert.deepEqual(content.lessons[0].blocks.map((b) => b.type), ["prose", "exercise", "prose", "exercise"]);
  const prose = content.lessons[0].blocks[2];
  assert.ok(prose.type === "prose" && prose.markdown.includes("````\n```widget\ntype: hologram\n```\n````") && prose.markdown.includes("```lean\nexample : True := trivial\n```"));

  // A widget as the very last thing, with no newline after it, in a CRLF file.
  const last = LESSON.replace("Closing prose.\n", "```widget\ntype: move-list\nmoves: [intro]\n```").replace(/\n/g, "\r\n");
  const crlf = loadContent(fixture({ "curriculum.yaml": CURRICULUM, "lessons/logic/a.md": last }));
  assert.deepEqual(crlf.problems, []);
  assert.deepEqual(crlf.lessons[0].blocks.at(-2), { type: "widget", widget: "move-list", params: { moves: ["intro"] } });
});

test("a lesson's own definitions go in front of each exercise's", () => {
  const withGiven = LESSON.replace("summary: s\n", "summary: s\ngiven: |\n  def two : Nat := 2\n").replace("    forbid: [tauto]\n", "    forbid: [tauto]\n    given: |\n      def three : Nat := 3\n");
  const content = loadContent(fixture({ "curriculum.yaml": CURRICULUM, "lessons/logic/a.md": withGiven }));
  assert.deepEqual(content.problems, []);
  assert.deepEqual(content.lessons[0].exercises.map((e) => e.given), ["def two : Nat := 2", "def two : Nat := 2\n\ndef three : Nat := 3"]);
});

const FILL = "  - id: gap\n    kind: fill\n    title: Gap\n    says: P gives P.\n    statement: \"(P : Prop) (hP : P) : P\"\n    proof: exact <gap>\n    options: [hP, P]\n    solution: hP\n";

test("a fill-the-gap exercise loads with its proof and its options, and is not a board exercise", () => {
  const content = loadContent(fixture({ "curriculum.yaml": CURRICULUM, "lessons/logic/a.md": LESSON.replace("---\n\nOpening", `${FILL}---\n\nOpening`) }));
  assert.deepEqual(content.problems, []);
  const gap = content.lessons[0].exercises.find((e) => e.id === "gap")!;
  assert.deepEqual([gap.kind, gap.mode, gap.proof, gap.options, gap.solution, gap.moves], ["fill", "typed", "exact <gap>", ["hP", "P"], "hP", []]);
  // Spaces around a fill mean nothing: the solution is still the option it names.
  const spaced = loadContent(fixture({ "curriculum.yaml": CURRICULUM, "lessons/logic/a.md": LESSON.replace("---\n\nOpening", `${FILL.replace("solution: hP", 'solution: " hP "')}---\n\nOpening`) }));
  assert.deepEqual(spaced.problems, []);
  assert.equal(spaced.lessons[0].exercises.find((e) => e.id === "gap")!.solution, "hP");
  const first = content.lessons[0].exercises[0];
  assert.deepEqual([first.kind, first.mode, first.proof, first.options], ["prove", "board", "", []]);
});

const PAIR = (exercise: string, steps: string) => `\`\`\`widget\ntype: informal-formal\nexercise: ${exercise}\nsteps: [${steps}]\n\`\`\``;

test("a paired proof loads when its exercise is the lesson's and its lines are in the solution", () => {
  const content = loadContent(fixture({ "curriculum.yaml": CURRICULUM, "lessons/logic/a.md": LESSON.replace("Closing prose.", PAIR("first", '"1: Suppose P.", "1-2: Then P, as supposed."')) }));
  assert.deepEqual(content.problems, []);
  assert.deepEqual(content.lessons[0].blocks.find((b) => b.type === "widget"), { type: "widget", widget: "informal-formal", params: { exercise: "first", steps: ["1: Suppose P.", "1-2: Then P, as supposed."] } });
});

test("the Gallery's paired proofs name real exercises, and lines their solutions have", async () => {
  const { WIDGETS } = await import("../shared/registry.ts");
  const { proofLines, readSteps } = await import("../shared/paired.ts");
  const content = loadContent();
  for (const ex of WIDGETS["informal-formal"].examples) {
    const exercise = content.lessons.find((l) => l.id === ex.lesson)?.exercises.find((e) => e.id === ex.exercise);
    assert.ok(exercise && exercise.kind === "prove", `${String(ex.lesson)}/${String(ex.exercise)}`);
    assert.deepEqual(readSteps(ex.steps, proofLines(exercise.solution).length).problems, []);
  }
});

const broken: [string, (lesson: string) => string, RegExp][] = [
  ["a fill-the-gap proof with no gap", (l) => l.replace("---\n\nOpening", `${FILL.replace("exact <gap>", "exact hP")}---\n\nOpening`), /exercise "gap": `proof` must contain <gap> exactly once/],
  ["options that leave the solution out", (l) => l.replace("---\n\nOpening", `${FILL.replace("[hP, P]", "[P, Q]")}---\n\nOpening`), /exercise "gap": `options` must include the `solution`/],
  ["a fill that would not stay in its gap", (l) => l.replace("---\n\nOpening", `${FILL.replace("solution: hP", 'solution: "hP -- x"').replace("[hP, P]", '[P, "hP -- x"]')}---\n\nOpening`), /exercise "gap": "hP -- x" cannot go in a gap/],
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
  ["a widget type that is not a name", (l) => l.replace("Closing prose.", "```widget\ntype: 5\n```"), /widget block 1 \(no type\): `type` must be a widget's name, not 5/],
  ["a required list with nothing in it", (l) => l.replace("Closing prose.", "```widget\ntype: move-list\nmoves: []\n```"), /widget block 1 \(move-list\): needs `moves`/],
  ["two goals run together in a proof state", (l) => l.replace("Closing prose.", "```widget\ntype: proof-state\nstate: |\n  P : Prop\n  ⊢ P\n  hQ : Q\n  ⊢ Q\n```"), /`state` has the line “hQ : Q” after the goal/],
  ["an empty widget block", (l) => l.replace("Closing prose.", "```widget\n```"), /widget block 1: must be a set of key: value lines/],
  ["a widget block that is never closed", (l) => l.replace("Closing prose.", "```widget\ntype: move-list\nmoves: [intro]\n"), /widget block 1 is opened with ```widget and never closed/],
  ["a capitalised widget fence", (l) => l.replace("Closing prose.", "```Widget\ntype: move-list\nmoves: [intro]\n```"), /“```Widget” looks like the start of a widget block/],
  ["a spaced widget fence", (l) => l.replace("Closing prose.", "``` widget\ntype: move-list\nmoves: [intro]\n```"), /looks like the start of a widget block/],
  ["an indented widget fence", (l) => l.replace("Closing prose.", "  ```widget\n  type: move-list\n  moves: [intro]\n  ```"), /looks like the start of a widget block/],
  ["a widget fence of tildes", (l) => l.replace("Closing prose.", "~~~widget\ntype: move-list\nmoves: [intro]\n~~~"), /looks like the start of a widget block/],
  ["an exercise fence written wrong", (l) => l.replace("```exercise\nid: second", "```Exercise\nid: second"), /looks like the start of an exercise block/],
  ["an axiom in the lesson's own definitions", (l) => l.replace("summary: s\n", "summary: s\ngiven: |\n  axiom cheat : False\n"), /the lesson's `given` must not contain sorry, admit or an axiom/],
  ["a sorry in the lesson's own definitions", (l) => l.replace("summary: s\n", "summary: s\ngiven: |\n  def f : Nat := sorry\n"), /the lesson's `given` must not contain/],
  ["an admit in an exercise's own definitions", (l) => l.replace("    forbid: [tauto]\n", "    forbid: [tauto]\n    given: |\n      theorem t : False := by admit\n"), /exercise "second": `given` must not contain sorry, admit or an axiom/],
  ["a widget block that is not YAML", (l) => l.replace("Closing prose.", "```widget\ntype: [unclosed\n```"), /widget block 1: is not valid YAML/],
  ["a statement that smuggles in a proof", (l) => l.replace('"(P : Prop) (hP : P) : P"', '"(P : Prop) : P := sorry"'), /must not contain := or sorry/],
  ["a duplicate exercise id", (l) => l.replace("id: second\n    title", "id: first\n    title"), /used twice|not in the frontmatter/],
  ["a block naming no exercise", (l) => l.replace("```exercise\nid: second", "```exercise\nid: nope"), /names "nope"/],
  ["no frontmatter", () => "Just prose.\n", /no frontmatter/],
  ["a pairing with an exercise not in the lesson", (l) => l.replace("Closing prose.", PAIR("nope", '"1: Suppose P."')), /widget block 1 \(informal-formal\): there is no exercise "nope"/],
  ["a pairing naming a line past the solution", (l) => l.replace("Closing prose.", PAIR("first", '"1: Suppose P.", "2-3: Then P."')), /names line 3, but the solution has 2 lines/],
  ["a pairing step with no line numbers", (l) => l.replace("Closing prose.", PAIR("first", '"Suppose P."')), /must be the line numbers, a colon, then the sentence/],
  ["a pairing that names another lesson", (l) => l.replace("Closing prose.", PAIR("first", '"1: Suppose P."') .replace("exercise: first", "exercise: first\nlesson: logic-1-a")), /`lesson` is for the Gallery and the Lab/],
  ["a pairing on an exercise that is not a proof", (l) => l.replace("    solution: exact hP\n", "    solution: exact hP\n" + FILL).replace("Closing prose.", PAIR("gap", '"1: P."')), /exercise "gap" is a fill; the Lean side must be a proof/],
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
