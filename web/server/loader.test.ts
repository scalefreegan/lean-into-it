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
  assert.ok((content.gallery ?? []).length >= 5, "the Famous Proofs gallery");
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

test("an exercise's rung on the ladder: its own, or its level's within what it can be; a board rung on a typed exercise is refused", () => {
  const curriculum = CURRICULUM.replace("{ id: 1, title: One, summary: s }", "{ id: 1, title: One, summary: s, ladder: 3 }");
  const lesson = LESSON.replace("    mode: board\n", "").replace("    mode: typed\n", "    mode: typed\n    ladder: 4\n");
  const content = loadContent(fixture({ "curriculum.yaml": curriculum, "lessons/logic/a.md": lesson }));
  assert.deepEqual(content.problems, []);
  assert.equal(content.levels[0].ladder, 3);
  // \`first\` can be done on the board (no mode, moves given): the level types it, with its moves to hand.
  assert.deepEqual(content.lessons[0].exercises.map((e) => [e.id, e.mode, e.ladder]), [["first", "board", 3], ["second", "typed", 4]]);
  // With no ladder the level is 1, and a typed exercise still types: 3.
  const plain = loadContent(fixture({ "curriculum.yaml": CURRICULUM, "lessons/logic/a.md": LESSON }));
  assert.deepEqual(plain.lessons[0].exercises.map((e) => e.ladder), [1, 3]);
  const bad = loadContent(fixture({ "curriculum.yaml": CURRICULUM.replace("{ id: 1, title: One, summary: s }", "{ id: 1, title: One, summary: s, ladder: 7 }"), "lessons/logic/a.md": LESSON.replace("    mode: typed\n", "    mode: typed\n    ladder: 2\n") }));
  assert.deepEqual(bad.problems.map((p) => p.message), [
    "level 1: `ladder` must be 1, 2, 3 or 4",
    'exercise "second": `ladder: 2` is the board, and the exercise is `mode: typed` (make it a board exercise, with `moves`, or use 3 or 4)',
    'an exercise block names "second", which is not in the frontmatter\'s exercises',
  ]);
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

test("the Famous Proofs gallery: entries read in order; a bad one is refused with its reason, the rest kept", () => {
  const entry = (id: string, extra = "") => `
  - id: ${id}
    title: T
    says: S
    who: W
    why: Y
    level: 1
    statement: "(P : Prop) (hP : P) : P"
    solution: |
      exact hP
    steps: ["1: P is given."]${extra}`;
  const good = loadContent(fixture({ "curriculum.yaml": CURRICULUM, "gallery.yaml": `entries:${entry("one")}${entry("two", "\n    mathlib: Nat.exists_infinite_primes")}` }));
  assert.deepEqual(good.problems, []);
  assert.deepEqual(good.gallery?.map((e) => [e.id, e.solution, e.mathlib ?? null]), [["one", "exact hP", null], ["two", "exact hP", "Nat.exists_infinite_primes"]]);
  const bad = loadContent(fixture({ "curriculum.yaml": CURRICULUM, "gallery.yaml": `entries:${entry("one", "\n    colour: red")}${entry("two").replace("level: 1", "level: 9").replace("1: P", "2: P")}${entry("three")}` }));
  assert.deepEqual(bad.gallery?.map((e) => e.id), ["three"]);
  assert.deepEqual(
    bad.problems.map((p) => `${p.file}: ${p.message}`),
    [
      "gallery.yaml: entry \"one\": `colour` is not a field of an entry (id, title, says, who, why, level, statement, solution, steps, formal, mathlib)",
      "gallery.yaml: entry \"two\": `level` must be one of the curriculum's levels (1, 2)",
      "gallery.yaml: entry \"two\": `steps`: “P is given.” names line 2, but the solution has 1 line",
    ],
  );
  // No gallery.yaml: no gallery, and nothing wrong.
  assert.equal(loadContent(fixture({ "curriculum.yaml": CURRICULUM })).gallery, undefined);
});

const PLAN = `
    concepts:
      - { id: later-idea, title: A later idea, needs: [implication] }
      - { id: last-idea, title: The last idea, needs: [later-idea] }
    planned:
      - { id: logic-2-later, track: logic, title: Later, summary: The later lesson., concepts: [later-idea], widgets: [truth-table, venn] }
    new_widgets:
      - { id: venn, does: Overlapping circles. }`;
const planned = (plan: string) => CURRICULUM.replace("  - { id: 2, title: Two, summary: s, status: outline, topics: [a, b] }", `  - id: 2\n    title: Two\n    status: outline${plan}`);

test("a level's plan: concepts with what they build on, lessons to write, widgets still to build", () => {
  const content = loadContent(fixture({ "curriculum.yaml": planned(PLAN), "lessons/logic/a.md": LESSON }));
  assert.deepEqual(content.problems, []);
  const two = content.levels.find((l) => l.id === 2)!;
  assert.deepEqual(two.concepts, [
    { id: "later-idea", title: "A later idea", needs: ["implication"] },
    { id: "last-idea", title: "The last idea", needs: ["later-idea"] },
  ]);
  assert.deepEqual(two.planned, [{ id: "logic-2-later", title: "Later", track: "logic", summary: "The later lesson.", concepts: ["later-idea"], widgets: ["truth-table", "venn"] }]);
  assert.deepEqual(two.newWidgets, [{ id: "venn", does: "Overlapping circles." }]);
  // A level without a plan has empty ones.
  assert.deepEqual([content.levels[0].concepts, content.levels[0].planned, content.levels[0].newWidgets], [[], [], []]);
});

const PLAN_REFUSALS: [string, (plan: string) => string, RegExp][] = [
  ["a need nobody declares or teaches", (p) => p.replace("needs: [implication]", "needs: [telepathy]"), /the concept later-idea needs telepathy, which no level declares and no lesson teaches/],
  ["a concept declared twice", (p) => p.replace("id: last-idea", "id: later-idea"), /the concept later-idea is declared twice/],
  ["concepts in a circle", (p) => p.replace("needs: [implication]", "needs: [last-idea]"), /rest on each other in a circle: later-idea → last-idea → later-idea/],
  ["an unknown track", (p) => p.replace("track: logic", "track: music"), /has track "music", which is not in curriculum.yaml/],
  ["an unknown concept taught", (p) => p.replace("concepts: [later-idea]", "concepts: [nothing]"), /teaches nothing, which no level declares/],
  ["a widget nobody plans", (p) => p.replace("widgets: [truth-table, venn]", "widgets: [hologram]"), /uses the widget hologram, which is neither registered nor under any level's `new_widgets`/],
  ["a new widget that exists", (p) => p.replace("id: venn, does", "id: truth-table, does"), /truth-table is a widget already/],
  ["a planned lesson without a track", (p) => p.replace("track: logic, ", ""), /a planned lesson needs an id \(lowercase, hyphens\), a title and a track/],
  ["a concept without a title", (p) => p.replace("title: A later idea, ", ""), /a concept needs an id \(lowercase, hyphens\) and a title/],
  ["a plan that is not a list", () => "\n    planned: soon", /level 2: `planned` must be a list/],
  ["a field a plan does not have", (p) => p.replace("needs: [implication]", "need: [implication]"), /`need` is not a field of an entry of `concepts` \(id, title, needs\)/],
  ["needs that are not a list", (p) => p.replace("needs: [implication]", "needs: implication"), /`needs` must be a list of names/],
  ["a planned lesson written somewhere else", (p) => p.replace("id: logic-2-later", "id: logic-1-a"), /the planned lesson logic-1-a was written as level 1, track logic \(lessons\/logic\/a.md\); move the plan or the lesson/],
];

for (const [what, mutate, reason] of PLAN_REFUSALS) {
  test(`a plan with ${what} is a problem`, () => {
    const content = loadContent(fixture({ "curriculum.yaml": planned(mutate(PLAN)), "lessons/logic/a.md": LESSON }));
    assert.ok(
      content.problems.some((p) => p.file === "curriculum.yaml" && reason.test(p.message)),
      JSON.stringify(content.problems),
    );
  });
}

// Level 1 with two tracks, logic declared first, and a plan naming lessons in the order given.
const twoTracks = (...plan: [string, string][]) =>
  CURRICULUM.replace("  - { id: logic, title: Logic, summary: s }", "  - { id: logic, title: Logic, summary: s }\n  - { id: math, title: Math, summary: s }").replace(
    "  - { id: 1, title: One, summary: s }",
    `  - id: 1\n    title: One\n    summary: s\n    planned:\n${plan.map(([id, track]) => `      - { id: ${id}, track: ${track}, title: T, summary: s }\n`).join("")}`,
  );
const lessonAs = (id: string, track: string, order: number) => LESSON.replace("id: logic-1-a", `id: ${id}`).replace("track: logic", `track: ${track}`).replace("order: 1", `order: ${order}`);

test("the loader orders a level's lessons by its plan, across tracks, and places one the plan does not list by its track's orders", () => {
  const content = loadContent(
    fixture({
      "curriculum.yaml": twoTracks(["math-1-first", "math"], ["logic-1-then", "logic"], ["math-1-last", "math"]),
      "lessons/logic/then.md": lessonAs("logic-1-then", "logic", 1),
      "lessons/math/first.md": lessonAs("math-1-first", "math", 1),
      "lessons/math/last.md": lessonAs("math-1-last", "math", 2),
      "lessons/math/craft.md": lessonAs("math-1-craft", "math", 1.5),
    }),
  );
  assert.deepEqual(content.problems, []);
  // Without the plan this would be logic first: logic-1-then, math-1-first, math-1-craft, math-1-last.
  assert.deepEqual(content.lessons.map((l) => l.id), ["math-1-first", "math-1-craft", "logic-1-then", "math-1-last"]);
});

test("a track's planned lessons whose orders do not rise in plan order are a problem", () => {
  const content = loadContent(
    fixture({
      "curriculum.yaml": twoTracks(["math-1-first", "math"], ["logic-1-then", "logic"], ["math-1-last", "math"]),
      "lessons/logic/then.md": lessonAs("logic-1-then", "logic", 1),
      "lessons/math/first.md": lessonAs("math-1-first", "math", 1),
      "lessons/math/last.md": lessonAs("math-1-last", "math", 1),
    }),
  );
  assert.deepEqual(
    content.problems.map((p) => [p.file, p.message]),
    [["curriculum.yaml", "level 1: the planned lesson math-1-last comes after math-1-first in the plan, in the same track, so its `order` (1) must be above math-1-first's (1): change the `order` in lessons/math/last.md or lessons/math/first.md, or the plan; a lesson the plan does not list is placed by these orders"]],
  );
});

test("the order check passes over a planned lesson not yet written, or written in another level, and a non-finite order counts as 0", () => {
  const curriculum = twoTracks(["math-1-first", "math"], ["math-1-unwritten", "math"], ["math-1-elsewhere", "math"], ["math-1-last", "math"]);
  const content = loadContent(
    fixture({
      "curriculum.yaml": curriculum,
      "lessons/math/first.md": lessonAs("math-1-first", "math", 1),
      "lessons/math/elsewhere.md": lessonAs("math-1-elsewhere", "math", 0).replace("level: 1", "level: 2"),
      "lessons/math/last.md": lessonAs("math-1-last", "math", 2),
      "lessons/math/nan.md": lessonAs("math-1-nan", "math", 1).replace("order: 1", "order: .nan"),
    }),
  );
  assert.deepEqual(content.problems.map((p) => p.message).filter((m) => /order/.test(m)), []);
  assert.ok(content.problems.some((p) => /math-1-elsewhere was written as level 2/.test(p.message)), JSON.stringify(content.problems));
  assert.equal(content.lessons.find((l) => l.id === "math-1-nan")!.order, 0);
});

test("docs/PRD.md's Curriculum section and curriculum.yaml agree on each outlined level: its title, and the moves it introduces", () => {
  const content = loadContent(path.resolve(import.meta.dirname, "../../content"));
  const prd = fs.readFileSync(path.resolve(import.meta.dirname, "../../docs/PRD.md"), "utf8");
  const section = prd.slice(prd.indexOf("\n## Curriculum\n"), prd.indexOf("\n## ", prd.indexOf("\n## Curriculum\n") + 1));
  for (const level of content.levels.filter((l) => l.status === "outline")) {
    const at = section.indexOf(`- **Level ${level.id} — `);
    assert.ok(at >= 0, `the PRD has no entry for level ${level.id}`);
    const end = section.indexOf("\n- **", at + 1);
    const entry = section.slice(at, end < 0 ? undefined : end);
    assert.ok(entry.startsWith(`- **Level ${level.id} — ${level.title}.**`), `level ${level.id}: the PRD calls it ${entry.slice(0, 80)}`);
    assert.ok(entry.includes("Moves:"), `level ${level.id}: the PRD lists no moves`);
    const moves = [...entry.slice(entry.indexOf("Moves:")).matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    assert.deepEqual(moves, level.moves, `level ${level.id}: the moves after "Moves:" in the PRD`);
  }
});

test("a concept that needs a later one, or is taught before the level declaring it, is a problem; coming back to one later is not", () => {
  const later = CURRICULUM.replace("  - { id: 1, title: One, summary: s }", "  - id: 1\n    title: One\n    concepts: [{ id: early, title: Early, needs: [later-idea] }]").replace("  - { id: 2, title: Two, summary: s, status: outline, topics: [a, b] }", `  - id: 2\n    title: Two\n    status: outline${PLAN}`);
  const a = loadContent(fixture({ "curriculum.yaml": later, "lessons/logic/a.md": LESSON }));
  assert.ok(a.problems.some((p) => /level 1: the concept early needs later-idea, which comes later, in level 2/.test(p.message)), JSON.stringify(a.problems));
  const elsewhere = loadContent(fixture({ "curriculum.yaml": planned(PLAN), "lessons/logic/a.md": LESSON.replace("concepts: [implication]", "concepts: [implication, later-idea]") }));
  assert.ok(elsewhere.problems.some((p) => /level 2: the concept later-idea is declared here but taught earlier, by the lesson logic-1-a, at level 1/.test(p.message)), JSON.stringify(elsewhere.problems));
  // A later level coming back to a declared concept is fine.
  const back = CURRICULUM.replace("  - { id: 1, title: One, summary: s }", "  - id: 1\n    title: One\n    concepts: [{ id: early, title: Early, needs: [implication] }]");
  assert.deepEqual(loadContent(fixture({ "curriculum.yaml": back, "lessons/logic/a.md": LESSON.replace("concepts: [implication]", "concepts: [implication, early]") })).problems, []);
  // A need on a concept only a later lesson teaches comes later too.
  const lessonLater = planned(PLAN.replace("needs: [implication]", "needs: [taught-later]"));
  const b = loadContent(fixture({ "curriculum.yaml": lessonLater.replace("{ id: 1, title: One, summary: s }", "{ id: 1, title: One, summary: s }\n  - { id: 3, title: Three, summary: s }"), "lessons/logic/a.md": LESSON.replace("level: 1", "level: 3").replace("concepts: [implication]", "concepts: [implication, taught-later]") }));
  assert.ok(b.problems.some((p) => /level 2: the concept later-idea needs taught-later, which comes later, in level 3/.test(p.message)), JSON.stringify(b.problems));
});

test("a written level's moves each need a sentence and a Lab example; an outline's need neither yet", () => {
  const withMoves = (status: string) => CURRICULUM.replace("  - { id: 2, title: Two, summary: s, status: outline, topics: [a, b] }", `  - { id: 2, title: Two, summary: s${status}, moves: [exact, ext] }`);
  assert.deepEqual(loadContent(fixture({ "curriculum.yaml": withMoves(", status: outline"), "lessons/logic/a.md": LESSON })).problems, []);
  const written = loadContent(fixture({ "curriculum.yaml": withMoves(""), "lessons/logic/a.md": LESSON }));
  assert.deepEqual(written.problems.map((p) => p.message), ["level 2: the move ext has no sentence or no Lab example in web/shared/lab.ts, which a written level's moves need; until it has, keep the level `status: outline`"]);
});
