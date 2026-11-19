import assert from "node:assert/strict";
import { test } from "node:test";
import { loadContent } from "../server/loader.ts";
import { EXPLORERS, LAB_FIRST_LINE, labSource, moveDoes, TACTIC_EXAMPLES } from "./lab.ts";
import { tacticsIn, tacticsOf } from "./progress.ts";
import { checkParams, isWidget, WIDGETS } from "./registry.ts";

// Whether Lean accepts each example is asked of the real Lean in web/server/lean.test.ts.

const content = loadContent();
const curriculum = tacticsOf(content);

test("the Lab has an example, and a sentence, for every move the curriculum teaches, and for nothing else", () => {
  assert.deepEqual(Object.keys(TACTIC_EXAMPLES).sort(), [...curriculum].sort());
  for (const t of curriculum) assert.ok(moveDoes(t), `${t} has no sentence saying what it does`);
});

test("each example uses its move, is one whole example, and leaves nothing for later", () => {
  for (const [t, example] of Object.entries(TACTIC_EXAMPLES)) {
    assert.match(example.lean, /^example .* := by\n {2}\S/s, t);
    assert.ok(tacticsIn(example.lean, curriculum).includes(t), `the example for ${t} does not use it`);
    assert.doesNotMatch(example.lean, /\b(sorry|admit)\b/, t);
    assert.ok(example.watch.trim().endsWith("."), `${t}: what to watch for is a sentence`);
  }
});

test("an example's file starts as a Playground file does, with the example where the cursor is sent", () => {
  const source = labSource(TACTIC_EXAMPLES.intro.lean);
  const lines = source.split("\n");
  assert.equal(lines[0], "import Mathlib");
  assert.match(lines[LAB_FIRST_LINE], /^example /);
  assert.ok(source.endsWith("\n"));
});

test("every explorer starts registered widgets with parameters they take", () => {
  const ids = EXPLORERS.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(!ids.includes("moves"), "`moves` is the move reference's own name in #/lab/<tool>");
  for (const e of EXPLORERS) {
    assert.match(e.id, /^[a-z-]+$/);
    assert.ok(e.widgets.length > 0, e.id);
    for (const w of e.widgets) {
      assert.ok(isWidget(w.type), `${e.id}: ${w.type}`);
      assert.deepEqual(checkParams(WIDGETS[w.type], w.params), [], `${e.id}: ${w.type} ${JSON.stringify(w.params)}`);
      assert.ok(w.note.trim(), `${e.id}: ${w.type} has no note`);
    }
  }
});
