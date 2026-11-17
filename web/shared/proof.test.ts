import assert from "node:assert/strict";
import { test } from "node:test";
import { assemble, axiomsOf, bodyLines, endOfBody, escapesIn, forbiddenIn, isLinterRemark, judge as judgeWith, lex, toBody, toSource, type BodyDiagnostic, type Diagnostic } from "./proof.ts";

/** judge with nothing forbidden and Lean's report that no axiom is used, unless said otherwise. */
const judge = (diagnostics: BodyDiagnostic[], body: string, forbid: string[] = [], axioms: string[] | null = []) => judgeWith(diagnostics, body, forbid, axioms);

const at = (line: number, message: string, severity: Diagnostic["severity"] = "error"): Diagnostic => ({
  severity,
  message,
  start: { line, character: 0 },
  end: { line, character: 1 },
});

test("the source is the statement as a named theorem, the body in brackets under by, then the axiom report", () => {
  assert.equal(
    assemble("(P : Prop)  (hP : P) :\n P", "exact hP\n\n"),
    "import Mathlib\n\ntheorem lii_exercise (P : Prop) (hP : P) : P := by\n  (\n    exact hP\n  )\n\n#print axioms lii_exercise\n",
  );
});

test("an empty body is sent as a tactic that does nothing, so Lean reports the opening goal", () => {
  assert.equal(assemble("(P : Prop) : P → P", "  \n"), "import Mathlib\n\ntheorem lii_exercise (P : Prop) : P → P := by\n  (\n    skip\n  )\n\n#print axioms lii_exercise\n");
  assert.deepEqual(toSource(endOfBody("")), { line: 4, character: 8 });
});

test("the end of the body is the end of its last non-blank line, in source coordinates", () => {
  assert.deepEqual(bodyLines("intro h\nexact h\n\n  \n"), ["intro h", "exact h"]);
  assert.deepEqual(endOfBody("intro h\nexact h\n\n"), { line: 1, character: 7 });
  assert.deepEqual(toSource({ line: 1, character: 7 }), { line: 5, character: 11 });
});

const FOOTER = "\n\nNote: This linter can be disabled with `set_option linter.unusedVariables false`";

test("diagnostics come back in body lines; one on the statement has no line; a linter's remark is dropped", () => {
  const body = "apply h\nexact hP";
  const out = toBody([at(2, "unsolved goals\n⊢ P"), at(5, "Unknown identifier `hP`"), at(5, `unused variable \`hQ\`${FOOTER}`, "warning")], body);
  assert.deepEqual(out, [
    { severity: "error", message: "unsolved goals\n⊢ P", line: null },
    { severity: "error", message: "Unknown identifier `hP`", line: 1 },
  ]);
});

test("an error is never dropped, even when its text looks like a linter's", () => {
  // Lean quotes the learner's own names: `exact linter.nope` gives the first, a
  // hypothesis named linter.x the second. Neither may make the proof pass.
  for (const message of ["Unknown identifier `linter.nope`", "unsolved goals\nlinter.x : True\n⊢ Q", `anything${FOOTER}`]) {
    const body = "exact linter.nope";
    const out = toBody([at(4, message)], body);
    assert.equal(out.length, 1, message);
    assert.equal(judge(out, body).solved, false, message);
  }
  assert.equal(isLinterRemark({ severity: "error", message: `x${FOOTER}` }), false);
  assert.equal(isLinterRemark({ severity: "warning", message: `x${FOOTER}` }), true);
  // A warning that merely mentions a linter is kept.
  assert.equal(isLinterRemark({ severity: "warning", message: "declaration uses `sorry` in linter.x" }), false);
});

test("solved means no error and no sorry, for a body that is not empty", () => {
  assert.equal(judge([], "exact hP").solved, true);
  assert.equal(judge([], "").solved, false);
  assert.equal(judge([], "  \n").solved, false);
});

test("sorry is never a solution, in either of Lean's spellings of the warning", () => {
  for (const message of ["declaration uses `sorry`", "declaration uses 'sorry'", "declaration uses sorry"]) {
    assert.equal(judge([{ severity: "warning", message, line: null }], "sorry").solved, false, message);
  }
});

test("unsolved goals is unfinished, not a wrong move; any other error is", () => {
  const unfinished = judge([{ severity: "error", message: "unsolved goals\n⊢ P", line: null }], "apply h");
  assert.deepEqual([unfinished.solved, unfinished.unfinished, unfinished.error], [false, true, null]);
  const wrong = judge([{ severity: "error", message: "Type mismatch", line: 0 }], "exact h");
  assert.equal(wrong.solved, false);
  assert.equal(wrong.unfinished, false);
  assert.equal(wrong.error?.line, 0);
});

test("a forbidden tactic is found as a whole word, outside comments", () => {
  const forbid = ["simp", "tauto", "exact?"];
  assert.deepEqual(forbiddenIn("intro h\n  simp", forbid), ["simp"]);
  assert.deepEqual(forbiddenIn("simp_all", forbid), []);
  assert.deepEqual(forbiddenIn("exact hP", forbid), []);
  assert.deepEqual(forbiddenIn("exact?", forbid), ["exact?"]);
  assert.deepEqual(forbiddenIn("intro h -- then tauto\n/- simp -/ exact h", forbid), []);
  assert.deepEqual(forbiddenIn("first | tauto | rfl", forbid), ["tauto"]);
  // A string is not a comment: neither of these hides the tactic after it.
  assert.deepEqual(forbiddenIn('have := "--"; tauto', forbid), ["tauto"]);
  assert.deepEqual(forbiddenIn('have := "/-"\ntauto\n-- -/', forbid), ["tauto"]);
  assert.deepEqual(forbiddenIn("/- a /- nested -/ tauto -/ exact h", forbid), []);
  assert.equal(judge([], "tauto", forbid).solved, false);
});

test("comments and strings are told apart the way Lean tells them", () => {
  assert.equal(lex('a -- b "c"\nd').code, "a         \nd");
  assert.equal(lex('a "-- b" c').code, 'a "-- b" c');
  assert.equal(lex('a "-- b" c').bare, "a        c");
  assert.equal(lex('a "x\\"y)" (').bare, "a         (");
  assert.equal(lex('r#"a")"# )').bare, "         )");
  assert.equal(lex("f ')' x").bare, "f     x");
  // h' is a name, not the start of a character.
  assert.equal(lex("h' ) 'x'").bare, "h' )    ");
  assert.equal(lex("/- a /- b -/ ) -/ )").bare, "                  )");
});

test("a body that would step outside a proof is refused, with the line it is on", () => {
  const names = (body: string) => escapesIn(body).map((e) => `${e.line}:${e.name}`);
  assert.deepEqual(names("apply hPQ\nexact hP"), []);
  assert.deepEqual(names("constructor\n· exact (f (g x))\n· exact ⟨a, b⟩"), []);
  assert.deepEqual(names("intro h\nrun_tac Lean.addDecl x"), ["1:run_tac", "1:Lean"]);
  assert.deepEqual(names("exact by_elab foo"), ["0:by_elab"]);
  assert.deepEqual(names("set_option debug.skipKernelTC true in\nexact h"), ["0:set_option"]);
  assert.deepEqual(names("exact hP\n#exit"), ["1:#exit"]);
  assert.deepEqual(names("native_decide"), ["0:native_decide"]);
  assert.deepEqual(names("decide +native"), ["0:+native"]);
  assert.deepEqual(names("exact lii_exercise P Q hP hPQ"), ["0:lii_exercise"]);
  assert.deepEqual(names("open Lean in exact h"), ["0:Lean"]);
  // Closing the bracket the body sits in would let commands follow.
  assert.deepEqual(names("exact hPQ hP\n)\nexample : True := (trivial"), ["1:)"]);
  assert.deepEqual(names('exact f ")" ( x )'), []);
  assert.deepEqual(names("exact f ')' )"), ["0:)"]);
  // Hidden in a comment it is only a comment; hidden in a string it is still refused.
  assert.deepEqual(names("exact hP -- run_tac"), []);
  assert.deepEqual(names('exact s!"{run_tac x}"'), ["0:run_tac"]);
  // An array literal is not a command; a name that only contains one of the words is fine.
  assert.deepEqual(names("exact #[1, 2].size_pos"), []);
  assert.deepEqual(names("exact my_run_tac_lemma h"), []);
  assert.deepEqual(names("exact LeanLike.foo"), []);
  assert.equal(judge([], "run_tac foo").solved, false);
  assert.match(judge([], "run_tac foo").refusal ?? "", /run_tac/);
});

test("the axiom report is read only from its own line, and only as a note", () => {
  const body = "apply hPQ\nexact hP"; // source lines 4 and 5, bracket 6, blank 7, report 8
  const note = (line: number, message: string) => at(line, message, "info");
  assert.deepEqual(axiomsOf([note(8, "'lii_exercise' does not depend on any axioms")], body), []);
  assert.deepEqual(axiomsOf([note(8, "'lii_exercise' depends on axioms: [propext, Classical.choice, Quot.sound]")], body), ["propext", "Classical.choice", "Quot.sound"]);
  assert.deepEqual(axiomsOf([note(8, "'lii_exercise' depends on axioms: [propext,\n Classical.choice]")], body), ["propext", "Classical.choice"]);
  assert.equal(axiomsOf([], body), null);
  // The same words from a line of the body, or as a warning, or about another name, are not the report.
  assert.equal(axiomsOf([note(5, "'lii_exercise' does not depend on any axioms")], body), null);
  assert.equal(axiomsOf([at(8, "'lii_exercise' does not depend on any axioms", "warning")], body), null);
  assert.equal(axiomsOf([note(8, "'other' does not depend on any axioms")], body), null);
  // The report is not shown to the learner as a diagnostic.
  assert.deepEqual(toBody([note(8, "'lii_exercise' does not depend on any axioms")], body), []);
});

test("solved needs the axiom report, and only the axioms of ordinary mathematics in it", () => {
  assert.equal(judge([], "exact hP", [], []).solved, true);
  assert.equal(judge([], "exact hP", [], ["propext", "Classical.choice", "Quot.sound"]).solved, true);
  const missing = judge([], "exact hP", [], null);
  assert.equal(missing.solved, false);
  assert.match(missing.refusal ?? "", /stopped before/);
  for (const axiom of ["cheatAx", "sorryAx", "Lean.ofReduceBool", "lii_exercise._native.native_decide.ax_1_1"]) {
    const v = judge([], "exact hP", [], ["propext", axiom]);
    assert.equal(v.solved, false, axiom);
    assert.ok(v.refusal?.includes(axiom), axiom);
  }
  // An unfinished or wrong proof rests on sorryAx too; that is said as what it is, not as an axiom.
  const unfinished = judge([{ severity: "error", message: "unsolved goals\n⊢ P", line: null }], "apply h", [], ["sorryAx"]);
  assert.deepEqual([unfinished.solved, unfinished.unfinished, unfinished.refusal], [false, true, null]);
});
