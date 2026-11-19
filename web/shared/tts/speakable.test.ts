import assert from "node:assert/strict";
import { test } from "node:test";
import { speakableText, spokenBlocks } from "./speakable.ts";

const boldWords = (source: string) => {
  const { text, boldRanges } = speakableText(source);
  return boldRanges.map(([s, e]) => text.slice(s, e));
};

test("strips heading markers and paragraph markup to plain words", () => {
  const { text } = speakableText("## Pitch\n\nA string vibrates. **Frequency** is how fast.");
  assert.equal(text, "Pitch A string vibrates. Frequency is how fast.");
});

test("tracks **bold** ranges as key-concept terms, matching the plain text they land on", () => {
  const { text, boldRanges } = speakableText("The **octave** is the first **interval** we name.");
  assert.equal(text, "The octave is the first interval we name.");
  assert.deepEqual(
    boldRanges.map(([s, e]) => text.slice(s, e)),
    ["octave", "interval"],
  );
});

test("strips italic and code markers without marking them bold", () => {
  const { text, boldRanges } = speakableText("Play *softly* and watch `middle C`.");
  assert.equal(text, "Play softly and watch middle C.");
  assert.deepEqual(boldRanges, []);
});

test("flattens bullet and numbered lists into spoken segments", () => {
  const { text } = speakableText("- First step\n- Second step");
  assert.equal(text, "First step Second step");
});

test("joins block quotes as one spoken segment", () => {
  const { text } = speakableText("> Key idea:\n> the octave sounds consonant.");
  assert.equal(text, "Key idea: the octave sounds consonant.");
});

test("drops blank lines and empty blocks without leaving stray spaces", () => {
  const { text } = speakableText("First paragraph.\n\n\nSecond paragraph.");
  assert.equal(text, "First paragraph. Second paragraph.");
});

test("a lesson-shaped passage keeps bold ranges correct across multiple blocks", () => {
  const source = "## Pitch is frequency\n\nFaster vibration sounds higher. **Frequency** is how we measure it.\n\n> The **octave** doubles frequency.";
  assert.deepEqual(boldWords(source), ["Frequency", "octave"]);
});

test("spokenBlocks tags each block's kind and keeps a running global word index across blocks", () => {
  const blocks = spokenBlocks("## Pitch\n\nFaster vibration sounds higher.\n\n- First\n- Second");
  assert.deepEqual(blocks.map((b) => b.kind), ["h2", "p", "bullet", "bullet"]);
  const all = blocks.flatMap((b) => b.words);
  assert.deepEqual(
    all.map((w) => w.index),
    all.map((_, i) => i),
    "indices are contiguous across every block, matching one TTS request for the whole passage",
  );
  assert.deepEqual(all.map((w) => w.text), ["Pitch", "Faster", "vibration", "sounds", "higher.", "First", "Second"]);
});

test("spokenBlocks marks the words that fall inside **bold**, including multi-word terms", () => {
  const [block] = spokenBlocks("The **minor pentatonic** scale is next.");
  assert.deepEqual(
    block.words.map((w) => w.bold),
    [false, true, true, false, false, false],
  );
});

test("spokenBlocks' global word order matches speakableText's plain text split on whitespace", () => {
  const source = "## Pitch is frequency\n\nFaster vibration sounds higher. **Frequency** is how we measure it.\n\n> The **octave** doubles frequency.";
  const { text } = speakableText(source);
  const flat = spokenBlocks(source).flatMap((b) => b.words.map((w) => w.text));
  assert.deepEqual(flat, text.split(" "));
});

test("a fenced code block is shown and not read, and the words after it keep counting", () => {
  const source = "Try this:\n\n```lean\nexample : 2 + 2 = 4 := by\n  rfl\n```\n\nIt works.";
  assert.equal(speakableText(source).text, "Try this: It works.");
  const blocks = spokenBlocks(source);
  assert.deepEqual(blocks.map((b) => b.kind), ["p", "code", "p"]);
  assert.equal(blocks[1].code, "example : 2 + 2 = 4 := by\n  rfl");
  assert.deepEqual(blocks[1].words, []);
  assert.deepEqual(blocks.flatMap((b) => b.words.map((w) => w.index)), [0, 1, 2, 3]);
  // A longer fence can quote a shorter one.
  assert.equal(speakableText("````\n```\ninner\n```\n````\nAfter.").text, "After.");
});

test("inline code and italics keep their marks, and a star inside code is not emphasis", () => {
  const [block] = spokenBlocks("Use `intro h` and *then* `a * b` **with `rw`**.");
  assert.deepEqual(block.words.map((w) => w.text), ["Use", "intro", "h", "and", "then", "a", "*", "b", "with", "rw."]);
  // Each word knows which code span it is in: `intro h` is one, `a * b` the next.
  assert.deepEqual(block.words.map((w) => w.code), [null, 0, 0, null, null, 1, 1, 1, null, 2]);
  assert.deepEqual(block.words.filter((w) => w.italic).map((w) => w.text), ["then"]);
  assert.deepEqual(block.words.filter((w) => w.bold).map((w) => w.text), ["with", "rw."]);
});

test("a passage with nothing to say is empty text", () => {
  assert.equal(speakableText("```\ncode only\n```").text, "");
  assert.equal(speakableText("\n\n").text, "");
});
