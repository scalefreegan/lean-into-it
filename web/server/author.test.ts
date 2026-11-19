import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { Readable } from "node:stream";
import { test } from "node:test";
import { buildArgs } from "../../scripts/claude.mjs";
import { ensureLearner } from "../../scripts/db/progress.ts";
import { authorRepo, LESSON_FILE, withExercise } from "../../scripts/tests/authorrepo.mjs";
import { freshDb } from "../../scripts/tests/testdb.mjs";
import type { TutorReply } from "../shared/wire.ts";
import { exerciseLean, lostIds, newProblems, refusedLean, turnProblems } from "./author.ts";
import { setDb } from "./db.ts";
import { loadContent } from "./loader.ts";
import { AUTHOR_PROMPT, authoringRoot, handleTutor, setAgent, setGate, systemPrompt, type Agent, type Gate } from "./tutor.ts";

// Lesson authoring without a real agent or Lean: the agent is a stand-in
// that writes files in the worktree it is given, and the gate is a stand-in
// for Lean's verdict. Every repository here is a throwaway
// (scripts/tests/authorrepo.mjs). The real gate, with the real Lean, is in
// lean.test.ts; the git mechanics are in turn.test.ts.

function call(body: unknown): Promise<{ status: number; reply: TutorReply }> {
  const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), { method: "POST", headers: {}, url: "/" }) as unknown as IncomingMessage;
  let status = 0;
  let text = "";
  const res = Object.assign(new EventEmitter(), {
    destroyed: false,
    writeHead(code: number) {
      status = code;
      return this;
    },
    end(chunk?: string) {
      text = chunk ?? "";
    },
  }) as unknown as ServerResponse;
  return handleTutor(req, res).then(
    () => ({ status, reply: JSON.parse(text) as TutorReply }),
    (e: { status?: number; message: string }) => ({ status: e.status ?? 500, reply: { messages: [], line: null, error: e.message } as TutorReply }),
  );
}

const accepts: Gate = async () => ({ problems: [], lessons: 1, solutions: 1 });

async function setup(t: { after: (fn: () => Promise<void> | void) => void }, agent: Agent, gate: Gate = accepts) {
  const repo = authorRepo();
  const fresh = await freshDb();
  setDb(fresh.db);
  setAgent(agent);
  setGate(gate);
  t.after(async () => {
    setAgent(null);
    setGate(null);
    setDb(null);
    await fresh.close();
    repo.close();
  });
  await ensureLearner(fresh.db);
  return repo;
}

const ask = { message: "write one more exercise on if-then", context: { page: "lesson", lessonId: "logic-1-if-then" } };
const notes = (r: TutorReply) => r.messages.filter((m) => m.role === "note").map((m) => m.text);

test("under the test runner a turn may write only into a repository the test names, never this one", () => {
  assert.equal(authoringRoot({ NODE_TEST_CONTEXT: "child-v8" }), null);
  assert.equal(authoringRoot({ LEAN_INTO_IT_AUTHORING: "off" }), null);
  assert.equal(typeof process.env.NODE_TEST_CONTEXT, "string", "node --test marks its children; authoringRoot relies on it");
  assert.equal(authoringRoot(), null);
});

test("a request to write: the agent writes in a copy outside the repository, and one commit touching only content/ lands", async (t) => {
  const seen: { cwd: string; system: string; inside: boolean }[] = [];
  const repo = await setup(t, async ({ workspace, systemPrompt: system }) => {
    assert.ok(workspace, "a writing turn has a worktree");
    seen.push({ cwd: workspace.dir, system, inside: !path.relative(repo.root, workspace.dir).startsWith("..") });
    const file = path.join(workspace.content, LESSON_FILE);
    fs.writeFileSync(file, withExercise(fs.readFileSync(file, "utf8"), { id: "one-more" }));
    // A write outside content/ in the copy never reaches the commit.
    fs.writeFileSync(path.join(workspace.dir, "notes.txt"), "scribbled\n");
    // While the agent works, the repository is as it was (the owner's own unsaved file aside).
    assert.equal(repo.git("status", "--porcelain"), "M notes.txt");
    return "I added an exercise to “If… then”.\n\nChanged: one more exercise on if-then";
  });
  fs.writeFileSync(path.join(repo.root, "notes.txt"), "the owner's unsaved work\n");
  const base = repo.git("rev-parse", "HEAD");
  const { status, reply } = await call(ask);
  assert.equal(status, 200);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].inside, false);
  assert.ok(seen[0].system.includes(AUTHOR_PROMPT) && seen[0].system.includes(seen[0].cwd), "the prompt says it may write, and names its copy");
  // One commit on top of where it started, only content/.
  assert.equal(repo.git("rev-parse", "HEAD^"), base);
  assert.equal(repo.git("log", "-1", "--format=%s"), "agent: one more exercise on if-then");
  assert.equal(repo.git("diff-tree", "-r", "--name-only", "HEAD^", "HEAD"), `content/${LESSON_FILE}`);
  assert.ok(reply.commit && repo.git("rev-parse", "HEAD").startsWith(reply.commit.hash));
  assert.equal(reply.commit.summary, "one more exercise on if-then");
  assert.deepEqual(reply.messages.map((m) => m.role), ["user", "assistant", "note"]);
  assert.match(notes(reply)[0], /^Committed [0-9a-f]{7}: one more exercise on if-then\./);
  // The exercise is live, the owner's other work untouched, the copy gone.
  assert.ok(loadContent(repo.content).lessons.find((l) => l.id === "logic-1-if-then")!.exercises.some((e) => e.id === "one-more"));
  assert.equal(fs.readFileSync(path.join(repo.root, "notes.txt"), "utf8"), "the owner's unsaved work\n");
  assert.equal(repo.git("status", "--porcelain"), "M notes.txt");
  assert.deepEqual(repo.copies(), []);
  assert.equal(repo.git("for-each-ref", "refs/tutor/"), "");
});

test("a question that writes nothing commits nothing", async (t) => {
  const repo = await setup(t, async () => "An if-then is used with apply.");
  const base = repo.git("rev-parse", "HEAD");
  const { reply } = await call({ message: "what is an if-then?", context: { page: "path" } });
  assert.deepEqual(reply.messages.map((m) => m.role), ["user", "assistant"]);
  assert.equal(reply.commit, null);
  assert.equal(repo.git("rev-parse", "HEAD"), base);
  assert.deepEqual(repo.copies(), []);
});

test("Lean refuses an exercise: the Tutor gets one repair turn, and a repaired turn is committed", async (t) => {
  const prompts: string[] = [];
  let verdicts = 0;
  const repo = await setup(
    t,
    async ({ workspace, prompt }) => {
      prompts.push(prompt);
      const file = path.join(workspace!.content, LESSON_FILE);
      if (prompts.length === 1) fs.writeFileSync(file, withExercise(fs.readFileSync(file, "utf8"), { id: "one-more", solution: "exact hP" }));
      else fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("      exact hP\n---", "      apply hPQ\n      exact hP\n---"));
      return prompts.length === 1 ? "Added.\nChanged: an exercise" : "Corrected the solution.\nChanged: one more exercise, corrected";
    },
    async () => (++verdicts === 1 ? { problems: [{ file: LESSON_FILE, message: 'exercise "one-more": the reference solution is not accepted: Lean says: type mismatch' }], lessons: 1, solutions: 1 } : { problems: [], lessons: 1, solutions: 1 }),
  );
  const { reply } = await call(ask);
  assert.equal(prompts.length, 2);
  assert.match(prompts[1], /REFUSES what you wrote[\s\S]*content\/lessons\/logic\/1-01-if-then\.md: exercise "one-more": the reference solution is not accepted/);
  assert.match(prompts[1], /\[TUTOR\]\nAdded\./, "the repair turn sees its own first reply");
  assert.equal(repo.git("log", "-1", "--format=%s"), "agent: one more exercise, corrected");
  assert.equal(reply.messages.find((m) => m.role === "assistant")!.text.startsWith("Corrected the solution."), true);
});

test("still refused after the repair turn: nothing lands, nothing is committed, and the chat says what failed", async (t) => {
  let runs = 0;
  const repo = await setup(
    t,
    async ({ workspace }) => {
      runs++;
      const file = path.join(workspace!.content, LESSON_FILE);
      if (runs === 1) fs.writeFileSync(file, withExercise(fs.readFileSync(file, "utf8"), { id: "one-more", solution: "exact hP" }));
      return "Added.\nChanged: an exercise";
    },
    async () => ({ problems: [{ file: LESSON_FILE, message: 'exercise "one-more": the reference solution is not accepted: Lean says: type mismatch' }], lessons: 1, solutions: 1 }),
  );
  const base = repo.git("rev-parse", "HEAD");
  const { reply } = await call(ask);
  assert.equal(runs, 2);
  assert.equal(reply.commit, null);
  assert.match(notes(reply)[0], /could not accept one file the Tutor wrote, even after a second try:\n- content\/lessons\/logic\/1-01-if-then\.md: exercise "one-more": the reference solution is not accepted[\s\S]*thrown away[\s\S]*content\/ was never touched/);
  assert.equal(repo.git("rev-parse", "HEAD"), base);
  assert.equal(repo.git("status", "--porcelain"), "");
  assert.deepEqual(repo.copies(), []);
  assert.equal(repo.git("for-each-ref", "refs/tutor/"), "");
});

test("what the loader refuses, a renamed exercise id, or a file that is no curriculum file never reaches Lean, and never lands", async (t) => {
  const kinds = [
    { write: (c: string) => fs.writeFileSync(path.join(c, LESSON_FILE), fs.readFileSync(path.join(c, LESSON_FILE), "utf8").replace("  - id: use-it\n", "  - id: use-it-renamed\n").replace(/^(```exercise\n(?:id: )?)use-it$/m, "$1use-it-renamed")), says: /exercise id removed or renamed: use-it\./ },
    { write: (c: string) => fs.writeFileSync(path.join(c, LESSON_FILE), fs.readFileSync(path.join(c, LESSON_FILE), "utf8").replace("moves: [apply, exact]", "moves: [no-such-move]")), says: /1-01-if-then\.md: /},
    { write: (c: string) => fs.writeFileSync(path.join(c, "notes.md"), "a note\n"), says: /notes\.md: this is not a curriculum file/ },
    { write: (c: string) => fs.writeFileSync(path.join(c, "lessons", "logic", ".hidden.md"), "x\n"), says: /\.hidden\.md: files and folders whose name starts with a dot/ },
  ];
  for (const [i, kind] of kinds.entries()) await t.test(`kind ${i + 1}`, async (t) => {
    let asked = 0;
    const repo = await setup(
      t,
      async ({ workspace }) => {
        kind.write(workspace!.content);
        return "Done.\nChanged: something";
      },
      async () => {
        asked++;
        return { problems: [], lessons: 0, solutions: 0 };
      },
    );
    const base = repo.git("rev-parse", "HEAD");
    const { reply } = await call(ask);
    assert.match(notes(reply).join("\n"), kind.says);
    assert.equal(asked, 0, "Lean is asked only about what the loader accepts");
    assert.equal(repo.git("rev-parse", "HEAD"), base);
    assert.equal(repo.git("status", "--porcelain"), "");
  });
});

test("uncommitted changes in content/: the turn is read-only, in the repository, and says why, once", async (t) => {
  const runs: { workspace: unknown; system: string }[] = [];
  const repo = await setup(t, async ({ workspace, systemPrompt: system }) => {
    runs.push({ workspace, system });
    return "I cannot write right now.";
  });
  fs.appendFileSync(path.join(repo.content, LESSON_FILE), "\nA sentence the owner is still writing.\n");
  const first = await call(ask);
  assert.equal(runs[0].workspace, null);
  assert.match(runs[0].system, /This turn is read-only: you have no Write or Edit tool, because content\/ has changes that are not committed \(content\/lessons\/logic\/1-01-if-then\.md\)/);
  assert.ok(!runs[0].system.includes(AUTHOR_PROMPT));
  assert.deepEqual(first.reply.messages.map((m) => m.role), ["user", "note", "assistant"]);
  assert.match(notes(first.reply)[0], /^The Tutor can answer questions right now but cannot write lessons, because content\/ has changes that are not committed .*git add content && git commit/);
  assert.equal(first.reply.commit, null);
  // Not said again after the next question.
  assert.deepEqual((await call(ask)).reply.messages.map((m) => m.role), ["user", "assistant"]);
  assert.equal(repo.git("status", "--porcelain"), `M content/${LESSON_FILE}`);
  assert.deepEqual(repo.copies(), []);
});

test("a hint is never a writing turn", async (t) => {
  let got: unknown = "unset";
  const repo = await setup(t, async ({ workspace }) => {
    got = workspace;
    return "Look at what the goal is.";
  });
  await call({ hint: 1, context: { page: "lesson", lessonId: "logic-1-if-then", exerciseId: "use-it", body: "" } });
  assert.equal(got, null);
  assert.deepEqual(repo.copies(), []);
});

test("a turn that dies after writing: nothing lands, and the note says the copy was thrown away", async (t) => {
  const repo = await setup(t, async ({ workspace }) => {
    const file = path.join(workspace!.content, LESSON_FILE);
    fs.writeFileSync(file, withExercise(fs.readFileSync(file, "utf8"), { id: "one-more" }));
    throw new Error("the Tutor took longer than 600 seconds");
  });
  const base = repo.git("rev-parse", "HEAD");
  const { reply } = await call(ask);
  assert.match(notes(reply)[0], /^The Tutor did not answer \(the Tutor took longer than 600 seconds\)\. What it had written so far was in a separate copy and has been thrown away/);
  assert.equal(repo.git("rev-parse", "HEAD"), base);
  assert.equal(repo.git("status", "--porcelain"), "");
  assert.deepEqual(repo.copies(), []);
});

test("ids progress is keyed on: a lost lesson, exercise or concept id is a problem; a new one is not", () => {
  const before = loadContent();
  const lesson = before.lessons.find((l) => l.id === "logic-1-if-then")!;
  const others = before.lessons.filter((l) => l !== lesson);
  assert.deepEqual(turnProblems(before, before), []);
  const added = { ...before, lessons: [...others, { ...lesson, exercises: [...lesson.exercises, { ...lesson.exercises[0], id: "new" }] }] };
  assert.deepEqual(lostIds(before, added), []);
  const dropped = { ...before, lessons: [...others, { ...lesson, exercises: lesson.exercises.slice(1) }] };
  assert.match(lostIds(before, dropped)[0].message, /^exercise id removed or renamed: use-it\./);
  const renamed = { ...before, lessons: [...others, { ...lesson, id: "logic-1-implication" }] };
  assert.match(lostIds(before, renamed)[0].message, /^lesson id "logic-1-if-then" no longer exists/);
  const concept = lesson.concepts[0];
  const untaught = { ...before, lessons: before.lessons.map((l) => ({ ...l, concepts: l.concepts.filter((c) => c !== concept), exercises: l.exercises.map((e) => (e.concept === concept ? { ...e, concept: "another" } : e)) })) };
  assert.match(lostIds(before, untaught).at(-1)!.message, new RegExp(`^concept id no longer taught by any lesson: ${concept}\\.`));
  assert.deepEqual(newProblems([{ file: "a", message: "old" }], [{ file: "a", message: "old" }, { file: "a", message: "new" }]), [{ file: "a", message: "new" }]);
});

test("the word filter reads a lesson's Lean before Lean does: what runs a program is named, a plain proof is not", () => {
  const before = loadContent();
  const lesson = before.lessons.find((l) => l.id === "logic-1-if-then")!;
  const plain = lesson.exercises[0];
  assert.match(exerciseLean(plain), /^example \(P Q : Prop\) \(hP : P\) \(hPQ : P → Q\) : Q := by\n  apply hPQ\n  exact hP/);
  assert.deepEqual([...refusedLean(lesson, "")], []);
  const sly = { ...lesson, exercises: [{ ...plain, id: "sly", given: '#eval IO.println "hi"', solution: "run_tac pure ()" }] };
  assert.deepEqual([...refusedLean(sly, "").keys()].sort(), ["#eval", "IO", "run_tac"]);
  // A lesson's compiled snippets are read too; a fragment is only shown.
  assert.deepEqual([...refusedLean({ ...lesson, exercises: [] }, "---\nid: x\n---\n\n```lean\n#eval 1 + 1\n```\n").keys()], ["#eval"]);
});

test("a writing run: Edit and Write exist, granted only under the copy's content/, with .git inside it denied", () => {
  const args = buildArgs({ systemPrompt: "s", mcpConfigPath: "/tmp/x/mcp.json", repoRoot: "/w/copy", write: { contentDir: "/w/copy/content" } });
  const after = (flag: string) => args.slice(args.indexOf(flag) + 1, args.findIndex((a, i) => i > args.indexOf(flag) && a.startsWith("--")));
  assert.deepEqual(after("--tools"), ["Read,Glob,Grep,Edit,Write"]);
  assert.deepEqual(after("--allowedTools"), ["Read", "Glob", "Grep", "Edit(//w/copy/content/**)", "Write(//w/copy/content/**)"]);
  const denied = after("--disallowedTools");
  for (const t of ["Bash", "WebFetch", "MultiEdit", "NotebookEdit", "Edit(//w/copy/content/**/.git/**)", "Write(//w/copy/content/.git)", "Read(//w/copy/.env*)"]) assert.ok(denied.includes(t), t);
  assert.ok(!denied.includes("Edit") && !denied.includes("Write"));
  // A read-only run is as it was: no write tool at all.
  assert.deepEqual(buildArgs({ repoRoot: "/r" }).slice(buildArgs({ repoRoot: "/r" }).indexOf("--tools") + 1)[0], "Read,Glob,Grep");
  for (const bad of ["/elsewhere/content", "/w/copy", "/w/copy/con tent", "/w/copy/a)b"]) assert.throws(() => buildArgs({ repoRoot: "/w/copy", write: { contentDir: bad } }), /content directory must be inside/, bad);
  assert.match(systemPrompt(loadContent(), false, { root: "/w/copy", author: true, lean: true }), /You may Read, Glob and Grep this repository \(\/w\/copy\)[\s\S]*You cannot run commands\. When[\s\S]*lean_check tool in this turn[\s\S]*Writing lessons\./);
});
