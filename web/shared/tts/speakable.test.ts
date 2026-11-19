import assert from "node:assert/strict";
import { test } from "node:test";
import { fenceSummary, isSounding, speakableText, spokenBlocks, spokenGaps, unsaidSymbols } from "./speakable.ts";

const boldWords = (source: string) => {
  const { text, boldRanges } = speakableText(source);
  return boldRanges.map(([s, e]) => text.slice(s, e));
};

test("strips heading markers and paragraph markup to plain words; a heading gets a stop, so it is not run into the text", () => {
  const { text } = speakableText("## Pitch\n\nA string vibrates. **Frequency** is how fast.");
  assert.equal(text, "Pitch. A string vibrates. Frequency is how fast.");
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
  assert.equal(text, "First step. Second step.");
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
  const flat = spokenBlocks(source).flatMap((b) => b.words.map((w) => w.say));
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

test("a code span is one word of the page, said from the tables; a star inside it is not emphasis", () => {
  const [block] = spokenBlocks("Use `intro h` and *then* `a * b` **with `rw`**.");
  assert.deepEqual(block.words.map((w) => w.text), ["Use", "intro h", "and", "then", "a * b", "with", "rw."]);
  assert.deepEqual(block.words.map((w) => w.say), ["Use", "intro h", "and", "then", "a times b", "with", "rewrite."]);
  // Spoken words are numbered through the passage; a formula covers as many as are said for it.
  assert.deepEqual(block.words.map((w) => [w.index, w.span]), [[0, 1], [1, 2], [3, 1], [4, 1], [5, 3], [8, 1], [9, 1]]);
  assert.deepEqual(block.words.filter((w) => w.parts[0].italic).map((w) => w.text), ["then"]);
  assert.deepEqual(block.words.filter((w) => w.bold).map((w) => w.text), ["with", "rw."]);
  assert.deepEqual(block.gaps.map((g) => g.bold), [false, false, false, false, false, true]);
  // "rw." is bold code, then a full stop that is neither.
  assert.deepEqual(block.words[6].parts, [{ text: "rw", bold: true, italic: false, code: true }, { text: ".", bold: false, italic: false, code: false }]);
  assert.equal(speakableText("Use `intro h` and *then* `a * b` **with `rw`**.").text, "Use intro h and then a times b with rewrite.");
});

test("a passage with nothing to say is empty text", () => {
  assert.equal(speakableText("```\ncode only\n```").text, "");
  assert.equal(speakableText("\n\n").text, "");
});

test("a word is cut where its marking changes, so punctuation beside code or bold keeps its own look", () => {
  const [block] = spokenBlocks("Name it `h`, as **P**s are; `a`+`b` too.");
  const parts = (text: string) => block.words.find((w) => w.text === text)!.parts.map((p) => [p.text, p.code, p.bold]);
  assert.deepEqual(parts("h,"), [["h", true, false], [",", false, false]]);
  assert.deepEqual(parts("Ps"), [["P", false, true], ["s", false, false]]);
  // Two code spans in one word stay two.
  assert.deepEqual(block.words.find((w) => w.text === "a+b")!.parts.map((p) => p.code), [true, false, true]);
  assert.equal(block.words.find((w) => w.text === "a+b")!.say, "a plus b");
  // Every word's parts spell the word.
  for (const w of block.words) assert.equal(w.parts.map((p) => p.text).join(""), w.text);
});

test("two lists with a blank line between them stay two lists", () => {
  const blocks = spokenBlocks("- one\n- two\n\n- three\n\n1. four");
  assert.deepEqual(blocks.map((b) => [b.kind, b.list]), [["bullet", 0], ["bullet", 0], ["bullet", 1], ["number", 2]]);
  assert.equal(spokenBlocks("A paragraph.")[0].list, undefined);
});

test("a written spoken form wins, and is not shown", () => {
  const source = "So `∑ i ∈ Finset.range n, f i`{say: the sum of f of i, for i below n} is what we want.";
  const [block] = spokenBlocks(source);
  const formula = block.words[1];
  assert.equal(formula.text, "∑ i ∈ Finset.range n, f i");
  assert.equal(formula.say, "the sum of f of i, for i below n");
  assert.deepEqual([formula.index, formula.span], [1, 10]);
  assert.equal(block.words[2].index, 11);
  assert.equal(speakableText(source).text, "So the sum of f of i, for i below n is what we want.");
  // An empty form says nothing: the span is passed over.
  assert.equal(speakableText("Type `⟨`{say:} now.").text, "Type now.");
  assert.equal(spokenBlocks("Type `⟨`{say:} now.")[0].words[1].span, 0);
});

test("a formula is marked for as long as any of its words is said", () => {
  const [block] = spokenBlocks("If `a ≤ b` then stop.");
  const formula = block.words[1];
  assert.deepEqual([formula.say, formula.index, formula.span], ["a is at most b", 1, 5]);
  assert.deepEqual([0, 1, 3, 5, 6, null].map((n) => isSounding(formula, n)), [false, true, true, true, false, false]);
});

test("symbols in running text are said as words, and the spoken words still line up", () => {
  const source = "For any real numbers a and b, (a + b)² = a² + 2ab + b². Suppose a ≤ b; then −b ≤ −a, and 0 + 1 + … + n is n(n + 1)/2.";
  const { text } = speakableText(source);
  assert.equal(text, "For any real numbers a and b, (a plus b) squared equals a squared plus 2ab plus b squared. Suppose a is at most b; then minus b is at most minus a, and 0 plus 1 plus and so on plus n is n(n plus 1)/2.");
  const words = spokenBlocks(source).flatMap((b) => b.words);
  assert.equal(words.reduce((n, w) => n + w.span, 0), text.split(" ").length);
  for (const w of words) assert.equal(text.split(" ").slice(w.index, w.index + w.span).join(" "), w.say);
  // A hyphen is not a minus, and an ellipsis that trails off is a pause.
  assert.equal(speakableText("A well-known if… then rule.").text, "A well-known if then rule.");
});

test("a code block with a summary is said as its summary, as one unit; without one it is passed over", () => {
  const source = "Here it is:\n\n```lean say: The same proof, typed out.\nexample : 2 + 2 = 4 := by\n  rfl\n```\n\nDone.";
  assert.equal(speakableText(source).text, "Here it is: The same proof, typed out. Done.");
  const blocks = spokenBlocks(source);
  assert.deepEqual(blocks.map((b) => b.kind), ["p", "code", "p"]);
  assert.deepEqual(blocks[1].words.map((w) => [w.index, w.span, w.say]), [[3, 5, "The same proof, typed out."]]);
  assert.equal(blocks[2].words[0].index, 8);
  assert.equal(fenceSummary("```lean say: Two lines."), "Two lines.");
  assert.equal(fenceSummary("```lean"), "");
  assert.equal(fenceSummary("````"), "");
});

test("the spans that want a written spoken form are listed once each; one with a form is not", () => {
  const source = "See `∀ m < n, P m` and `rfl`, then `∀ m < n, P m` again, and `∑ i ∈ s, f i`{say: the sum of f over s}.\n\n```lean\n∀ m < n, Q m\n```";
  assert.deepEqual(spokenGaps(source).map((g) => g.code), ["∀ m < n, P m"]);
  assert.deepEqual(unsaidSymbols("Fine: a² ≤ b. Not known: a ⊕ b and ∮."), ["⊕", "∮"]);
});
