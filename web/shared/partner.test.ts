import assert from "node:assert/strict";
import { test } from "node:test";
import { HASH_ALLOWED, MAX_SCRATCH, insertable, labelled, leanBlocks, scratchProblems, scratchSource, standsAlone, verdictLine, withoutLabels } from "./partner.ts";

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
  assert.match(scratchProblems("trivial")[0].message, /must begin a theorem/);
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
    ["example : 2 + 2 = 4 := by decide +native", "native"],
    ["example : 2 + 2 = 4 := by\n  decide (config := { native\n    := true })", "native"],
    ["example : 2 + 2 = 4 := by\n  simp (config := c)", "config"],
    // Ways a file extends Lean with code of its own, which Lean then runs.
    ["macro \"x\" : tactic => `(tactic| trivial)", "macro"],
    ["  macro_rules | `(x) => `(y)", "macro_rules"],
    ["syntax \"x\" : term", "syntax"],
    ["notation \"x\" => 1", "notation"],
    ["simproc foo (_) := fun e => e", "simproc"],
    ["dsimproc foo (_) := fun e => e", "dsimproc"],
    ["attribute [simp] foo", "attribute"],
    ["@[norm_num 1] def f := 1", "@[norm_num 1]"],
    ["@[simp, positivity] def f := 1", "@[positivity]"],
    ["@[simp,\n  tactic] def f := 1", "@[simp]"],
    ["example (x : ℕ) : x = x := by plausible", "plausible"],
    ["example (x : BitVec 8) : x = x := by bv_decide", "bv_decide"],
    ["def f := System.FilePath.readDir", "System"],
    ["def f : BaseIO Unit := pure ()", "BaseIO"],
    ["def f : Mathlib.Meta.NormNum.NormNumExt := sorry", "Meta"],
    ["instance : Testable p := sorry", "Testable"],
    // "No errors" must not rest on an assumption made up in the file.
    ["axiom h : False", "axiom"],
    ["opaque c : ℕ", "opaque"],
    // A first-column line must start a command a scratch file is for.
    ["register_simp_attr mine", "register_simp_attr"],
    ["example : True := by\ntrivial", "trivial"],
    ["/- never closed\nexample : True := trivial", "/-"],
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

test("ordinary scratch files pass the first-column rule and the attribute list", () => {
  for (const lean of [
    "@[simp] theorem t : (1 : ℕ) + 1 = 2 := rfl\n\n@[simp, norm_cast]\nlemma l : True := trivial",
    "variable (a b : ℕ)\nnamespace Scratch\nsection\nprivate def f (n : ℕ) : ℕ :=\n  match n with\n  | 0 => 0\n  | n + 1 => f n\nend\nend Scratch",
    "structure P where\n  x : ℕ\nderiving Repr\n\ninductive T\n  | a\n  | b",
    "noncomputable def r : ℝ := Real.sqrt 2\n/-- A doc comment. -/\ntheorem t : True := by\n  trivial\n-- done",
    "example (a b : ℝ) (h : a ≤ b) : a + 1 ≤ b + 1 := by\n  calc a + 1 ≤ b + 1 := by gcongr",
  ])
    assert.deepEqual(scratchProblems(lean), [], lean);
});

test("Insert is offered for Lean that would not run a program, fragments included, and for nothing else", () => {
  assert.equal(insertable("theorem t : True := by\n  sorry", "lean"), true);
  assert.equal(insertable("exact hP", ""), true);
  assert.equal(insertable("intro h\napply h"), true);
  assert.equal(insertable("#eval IO.println 1", "lean"), false);
  assert.equal(insertable("example : True := by run_tac pure ()", "lean"), false);
  assert.equal(insertable("rm -rf x", "bash"), false);
  assert.equal(insertable("  ", "lean"), false);
});

test("a line that looks like a label is the app's to write: one the Tutor wrote is taken out", () => {
  const faked = "```lean\nexample : 1 = 2 := by sorry\n```\n*Lean: checked, no errors.*\n  **Lean: checked**\n_lean: fine_\nLean is a proof assistant.";
  assert.equal(withoutLabels(faked), "```lean\nexample : 1 = 2 := by sorry\n```\nLean is a proof assistant.");
  assert.equal(withoutLabels("plain"), "plain");
});

test("fences are read as the drawer reads them: a fence with words after its language, a longer fence, another language", () => {
  const md = ["```lean say: an example", "example : True := trivial", "```", "Some prose.", "```lean", "theorem t : 2 = 2 := rfl", "```", "````", "```lean", "quoted", "```", "````", "```bash say: x", "ls", "```"].join("\n");
  assert.deepEqual(leanBlocks(md).map((b) => b.code), ["example : True := trivial", "theorem t : 2 = 2 := rfl", "```lean\nquoted\n```"]);
  // The label is a paragraph of its own, whatever follows the block.
  assert.deepEqual(labelled("```lean\nx\n```\nProved:", [{ kind: "accepted" }]).split("\n"), ["```lean", "x", "```", "", "*Lean: checked, no errors.*", "", "Proved:"]);
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
  assert.equal(out[8], "");
  assert.equal(labelled(reply, []), reply);
  assert.equal(verdictLine({ kind: "accepted" }), "*Lean: checked, no errors.*");
  // Lean's words cannot close the emphasis or run past a line.
  assert.equal(verdictLine({ kind: "refused", error: "Unknown constant `Nat.no_such*`\nmore" }), "*Lean: a sketch, not accepted as written (Unknown constant Nat.no_such×).*");
  assert.match(verdictLine({ kind: "not-run", why: "“#eval” is not run for the Tutor: x" }), /not checked \(“#eval” is not run/);
  assert.match(verdictLine({ kind: "unasked", why: "Lean took too long" }), /could not be asked \(Lean took too long\)/);
});
