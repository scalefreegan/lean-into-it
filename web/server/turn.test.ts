import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, beforeEach, test } from "node:test";
import {
  applyCommit,
  changedPaths,
  closeWorkspace,
  commitSubject,
  commitWorkspace,
  gitRoot,
  heldNote,
  heldRefs,
  isContentFile,
  linkOnTheWay,
  openWorkspace,
  processStarted,
  readOnlyNote,
  STALE_MS,
  strayWrites,
  sweepWorkspaces,
  unsafePaths,
  workspaceBase,
  writable,
  type Ready,
} from "./turn.ts";

// Tests for the git half of Tutor lesson authoring, called directly. Every
// repository here is a throwaway under the system temp directory with its own
// identity; the three LEAN_INTO_IT_* variables point at it and are restored
// afterwards. Nothing touches this repository's git or content/.

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lii-turn-test-")));
const repo = path.join(tmp, "repo");
const content = path.join(repo, "content");
const tutorDir = path.join(tmp, "tutor");

const ENV = ["LEAN_INTO_IT_REPO_ROOT", "LEAN_INTO_IT_TUTOR_DIR", "LEAN_INTO_IT_CONTENT_DIR", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM"] as const;
const savedEnv = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
fs.writeFileSync(path.join(tmp, "gitconfig"), "");
process.env.LEAN_INTO_IT_REPO_ROOT = repo;
process.env.LEAN_INTO_IT_TUTOR_DIR = tutorDir;
process.env.LEAN_INTO_IT_CONTENT_DIR = content;
process.env.GIT_CONFIG_GLOBAL = path.join(tmp, "gitconfig");
process.env.GIT_CONFIG_SYSTEM = "/dev/null";

after(() => {
  for (const k of ENV) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  fs.rmSync(tmp, { recursive: true, force: true });
});

const cleanEnv = (): NodeJS.ProcessEnv => {
  const env = { ...process.env };
  for (const k of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR", "GIT_PREFIX", "GIT_NAMESPACE"]) delete env[k];
  return env;
};
const git = (...args: string[]): string => execFileSync("git", args, { cwd: repo, env: cleanEnv(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const gitIn = (cwd: string, ...args: string[]): string => execFileSync("git", args, { cwd, env: cleanEnv(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

const write = (rel: string, text: string): void => {
  fs.mkdirSync(path.dirname(path.join(content, rel)), { recursive: true });
  fs.writeFileSync(path.join(content, rel), text);
};
const ALPHA = "lessons/logic/alpha.md";
const NEW = "lessons/logic/more.md";

beforeEach(() => {
  fs.rmSync(repo, { recursive: true, force: true });
  fs.rmSync(tutorDir, { recursive: true, force: true });
  fs.mkdirSync(repo, { recursive: true });
  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "Test");
  git("config", "commit.gpgsign", "false");
  write("curriculum.yaml", "tracks: []\n");
  write(ALPHA, "alpha\n");
  fs.writeFileSync(path.join(repo, "app.txt"), "one\n");
  git("add", "-A");
  git("commit", "-q", "-m", "init");
});

const refs = (): string[] => git("for-each-ref", "--format=%(refname)", "refs/tutor").trim().split("\n").filter(Boolean);
const worktrees = (): number => git("worktree", "list", "--porcelain").split("\n").filter((l) => l.startsWith("worktree ")).length;
const commits = (): string[] => git("log", "--format=%s").trim().split("\n");
const ready = async (): Promise<Ready> => {
  const w = await writable();
  assert.ok(w.ok, JSON.stringify(w));
  return w;
};
const notReady = async (re: RegExp): Promise<void> => {
  const w = await writable();
  assert.ok(!w.ok, "expected read-only");
  assert.match(w.reason, re);
  assert.ok(w.fix.length > 0);
  assert.match(readOnlyNote(w), /cannot write lessons, because/);
};
const OWNER_FILE = ".lean-into-it-owner.json";

/* --------------------------------- writable -------------------------------- */

test("writable: a clean repository is ready, with the base commit, branch and content spec", async () => {
  const w = await writable();
  assert.ok(w.ok);
  assert.equal(w.spec, "content");
  assert.equal(w.base, git("rev-parse", "HEAD").trim());
  assert.equal(w.branch, "refs/heads/main");
  assert.equal(w.root, repo);
  assert.equal(gitRoot(), repo);
});

test("writable: uncommitted, staged or untracked work outside content/ does not stop it", async () => {
  fs.writeFileSync(path.join(repo, "app.txt"), "two\n");
  fs.writeFileSync(path.join(repo, "new.txt"), "new\n");
  git("add", "new.txt");
  fs.writeFileSync(path.join(repo, "scratch.txt"), "scratch\n");
  assert.ok((await writable()).ok);
});

test("writable: a modified file in content/ makes it read-only, with a readable reason", async () => {
  write(ALPHA, "owner is editing\n");
  await notReady(/content\/ has changes that are not committed \(content\/lessons\/logic\/alpha\.md\)/);
});

test("writable: an untracked file in content/ makes it read-only", async () => {
  write("lessons/logic/draft.md", "draft\n");
  await notReady(/not committed \(content\/lessons\/logic\/draft\.md\)/);
});

test("writable: a staged change in content/ makes it read-only", async () => {
  write(NEW, "new\n");
  git("add", `content/${NEW}`);
  await notReady(/not committed/);
});

test("writable: an ignored file in content/ makes it read-only, but an ignored .DS_Store does not", async () => {
  fs.writeFileSync(path.join(repo, ".git", "info", "exclude"), "private.md\n.DS_Store\n");
  write(".DS_Store", "junk");
  assert.ok((await writable()).ok);
  write("lessons/logic/private.md", "mine\n");
  await notReady(/not committed \(content\/lessons\/logic\/private\.md\)/);
});

test("writable: a detached HEAD makes it read-only", async () => {
  git("checkout", "-q", "--detach");
  await notReady(/not on a branch \(HEAD is detached\)/);
});

test("writable: a repository with no commits makes it read-only", async () => {
  fs.rmSync(path.join(repo, ".git"), { recursive: true, force: true });
  git("init", "-q", "-b", "main");
  await notReady(/no commits yet/);
});

test("writable: a merge in progress makes it read-only", async () => {
  fs.writeFileSync(path.join(repo, ".git", "MERGE_HEAD"), `${git("rev-parse", "HEAD").trim()}\n`);
  await notReady(/a merge is in progress/);
});

test("writable: a content/ reached through a symbolic link makes it read-only", async () => {
  fs.renameSync(content, path.join(tmp, "real-content"));
  fs.symlinkSync(path.join(tmp, "real-content"), content);
  await notReady(/content is a symbolic link/);
});

test("writable: a symbolic link inside content/ makes it read-only", async () => {
  fs.symlinkSync(path.join(tmp, "elsewhere"), path.join(content, "lessons", "link"));
  await notReady(/content\/ contains a symbolic link or \.git entry \(content\/lessons\/link\)/);
});

test("writable: a folder that is not a git repository makes it read-only", async () => {
  fs.rmSync(path.join(repo, ".git"), { recursive: true, force: true });
  await notReady(/not a git repository|inside another git repository/);
});

test("writable: a content directory outside the repository is refused", async () => {
  const w = await writable(repo, tmp);
  assert.ok(!w.ok);
  assert.match(w.reason, /not inside the repository/);
});

/* ------------------------------- the worktree ------------------------------ */

test("openWorkspace: makes a worktree outside the repository at the base commit, with the owner marker", async () => {
  const r = await ready();
  const ws = await openWorkspace(r);
  try {
    assert.ok(path.relative(repo, ws.dir).startsWith(".."));
    assert.ok(ws.dir.startsWith(workspaceBase(repo)));
    assert.equal(gitIn(ws.dir, "rev-parse", "HEAD").trim(), r.base);
    assert.equal(fs.readFileSync(path.join(ws.content, ALPHA), "utf8"), "alpha\n");
    const marker = JSON.parse(fs.readFileSync(path.join(ws.dir, OWNER_FILE), "utf8"));
    assert.equal(marker.pid, process.pid);
    assert.equal(marker.started, processStarted(process.pid));
    assert.equal(worktrees(), 2);
    assert.equal(git("rev-parse", "HEAD").trim(), r.base, "the repository itself did not move");
  } finally {
    closeWorkspace(ws);
  }
});

test("closeWorkspace: removes the directory and git's record of it", async () => {
  const ws = await openWorkspace(await ready());
  closeWorkspace(ws);
  assert.equal(fs.existsSync(ws.dir), false);
  assert.equal(worktrees(), 1);
  assert.deepEqual(fs.readdirSync(workspaceBase(repo)), []);
  closeWorkspace(ws); // twice is harmless
});

/* ------------------------------ commit and apply ---------------------------- */

test("a change in the worktree's content/ is committed as `agent: <summary>` and fast-forwarded into the real branch; the owner's work outside content/ is untouched", async () => {
  fs.writeFileSync(path.join(repo, "app.txt"), "two\n"); // unstaged
  fs.writeFileSync(path.join(repo, "new.txt"), "staged\n");
  git("add", "new.txt");
  fs.writeFileSync(path.join(repo, "scratch.txt"), "untracked\n");
  const outside = (): string =>
    [git("ls-files", "-s", "--", ".", ":(exclude)content"), git("diff", "--cached", "--", ".", ":(exclude)content"), git("diff", "--", ".", ":(exclude)content"), fs.readFileSync(path.join(repo, "app.txt"), "utf8"), fs.readFileSync(path.join(repo, "new.txt"), "utf8"), fs.readFileSync(path.join(repo, "scratch.txt"), "utf8")].join("\n--\n");
  const was = outside();
  const r = await ready();
  const ws = await openWorkspace(r);
  try {
    fs.writeFileSync(path.join(ws.content, NEW), "more\n");
    assert.deepEqual(await changedPaths(ws), [{ path: NEW, ignored: false }]);
    assert.deepEqual(strayWrites(ws, await changedPaths(ws)), []);
    const c = await commitWorkspace(ws, "I wrote it.\n\nChanged: added lesson more.");
    assert.ok("hash" in c, JSON.stringify(c));
    assert.equal(c.summary, "added lesson more.");
    assert.equal(gitIn(repo, "log", "-1", "--format=%s", c.hash).trim(), "agent: added lesson more.");
    assert.deepEqual(await applyCommit(ws, c.hash), { applied: true });
    assert.equal(git("rev-parse", "HEAD").trim(), c.hash);
    assert.equal(git("rev-parse", "HEAD~1").trim(), r.base);
    assert.equal(git("symbolic-ref", "HEAD").trim(), "refs/heads/main");
    assert.equal(fs.readFileSync(path.join(content, NEW), "utf8"), "more\n");
    assert.equal(git("status", "--porcelain", "--", "content"), "");
    assert.equal(outside(), was, "the owner's staged and unstaged work is byte-identical");
    assert.deepEqual(refs(), []);
  } finally {
    closeWorkspace(ws);
  }
});

test("commitWorkspace: nothing changed is skipped", async () => {
  const ws = await openWorkspace(await ready());
  try {
    assert.deepEqual(await commitWorkspace(ws, "Changed: nothing"), { skipped: true });
    assert.deepEqual(commits(), ["init"]);
  } finally {
    closeWorkspace(ws);
  }
});

test("commitWorkspace: a file written outside content/ in the worktree is not in the commit", async () => {
  const ws = await openWorkspace(await ready());
  try {
    fs.writeFileSync(path.join(ws.dir, "app.txt"), "agent was here\n");
    fs.writeFileSync(path.join(ws.dir, "stray.txt"), "stray\n");
    assert.deepEqual(await commitWorkspace(ws, "Changed: x"), { skipped: true }, "only outside files: nothing to commit");
    fs.writeFileSync(path.join(ws.content, NEW), "more\n");
    const c = await commitWorkspace(ws, "Changed: more");
    assert.ok("hash" in c, JSON.stringify(c));
    assert.deepEqual(git("show", "--name-only", "--format=", c.hash).trim().split("\n"), [`content/${NEW}`]);
  } finally {
    closeWorkspace(ws);
  }
});

test("commitWorkspace: git hooks do not run (a pre-commit hook that exits 1 does not stop it)", async () => {
  const hooks = path.join(repo, ".git", "hooks");
  fs.mkdirSync(hooks, { recursive: true });
  const marker = path.join(tmp, "hook-ran");
  for (const name of ["pre-commit", "commit-msg", "prepare-commit-msg"]) fs.writeFileSync(path.join(hooks, name), `#!/bin/sh\necho ${name} >> ${JSON.stringify(marker)}\nexit 1\n`, { mode: 0o755 });
  for (const name of ["post-commit", "post-checkout", "reference-transaction"]) fs.writeFileSync(path.join(hooks, name), `#!/bin/sh\necho ${name} >> ${JSON.stringify(marker)}\nexit 0\n`, { mode: 0o755 });
  const ws = await openWorkspace(await ready());
  try {
    fs.writeFileSync(path.join(ws.content, NEW), "more\n");
    const c = await commitWorkspace(ws, "Changed: more");
    assert.ok("hash" in c, JSON.stringify(c));
    assert.deepEqual(await applyCommit(ws, c.hash), { applied: true });
    assert.equal(fs.existsSync(marker), false, fs.existsSync(marker) ? fs.readFileSync(marker, "utf8") : "");
    assert.deepEqual(commits(), ["agent: more", "init"]);
  } finally {
    closeWorkspace(ws);
  }
});

/* ------------------------------- stray writes ------------------------------- */

test("strayWrites: flags a dot-file, a non-curriculum file, a lesson with no track folder, and an ignored file", async () => {
  fs.writeFileSync(path.join(repo, ".gitignore"), "secret.md\n");
  git("add", ".gitignore");
  git("commit", "-q", "-m", "ignore");
  const ws = await openWorkspace(await ready());
  try {
    const stray = [".hidden", "notes.txt", "lessons/x.md", "lessons/.dot/y.md", "lessons/logic/secret.md"];
    for (const p of stray) {
      fs.mkdirSync(path.dirname(path.join(ws.content, p)), { recursive: true });
      fs.writeFileSync(path.join(ws.content, p), "x\n");
    }
    fs.writeFileSync(path.join(ws.content, NEW), "fine\n");
    const changed = await changedPaths(ws);
    assert.ok(changed.find((c) => c.path === "lessons/logic/secret.md")?.ignored, JSON.stringify(changed));
    const files = strayWrites(ws, changed).map((p) => p.file).sort();
    assert.deepEqual(files, [...stray].sort());
    assert.ok(!files.includes(NEW));
  } finally {
    closeWorkspace(ws);
  }
});

test("strayWrites: flags a curriculum path that is not a regular file", async () => {
  const ws = await openWorkspace(await ready());
  try {
    fs.mkdirSync(path.join(ws.content, "lessons/logic/odd.md"), { recursive: true });
    fs.writeFileSync(path.join(ws.content, "lessons/logic/odd.md/inner.txt"), "x\n");
    assert.deepEqual(strayWrites(ws, [{ path: "lessons/logic/odd.md", ignored: false }]).map((p) => p.file), ["lessons/logic/odd.md"]);
  } finally {
    closeWorkspace(ws);
  }
});

/* ------------------------- the owner moves meanwhile ------------------------ */

/** A turn's commit, ready to apply. */
async function turn(): Promise<{ ws: Awaited<ReturnType<typeof openWorkspace>>; hash: string }> {
  const ws = await openWorkspace(await ready());
  fs.writeFileSync(path.join(ws.content, NEW), "from the tutor\n");
  const c = await commitWorkspace(ws, "Changed: added more");
  assert.ok("hash" in c, JSON.stringify(c));
  return { ws, hash: c.hash };
}

test("applyCommit: the owner editing content/ meanwhile makes it refuse; the commit is kept under refs/tutor and the owner's file stands", async () => {
  const { ws, hash } = await turn();
  try {
    write(ALPHA, "owner edit\n");
    const a = await applyCommit(ws, hash);
    assert.equal(a.applied, false);
    assert.ok(!a.applied && !a.cancelled);
    if (a.applied || a.cancelled) return;
    assert.equal(a.ref, `refs/tutor/${ws.id}`);
    assert.equal(a.state, "kept");
    assert.match(a.reason, /not committed[\s\S]*appeared while the tutor was working/);
    assert.deepEqual(refs(), [a.ref]);
    assert.equal(git("rev-parse", a.ref).trim(), hash);
    assert.equal(fs.readFileSync(path.join(content, ALPHA), "utf8"), "owner edit\n");
    assert.equal(fs.existsSync(path.join(content, NEW)), false);
    assert.deepEqual(commits(), ["init"]);
    const { held, landed } = await heldRefs(repo);
    assert.deepEqual(landed, []);
    assert.equal(held.length, 1);
    assert.equal(held[0].ref, a.ref);
    assert.equal(held[0].hash, hash);
    assert.equal(held[0].summary, "added more");
    assert.equal(held[0].staged, false);
    const note = heldNote(ws, hash, "added more", a);
    assert.match(note, /NOT put into your files/);
    assert.ok(note.includes(`git merge --ff-only ${a.ref}`));
  } finally {
    closeWorkspace(ws);
  }
});

test("applyCommit: the owner creating the same file meanwhile makes it refuse and their file stands", async () => {
  const { ws, hash } = await turn();
  try {
    write(NEW, "the owner's own version\n");
    const a = await applyCommit(ws, hash);
    assert.ok(!a.applied && !a.cancelled);
    assert.equal(fs.readFileSync(path.join(content, NEW), "utf8"), "the owner's own version\n");
    assert.deepEqual(commits(), ["init"]);
    assert.equal((await heldRefs(repo)).held.length, 1);
  } finally {
    closeWorkspace(ws);
  }
});

test("applyCommit: the branch having moved (a new commit) keeps the change and does not apply it", async () => {
  const { ws, hash } = await turn();
  try {
    fs.writeFileSync(path.join(repo, "app.txt"), "owner commit\n");
    git("commit", "-q", "-am", "owner commits meanwhile");
    const a = await applyCommit(ws, hash);
    assert.ok(!a.applied && !a.cancelled);
    if (a.applied || a.cancelled) return;
    assert.match(a.reason, /main gained or lost commits while the tutor was working/);
    assert.deepEqual(refs(), [a.ref]);
    assert.deepEqual(commits(), ["owner commits meanwhile", "init"]);
    assert.equal(fs.existsSync(path.join(content, NEW)), false);
    assert.equal(git("status", "--porcelain").trim(), "");
  } finally {
    closeWorkspace(ws);
  }
});

test("applyCommit: the repository having left the branch keeps the change", async () => {
  const { ws, hash } = await turn();
  try {
    git("checkout", "-q", "-b", "side");
    const a = await applyCommit(ws, hash);
    assert.ok(!a.applied && !a.cancelled);
    if (a.applied || a.cancelled) return;
    assert.match(a.reason, /was on main when the tutor started and is on side now/);
    assert.equal(git("symbolic-ref", "HEAD").trim(), "refs/heads/side");
    assert.equal(fs.existsSync(path.join(content, NEW)), false);
  } finally {
    closeWorkspace(ws);
  }
});

test("applyCommit: a cancelled turn is not applied and nothing is kept", async () => {
  const { ws, hash } = await turn();
  try {
    assert.deepEqual(await applyCommit(ws, hash, { cancelled: () => true }), { applied: false, cancelled: true });
    assert.deepEqual(refs(), []);
    assert.deepEqual(commits(), ["init"]);
    assert.equal(fs.existsSync(path.join(content, NEW)), false);
    // Cancelled only after the first look: the name it took is dropped again.
    let calls = 0;
    assert.deepEqual(await applyCommit(ws, hash, { cancelled: () => ++calls > 1 }), { applied: false, cancelled: true });
    assert.deepEqual(refs(), []);
    assert.deepEqual(commits(), ["init"]);
    assert.equal(fs.existsSync(path.join(content, NEW)), false);
  } finally {
    closeWorkspace(ws);
  }
});

test("heldRefs: a name whose commit is already on the branch is dropped and reported as landed", async () => {
  const { ws, hash } = await turn();
  try {
    assert.deepEqual(await applyCommit(ws, hash), { applied: true });
    git("update-ref", "refs/tutor/123-abc", hash);
    const { held, landed } = await heldRefs(repo);
    assert.deepEqual(held, []);
    assert.deepEqual(landed.map((l) => l.ref), ["refs/tutor/123-abc"]);
    assert.deepEqual(refs(), []);
  } finally {
    closeWorkspace(ws);
  }
});

/* --------------------------------- sweeping --------------------------------- */

const setOwner = (dir: string, owner: { pid: number; started: string } | null): void => {
  const file = path.join(dir, OWNER_FILE);
  if (owner) fs.writeFileSync(file, JSON.stringify(owner));
  else fs.rmSync(file, { force: true });
};
const leftovers = (): string[] => fs.readdirSync(workspaceBase(repo)).sort();

test("sweepWorkspaces: removes a dead process's directory, keeps a live other process's, ages out unmarked ones, skips `keep`", async () => {
  const r = await ready();
  const twoHoursAgo = Date.now() - 2 * 60 * 60_000;
  const other = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  try {
    for (let i = 0; i < 100 && !processStarted(other.pid!); i++) await new Promise((res) => setTimeout(res, 50));
    const otherStarted = processStarted(other.pid!);
    assert.ok(otherStarted, "the other process is visible to ps");
    const alive = await openWorkspace(r, twoHoursAgo);
    setOwner(alive.dir, { pid: other.pid!, started: otherStarted });
    // The pid is running, but is not the process that made the worktree.
    const dead = await openWorkspace(r, Date.now() - 60_000);
    setOwner(dead.dir, { pid: other.pid!, started: "Thu Jan  1 00:00:00 1970" });
    const unmarkedOld = await openWorkspace(r, twoHoursAgo + 1);
    setOwner(unmarkedOld.dir, null);
    const unmarkedNew = await openWorkspace(r, Date.now() - 1000);
    setOwner(unmarkedNew.dir, null);
    const mine = await openWorkspace(r);
    assert.equal(worktrees(), 6);
    assert.ok(STALE_MS > 0);

    // dead + unmarkedOld go; alive, unmarkedNew and keep stay.
    assert.equal(sweepWorkspaces({ root: repo, keep: mine.dir }), 2);
    assert.deepEqual(leftovers(), [alive.id, mine.id, unmarkedNew.id].sort());
    assert.equal(worktrees(), 4);
    assert.equal(fs.existsSync(dead.dir), false);
    assert.equal(fs.existsSync(unmarkedOld.dir), false);

    // Without `keep`, the turn's own process's worktree is a leftover too.
    assert.equal(sweepWorkspaces({ root: repo }), 1);
    assert.deepEqual(leftovers(), [alive.id, unmarkedNew.id].sort());

    // A short maxAgeMs ages the fresh unmarked one out; the live one stays.
    assert.equal(sweepWorkspaces({ root: repo, maxAgeMs: 100, now: Date.now() + 1000 }), 1);
    assert.deepEqual(leftovers(), [alive.id]);

    other.kill("SIGKILL");
    for (let i = 0; i < 100 && processStarted(other.pid!) !== ""; i++) await new Promise((res) => setTimeout(res, 50));
    assert.equal(sweepWorkspaces({ root: repo }), 1);
    assert.deepEqual(leftovers(), []);
    assert.equal(worktrees(), 1);

    // Names that are not this app's are left alone.
    fs.mkdirSync(path.join(workspaceBase(repo), "something-else"));
    assert.equal(sweepWorkspaces({ root: repo, maxAgeMs: 0 }), 0);
    assert.deepEqual(leftovers(), ["something-else"]);
  } finally {
    other.kill("SIGKILL");
  }
});

test("sweepWorkspaces: drops git's record of a worktree of ours whose folder is gone, and leaves the owner's own worktree alone", async () => {
  const ownWt = path.join(tmp, "owners-worktree");
  git("worktree", "add", "-q", "-b", "feature", ownWt);
  const ws = await openWorkspace(await ready());
  fs.rmSync(ws.dir, { recursive: true, force: true });
  assert.equal(worktrees(), 3);
  assert.equal(sweepWorkspaces({ root: repo, maxAgeMs: 0 }), 0);
  assert.equal(worktrees(), 2, "our stale record is gone, the owner's is not");
  assert.equal(gitIn(ownWt, "symbolic-ref", "HEAD").trim(), "refs/heads/feature");
});

/* ------------------------------- pure helpers ------------------------------- */

test("isContentFile: only curriculum.yaml and lessons/<track>/<name>.md", () => {
  for (const ok of ["curriculum.yaml", "lessons/logic/alpha.md", "lessons/a/b-c.md"]) assert.equal(isContentFile(ok), true, ok);
  for (const no of ["notes.txt", "lessons/x.md", "lessons/logic/deep/x.md", "lessons/logic/x.txt", "other/curriculum.yaml", "curriculum.yml", ".hidden", "lessons/logic/"]) assert.equal(isContentFile(no), false, no);
});

test("commitSubject: the last Changed: line, markdown stripped, cut to 72 characters", () => {
  assert.equal(commitSubject("Done.\n\nChanged: added a lesson on modus ponens."), "added a lesson on modus ponens.");
  assert.equal(commitSubject("Changed: first\nmore text\n**Changed:** second"), "second");
  assert.equal(commitSubject("- Changed: bulleted"), "bulleted");
  assert.equal(commitSubject("I did stuff\nand the last line"), "and the last line");
  assert.equal(commitSubject(""), "content edited");
  const long = commitSubject(`Changed: ${"word ".repeat(40)}`);
  assert.ok(long.length <= 72 && long.endsWith("…"), long);
});

test("unsafePaths: finds symbolic links and .git entries, with a limit", () => {
  const dir = path.join(tmp, "unsafe");
  fs.mkdirSync(path.join(dir, "a", ".git"), { recursive: true });
  fs.mkdirSync(path.join(dir, "b"), { recursive: true });
  fs.writeFileSync(path.join(dir, "b", "plain.md"), "x");
  fs.symlinkSync(tmp, path.join(dir, "b", "link"));
  assert.deepEqual(unsafePaths(dir).sort(), ["a/.git", "b/link"]);
  assert.equal(unsafePaths(dir, 1).length, 1);
  assert.deepEqual(unsafePaths(path.join(tmp, "does-not-exist")), []);
});

test("linkOnTheWay: names the first symbolic link between the root and the directory, else null", () => {
  const root = path.join(tmp, "way");
  fs.mkdirSync(path.join(root, "a", "b"), { recursive: true });
  fs.symlinkSync(path.join(root, "a"), path.join(root, "alias"));
  assert.equal(linkOnTheWay(root, path.join(root, "a", "b")), null);
  assert.equal(linkOnTheWay(root, path.join(root, "alias", "b")), "alias");
  assert.equal(linkOnTheWay(root, path.join(root, "missing", "x")), null);
});

test("readOnlyNote and heldNote: say why, and how to take or drop the change", () => {
  assert.equal(readOnlyNote({ ok: false, reason: "r", fix: "Do f." }), "The Tutor can answer questions right now but cannot write lessons, because r. Do f.");
  const ws = { branch: "refs/heads/main", spec: "content" };
  const kept = heldNote(ws, "a".repeat(40), "s", { ref: "refs/tutor/1-x", reason: "why", state: "kept" });
  assert.match(kept, /NOT put into your files, because why/);
  assert.match(kept, /git merge --ff-only refs\/tutor\/1-x/);
  assert.match(kept, /git update-ref -d refs\/tutor\/1-x/);
  assert.match(heldNote(ws, "b".repeat(40), "s", { ref: "refs/tutor/1-x", reason: "why", state: "staged" }), /NOT committed to your branch[\s\S]*git restore --staged/);
  assert.match(heldNote(ws, "c".repeat(40), "s", { ref: "c".repeat(40), reason: "why", state: "unnamed" }), /unnamed commit/);
});
