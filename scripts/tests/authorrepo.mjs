// A throwaway git repository holding a copy of content/, for the tests of
// lesson authoring: the Tutor's worktrees and commits are made there and
// never in this repository. `authorRepo()` points the app at it through the
// environment and puts everything back in `close()`.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT } from "../env.mjs";

const ENV = ["LEAN_INTO_IT_REPO_ROOT", "LEAN_INTO_IT_TUTOR_DIR", "LEAN_INTO_IT_CONTENT_DIR", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM"];

export function authorRepo() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lii-author-test-")));
  const root = path.join(tmp, "repo");
  const content = path.join(root, "content");
  fs.mkdirSync(root);
  fs.cpSync(path.join(ROOT, "content"), content, { recursive: true });
  // What the Tutor is told to read; copied into its worktree from the live tree.
  fs.mkdirSync(path.join(root, "docs"));
  fs.writeFileSync(path.join(root, "docs", "CONTENT.md"), "the format\n");
  fs.writeFileSync(path.join(root, "notes.txt"), "the owner's own file\n");
  const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  fs.writeFileSync(path.join(tmp, "gitconfig"), "");
  Object.assign(process.env, { LEAN_INTO_IT_REPO_ROOT: root, LEAN_INTO_IT_TUTOR_DIR: path.join(tmp, "tutor"), LEAN_INTO_IT_CONTENT_DIR: content, GIT_CONFIG_GLOBAL: path.join(tmp, "gitconfig"), GIT_CONFIG_SYSTEM: "/dev/null" });
  const git = (...args) => {
    const env = { ...process.env };
    for (const k of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR", "GIT_PREFIX", "GIT_NAMESPACE"]) delete env[k];
    return execFileSync("git", args, { cwd: root, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  };
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Test Owner");
  git("config", "user.email", "owner@example.invalid");
  git("add", "-A");
  git("commit", "-q", "-m", "the curriculum");
  return {
    root,
    content,
    git,
    /** Worktrees still standing under the Tutor's own folder. */
    copies: () => {
      try {
        return fs.readdirSync(path.join(tmp, "tutor")).flatMap((d) => fs.readdirSync(path.join(tmp, "tutor", d)));
      } catch {
        return [];
      }
    },
    close() {
      for (const k of ENV) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
      fs.rmSync(tmp, { recursive: true, force: true });
    },
  };
}

/** The lesson the tests write into, and an exercise to add to it. */
export const LESSON_FILE = "lessons/logic/1-01-if-then.md";

/** A lesson file's text with one more exercise at the end of its list. */
export function withExercise(raw, { id, statement = "(P Q : Prop) (hP : P) (hPQ : P → Q) : Q", solution = "apply hPQ\nexact hP", given = "" }) {
  const entry = [
    `  - id: ${id}`,
    "    title: One more",
    "    mode: board",
    "    says: Suppose P is true, and suppose that if P then Q. Then Q is true.",
    `    statement: ${JSON.stringify(statement)}`,
    "    moves: [apply, exact]",
    ...(given ? ["    given: |", ...given.split("\n").map((l) => `      ${l}`)] : []),
    "    solution: |",
    ...solution.split("\n").map((l) => `      ${l}`),
  ].join("\n");
  const end = raw.indexOf("\n---", 4);
  return `${raw.slice(0, end)}\n${entry}${raw.slice(end)}`;
}
