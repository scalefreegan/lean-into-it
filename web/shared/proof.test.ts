import assert from "node:assert/strict";
import { test } from "node:test";
import { assemble, axiomsOf, replayOf, isBlank, bodyLines, endOfBody, escapesIn, forbiddenIn, isLinterRemark, judge as judgeWith, lex, ringFailures, ringNotes, toBody, toSource, type BodyDiagnostic, type Diagnostic, gapPosition, fillBody, fillProblem, GAP, gapLine } from "./proof.ts";

/** judge with nothing forbidden, Lean's report that no axiom is used, and the kernel replay's "ok", unless said otherwise. */
const judge = (diagnostics: BodyDiagnostic[], body: string, forbid: string[] = [], axioms: string[] | null = [], replay: string | null = "ok") => judgeWith(diagnostics, body, forbid, axioms, replay);

const at = (line: number, message: string, severity: Diagnostic["severity"] = "error"): Diagnostic => ({
  severity,
  message,
  start: { line, character: 0 },
  end: { line, character: 1 },
});

test("the source is the statement as a named theorem, the body in brackets under by, then the axiom report", () => {
  assert.equal(
    assemble("(P : Prop)  (hP : P) :\n P", "exact hP\n\n"),
    "import Mathlib import LeanIntoIt.Replay\n\nset_option pp.beta true in theorem lii_exercise (P : Prop) (hP : P) : P := by\n  (\n    exact hP\n  )\n\n#print axioms lii_exercise\n#lii_replay\n",
  );
});

test("an empty body is sent as a tactic that does nothing, so Lean reports the opening goal", () => {
  assert.equal(assemble("(P : Prop) : P → P", "  \n"), "import Mathlib import LeanIntoIt.Replay\n\nset_option pp.beta true in theorem lii_exercise (P : Prop) : P → P := by\n  (\n    skip\n  )\n\n#print axioms lii_exercise\n#lii_replay\n");
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
    { severity: "error", message: "Unknown identifier `hP`", line: 1, range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } } },
  ]);
});

test("where Lean pointed comes back in the body's own columns, cut off at the body's end", () => {
  const body = "apply h\nexact hP";
  const span = (startLine: number, startChar: number, endLine: number, endChar: number, message = "Unknown identifier `hP`"): Diagnostic => ({ severity: "error", message, start: { line: startLine, character: startChar }, end: { line: endLine, character: endChar } });
  // Source line 5 is body line 1, and the body is indented four columns.
  assert.deepEqual(toBody([span(5, 10, 5, 12)], body)[0].range, { start: { line: 1, character: 6 }, end: { line: 1, character: 8 } });
  // A span running past the body (into the closing bracket) ends where the body does.
  assert.deepEqual(toBody([span(4, 4, 9, 3)], body)[0].range, { start: { line: 0, character: 0 }, end: { line: 1, character: 8 } });
  // On the statement: no line and no range.
  assert.equal(toBody([span(2, 0, 2, 5, "unsolved goals\n⊢ P")], body)[0].range, undefined);
  // Blamed on another line than Lean named (a bracket left open on line 0, noticed at the axiom line): no range.
  const moved = toBody([span(9, 0, 9, 6, "unexpected token '#print'; expected ')'")], "apply (hPQ\nexact hP")[0];
  assert.equal(moved.line, 0);
  assert.equal(moved.range, undefined);
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

test("try? is switched off wherever anything is: it would run the forbidden things itself", () => {
  assert.deepEqual(forbiddenIn("try?", ["simp"]), ["try?"]);
  assert.deepEqual(forbiddenIn("intro h\n  try?", ["two_mul_le_add_sq"]), ["try?"]);
  assert.deepEqual(forbiddenIn("try?", ["simp", "try?"]), ["try?"]);
  // `try` is a different word, and an exercise that forbids nothing forbids nothing.
  assert.deepEqual(forbiddenIn("try simp at h\nexact h", ["tauto"]), []);
  assert.deepEqual(forbiddenIn("try?", []), []);
  assert.equal(judge([], "try?", ["tauto"]).solved, false);
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
  assert.deepEqual(names('exact s!"{run_tac x}"'), ["0:run_tac", "0:{"]);
  // A `{` in a string may open code Lean reads (an interpolated string), so it is refused.
  assert.deepEqual(names('have _h := s!"{ "--" }"; run_tac pure ()\nexact hP'), ["0:{"]);
  assert.ok(names('have _h := s!"{ "--" }"; skip').includes("0:{"));
  assert.ok(names('exact hP\nhave _ := "a {"').includes("1:{"));
  assert.deepEqual(names('have _ := "a \\{ b"\nexact hP'), [], "an escaped brace is a character");
  assert.deepEqual(names("exact { c with x := 1 }"), [], "braces outside strings are ordinary Lean");
  assert.deepEqual(names("exact f '{' '}'"), [], "a brace as a character literal");
  // Native evaluation written as an option, on one line or across two, after a dot or not.
  assert.deepEqual(names("exact (by decide (config := { native := true }) : True)"), ["0:native :="]);
  assert.deepEqual(names("decide (config := {native:=true})"), ["0:native :="]);
  assert.deepEqual(names("decide (config := { native\n  := true })"), ["0:native :="]);
  assert.deepEqual(names("exact (Foo.native := 1)"), ["0:native :="]);
  assert.deepEqual(names("exact { c with alternative := true }"), []);
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

test("each way to run a program is refused by name", () => {
  for (const word of ["run_tac", "run_cmd", "run_elab", "run_meta", "by_elab", "set_option", "native_decide", "unsafe"]) {
    assert.deepEqual(escapesIn(`exact hP\n${word} foo`).map((e) => `${e.line}:${e.name}`), [`1:${word}`], word);
  }
  assert.deepEqual(escapesIn("exact «run» h").map((e) => e.name), ["«»"]);
});

test("characters outside Unicode's basic plane keep every line and column where it is", () => {
  const body = "exact 𝓝 -- a note\nexact h";
  const { code, bare } = lex(body);
  assert.equal(code, "exact 𝓝" + " ".repeat(10) + "\nexact h");
  assert.equal(code.length, body.length);
  assert.equal(bare.split("\n").length, 2);
  assert.deepEqual(escapesIn("exact 𝔽 \"x\" -- run_tac\nrun_cmd x").map((e) => `${e.line}:${e.name}`), ["1:run_cmd"]);
});

test("a forbidden tactic cannot hide inside an interpolated string either", () => {
  assert.deepEqual(forbiddenIn("tauto", ["tauto"]), ["tauto"]);
  assert.deepEqual(forbiddenIn("exact hP -- tauto", ["tauto"]), [], "a real comment hides nothing to forbid");
  // The body that would hide it is refused before the forbid list is read.
  assert.ok(escapesIn('have _ := s!"{ "--" }"; tauto').some((e) => e.name === "{"));
});

test("a quote after a name, and an r after a name, do not start a literal", () => {
  // h' is a name: the bracket after it is real, not the inside of a character ')'.
  assert.equal(lex("h')' y").bare, "h')' y");
  assert.deepEqual(escapesIn("exact h')' y").map((e) => e.name), [")"]);
  // bar"…" is the name bar and an ordinary string, where \" does not end it.
  assert.equal(lex('bar"\\" )').bare, "bar" + " ".repeat(5));
  assert.equal(lex('r"\\" )').bare, " ".repeat(5) + ")");
});

test("a body of comments only is an empty proof: sent with the placeholder, never solved", () => {
  assert.equal(isBlank("-- thinking\n/- a plan -/"), true);
  assert.equal(isBlank("exact hP -- done"), false);
  assert.match(assemble("(P : Prop) : P", "-- thinking"), /\n {4}skip -- thinking\n {2}\)\n/);
  assert.deepEqual(endOfBody("-- thinking"), { line: 0, character: 4 });
  assert.equal(judge([], "-- thinking").solved, false);
});

test("an error past the end of the body is put on a line of the body", () => {
  const body = "apply hPQ\nexact (hP"; // source lines 4 and 5; Lean stumbles at the axiom line, 8
  assert.deepEqual(toBody([at(8, "unexpected token '#print'; expected ')'")], body), [{ severity: "error", message: "unexpected token '#print'; expected ')'", line: 1 }]);
});

test("something left open is blamed on the line that opened it, with the messages Lean really gives", () => {
  // Each message and source line below is what Lean 4.36 reported for that body.
  const blamed = (body: string, sourceLine: number, message: string) => toBody([at(sourceLine, message)], body)[0].line;
  const PRINT = "unexpected token '#print'; expected ')'";
  // A round bracket: Lean notices at the axiom line, past the body.
  assert.equal(blamed("apply (hPQ\nexact hP", 9, PRINT), 0);
  assert.equal(blamed("exact (hPQ hP\n-- a note", 9, PRINT), 0);
  // The last one still open, not the first; one that was closed is not blamed.
  assert.equal(blamed("exact (f x)\nintro h\nexact g (h", 10, PRINT), 2);
  assert.equal(blamed("apply (f\nexact (g\n  x)", 10, PRINT), 0);
  // A bracket inside a string or a comment is not a bracket.
  assert.equal(blamed('have s := "("\nexact (h', 9, PRINT), 1);
  assert.equal(blamed("intro h -- (\nexact (h", 9, PRINT), 1);
  // The other kinds: Lean notices on the body's last line, at the bracket the body sits in.
  assert.equal(blamed("have h : P ∧ P := ⟨hP, hP\napply hPQ\nexact hP", 6, "unexpected token ')'; expected '⟩'"), 0);
  assert.equal(blamed("simp only [hP\napply hPQ\nexact hP", 6, "unexpected token ')'; expected ']'"), 0);
  assert.equal(blamed("have h : P := by {\n  exact hP\napply hPQ\nexact h", 5, "unexpected identifier; expected '}'"), 0);
  // A bracket closed by the wrong kind of bracket was never closed.
  assert.equal(blamed("apply hPQ\nexact (f ⟨hP, hP)", 5, "unexpected token ')'; expected '⟩'"), 1);
  // Nothing open: the error stays where Lean put it, or on the last line with code.
  assert.equal(blamed("apply hPQ\nexact hP +", 5, "unexpected token ')'; expected term"), 1);
  assert.equal(blamed("intro h\nexact h\n-- note", 9, "unexpected token '#print'; expected term"), 1);
  // A comment never closed is blamed on the line where it starts.
  assert.equal(blamed("apply hPQ\n/- never closed\nexact hP", 11, "unterminated comment"), 1);
  // An ordinary error is left on its own line.
  assert.equal(blamed("apply (hPQ)\nexact hPQ", 5, "Type mismatch"), 1);
});

test("a forbidden name without a dot is found after one; a tactic's relatives are separate words", () => {
  assert.deepEqual(forbiddenIn("exact n.zero_add", ["zero_add"]), ["zero_add"]);
  assert.deepEqual(forbiddenIn("exact Nat.zero_add n", ["zero_add"]), ["zero_add"]);
  assert.deepEqual(forbiddenIn("exact hab.trans hbc", ["trans"]), ["trans"]);
  assert.deepEqual(forbiddenIn("exact Nat.dvd_trans hab hbc", ["trans"]), []);
  // A dotted name is one particular name.
  assert.deepEqual(forbiddenIn("exact n.zero_add", ["Nat.zero_add"]), []);
  assert.deepEqual(forbiddenIn("simpa", ["simp"]), []);
  assert.deepEqual(forbiddenIn("simpa", ["simp", "simpa"]), ["simpa"]);
  assert.deepEqual(forbiddenIn("rw?", ["rw?"]), ["rw?"]);
  assert.deepEqual(forbiddenIn("rw [h]", ["rw?"]), []);
});

test("an exercise's own definitions sit between the import and the theorem, and every line number moves with them", () => {
  const given = "def twice (n : ℕ) : ℕ := n + n\n\ndef thrice (n : ℕ) : ℕ := n + n + n\n";
  const source = assemble(": twice 2 = 4", "rfl", given).split("\n");
  assert.deepEqual(source.slice(0, 8), ["import Mathlib import LeanIntoIt.Replay", "", "def twice (n : ℕ) : ℕ := n + n", "", "def thrice (n : ℕ) : ℕ := n + n + n", "", "set_option pp.beta true in theorem lii_exercise : twice 2 = 4 := by", "  ("]);
  // Three lines of definitions and a blank: the body starts four lines further down.
  assert.deepEqual(toSource({ line: 0, character: 0 }, given), { line: 8, character: 4 });
  assert.equal(source[8], "    rfl");
  assert.equal(source[11], "#print axioms lii_exercise");
  const at = (line: number): Diagnostic => ({ severity: "info", message: "'lii_exercise' does not depend on any axioms", start: { line, character: 0 }, end: { line, character: 1 } });
  assert.deepEqual(axiomsOf([at(11)], "rfl", given), []);
  // The report on the line it would be on without the definitions does not count.
  assert.equal(axiomsOf([at(7)], "rfl", given), null);
  const err: Diagnostic = { severity: "error", message: "boom", start: { line: 8, character: 4 }, end: { line: 8, character: 7 } };
  assert.equal(toBody([err], "rfl", given)[0].line, 0);
  // An error inside the definitions is not on any line of the learner's.
  assert.equal(toBody([{ ...err, start: { line: 2, character: 0 } }], "rfl", given)[0].line, null);
  // No definitions: the source is what it always was.
  assert.equal(assemble(": 1 = 1", "rfl", ""), assemble(": 1 = 1", "rfl"));
});

test("a ring that left its goal open is an error in a proof Lean has not accepted, and a note everywhere else", () => {
  const ring = at(4, "Try this:\n  [apply] ring_nf\n  \n  The `ring` tactic failed to close the goal. Use `ring_nf` to obtain a normal form.", "info");
  const unsolved = at(2, "unsolved goals\na b : ℝ\n⊢ a * b * 2 + a ^ 2 + b ^ 2 = a ^ 2 + b ^ 2");
  const left = "case left\n⊢ A";
  const right = "case right\n⊢ B";
  const after = (diagnostics: Diagnostic[], goals: (string[] | null)[]) => toBody(ringFailures(diagnostics, ringNotes(diagnostics), goals), "ring");

  // The goal it ran on is still there afterwards, rewritten: the move failed.
  const open = after([ring, unsolved], [["⊢ A"], ["⊢ A'"]]);
  assert.deepEqual({ ...open[0], range: undefined }, { severity: "error", message: "The `ring` tactic failed to close the goal.", line: 0, range: undefined });
  assert.equal(judgeWith(open, "ring", [], [], "ok").error?.message, "The `ring` tactic failed to close the goal.");
  assert.equal(after([ring, unsolved], [[left, right], [left, right]])[0].severity, "error");

  // One goal fewer afterwards: its standard form closed the goal, and the error is about something else.
  assert.equal(after([ring, unsolved], [[left, right], [right]])[0].severity, "info");
  assert.equal(after([ring, unsolved], [["⊢ A"], []])[0].severity, "info");
  assert.equal(judgeWith(after([ring, unsolved], [["⊢ A"], []]), "ring", [], [], "ok").error, null);
  // Lean could not say what the goals were: nothing is called wrong on a guess.
  assert.equal(after([ring, unsolved], [null, null])[0].severity, "info");
  assert.equal(after([ring, unsolved], [])[0].severity, "info");

  // No error anywhere: Lean accepts the proof, a later line having finished from the standard form, and so do we.
  assert.deepEqual(ringNotes([ring]), []);
  assert.equal(after([ring], [["⊢ A"], ["⊢ A'"]])[0].severity, "info");
  // An error of Lean's own is never a ring note, whatever it quotes.
  assert.deepEqual(ringNotes([at(4, "The `ring` tactic failed to close the goal.")]), []);
});

test("a fill is one line that stays in its gap", () => {
  const proof = "intro h\n  rw [<gap>] at h\nlinarith";
  assert.equal(GAP, "<gap>");
  assert.equal(gapLine(proof), 1);
  assert.equal(gapLine("exact h"), -1);
  assert.equal(fillBody(proof, "  abs_lt \r"), "intro h\n  rw [abs_lt] at h\nlinarith");
  // A fill is put in as written: `$&` and the like mean nothing.
  assert.equal(fillBody("exact <gap>", "$& $1 $$"), "exact $& $1 $$");
  assert.deepEqual(gapPosition(proof), { line: 1, character: 6 });
  assert.deepEqual(gapPosition("calc a ≤ b := by <gap>\n  _ = c := h"), { line: 0, character: 17 });
  assert.equal(gapPosition("exact h"), null);

  for (const fine of ["abs_lt", "abs_add_le (a - b) (b - c)", "⟨h1, h2⟩", "simp [foo]; exact h", 'exact "a) -- b".length', "h.1 ▸ rfl"]) assert.equal(fillProblem(fine), null, fine);
  assert.match(fillProblem("abs_lt\nsorry") ?? "", /one line/);
  assert.match(fillProblem("abs_lt] at h -- ") ?? "", /comment/);
  assert.match(fillProblem("abs_lt /- ") ?? "", /comment/);
  assert.match(fillProblem("abs_lt] at h; simp [") ?? "", /“]” closes a bracket that the gap did not open/);
  assert.match(fillProblem("foo)") ?? "", /closes a bracket/);
  assert.match(fillProblem("(foo]") ?? "", /closes a bracket/);
  assert.match(fillProblem("foo (bar") ?? "", /“\(” opens a bracket that is not closed/);
  for (const open of ['"', 'exact "abc', 'r#"x', 's!"{x} and']) assert.match(fillProblem(open) ?? "", /string is opened/, open);
  assert.equal(fillProblem('s!"{x}" ++ r#"a"b"#'), null);
});

test("in a fill-the-gap exercise the forbid list is about the fill, not the proof around it", () => {
  const body = "rw [abs_lt] at h\nlinarith";
  const axioms = ["propext"];
  assert.equal(judgeWith([], body, ["linarith"], axioms, "ok").solved, false, "a whole proof may not use it");
  assert.deepEqual(judgeWith([], body, ["linarith"], axioms, "ok", "abs_lt").forbidden, []);
  assert.equal(judgeWith([], body, ["linarith"], axioms, "ok", "abs_lt").solved, true);
  assert.deepEqual(judgeWith([], body, ["abs_lt"], axioms, "ok", "abs_lt").forbidden, ["abs_lt"]);
  // Everything else is still judged on the whole body.
  assert.match(judgeWith([], "rw [abs_lt] at h\nrun_tac foo", [], axioms, "ok", "abs_lt").refusal ?? "", /run_tac/);
  assert.equal(judgeWith([], body, [], null, "ok", "abs_lt").solved, false);
});

test("solved needs the kernel replay's ok on its own line; a refusal or no report is not solved", () => {
  const body = "exact hP";
  const source = assemble("(P : Prop) (hP : P) : P", body).split("\n");
  const line = source.indexOf("#lii_replay");
  assert.equal(source[line - 1], "#print axioms lii_exercise");
  const ok = at(line, "lii-replay: ok, 1 constants", "info");
  assert.equal(replayOf([ok], body), "ok");
  assert.equal(replayOf([], body), null, "no report");
  assert.equal(replayOf([{ ...ok, start: { line: 4, character: 4 }, end: { line: 4, character: 9 } }], body), null, "an ok from the body's lines does not count");
  assert.match(replayOf([ok, at(line, "lii-replay: the kernel refused this: …")], body) ?? "", /refused/, "a refusal beats an ok");
  assert.equal(judge([], body, [], [], "ok").solved, true);
  const missing = judge([], body, [], [], null);
  assert.equal(missing.solved, false);
  assert.match(missing.refusal ?? "", /a second time/);
  const refused = judge([], body, [], [], "lii-replay: the kernel refused this");
  assert.equal(refused.solved, false);
  assert.match(refused.refusal ?? "", /refused part of it/);
  // The replay's own messages never reach the learner's lines.
  assert.deepEqual(toBody([ok, at(line, "lii-replay: the kernel refused this")], body), []);
  // Any other message on that line is Lean's about the proof, and stays.
  assert.equal(toBody([at(line, "unterminated comment")], body).length, 1);
});
