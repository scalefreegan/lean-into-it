import assert from "node:assert/strict";
import { test } from "node:test";
import { type Arrows, braces, collisions, image, injectiveSaid, missed, preimage, readArrows, surjectiveSaid } from "./arrows.ts";
import { checkParams, WIDGETS } from "./registry.ts";

const base = { from: ["1", "2", "3"], to: ["a", "b", "c"], arrows: ["1 -> a", "2→a", "3 -> b"] };
const read = (p: Record<string, unknown>) => {
  const r = readArrows(p);
  assert.ok(typeof r !== "string", String(r));
  return r as Arrows;
};

test("where injectivity and surjectivity fail, and in words", () => {
  const f = read(base);
  assert.deepEqual(f.map, [0, 0, 1]);
  assert.deepEqual([collisions(f), missed(f)], [[0], [2]]);
  assert.deepEqual(injectiveSaid(f), { holds: false, why: "1 and 2 both go to a" });
  assert.deepEqual(surjectiveSaid(f), { holds: false, why: "nothing goes to c" });
  const g = { ...f, map: [0, 0, 0] };
  assert.equal(injectiveSaid(g).why, "1, 2 and 3 all go to a");
  assert.equal(surjectiveSaid(g).why, "nothing goes to b or c");
  const h = { ...f, map: [2, 0, 1] };
  assert.ok(injectiveSaid(h).holds && surjectiveSaid(h).holds);
});

test("every function between small sets: the words agree with the definitions", () => {
  for (let n = 0; n < 27; n++) {
    const f: Arrows = { from: ["1", "2", "3"], to: ["a", "b", "c"], map: [n % 3, Math.floor(n / 3) % 3, Math.floor(n / 9)] };
    assert.equal(injectiveSaid(f).holds, new Set(f.map).size === 3);
    assert.equal(surjectiveSaid(f).holds, [0, 1, 2].every((j) => f.map.includes(j)));
    for (let s = 0; s < 8; s++) {
      const set = new Set([0, 1, 2].filter((i) => (s >> i) & 1));
      // f '' S ⊆ T ↔ S ⊆ f ⁻¹' T, on the pair at hand: S is inside the preimage of its image.
      const back = preimage(f, new Set(image(f, set)));
      for (const i of set) assert.ok(back.includes(i));
      for (const j of image(f, new Set(preimage(f, set)))) assert.ok(set.has(j));
    }
  }
});

test("image and preimage of a set", () => {
  const f = read(base);
  assert.deepEqual(image(f, new Set([0, 1])), [0]);
  assert.deepEqual(image(f, new Set()), []);
  assert.deepEqual(preimage(f, new Set([0, 2])), [0, 1]);
  assert.deepEqual(preimage(f, new Set([2])), []);
  assert.deepEqual([braces([]), braces(["a", "b"])], ["∅", "{a, b}"]);
});

test("the registry refuses arrows that are not a function", () => {
  const check = (p: Record<string, unknown>) => checkParams(WIDGETS["function-arrows"], { ...base, ...p }).join("\n");
  assert.equal(check({}), "");
  assert.equal(check({ image: [] }), "");
  assert.match(check({ arrows: ["1 -> a", "2 -> a"] }), /3 has no arrow/);
  assert.match(check({ arrows: [...base.arrows, "1 -> b"] }), /1 has two arrows/);
  assert.match(check({ arrows: ["1 -> z", "2 -> a", "3 -> b"] }), /z is not in `to`/);
  assert.match(check({ arrows: ["1 a", "2 -> a", "3 -> b"] }), /not of the form/);
  assert.match(check({ from: ["1", "1", "3"] }), /twice/);
  assert.match(check({ to: [] }), /needs `to`/);
  assert.match(check({ to: ["a", "b", "c", "d", "e", "f", "g", "h"] }), /at most 7/);
  assert.match(check({ image: ["9"] }), /9 is not in `from`/);
  assert.match(check({ preimage: ["9"] }), /9 is not in `to`/);
  assert.match(check({ image: ["1"], preimage: ["a"] }), /give one/);
});
