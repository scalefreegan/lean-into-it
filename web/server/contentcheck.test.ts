import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import type { CheckReply } from "../shared/wire.ts";
import { checkWithLean, classify, coverage, lessonGiven, snippetSource, snippetsOf, whyNot } from "./contentcheck.ts";
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
  assert.equal(classify("#eval 1 + 1"), "commands");
  assert.equal(classify("abs_lt : |a| < b ↔ -b < a ∧ a < b"), "signature");
  assert.equal(classify("abs_add_le a b : |a + b| ≤ |a| + |b|"), "signature");
  assert.equal(classify("Nat.succ_ne_zero n : n + 1 ≠ 0"), "signature");
  // A hypothesis is not a library fact, and a state is not a declaration.
  assert.equal(classify("hP : P"), "fragment");
  assert.equal(classify("x : ℕ\nhP : P"), "fragment");
  assert.equal(classify("P Q : Prop\n⊢ P → Q"), "fragment");
  assert.equal(classify("intro hP\nexact hP"), "fragment");
  assert.equal(classify("definitely := 1"), "fragment", "`def` must be the whole word");
  assert.equal(classify("induction n with\n| zero => …"), "fragment");
  assert.equal(classify("theorem t : True := by\n  …"), "fragment", "an outline is not compiled");
  assert.equal(classify("∑ i ∈ Finset.range 5, i"), "fragment");
});

test("snippets are read from the prose with their line in the file; a block shown inside a longer fence is not one", () => {
  const dir = made({ "good.md": GOOD });
  const content = loadContent(dir);
  assert.deepEqual(content.problems, []);
  const lesson = content.lessons[0]!;
  const raw = fs.readFileSync(path.join(dir, lesson.file), "utf8");
  const snippets = snippetsOf(lesson, raw);
  assert.deepEqual(snippets.map((s) => s.kind), ["commands", "commands", "signature", "fragment", "fragment"]);
  const lines = raw.split("\n");
  for (const s of snippets) assert.equal(lines[s.line - 1], s.text.split("\n")[0], "the line is the snippet's first");
  assert.equal(lessonGiven(raw), "def twice (n : ℕ) : ℕ := n + n");
  assert.equal(lessonGiven("no frontmatter"), "");

  const { source, spans } = snippetSource(lessonGiven(raw), snippets);
  assert.equal(spans.length, 3, "fragments are left out");
  const out = source.split("\n");
  assert.equal(out[0], "import Mathlib");
  assert.ok(source.includes("namespace LiiGiven\ndef twice (n : ℕ) : ℕ := n + n\nend LiiGiven\nopen LiiGiven"));
  assert.equal(out[spans[0]!.start], "def twice (n : ℕ) : ℕ := n + n");
  assert.equal(out[spans[1]!.start], "theorem twice_eq (n : ℕ) : twice n = 2 * n := by sorry", "a statement alone gets a placeholder proof");
  assert.equal(out[spans[2]!.start], "#check @Nat.add_comm", "a signature is checked by its name");
  assert.ok(!source.includes("shown_not_embedded"));
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

test("Lean accepts a sound lesson: its solutions, its wrong option, its snippets and the fact it names", { skip }, async (t) => {
  const dir = made({ "good.md": GOOD });
  const lean = new LeanServer();
  t.after(() => lean.close());
  const seen: string[] = [];
  const pass = await checkWithLean(lean, loadContent(dir), { dir, onLesson: (l, problems) => seen.push(`${l.id}:${problems.length}`) });
  assert.deepEqual(pass.problems, []);
  assert.deepEqual(pass.counts, { lessons: 1, solutions: 2, options: 1, snippets: 2, signatures: 1, fragments: 2 });
  assert.deepEqual(seen, ["good:0"]);
});

test("Lean refuses a broken lesson, and each problem names the file, the exercise or line, and Lean's reason", { skip }, async (t) => {
  const dir = made({ "bad.md": BAD, "good.md": GOOD.replace("order: 1", "order: 2") });
  const content = loadContent(dir);
  assert.deepEqual(content.problems, [], "the structure check alone finds nothing wrong");
  const lean = new LeanServer();
  t.after(() => lean.close());
  const pass = await checkWithLean(lean, content, { dir });
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
  const one = await checkWithLean(lean, content, { dir, only: ["good"] });
  assert.deepEqual([one.problems, one.counts.lessons], [[], 1]);
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
  const unknown = run(good, "--nolean");
  assert.equal(unknown.code, 2);
  assert.match(unknown.text, /Unknown option --nolean/);
  assert.equal(run(good, "--lean", "--no-lean").code, 2);
});

test("the command fails on a broken reference solution, with Lean's error", { skip }, () => {
  const out = run(made({ "bad.md": BAD }), "--lesson", "bad");
  assert.equal(out.code, 1, out.text);
  assert.match(out.text, /✖ lessons\/logic\/bad\.md: exercise "wrong": the reference solution is not accepted: Lean says, at line 1 of the solution: /);
  assert.match(out.text, /Lean: 1 lessons in \d+ s\. 3 reference solutions, 1 wrong options, 1 snippets and 1 library names checked; 5 problems\./);
  assert.match(out.text, /5 problems\.\n$/);
});
