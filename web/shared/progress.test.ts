import assert from "node:assert/strict";
import { test } from "node:test";
import { MOVES, lineShape } from "./moves.ts";
import { loadContent } from "../server/loader.ts";
import { isDue, reviewSession, REVIEW_INTERVAL_DAYS, REVIEW_SIZE, startOfDay, solvedOf, lessonMastered, lessonMastery, masteryFor, masteryFrom, masteryOf, MIN_ATTEMPTS, RECENT_WINDOW, tacticsIn, tacticsOf, blankMastery, PLACEMENT_BOX, levelOpen, levelStatuses, UNLOCK_FRACTION, type AttemptLike, type MasteryMap } from "./progress.ts";

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
  // Wrong, right, wrong, right, right: 11/15, and never 80% on the way.
  const low = masteryFrom(content, [false, true, false, true, true].map((ok, i) => row("b", `x${i}`, ok))).concepts.and;
  assert.equal(low.mastery, 11 / 15);
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

// Local days: built with the local Date constructor, so these hold in any time zone.
const on = (day: number, hour = 10) => new Date(2026, 0, day, hour);
const at = (exerciseId: string, body: string, solved: boolean, when: Date, extra: Partial<AttemptLike> = {}): AttemptLike => ({ lessonId: "l", exerciseId, body, solved, createdAt: when, ...extra });
const learn = (day: number) => [1, 2, 3, 4].map((i) => at("b", `p${i}`, true, on(day, 9 + i)));

test("mastering a concept puts it in review, due the next calendar day", () => {
  const m = masteryFrom(content, learn(1)).concepts.and;
  assert.equal(m.box, 1);
  assert.equal(m.dueAt, startOfDay(on(2)).toISOString());
  assert.equal(isDue(m.dueAt, on(1, 23)), false, "not later the same day");
  assert.equal(isDue(m.dueAt, on(2, 0)), true, "from midnight, not 24 hours on");
});

test("each review passed lengthens the gap; a miss drops two boxes and is due tomorrow", () => {
  const rows = [...learn(1), at("b", "r1", true, on(2)), at("b", "r2", true, on(5)), at("b", "r3", true, on(12))];
  const up = masteryFrom(content, rows).concepts.and;
  assert.equal(up.box, 4);
  assert.equal(up.dueAt, startOfDay(on(12), 14).toISOString());
  const miss = masteryFrom(content, [...rows, at("b", "r4", false, on(26))]).concepts.and;
  assert.equal(miss.box, 2);
  assert.equal(miss.dueAt, startOfDay(on(27)).toISOString());
  assert.equal(miss.mastered, true, "in review it stays mastered");
});

test("answers before the review is due change the score only; assisted leaves it due", () => {
  const early = masteryFrom(content, [...learn(1), at("b", "e", false, on(1, 20))]).concepts.and;
  assert.equal(early.box, 1);
  assert.equal(early.dueAt, startOfDay(on(2)).toISOString());
  const helped = masteryFrom(content, [...learn(1), at("b", "h", true, on(3), { assisted: true })]).concepts.and;
  assert.equal(helped.box, 1);
  assert.equal(isDue(helped.dueAt, on(3, 12)), true);
});

test("the same proof checked again counts again on a later day: that is a review", () => {
  const m = masteryFrom(content, [...learn(1), at("b", "p4", true, on(2))]).concepts.and;
  assert.equal(m.box, 2);
});

test("a review session offers each due concept's least recently checked exercise", () => {
  const two = { ...content, lessons: [{ id: "l", exercises: [{ id: "a", concept: "and", mode: "board" }, { id: "b", concept: "and", mode: "board" }, { id: "c", concept: "or", mode: "board" }] }] } as unknown as typeof content;
  const rows = [...learn(1), at("a", "q", true, on(1, 8))];
  const m = masteryFrom(two, rows);
  assert.deepEqual(reviewSession(two, m, rows, on(1, 22)), [], "nothing due yet");
  // b was checked last (on day 1 at 13:00), a at 8:00: a is offered.
  assert.deepEqual(reviewSession(two, m, rows, on(2)), [{ lessonId: "l", exerciseId: "a", concept: "and" }]);
});

test("a concept with no exercise is never due, and a session holds at most REVIEW_SIZE", () => {
  const map = { concepts: {} as Record<string, ReturnType<typeof masteryFrom>["concepts"][string]>, tactics: {} };
  const lessons: { id: string; exercises: { id: string; concept: string; mode: string }[] }[] = [{ id: "l", exercises: [] }];
  for (let i = 0; i < REVIEW_SIZE + 3; i++) {
    lessons[0].exercises.push({ id: `e${i}`, concept: `c${i}`, mode: "board" });
    map.concepts[`c${i}`] = { ...masteryFrom(content, learn(1)).concepts.and };
  }
  map.concepts.gone = { ...map.concepts.c0 };
  const session = reviewSession({ lessons } as unknown as typeof content, map, [], on(5));
  assert.equal(session.length, REVIEW_SIZE);
  assert.ok(!session.some((s) => s.concept === "gone"));
});

test("an early right answer leaves the box where it is; only the review moves it", () => {
  const early = masteryFrom(content, [...learn(1), at("b", "e", true, on(1, 20))]).concepts.and;
  assert.equal(early.box, 1);
  assert.equal(early.dueAt, startOfDay(on(2)).toISOString());
});

test("the box stops at the longest gap", () => {
  const rows = [...learn(1)];
  let day = 2;
  for (let i = 0; i < 9; i++) {
    rows.push(at("b", `r${i}`, true, on(day)));
    day += 130;
  }
  const m = masteryFrom(content, rows).concepts.and;
  assert.equal(m.box, REVIEW_INTERVAL_DAYS.length);
});

test("the concept due longest comes first in a session", () => {
  const two = { ...content, lessons: [{ id: "l", exercises: [{ id: "a", concept: "zeta", mode: "board" }, { id: "b", concept: "alpha", mode: "board" }] }] } as unknown as typeof content;
  // zeta learned on day 1 (due day 2), alpha on day 3 (due day 4).
  const rows = [...[1, 2, 3, 4].map((i) => at("a", `z${i}`, true, on(1, 9 + i))), ...[1, 2, 3, 4].map((i) => at("b", `a${i}`, true, on(3, 9 + i)))];
  const m = masteryFrom(two, rows);
  assert.deepEqual(reviewSession(two, m, rows, on(5)).map((s) => s.concept), ["zeta", "alpha"]);
});

test("an exercise solved with the Tutor's line comes back the next day, until it is solved unaided", () => {
  const rows = [at("a", "p", true, on(1), { assisted: true })];
  const m = masteryFrom(content, rows);
  assert.equal(m.concepts.implication.correct, 0, "assisted is not an answer");
  assert.deepEqual(reviewSession(content, m, rows, on(1, 22)), [], "not the same day");
  assert.deepEqual(reviewSession(content, m, rows, on(2)), [{ lessonId: "l", exerciseId: "a", concept: "implication" }]);
  const after = [...rows, at("a", "p", true, on(2))];
  assert.deepEqual(reviewSession(content, masteryFrom(content, after), after, on(3)), []);
});

test("an assisted check of a concept in review makes it due tomorrow, keeping its box", () => {
  // Mastered on day 1 (box 1, due day 2); passed on day 2 (box 2, due day 5).
  const rows = [...learn(1), at("b", "r", true, on(2))];
  const before = masteryFrom(content, rows).concepts.and;
  assert.equal(before.box, 2);
  const helped = masteryFrom(content, [...rows, at("t", "x", true, on(3), { assisted: true })]).concepts.and;
  assert.equal(helped.box, 2);
  assert.equal(helped.dueAt, startOfDay(on(4)).toISOString());
});

/* --------------------------------- levels --------------------------------- */

// Level 0 tests ten concepts; level 1 three; level 2 is written but tests
// nothing (a lesson without exercises); level 3 tests one; level 4 is an outline.
const lvl = (id: number, status: "written" | "outline" = "written") => ({ id, title: "", summary: "", status, topics: [], moves: [] });
const tens = Array.from({ length: 10 }, (_, i) => `c${i}`);
const ladder = {
  levels: [lvl(0), lvl(1), lvl(2), lvl(3), lvl(4, "outline")],
  lessons: [
    { id: "zero", level: 0, exercises: tens.map((c) => ({ id: c, concept: c })) },
    { id: "one", level: 1, exercises: ["d0", "d1", "d2"].map((c) => ({ id: c, concept: c })) },
    { id: "two", level: 2, exercises: [] },
    { id: "three", level: 3, exercises: [{ id: "e0", concept: "e0" }] },
  ],
} as unknown as Parameters<typeof levelStatuses>[0];
const knowing = (...ids: string[]): MasteryMap => ({ concepts: Object.fromEntries(ids.map((id) => [id, { ...blankMastery(), mastered: true }])), tactics: {} });
const states = (map: MasteryMap, opened: Parameters<typeof levelStatuses>[2] = [], rows: { lessonId: string }[] = [], solved = {}) =>
  levelStatuses(ladder, map, opened, rows, solved).map((s) => s.state);

test("a level opens when 70% of the concepts the level before it tests are mastered", () => {
  assert.equal(UNLOCK_FRACTION, 0.7);
  const six = knowing(...tens.slice(0, 6));
  assert.deepEqual(states(six), ["open", "locked", "locked", "locked", "locked"]);
  const s = levelStatuses(ladder, six, [], [], {})[1];
  assert.deepEqual([s.gate, s.gateMastered, s.gateTotal, s.need], [0, 6, 10, 1]);
  assert.deepEqual(states(knowing(...tens.slice(0, 7))), ["open", "open", "locked", "locked", "locked"]);
  assert.equal(levelStatuses(ladder, knowing(...tens.slice(0, 7)), [], [], {})[1].why, "earned");
});

test("a level that tests nothing asks nothing: the next one looks back past it", () => {
  // Level 1 mastered (2 of 3 is under 70%; 3 of 3 is not): level 2 opens on it,
  // and level 3, gated past the empty level 2, opens on level 1 too.
  const map = knowing(...tens.slice(0, 7), "d0", "d1", "d2");
  const all = levelStatuses(ladder, map, [], [], {});
  assert.deepEqual(all.map((s) => s.state), ["open", "open", "open", "open", "locked"]);
  assert.equal(all[3].gate, 1, "level 3's gate is level 1, not the empty level 2");
  assert.deepEqual(states(knowing(...tens.slice(0, 7), "d0", "d1")).slice(2, 4), ["locked", "locked"]);
});

test("a passed gate opens nothing while the written level before is locked", () => {
  // Level 1 fully mastered but level 1 itself locked (level 0 not mastered): 2 and 3 stay locked.
  const all = levelStatuses(ladder, knowing("d0", "d1", "d2"), [], [], {});
  assert.deepEqual(all.map((s) => s.state), ["open", "locked", "locked", "locked", "locked"]);
  assert.deepEqual([all[2].gate, all[2].need, all[3].gate, all[3].need], [1, 0, 1, 0], "level 3 is gated past the empty level 2, on level 1");
});

test("review never offers an exercise in a locked level", () => {
  const two = {
    lessons: [
      { id: "low", level: 0, exercises: [{ id: "a", concept: "x" }] },
      { id: "high", level: 2, exercises: [{ id: "b", concept: "x" }] },
    ],
  } as unknown as Parameters<typeof reviewSession>[0];
  const map: MasteryMap = { concepts: { x: { ...blankMastery(), mastered: true, box: 1, dueAt: new Date(2026, 0, 1).toISOString() } }, tactics: {} };
  const seenLow = [{ lessonId: "low", exerciseId: "a", body: "", solved: true, createdAt: new Date(2026, 0, 1) }];
  const now = new Date(2026, 0, 5);
  assert.equal(reviewSession(two, map, seenLow, now)[0].lessonId, "high", "unseen first, when every level is open");
  assert.equal(reviewSession(two, map, seenLow, now, (l) => l < 2)[0].lessonId, "low");
  assert.deepEqual(reviewSession(two, map, seenLow, now, () => false), []);
});

test("an outline level never opens, whatever is mastered or recorded", () => {
  const map = knowing(...tens, "d0", "d1", "d2", "e0");
  assert.equal(states(map, [{ level: 4, how: "anyway" }])[4], "locked");
});

test("a level once opened stays open, and opens every written level before it", () => {
  // Nothing mastered: a recorded level stays open (a concept added later, a missed review).
  assert.deepEqual(states(knowing(), [{ level: 1, how: "earned" }]), ["open", "open", "locked", "locked", "locked"]);
  const anyway = levelStatuses(ladder, knowing(), [{ level: 3, how: "anyway" }], [], {});
  assert.deepEqual(anyway.map((s) => s.state), ["open", "open", "open", "open", "locked"]);
  assert.deepEqual(anyway.map((s) => s.why), ["first", "anyway", "anyway", "anyway", null]);
  // Work on record in a level opens it: it was open before levels could lock.
  assert.deepEqual(states(knowing(), [], [{ lessonId: "one" }, { lessonId: "gone" }]), ["open", "open", "locked", "locked", "locked"]);
  assert.equal(levelStatuses(ladder, knowing(), [], [{ lessonId: "one" }], {})[1].why, "worked");
});

test("an open level is done when every exercise in it is solved", () => {
  const solved = { one: { d0: {}, d1: {}, d2: {} }, two: {} };
  assert.deepEqual(states(knowing(), [], [], solved).slice(0, 3), ["open", "locked", "locked"], "solved in a locked level is not done");
  assert.deepEqual(states(knowing(), [{ level: 2, how: "anyway" }], [], solved).slice(0, 3), ["open", "done", "open"], "a level of no exercises is never done");
  assert.equal(levelOpen(levelStatuses(ladder, knowing(), [], [], {}), 9), true, "a level not listed is not locked");
});

test("a placement credit masters a concept in box 2, due on its own day, without an answer", () => {
  const now = new Date(2026, 0, 10, 12);
  const due = new Date(2026, 0, 19, 9);
  const map = masteryFrom(content, [], [{ concept: "and", creditedAt: now, dueAt: due }]);
  assert.deepEqual([map.concepts.and.mastered, map.concepts.and.box, map.concepts.and.attempts], [true, PLACEMENT_BOX, 0]);
  assert.equal(map.concepts.and.dueAt, startOfDay(due).toISOString());
  // An answer before it is due changes the score only; on the day, it is the review.
  const miss = { lessonId: "l", exerciseId: "b", body: "x", solved: false, createdAt: new Date(2026, 0, 12) };
  const after = masteryFrom(content, [miss], [{ concept: "and", creditedAt: now, dueAt: due }]).concepts.and;
  assert.deepEqual([after.mastered, after.box, after.dueAt], [true, PLACEMENT_BOX, startOfDay(due).toISOString()]);
  const review = { ...miss, body: "y", solved: true, createdAt: new Date(2026, 0, 19, 10) };
  assert.equal(masteryFrom(content, [miss, review], [{ concept: "and", creditedAt: now, dueAt: due }]).concepts.and.box, PLACEMENT_BOX + 1);
  // A concept already in PLACEMENT_BOX or past it keeps its own schedule; a credit for no concept is nothing.
  const twice = masteryFrom(content, [], [{ concept: "and", creditedAt: now, dueAt: due }, { concept: "and", creditedAt: new Date(2026, 0, 11), dueAt: new Date(2026, 0, 30) }]);
  assert.equal(twice.concepts.and.dueAt, startOfDay(due).toISOString());
  const far = { concepts: {}, tactics: {} };
  assert.deepEqual(masteryFrom(content, [], [{ concept: "__proto__", creditedAt: now, dueAt: due }]), far);
});
