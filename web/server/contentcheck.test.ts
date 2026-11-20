import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import type { CheckReply } from "../shared/wire.ts";
import type { Content } from "../shared/content.ts";
import { speakableText, spokenBlocks } from "../shared/tts/speakable.ts";
import { checkSnippets, checkWithLean, classify, coverage, spokenCoverage, declarations, lessonGiven, signatureName, snippetSource, snippetsOf, whyNot } from "./contentcheck.ts";
import { LeanServer, leanProblem } from "./lean/lsp.ts";
import { loadContent } from "./loader.ts";

// `npm run check:content`: what it reads out of a lesson, and that the real
// Lean refuses what is wrong. The lessons here are fixtures in a temporary
// folder; the real content/ is only read (by the last test).

const problem = leanProblem();
const skip = problem ? `Lean is not installed: ${problem}` : false;
if (skip) console.warn(`[contentcheck.test] SKIPPED, nothing here was checked with Lean. ${skip}`);

const CURRICULUM = `tracks:
  - id: logic
    title: Logic
    summary: s
levels:
  - id: 1
    title: One
    summary: s
    moves: [exact, apply, omega]
    topics: ["Still to write"]
  - id: 2
    title: Two
    summary: s
    status: outline
    topics: [Later]
`;

const lessonFile = (id: string, front: string, body: string) => `---
id: ${id}
title: A lesson
track: logic
level: 1
order: 1
concepts: [implication, unused-concept]
summary: s
${front}---

${body}`;

const GOOD = lessonFile(
  "good",
  `given: |
  def twice (n : ℕ) : ℕ := n + n
exercises:
  - id: use-it
    title: Use it
    mode: typed
    says: Q follows.
    statement: "(P Q : Prop) (hP : P) (hPQ : P → Q) : Q"
    solution: |
      apply hPQ
      exact hP
  - id: pick
    kind: fill
    title: Pick
    says: twice 2 is 4.
    statement: ": twice 2 = 4"
    proof: |
      <gap>
    options: [rfl, "exact Nat.succ_ne_zero 3"]
    solution: rfl
`,
  `Prose.

\`\`\`lean
def twice (n : ℕ) : ℕ := n + n

#eval twice 2
\`\`\`

A statement alone, using both:

\`\`\`lean
theorem twice_eq (n : ℕ) : twice n = 2 * n
\`\`\`

\`\`\`lean
Nat.add_comm a b : a + b = b + a
\`\`\`

A state and an outline are not compiled:

\`\`\`lean
hP : P
⊢ Q
\`\`\`

\`\`\`lean
induction n with
| zero => …
\`\`\`

\`\`\`\`
\`\`\`lean
def shown_not_embedded := sorry sorry
\`\`\`
\`\`\`\`

\`\`\`text
not lean at all
\`\`\`
`,
);

const BAD = lessonFile(
  "bad",
  `exercises:
  - id: wrong
    title: Wrong
    mode: typed
    says: Q follows.
    statement: "(P Q : Prop) (hP : P) (hPQ : P → Q) : Q"
    solution: |
      exact hP
  - id: unfinished
    title: Unfinished
    mode: typed
    says: Both.
    statement: "(P Q : Prop) (hP : P) (hQ : Q) : P ∧ Q"
    solution: |
      constructor
      exact hP
  - id: too-easy
    kind: fill
    title: Two right answers
    says: One is one.
    statement: ": 1 = 1"
    proof: |
      <gap>
    options: [rfl, "norm_num"]
    solution: rfl
`,
  `\`\`\`lean
def half (n : ℕ) : ℕ := n / 2

example : half 4 = 3 := by
  decide
\`\`\`

\`\`\`lean
abs_definitely_not_a_lemma a : |a| = a
\`\`\`
`,
);

function fixture(lessons: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lii-check-"));
  fs.writeFileSync(path.join(dir, "curriculum.yaml"), CURRICULUM);
  fs.mkdirSync(path.join(dir, "lessons", "logic"), { recursive: true });
  for (const [name, text] of Object.entries(lessons)) fs.writeFileSync(path.join(dir, "lessons", "logic", name), text);
  return dir;
}

const dirs: string[] = [];
after(() => dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
const made = (lessons: Record<string, string>) => {
  const dir = fixture(lessons);
  dirs.push(dir);
  return dir;
};

test("a ```lean block is commands, a library fact's signature, or a fragment", () => {
  assert.equal(classify("def f (n : ℕ) : ℕ := n"), "commands");
  assert.equal(classify("-- a comment first\n@[simp] theorem t : True := trivial"), "commands");
  assert.equal(classify("/-- Doubles. -/\ndef dbl (n : ℕ) : ℕ := n + n"), "commands");
  assert.equal(classify("/- a note\n   on two lines -/\ntheorem t : True := trivial"), "commands");
  assert.equal(classify("def f (n : ℕ) : ℕ := n -- and so on…"), "commands", "an ellipsis in a comment is not an outline");
  for (const first of ["#eval 1 + 1", "#guard 1 + 1 = 2", "#synth Inhabited ℕ", "mutual", "opaque op : ℕ", "local notation \"x\" => 1", "open Nat in", "@[simp]", "axiom a : True", "deriving instance Repr for Foo"]) {
    assert.equal(classify(`${first}\n`), "commands", first);
  }
  assert.equal(classify("abs_lt : |a| < b ↔ -b < a ∧ a < b"), "signature");
  assert.equal(classify("abs_add_le a b : |a + b| ≤ |a| + |b|"), "signature");
  assert.equal(classify("-- The triangle inequality:\nabs_add_le a b : |a + b| ≤ |a| + |b|"), "signature");
  assert.equal(signatureName("-- The triangle inequality:\nabs_add_le a b : |a + b| ≤ |a| + |b|"), "abs_add_le");
  assert.equal(signatureName("Nat.succ_ne_zero n : n + 1 ≠ 0"), "Nat.succ_ne_zero");
  assert.equal(signatureName("div_le_iff₀ hc : a / c ≤ b ↔ a ≤ b * c"), "div_le_iff₀");
  assert.equal(signatureName("half_pos h : 0 < a / 2"), "half_pos");
  // A hypothesis is not a library fact, and a state is not a declaration.
  for (const hypothesis of ["hP : P", "h_pos : 0 < x", "hx_pos : 0 < x", "h1_le : a ≤ b", "x : ℕ\nhP : P", "P Q : Prop\n⊢ P → Q"]) assert.equal(classify(hypothesis), "fragment", hypothesis);
  assert.equal(classify("intro hP\nexact hP"), "fragment");
  assert.equal(classify("definitely := 1"), "fragment", "`def` must be the whole word");
  assert.equal(classify("induction n with\n| zero => …"), "fragment");
  assert.equal(classify("theorem t : True := by\n  …"), "fragment", "an outline is not compiled");
  assert.equal(classify("∑ i ∈ Finset.range 5, i"), "fragment");
  assert.equal(classify("-- only a comment"), "fragment");
});

test("a block of Lean is cut into its declarations, each with the name it declares", () => {
  const block = "/-- Doubles. -/\n@[simp] def dbl (n : ℕ) : ℕ :=\n  n + n\n\n@[simp]\nprivate theorem dbl_eq (n : ℕ) : dbl n = 2 * n := by\n  unfold dbl\n  omega\n\nexample : dbl 2 = 4 := rfl\n#eval dbl 3\ndef List.len : List ℕ → ℕ\n  | [] => 0\n  | _ :: xs => xs.len + 1";
  const found = declarations(block);
  assert.deepEqual(found.map((d) => d.name), ["dbl", "dbl_eq", "", "", "List.len"]);
  assert.equal(found.map((d) => d.text).join("\n"), block, "no line is lost");
  assert.ok(found[1]!.text.startsWith("@[simp]\nprivate theorem"), "an attribute on its own line stays with its declaration");
});

test("snippets are read from the lesson file with their line; a block shown inside a longer fence is not one", () => {
  const dir = made({ "good.md": GOOD });
  const content = loadContent(dir);
  assert.deepEqual(content.problems, []);
  const raw = fs.readFileSync(path.join(dir, content.lessons[0]!.file), "utf8");
  const snippets = snippetsOf(raw);
  assert.deepEqual(snippets.map((s) => s.kind), ["commands", "commands", "signature", "fragment", "fragment"]);
  const lines = raw.split("\n");
  for (const s of snippets) assert.equal(lines[s.line - 1], s.text.split("\n")[0], "the line is the snippet's first");
  // The same with Windows line ends, and with ```lean4 or words after `lean`.
  assert.deepEqual(snippetsOf(raw.replace(/\n/g, "\r\n")), snippets);
  assert.deepEqual(snippetsOf(raw.replace(/```lean\n/g, "```lean4\n")), snippets);
  assert.deepEqual(snippetsOf(raw.replace(/```lean\n/g, "```lean title\n")), snippets);
  // A block quoted in a longer fence above the real one does not take its line.
  const quoted = "---\nid: x\n---\n\n````\n```lean\ndef a := 1\n```\n````\n\n```lean\ndef a := 1\n```\n";
  assert.deepEqual(snippetsOf(quoted), [{ text: "def a := 1", kind: "commands", line: 12 }]);
  assert.equal(lessonGiven(raw), "def twice (n : ℕ) : ℕ := n + n");
  assert.equal(lessonGiven("no frontmatter"), "");
});

test("the file Lean is given: the given at the top as exercises have it, snippets in order, statements completed", () => {
  const given = "@[simp] def twice (n : ℕ) : ℕ := n + n";
  const text = (t: string, line = 1) => ({ text: t, kind: classify(t), line });
  const src = snippetSource(given, [
    text("def twice (n : ℕ) : ℕ :=\n  n + n   -- shown without its attribute\n\n#eval twice 2", 10),
    text("-- A statement alone:\n@[simp] theorem twice_eq (n : ℕ) :\n    twice n = 2 * n\n\nexample (n : ℕ) : twice n = n + n\ntheorem done : True := trivial", 20),
    text("hP : P", 30),
    text("-- in the library:\nNat.add_comm a b : a + b = b + a", 40),
  ]);
  assert.deepEqual(src.problems, []);
  const out = src.source.split("\n");
  assert.deepEqual(out.slice(0, 3), ["import Mathlib import LeanIntoIt.Replay", "", given]);
  assert.deepEqual(src.given, { start: 2, length: 1 });
  assert.equal(src.spans.length, 3, "the fragment is left out");
  // A snippet that shows a given definition is compiled apart from it.
  assert.equal(out[src.spans[0]!.start - 1], "namespace LiiShown0");
  assert.equal(out[src.spans[0]!.start], "def twice (n : ℕ) : ℕ :=");
  assert.equal(out[src.spans[0]!.start + src.spans[0]!.length], "end LiiShown0");
  // Statements alone get a placeholder proof on their own last line; a whole theorem is left as it is.
  assert.deepEqual(out.slice(src.spans[1]!.start, src.spans[1]!.start + 6), [
    "-- A statement alone:",
    "@[simp] theorem twice_eq (n : ℕ) :",
    "    twice n = 2 * n := by sorry",
    "",
    "example (n : ℕ) : twice n = n + n := by sorry",
    "theorem done : True := trivial",
  ]);
  assert.equal(out[src.spans[1]!.start - 1], "", "not in a namespace: a name the library has would clash, as in the Playground");
  assert.equal(out[src.spans[2]!.start], "#check @Nat.add_comm");

  // Shown otherwise than given: said before Lean is asked.
  const differs = snippetSource(given, [text("def twice (n : ℕ) : ℕ := n * 3", 7)]);
  assert.deepEqual(differs.problems.map((p) => [p.snippet.line, p.message]), [[7, "`twice` is shown differently from the lesson's `given`, which is what the exercises use"]]);
});

test("why a reference solution was not accepted is said in a sentence", () => {
  const base: CheckReply = { solved: false, goals: [], cursorGoals: null, error: null, diagnostics: [], forbidden: [], refusal: null };
  assert.match(whyNot({ ...base, forbidden: ["simp"] }), /uses `simp`, which the exercise forbids/);
  assert.equal(whyNot({ ...base, refusal: "It rests on an axiom." }), "It rests on an axiom.");
  assert.match(whyNot({ ...base, error: { severity: "error", message: "type mismatch\n  hP", line: 1 } as CheckReply["error"] }), /at line 2 of the solution: type mismatch ⏎ hP/);
  assert.match(whyNot({ ...base, goals: [{ hypotheses: [], target: "Q" }] }), /leaves a goal unproved: ⊢ Q/);
});

test("gaps: untested concepts, moves no exercise uses, empty levels, topics to write", () => {
  const content = loadContent(made({ "good.md": GOOD }));
  assert.deepEqual(coverage(content), {
    untested: [{ concept: "unused-concept", lesson: "good" }],
    // `exact` and `apply` are used by a solution; `omega` by none. Level 2 is an outline.
    unexercised: [{ level: 1, moves: ["omega"] }],
    empty: [2],
    topics: [
      { level: 1, topic: "Still to write" },
      { level: 2, topic: "Later" },
    ],
  });
});

// One Lean for the tests below: each server pays for its own Mathlib. It has
// the app's own limit (20 s): a shorter one let an ordinary check time out
// when the rest of the suite loaded the machine (bead lii-z19).
let shared: LeanServer | null = null;
const lean = () => (shared ??= new LeanServer());
after(() => shared?.close());

test("Lean accepts a sound lesson: its solutions, its wrong option, its snippets and the fact it names", { skip }, async () => {
  const dir = made({ "good.md": GOOD });
  const seen: string[] = [];
  const pass = await checkWithLean(lean(), loadContent(dir), { dir, onLesson: (l, problems, n) => seen.push(`${l.id}:${problems.length}:${n.solutions}:${n.snippets}:${n.signatures}`) });
  assert.deepEqual(pass.problems, []);
  assert.deepEqual(pass.counts, { lessons: 1, solutions: 2, options: 1, snippets: 2, signatures: 1, fragments: 2 });
  assert.deepEqual(seen, ["good:0:2:2:1"]);
});

test("Lean refuses a broken lesson, and each problem names the file, the exercise or line, and Lean's reason", { skip }, async () => {
  const dir = made({ "bad.md": BAD, "good.md": GOOD.replace("order: 1", "order: 2") });
  const content = loadContent(dir);
  assert.deepEqual(content.problems, [], "the structure check alone finds nothing wrong");
  const pass = await checkWithLean(lean(), content, { dir });
  const raw = fs.readFileSync(path.join(dir, "lessons/logic/bad.md"), "utf8").split("\n");
  const line = (text: string) => raw.indexOf(text) + 1;
  assert.ok(pass.problems.every((p) => p.file === "lessons/logic/bad.md"), "the good lesson beside it has none");
  const messages = pass.problems.map((p) => p.message);
  assert.equal(messages.length, 5, messages.join("\n"));
  // A solution with an error: Lean's own message, and where.
  assert.match(messages[0]!, /^exercise "wrong": the reference solution is not accepted: Lean says, at line 1 of the solution: .*mismatch/i);
  // A solution that stops early.
  assert.match(messages[1]!, /^exercise "unfinished": the reference solution is not accepted: it leaves a goal unproved: ⊢ Q$/);
  // A "wrong" option that is right.
  assert.equal(messages[2], 'exercise "too-easy": Lean also accepts the option `norm_num`, so it is not a wrong answer');
  // A snippet that does not compile, at its line in the lesson file.
  assert.match(messages[3]!, new RegExp(`^Lean snippet at line (${line("example : half 4 = 3 := by")}|${line("  decide")}): `));
  // A library fact that does not exist.
  assert.match(messages[4]!, new RegExp(`^the library fact named at line ${line("abs_definitely_not_a_lemma a : |a| = a")}: .*abs_definitely_not_a_lemma`));

  // One lesson alone can be asked for.
  const one = await checkWithLean(lean(), content, { dir, only: ["good"] });
  assert.deepEqual([one.problems, one.counts.lessons], [[], 1]);
});

const page = (given: string, ...blocks: string[]) =>
  `---\nid: x\n${given ? `given: |\n${given.split("\n").map((l) => `  ${l}`).join("\n")}\n` : ""}---\n\nProse.\n\n${blocks.map((b) => `\`\`\`lean\n${b}\n\`\`\`\n`).join("\nMore prose.\n\n")}`;
const lineOf = (raw: string, text: string) => raw.split(/\r?\n/).indexOf(text) + 1;

test("snippets Lean must refuse, each found: nothing Lean says is dropped", { skip }, async () => {
  // An unclosed comment swallows what follows; Lean says so only at the end of the file.
  const open = page("", "def a1 := 1 /- oops", "theorem bad2 : 1 = 2 := rfl");
  const swallowed = await checkSnippets(lean(), open);
  assert.equal(swallowed.problems.length, 1, swallowed.problems.join("\n"));
  assert.match(swallowed.problems[0]!, new RegExp(`^after the Lean snippet at line ${lineOf(open, "theorem bad2 : 1 = 2 := rfl")} \\(what follows it in the lesson may not have been checked\\): .*unterminated comment`));

  // Declarations that do not start with their keyword, and commands beyond def and theorem.
  const kinds = page(
    "",
    "/-- Doubles. -/\ndef dbl (n : ℕ) : ℕ := n + nope",
    "/- a note -/\ntheorem bad1 : 1 = 2 := rfl",
    "#guard 1 + 1 = 3",
    "mutual\ndef ev : ℕ → Bool\n  | 0 => true\n  | n + 1 => od n\ndef od : ℕ → Bool\n  | 0 => false\n  | n + 1 => ev nope\nend",
    "-- in the library:\nabs_not_there_at_all a : |a| = a",
  );
  const found = await checkSnippets(lean(), kinds);
  assert.deepEqual([found.snippets, found.signatures, found.fragments], [4, 1, 0]);
  for (const first of ["def dbl (n : ℕ) : ℕ := n + nope", "theorem bad1 : 1 = 2 := rfl", "#guard 1 + 1 = 3"]) {
    assert.ok(found.problems.some((p) => p.startsWith(`Lean snippet at line ${lineOf(kinds, first)}: `)), `${first}\n${found.problems.join("\n")}`);
  }
  assert.ok(found.problems.some((p) => /^Lean snippet at line \d+: /.test(p) && Number(/line (\d+)/.exec(p)![1]) >= lineOf(kinds, "mutual")), "the mutual block");
  assert.ok(found.problems.some((p) => p.startsWith(`the library fact named at line ${lineOf(kinds, "abs_not_there_at_all a : |a| = a")}: `)));

  // A name the library already has is refused, as it would be in the Playground.
  const clash = await checkSnippets(lean(), page("", "theorem add_comm (a b : ℕ) : a + b = b + a := Nat.add_comm a b"));
  assert.match(clash.problems.join("\n"), /already been declared/);

  // A definition shown otherwise than the exercises are given it.
  const shadow = page("def twice (n : ℕ) : ℕ := n + n", "def twice (n : ℕ) : ℕ := n * 3\n\nexample : twice 2 = 6 := rfl");
  assert.deepEqual((await checkSnippets(lean(), shadow)).problems, [`Lean snippet at line ${lineOf(shadow, "def twice (n : ℕ) : ℕ := n * 3")}: \`twice\` is shown differently from the lesson's \`given\`, which is what the exercises use`]);

  // Windows line ends lose nothing.
  const crlf = page("", "def ok := 1", "def broken : ℕ := nope").replace(/\n/g, "\r\n");
  assert.match((await checkSnippets(lean(), crlf)).problems.join("\n"), new RegExp(`^Lean snippet at line ${lineOf(crlf, "def broken : ℕ := nope")}: .*nope`));
});

test("snippets Lean must accept: a given used as the exercises use it, statements alone, an author's own sections", { skip }, async () => {
  const sound = page(
    // A given that only works at the top level, where the exercises put it.
    "def List.len : List ℕ → ℕ\n  | [] => 0\n  | _ :: xs => xs.len + 1",
    "#eval [4, 7].len",
    "def List.len : List ℕ → ℕ\n  | [] => 0\n  | _ :: xs => xs.len + 1\n\n#eval [1].len",
    "-- Two statements, shown without their proofs:\n@[simp] theorem len_nil : ([] : List ℕ).len = 0\n\nexample (x : ℕ) (xs : List ℕ) : (x :: xs).len = xs.len + 1",
    "section\nvariable (n : ℕ)\nopen Nat in\ntheorem mine : n + 0 = n := by simp\nend\n\nnamespace Mine\ndef three := 3\nend Mine\n#eval Mine.three",
  );
  const result = await checkSnippets(lean(), sound);
  assert.deepEqual(result.problems, []);
  assert.equal(result.snippets, 4);
});

test("a check Lean cannot finish is that exercise's problem, and the run goes on", { skip }, async () => {
  const slow = lessonFile(
    "slow",
    `exercises:
  - id: wrong
    title: Wrong
    mode: typed
    says: Q follows.
    statement: "(P Q : Prop) (hP : P) (hPQ : P → Q) : Q"
    solution: |
      exact hP
  - id: sleepy
    kind: fill
    title: Sleepy
    says: One is one.
    statement: ": 1 = 1"
    proof: |
      <gap>
    options: [rfl, "sleep 60000"]
    solution: rfl
`,
    "Prose.\n",
  );
  const dir = made({ "a-slow.md": slow, "bad.md": BAD.replace("order: 1", "order: 2") });
  const pass = await checkWithLean(lean(), loadContent(dir), { dir });
  const messages = pass.problems.map((p) => `${p.file}: ${p.message}`);
  // The wrong solution before it is still reported,
  assert.match(messages[0]!, /^lessons\/logic\/a-slow\.md: exercise "wrong": the reference solution is not accepted/);
  // the option Lean ran out of time on is named,
  assert.match(messages[1]!, /^lessons\/logic\/a-slow\.md: exercise "sleepy": the option `sleep 60000`: Lean could not check it: Lean took longer than 20 seconds/);
  // and the lesson after it is checked in full.
  assert.equal(messages.filter((m) => m.startsWith("lessons/logic/bad.md: ")).length, 5, messages.join("\n"));
  assert.equal(pass.counts.lessons, 2);
});

const run = (dir: string, ...args: string[]) => {
  const out = spawnSync(process.execPath, [path.resolve(import.meta.dirname, "../../scripts/check-content.ts"), ...args], {
    env: { ...process.env, LEAN_INTO_IT_CONTENT_DIR: dir },
    encoding: "utf8",
  });
  return { code: out.status, text: out.stdout + out.stderr };
};

test("the command: exit codes, --no-lean, --gaps, and options it does not know", () => {
  const good = made({ "good.md": GOOD });
  const fine = run(good, "--no-lean", "--gaps");
  assert.equal(fine.code, 0, fine.text);
  assert.match(fine.text, /Structure: 1 lessons and 2 exercises read .*0 refused/);
  assert.match(fine.text, /Lean: not run \(--no-lean\)\. No solution and no snippet was checked\./);
  assert.match(fine.text, /Concepts a lesson lists that no exercise tests:\n {2}- unused-concept \(good\)/);
  assert.match(fine.text, /No problems\.\n$/);

  // What the loader refuses fails the check without Lean.
  const broken = run(made({ "x.md": GOOD.replace("track: logic", "track: nowhere") }), "--no-lean");
  assert.equal(broken.code, 1);
  assert.match(broken.text, /✖ lessons\/logic\/x\.md: .*nowhere/);
  assert.match(broken.text, /1 problem\.\n$/);

  assert.equal(run(good, "--no-lean", "--lesson", "no-such-lesson").code, 1);
  assert.equal(run(good, "--no-lean", "--lesson=good").code, 0);
  const unknown = run(good, "--nolean");
  assert.equal(unknown.code, 2);
  assert.match(unknown.text, /Unknown option --nolean\./);
  assert.equal(run(good, "--lean", "--no-lean").code, 2);
  // A word that is not an option is not ignored, and --lesson does not take a flag for an id.
  assert.match(run(good, "good").text, /Unknown option good\./);
  const flagLike = run(good, "--lesson", "--gaps");
  assert.equal(flagLike.code, 2);
  assert.match(flagLike.text, /--lesson needs a lesson id\./);
  assert.equal(run(good, "--no-lean", "--lesson").code, 2);
  const help = run(good, "--help");
  assert.equal(help.code, 0);
  assert.match(help.text, /--lesson <id>/);
});

test("the command fails on a broken reference solution, with Lean's error", { skip }, () => {
  const out = run(made({ "bad.md": BAD }), "--lesson", "bad");
  assert.equal(out.code, 1, out.text);
  assert.match(out.text, /✖ lessons\/logic\/bad\.md: exercise "wrong": the reference solution is not accepted: Lean says, at line 1 of the solution: /);
  assert.match(out.text, /Lean: 1 lessons in \d+ s\. 3 reference solutions, 1 wrong options, 1 snippets and 1 library names checked; 5 problems\./);
  assert.match(out.text, /5 problems\.\n$/);
});

test("what Listen mode cannot say well is listed per lesson: unsure formulas with no form, and symbols with no word", () => {
  const lesson = (id: string, markdown: string, says: string) => ({ id, blocks: [{ type: "prose", markdown }], exercises: [{ title: "A title", says }] });
  const content = {
    lessons: [
      lesson("one", "See `∀ m < n, P m` twice: `∀ m < n, P m`. But `rfl` and `∑ i ∈ s, f i`{say: the sum of f over s} are fine.", "Suppose a ≤ b. Then a ⊕ b."),
      lesson("two", "Nothing here but `A ∧ B`, |x| and a².", "For any a, a × 0 = 0, and `∀ m < n, Q m`."),
    ],
  } as unknown as Content;
  assert.deepEqual(spokenCoverage(content), {
    formulas: [
      { lesson: "one", code: "∀ m < n, P m", said: "for every m is less than n, P m" },
      // In a claim a form would be shown, so it is marked for rewording.
      { lesson: "two", code: "∀ m < n, Q m", said: "for every m is less than n, Q m", claim: true },
    ],
    symbols: [{ lesson: "one", symbols: ["⊕"] }],
  });
});

test("every lesson there is can be said: the spoken words line up, and nothing is left for --gaps", () => {
  const content = loadContent();
  for (const l of content.lessons) {
    for (const text of [...l.blocks.flatMap((b) => (b.type === "prose" ? [b.markdown] : [])), ...l.exercises.flatMap((e) => [e.title, e.says])]) {
      const said = speakableText(text).text;
      const words = spokenBlocks(text).flatMap((b) => b.words);
      // What is sent, split on spaces, is exactly the words the page numbers: the highlight cannot drift.
      assert.equal(words.reduce((n, w) => n + w.span, 0), said ? said.split(" ").length : 0, l.id);
      for (const w of words) assert.equal(said.split(" ").slice(w.index, w.index + w.span).join(" "), w.say, `${l.id}: ${w.text}`);
      assert.ok(!said.includes("{say"), l.id);
    }
  }
  assert.deepEqual(spokenCoverage(content), { formulas: [], symbols: [] });
});
