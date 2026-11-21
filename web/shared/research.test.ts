import assert from "node:assert/strict";
import { test } from "node:test";
import { loadContent } from "../server/loader.ts";
import { jsonBlock, NOTHING_VERIFIED, pathConcepts, readMap, safeUrl, settleLinks } from "./research.ts";

// A research map as the Tutor writes it, held to the rules (research.ts).

const content = loadContent();
const fence = (o: unknown) => `Here is the map.\n\n\`\`\`json\n${JSON.stringify(o, null, 2)}\n\`\`\`\n`;

const GOOD = {
  title: "A result",
  summary: "Someone proved something.",
  claimed: [{ text: "A team announced a proof.", sources: [1] }],
  verified: [{ text: "The main theorem was checked.", system: "Lean 4 with Mathlib", sources: [2] }],
  verifiedNote: "",
  concepts: [{ id: "induction", why: "The proof is by induction." }, { id: "sets", why: "It is about sets." }, { id: "not-a-concept", why: "x" }, { id: "induction", why: "again" }],
  open: [{ text: "Experts dispute the bound.", sources: [1, 2] }],
  unconfirmed: ["The date of the announcement."],
  sources: [
    { n: 1, title: "The announcement", url: "https://example.org/a", publisher: "Example", date: "2026-11-01" },
    { n: 2, title: "The repository", url: "https://example.org/b" },
  ],
};

test("a map is read from the last ```json block of the reply", () => {
  assert.equal(jsonBlock("no block"), null);
  assert.equal(jsonBlock("```json\nnot json\n```"), null);
  assert.deepEqual(jsonBlock('```json\n{"a":1}\n```\ntext\n```json\n{"b":2}\n```'), { b: 2 });
});

test("only http and https links are kept", () => {
  assert.equal(safeUrl("https://example.org/x"), "https://example.org/x");
  assert.equal(safeUrl("javascript:alert(1)"), "");
  assert.equal(safeUrl("file:///etc/passwd"), "");
  assert.equal(safeUrl("not a url"), "");
});

test("a good map keeps its four parts, its sources, and links concepts to lessons or to the outline", () => {
  const read = readMap(fence(GOOD), "  What happened?  ", content);
  assert.ok("map" in read);
  const { map } = read;
  assert.equal(map.question, "What happened?");
  assert.deepEqual(map.claimed, [{ text: "A team announced a proof.", sources: [1] }]);
  assert.deepEqual(map.verified, [{ text: "The main theorem was checked.", system: "Lean 4 with Mathlib", sources: [2] }]);
  assert.deepEqual(map.open, [{ text: "Experts dispute the bound.", sources: [1, 2] }]);
  assert.equal(map.sources.length, 2);
  assert.equal(map.sources[1].title, "The repository");
  assert.equal(map.sources[0].reachable, null, "not checked yet");
  const induction = map.concepts.find((c) => c.concept === "induction")!;
  assert.equal(induction.kind, "lesson");
  assert.ok(induction.kind === "lesson" && content.lessons.some((l) => l.id === induction.lessonId && l.concepts.includes("induction")));
  const sets = map.concepts.find((c) => c.concept === "sets")!;
  assert.deepEqual(sets.kind === "outline" && [sets.level, sets.title], [4, "Sets, membership and subset"]);
  assert.equal(map.concepts.length, 2, "an unknown concept is dropped, a repeated one kept once");
});

test("a claim with no source is not shown as a claim: it moves to what could not be confirmed", () => {
  const map = { ...GOOD, claimed: [{ text: "Unsourced.", sources: [] }, { text: "Cites nothing real.", sources: [9] }], verified: [{ text: "Checked somewhere.", sources: [1] }] };
  const read = readMap(fence(map), "q", content);
  assert.ok("map" in read);
  assert.deepEqual(read.map.claimed, []);
  assert.deepEqual(read.map.verified, []);
  assert.ok(read.map.unconfirmed.includes("Claimed, with no source given: Unsourced."));
  assert.ok(read.map.unconfirmed.includes("Claimed, with no source given: Cites nothing real."));
  assert.ok(read.map.unconfirmed.includes("Said to be formally verified, but without naming the system it was checked in: Checked somewhere."));
  // Nothing verified and no note: the map says so itself.
  assert.equal(read.map.verifiedNote, NOTHING_VERIFIED);
});

test("sources are renumbered in order, a repeated link is one source, and a bad link is no source", () => {
  const map = {
    ...GOOD,
    claimed: [{ text: "A.", sources: [5, 7] }, { text: "B.", sources: [6] }],
    verified: [],
    open: [],
    sources: [
      { n: 5, title: "One", url: "https://example.org/one" },
      { n: 6, title: "Bad", url: "ftp://example.org/x" },
      { n: 7, title: "One again", url: "https://example.org/one" },
    ],
  };
  const read = readMap(fence(map), "q", content);
  assert.ok("map" in read);
  assert.deepEqual(read.map.sources.map((s) => [s.n, s.url]), [[1, "https://example.org/one"]]);
  assert.deepEqual(read.map.claimed, [{ text: "A.", sources: [1] }]);
  assert.ok(read.map.unconfirmed.includes("Claimed, with no source given: B."));
});

test("a reply with no map, or a map with no sources, is refused with the reason", () => {
  assert.match((readMap("I could not find it.", "q", content) as { error: string }).error, /no map in it/);
  assert.match((readMap(fence({ ...GOOD, sources: [] }), "q", content) as { error: string }).error, /cited no sources/);
});

test("the path's concepts: those lessons teach, linked to the first lesson, then those only an outline plans", () => {
  const all = pathConcepts(content);
  const ids = all.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(all.find((c) => c.id === "implication")?.where.kind, "lesson");
  assert.deepEqual(all.find((c) => c.id === "limit-definition")?.where, { kind: "outline", level: 5 });
});

test("a system that names none is no system; with nothing verified, the note is fixed, never the Tutor's words", () => {
  for (const system of ["none", "N/A", "unknown", "not verified", "Unverified", "—"]) {
    const read = readMap(fence({ ...GOOD, verified: [{ text: "Checked.", system, sources: [2] }], verifiedNote: "It was fully checked in Lean by X." }), "q", content);
    assert.ok("map" in read);
    assert.deepEqual(read.map.verified, [], system);
    assert.equal(read.map.verifiedNote, NOTHING_VERIFIED, system);
  }
  const kept = readMap(fence({ ...GOOD, verifiedNote: "Only the main lemma." }), "q", content);
  assert.ok("map" in kept);
  assert.equal(kept.map.verifiedNote, "Only the main lemma.");
});

test("an item whose every source did not open moves to what could not be confirmed", () => {
  const read = readMap(fence(GOOD), "q", content);
  assert.ok("map" in read);
  const settled = settleLinks({ ...read.map, sources: read.map.sources.map((s) => ({ ...s, reachable: s.n === 1 })) });
  assert.deepEqual(settled.claimed.map((c) => c.text), ["A team announced a proof."]);
  assert.deepEqual(settled.verified, [], "its only source, 2, did not open");
  assert.equal(settled.verifiedNote, NOTHING_VERIFIED);
  assert.deepEqual(settled.open.map((c) => c.text), ["Experts dispute the bound."], "one of its two sources opened");
  assert.ok(settled.unconfirmed.includes("Said to be formally verified, but no source for it opened when the map was made: The main theorem was checked."));
});
