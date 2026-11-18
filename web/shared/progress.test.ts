import assert from "node:assert/strict";
import { test } from "node:test";
import { MOVES, lineShape } from "./moves.ts";
import { loadContent } from "../server/loader.ts";
import { solvedOf, lessonMastered, lessonMastery, masteryFor, masteryFrom, masteryOf, MIN_ATTEMPTS, RECENT_WINDOW, tacticsIn, tacticsOf, type AttemptLike } from "./progress.ts";

const content = {
  levels: [
    { id: 0, title: "", summary: "", status: "written" as const, topics: [], moves: ["exact", "rfl"] },
    { id: 1, title: "", summary: "", status: "written" as const, topics: [], moves: ["intro", "exact", "exact?"] },
  ],
  lessons: [
    { id: "l", exercises: [{ id: "a", concept: "implication", mode: "board" }, { id: "b", concept: "and", mode: "board" }, { id: "t", concept: "and", mode: "typed" }] },
  ],
} as unknown as Parameters<typeof masteryFrom>[0];

let clock = 0;
const row = (exerciseId: string, body: string, solved: boolean, extra: Partial<AttemptLike> = {}): AttemptLike => ({
  lessonId: "l",
  exerciseId,
  body,
  solved,
  createdAt: new Date(Date.UTC(2026, 0, 1) + 1000 * ++clock),
  ...extra,
});

test("newer answers weigh more, and nothing tried is 0", () => {
  assert.equal(masteryOf([]), 0);
  assert.equal(masteryOf([true]), 1);
  assert.equal(masteryOf([false, true]), 2 / 3);
  assert.equal(masteryOf([true, false]), 1 / 3);
});

test("the moves are the levels', in order, each once", () => {
  assert.deepEqual(tacticsOf(content), ["exact", "rfl", "intro", "exact?"]);
});

test("a move is found as a word, not inside another word, a comment or a string", () => {
  const all = ["exact", "exact?", "rfl", "intro", "rw"];
  assert.deepEqual(tacticsIn("intro h\nexact h", all), ["exact", "intro"]);
  assert.deepEqual(tacticsIn("exact?", all), ["exact?"]);
  assert.deepEqual(tacticsIn("exact h -- rfl would do", all), ["exact"]);
  assert.deepEqual(tacticsIn('exact (f "intro")', all), ["exact"]);
  assert.deepEqual(tacticsIn("exact Nat.rw_foo h", all), ["exact"]);
  assert.deepEqual(tacticsIn("· exact h", all), ["exact"]);
  assert.deepEqual(tacticsIn("exact h.rw", all), ["exact"], "a dot stops a word");
  assert.deepEqual(tacticsIn("induction' n with n ih", ["induction"]), ["induction"], "the primed form is the same move");
});

test("every move the board writes is credited to the curriculum move it is", () => {
  const curriculum = tacticsOf(loadContent());
  for (const move of Object.values(MOVES)) {
    const id = move.id === "rw_back" ? "rw" : move.id;
    if (!curriculum.includes(id)) continue;
    assert.ok(tacticsIn(lineShape(move).split(" (")[0], curriculum).includes(id), `${move.id}: ${lineShape(move)}`);
  }
});

test("each check is an answer for its concept; a solve credits every move it used", () => {
  const m = masteryFrom(content, [row("a", "intro h", false), row("a", "intro h\nexact h", true)]);
  assert.equal(m.concepts.implication.attempts, 2);
  assert.equal(m.concepts.implication.correct, 1);
  assert.equal(m.concepts.implication.mastery, 2 / 3);
  assert.deepEqual(m.tactics.exact.recent, [true]);
  // A board refusal blames its last line: intro, which then worked.
  assert.deepEqual(m.tactics.intro.recent, [false, true]);
  assert.equal(m.concepts.and, undefined);
});

test("a refused board move counts against the move on its last line only", () => {
  const m = masteryFrom(content, [row("a", "intro h\nrfl\n", false)]);
  assert.deepEqual(m.tactics.rfl.recent, [false]);
  assert.equal(m.tactics.intro, undefined);
});

test("a refused typed proof counts against its concept only", () => {
  const m = masteryFrom(content, [row("t", "intro h\nexact h", false)]);
  assert.deepEqual(m.concepts.and.recent, [false]);
  assert.deepEqual(m.tactics, {});
});

test("a check that repeats the one before it is not a new answer", () => {
  const m = masteryFrom(content, [row("t", "exact h", true), row("t", "exact h", true), row("t", "exact h", true), row("a", "exact h", true), row("t", "exact h", true)]);
  assert.equal(m.concepts.and.attempts, 1);
  assert.equal(m.tactics.exact.attempts, 2);
  const changed = masteryFrom(content, [row("t", "exact h", false), row("t", "exact h", true)]);
  assert.equal(changed.concepts.and.attempts, 2);
});

test("a refused board line inside a string is not a move", () => {
  const m = masteryFrom(content, [row("a", 'exact (f "x\nrfl")', false)]);
  assert.equal(m.tactics.rfl, undefined);
});

test("mastered needs 80%: a high share just under it is not", () => {
  // Weights 1..5: wrong first, then four right gives 14/15; wrong last of five gives 10/15.
  assert.equal(masteryFrom(content, [row("b", "x1", false), ...[2, 3, 4, 5].map((i) => row("b", `x${i}`, true))]).concepts.and.mastered, true);
  const low = masteryFrom(content, [...[1, 2, 3, 4].map((i) => row("b", `x${i}`, true)), row("b", "x5", false)]).concepts.and;
  assert.equal(low.mastery, 10 / 15);
  assert.equal(low.mastered, false);
});

test("a concept named __proto__ is never recorded", () => {
  const proto = { ...content, lessons: [{ id: "l", exercises: [{ id: "a", concept: "__proto__", mode: "board" }] }] } as unknown as typeof content;
  const m = masteryFrom(proto, [row("a", "exact h", true)]);
  assert.equal(Object.keys(m.concepts).length, 0);
  assert.equal(Object.getPrototypeOf(m.concepts), Object.prototype);
});

test("mastered needs enough answers as well as a high share", () => {
  const rows = Array.from({ length: MIN_ATTEMPTS - 1 }, (_, i) => row("b", `exact h${i}`, true));
  assert.equal(masteryFrom(content, rows).concepts.and.mastered, false);
  assert.equal(masteryFrom(content, [...rows, row("b", "exact h", true)]).concepts.and.mastered, true);
});

test("only the last answers count, and rows are taken in time order", () => {
  const wrong = Array.from({ length: 20 }, (_, i) => row("b", `w${i}`, false));
  const right = Array.from({ length: RECENT_WINDOW }, (_, i) => row("b", `r${i}`, true));
  // Handed in newest first: unsorted, the wrong answers would be the last ones.
  const m = masteryFrom(content, [...wrong, ...right].reverse());
  assert.equal(m.concepts.and.mastery, 1);
  assert.equal(m.concepts.and.attempts, 32);
  assert.equal(m.concepts.and.recent.length, RECENT_WINDOW);
});

test("an assisted solve is seen but is not an answer", () => {
  const m = masteryFrom(content, [row("b", "exact h", true, { assisted: true })]);
  assert.equal(m.concepts.and.attempts, 1);
  assert.equal(m.concepts.and.correct, 0);
  assert.deepEqual(m.concepts.and.recent, []);
  assert.equal(m.concepts.and.mastery, 0);
});

test("a move or concept named like a built-in finds nothing until it is used", () => {
  const withCtor = { ...content, levels: [{ ...content.levels[0], moves: ["constructor"] }] } as typeof content;
  const empty = masteryFrom(withCtor, []);
  assert.equal(masteryFor(empty.tactics, "constructor"), undefined);
  assert.equal(masteryFor(JSON.parse(JSON.stringify(empty)).concepts, "toString"), undefined);
  const used = masteryFrom(withCtor, [row("b", "constructor", true)]);
  assert.equal(masteryFor(used.tactics, "constructor")?.attempts, 1);
});

test("rows for an exercise the content no longer has are skipped", () => {
  const m = masteryFrom(content, [{ ...row("gone", "exact h", true) }, { ...row("a", "exact h", true), lessonId: "other" }]);
  assert.deepEqual(m, { concepts: {}, tactics: {} });
});

test("a solved record is read by own property only", () => {
  const solved: Record<string, Record<string, { solution: string }>> = JSON.parse('{"l":{"a":{"solution":"exact h"}}}');
  assert.equal(solvedOf(solved, "l", "a")?.solution, "exact h");
  assert.equal(solvedOf(solved, "constructor", "a"), undefined);
  assert.equal(solvedOf(solved, "l", "toString"), undefined);
});

test("a lesson's mastery is the mean over its concepts, untried ones as 0", () => {
  const lesson = content.lessons[0];
  assert.equal(lessonMastery(lesson, { concepts: {}, tactics: {} }), null);
  const m = masteryFrom(content, [row("a", "exact h", true)]);
  assert.equal(lessonMastery(lesson, m), 0.5);
  assert.equal(lessonMastered(lesson, m), false);
  const all = masteryFrom(content, ["a", "b"].flatMap((e) => [1, 2, 3, 4].map((i) => row(e, `x${i}`, true))));
  assert.equal(lessonMastered(lesson, all), true);
});
