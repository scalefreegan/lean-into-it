import assert from "node:assert/strict";
import { test } from "node:test";
import { HASH_ALLOWED, MAX_SCRATCH, labelled, leanBlocks, scratchProblems, scratchSource, standsAlone, verdictLine } from "./partner.ts";

const names = (lean: string) => scratchProblems(lean).map((p) => p.name);

test("what a proof partner needs is let through", () => {
  for (const lean of [
    "theorem t (m n : ℕ) (hm : Even m) (hn : Even n) : Even (m + n) := by\n  sorry",
    "example (a : ℕ) : a + 0 = a := by\n  exact?",
    "#check Nat.add_zero\n#print Nat.add_zero\n#reduce 2 + 2\n#synth Add ℕ",
    "def double (n : ℕ) : ℕ := 2 * n\nexample : double 3 = 6 := by decide",
    "example : #[1, 2].size = 2 := by rfl",
    "-- #eval would run a program; IO too\nexample : True := trivial",
    "open Nat in\nexample (n : ℕ) : n ≤ n.succ := by omega",
  ])
    assert.deepEqual(scratchProblems(lean), [], lean);
  assert.ok(HASH_ALLOWED.includes("check"));
});

test("what runs a program, reads a file, reaches the network or loads a module is refused, with its line", () => {
  assert.deepEqual(names("#eval 1 + 1"), ["#eval"]);
  assert.deepEqual(scratchProblems("example : True := trivial\n#eval 2")[0].line, 2);
  for (const [lean, name] of [
    ["run_cmd pure ()", "run_cmd"],
    ["example : True := by run_tac pure ()", "run_tac"],
    ["elab \"x\" : tactic => pure ()", "elab"],
    ["initialize pure ()", "initialize"],
    ["open Lean in\nexample : True := trivial", "Lean"],
    ["def f : IO Unit := pure ()", "IO"],
    ["def s := include_str \"x\"", "include_str"],
    ["import Mathlib.Tactic", "import"],
    ["set_option maxHeartbeats 0 in\nexample : True := trivial", "set_option"],
    ["example : 2 + 2 = 4 := by native_decide", "native_decide"],
    ["example : 2 + 2 = 4 := by decide +native", "+native"],
    ["example (x : ℝ) (h : x = 1) : x = 1 := by polyrith", "polyrith"],
    ["#loogle Nat", "#loogle"],
    ["#leansearch \"sum of evens\"", "#leansearch"],
    ["#exit", "#exit"],
    ["def «x» := 1", "«»"],
    ["unsafe def f := 1", "unsafe"],
  ] as const)
    assert.ok(names(lean).includes(name), `${lean} → ${names(lean)}`);
  // A string is searched too: an interpolated one holds code.
  assert.ok(names('def s := s!"{1}"').includes("{"));
  assert.ok(names('def s := "#eval"').includes("#eval"));
  assert.deepEqual(names("x".repeat(MAX_SCRATCH + 1)), ["length"]);
  assert.match(scratchProblems("#eval 1")[0].message, /#reduce/);
});

test("the scratch file is Mathlib and the text, and never the learner's", () => {
  assert.equal(scratchSource("example : True := trivial\n\n"), "import Mathlib\n\nexample : True := trivial\n");
});

const reply = ["Here is the statement:", "", "```lean", "theorem t : True := by", "  sorry", "```", "", "Then try:", "", "```", "trivial", "```", "", "```python", "print(1)", "```", "", "```lean", "unclosed"].join("\n");

test("a reply's Lean blocks: marked lean or unmarked, closed, not other languages", () => {
  const blocks = leanBlocks(reply);
  assert.deepEqual(blocks.map((b) => b.code), ["theorem t : True := by\n  sorry", "trivial"]);
  assert.deepEqual(blocks.map((b) => b.after), [6, 12]);
  assert.equal(standsAlone(blocks[0].code), true);
  assert.equal(standsAlone(blocks[1].code), false);
  assert.equal(standsAlone("-- theorem in a comment\nintro h"), false);
  assert.equal(standsAlone("@[simp] lemma l : True := trivial"), true);
  assert.equal(standsAlone("#check Nat.add_zero"), true);
});

test("each block gets Lean's verdict under it, in Lean's name and not the Tutor's", () => {
  const out = labelled(reply, [{ kind: "open" }, { kind: "fragment" }]).split("\n");
  assert.equal(out[5], "```");
  assert.equal(out[7], "*Lean: the statement is accepted; the proof is left open (sorry).*");
  assert.equal(out[15], "*Lean: not checked; this is part of a proof, not a whole example.*");
  assert.equal(labelled(reply, []), reply);
  assert.equal(verdictLine({ kind: "accepted" }), "*Lean: checked, no errors.*");
  // Lean's words cannot close the emphasis or run past a line.
  assert.equal(verdictLine({ kind: "refused", error: "Unknown constant `Nat.no_such*`\nmore" }), "*Lean: a sketch, not accepted as written (Unknown constant Nat.no_such∗).*");
  assert.match(verdictLine({ kind: "not-run", why: "“#eval” is not run for the Tutor: x" }), /not checked \(“#eval” is not run/);
  assert.match(verdictLine({ kind: "unasked", why: "Lean took too long" }), /could not be asked \(Lean took too long\)/);
});
