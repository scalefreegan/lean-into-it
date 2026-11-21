import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { assemble, endOfBody, toSource } from "../shared/proof.ts";
import { headerOf, LeanAbandoned, LeanServer, LeanTimeout, LeanUnavailable, leanProblem, leanToolchain, MEMORY_MB, wantedWhile } from "./lean/lsp.ts";

// How the Lean client behaves when its server stops, is slow or is absent.
// All but the last test start a real `lake serve`; where Lean is not
// installed they are skipped, loudly.

const problem = leanProblem();
const skip = problem ? `Lean is not installed: ${problem}` : false;
if (skip) console.warn(`[lsp.test] SKIPPED, nothing here was checked. ${skip}`);

const STATEMENT = "(P Q : Prop) (hP : P) (hPQ : P → Q) : Q";
const source = (body: string) => assemble(STATEMENT, body);
const end = (body: string) => [toSource(endOfBody(body))];

test("a check waiting its turn when the server stops runs on the next server, and does not hang", { skip }, async (t) => {
  const lean = new LeanServer({ timeoutMs: 120_000 });
  t.after(() => lean.stop());
  await lean.check("exercise", source("apply hPQ"), end("apply hPQ")); // warm: Mathlib is loaded

  const first = lean.check("exercise", source("exact hP"), end("exact hP"));
  const queued = lean.check("exercise", source("apply hPQ"), end("apply hPQ"));
  first.catch(() => {});
  // Let both reach the queue (the first is now with Lean), then pull the plug.
  await new Promise((r) => setImmediate(r));
  const started = Date.now();
  lean.stop();

  // The one Lean was working on is lost with its server...
  await assert.rejects(first, LeanUnavailable);
  // ...the one behind it is not: it gets a fresh server, well inside the
  // timeout it would otherwise have waited out.
  const reply = await queued;
  assert.ok(Date.now() - started < 90_000, `took ${Date.now() - started} ms`);
  assert.equal(reply.goals[0]?.length, 1);
  assert.match(reply.goals[0]?.[0] ?? "", /⊢ P$/);

  // And the new server is healthy: nothing left over kills it.
  const after = await lean.check("exercise", source("apply hPQ\nexact hP"), end("apply hPQ\nexact hP"));
  assert.deepEqual(after.goals, [[]]);
  assert.deepEqual(after.diagnostics.filter((d) => d.severity === "error"), []);
});

test("a check waiting its turn is not run on a server that started after its own was stopped", { skip }, async (t) => {
  const lean = new LeanServer({ timeoutMs: 120_000 });
  t.after(() => lean.stop());
  await lean.check("exercise", source("apply hPQ"), end("apply hPQ"));
  const first = lean.check("exercise", source("exact hP"), end("exact hP"));
  const queued = lean.check("exercise", source("apply hPQ"), end("apply hPQ"));
  first.catch(() => {});
  await new Promise((r) => setImmediate(r));
  lean.stop();
  // Another document asks at once, so a new server is already starting when
  // the queued check gets its turn: it must see that its document is from
  // the old one, not send into the new.
  const other = lean.check("playground", "example : True := trivial\n");
  const reply = await queued;
  assert.match(reply.goals[0]?.[0] ?? "", /⊢ P$/);
  assert.deepEqual((await other).diagnostics, []);
});

test("a document with a check under way is not closed to make room for another", { skip }, async (t) => {
  // Room for one document, two asked for at once: closing the first while
  // Lean is still working on it would lose its diagnostics.
  const lean = new LeanServer({ maxDocs: 1 });
  t.after(() => lean.stop());
  const [a, b] = await Promise.all([lean.check("a", source("exact hPQ"), []), lean.check("b", source("apply hPQ\nexact hP"), [])]);
  assert.match(a.diagnostics.find((d) => d.severity === "error")?.message ?? "", /mismatch/i);
  assert.deepEqual(b.diagnostics.filter((d) => d.severity === "error"), []);
  // Once idle they do make room, and a later check of the same name still works.
  const c = await lean.check("c", source("exact hP"), []);
  assert.match(c.diagnostics.find((d) => d.severity === "error")?.message ?? "", /mismatch/i);
  const again = await lean.check("a", source("exact hPQ hP"), []);
  assert.deepEqual(again.diagnostics.filter((d) => d.severity === "error"), []);
});

test("a server that does not answer in time is given up on; after the second time it stays stopped until restarted", { skip }, async (t) => {
  const lean = new LeanServer({ bootTimeoutMs: 1 });
  t.after(() => lean.stop());
  await assert.rejects(lean.check("exercise", source("exact hP"), []), (e: Error) => e instanceof LeanUnavailable && /did not start/.test(e.message));
  // Nothing is running and nothing is on its way: that is down, not "restarting".
  assert.deepEqual(lean.health(), { state: "down", problem: "Lean did not start within 0 seconds." });
  // A check tries once more by itself.
  await assert.rejects(lean.check("exercise", source("exact hP"), []), (e: Error) => e instanceof LeanUnavailable && /did not start/.test(e.message));
  assert.equal(lean.health().state, "down");
  // After two in a row a check no longer starts Lean: it is refused at once.
  const asked = Date.now();
  await assert.rejects(lean.check("exercise", source("exact hP"), []), (e: Error) => e instanceof LeanUnavailable && /did not start within 0 seconds\. Lean is stopped: restart it/.test(e.message));
  assert.ok(Date.now() - asked < 1000);
  // restart() does try, and here fails again, and says so.
  await assert.rejects(lean.restart(), /did not start/);
  assert.equal(lean.health().state, "down");
});

test("a check that runs out of time is refused with a reason", { skip }, async (t) => {
  // 50 ms is far less than loading Mathlib takes, so the first check of a cold server cannot finish.
  const lean = new LeanServer({ loadTimeoutMs: 50 });
  t.after(() => lean.stop());
  const started = Date.now();
  await assert.rejects(lean.check("exercise", source("exact hP"), []), (e: Error) => e instanceof LeanTimeout && /took longer than 0 seconds to load its library/.test(e.message));
  assert.ok(Date.now() - started < 30_000);
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (what: () => boolean, ms = 30_000) => {
  const end = Date.now() + ms;
  while (!what() && Date.now() < end) await sleep(50);
};
/** A file whose elaboration never ends: a program that counts for ever. */
const ENDLESS = "import Mathlib\npartial def spin (n : Nat) : Nat := spin (n + 1)\n#eval spin 0\n";
const fine = (n: number) => `import Mathlib\nexample : ${n} = ${n} := rfl\n`;

/** The pids of the Lean workers elaborating the document of this name. The
 *  names used here are this file's own, so no other Lean has one. */
const workersOf = (key: string): number[] =>
  execFileSync("ps", ["-axww", "-o", "pid=,command="])
    .toString()
    .split("\n")
    .filter((line) => line.includes("--worker") && line.includes(`/Scratch/${key}.lean`))
    .map((line) => Number(line.trim().split(/\s+/)[0]));

test("a check that never ends is given up on inside the limit, and Lean goes on working", { skip }, async (t) => {
  const lean = new LeanServer({ timeoutMs: 3000 });
  t.after(() => lean.stop());
  assert.deepEqual(lean.health(), { state: "down", problem: "Lean is not running." }, "not started yet");
  await lean.check("lsp-endless", fine(1));
  await lean.check("lsp-other", fine(1));
  assert.deepEqual(lean.health(), { state: "ready", problem: null });
  const worker = workersOf("lsp-endless");
  assert.equal(worker.length, 1);

  const started = Date.now();
  const endless = lean.check("lsp-endless", ENDLESS);
  // Behind it on the same document: the same endless text twice more (what
  // a caret moving in the editor asks for), then a good proof.
  const again = [lean.check("lsp-endless", ENDLESS, [{ line: 1, character: 0 }]), lean.check("lsp-endless", ENDLESS)];
  for (const check of again) check.catch(() => {});
  const behind = lean.check("lsp-endless", fine(2));
  await assert.rejects(endless, (e: Error) => e instanceof LeanTimeout && /took longer than 3 seconds on this and gave up/.test(e.message));
  const took = Date.now() - started;
  assert.ok(took >= 2900 && took < 6000, `gave up after ${took} ms`);
  // The copies do not each run out the limit again: they are refused with it.
  for (const check of again) await assert.rejects(check, LeanTimeout);
  assert.ok(Date.now() - started < 6000, `the copies were refused after ${Date.now() - started} ms`);
  // The worker that was running it is gone (closing the document ends it).
  await until(() => !workersOf("lsp-endless").includes(worker[0]!), 10_000);
  assert.ok(!workersOf("lsp-endless").includes(worker[0]!), "the worker of the endless check is still running");
  // Only that document was closed: the server is the same one, still warm,
  assert.equal(lean.health().state, "ready");
  // and the other document answers without loading Mathlib again.
  const other = Date.now();
  assert.deepEqual((await lean.check("lsp-other", fine(2))).diagnostics, []);
  assert.ok(Date.now() - other < 3000, `the other document took ${Date.now() - other} ms`);
  // The good check that was waiting, and the next one, run on a new
  // document, whose library load is not counted against the 3 seconds.
  assert.deepEqual((await behind).diagnostics, []);
  assert.deepEqual((await lean.check("lsp-endless", fine(3))).diagnostics, []);
  // Asked for again on purpose, the endless text is run again, and given up on again.
  await assert.rejects(lean.check("lsp-endless", ENDLESS), LeanTimeout);
  // The same when the endless file is the first thing a document is given:
  // loading the library has its own, longer, limit, and the file does not borrow it.
  await assert.rejects(lean.check("lsp-first", ENDLESS), (e: Error) => e instanceof LeanTimeout && /took longer than 3 seconds on this and gave up/.test(e.message));
  assert.equal(lean.health().state, "ready");
  // A real error is still an error there.
  const wrong = await lean.check("lsp-endless", "import Mathlib\nexample : 1 = 2 := rfl\n");
  assert.equal(wrong.diagnostics.filter((d) => d.severity === "error").length, 1);
  assert.equal(wrong.diagnostics[0]?.start.line, 1);
});

test("a check no one waits for any more is skipped when its turn comes, and the ones after it still run", { skip }, async (t) => {
  const lean = new LeanServer({ timeoutMs: 3000 });
  t.after(() => lean.stop());
  await lean.check("lsp-wanted", fine(1));
  // A check that holds the document for its 3 seconds, and two behind it: one
  // whose asker gives up while it waits (the learner typed on), and one wanted.
  const slow = lean.check("lsp-wanted", ENDLESS);
  slow.catch(() => {});
  const asked = new AbortController();
  const dropped = wantedWhile(asked.signal, () => lean.check("lsp-wanted", fine(2)));
  const kept = wantedWhile(new AbortController().signal, () => lean.check("lsp-wanted", "import Mathlib\nexample : 1 = 2 := rfl\n"));
  asked.abort();
  await assert.rejects(slow, LeanTimeout);
  const before = Date.now();
  await assert.rejects(dropped, LeanAbandoned);
  assert.ok(Date.now() - before < 500, "skipped at once, not checked");
  // The wanted one ran, on the text it was given.
  assert.equal((await kept).diagnostics.filter((d) => d.severity === "error").length, 1);
  // A check whose asker gave up once it was running is left to finish.
  const late = new AbortController();
  const running = wantedWhile(late.signal, () => lean.check("lsp-wanted", fine(3)));
  setTimeout(() => late.abort(), 20);
  assert.deepEqual((await running).diagnostics, []);
});

test(`a check that wants more memory than a worker may have (${MEMORY_MB} MB) is refused as that, and Lean goes on`, { skip }, async (t) => {
  const lean = new LeanServer();
  t.after(() => lean.stop());
  await lean.check("lsp-memory", fine(1));
  // About 3 GB of list on top of Mathlib: past the limit (without one it finishes, in some 16 s).
  const huge = "import Mathlib\n#eval (List.replicate 400000000 (7 : Nat)).length\n";
  await assert.rejects(lean.check("lsp-memory", huge), (e: Error) => e instanceof LeanUnavailable && /ran out of memory on this: one check may use 8 GB/.test(e.message));
  assert.equal(lean.health().state, "ready");
  assert.deepEqual((await lean.check("lsp-memory", fine(2))).diagnostics, []);
});

test("the header of a file is its imports with the comments around them", () => {
  assert.equal(headerOf("import Mathlib\nexample : 1 = 1 := rfl\n"), "import Mathlib\n");
  assert.equal(headerOf("import Mathlib"), "import Mathlib");
  assert.equal(headerOf("-- note\nimport Mathlib\n\n-- about the proof\nexample : 1 = 1 := rfl\n"), "-- note\nimport Mathlib\n");
  assert.equal(headerOf("/- a /- nested -/ b -/\n\nimport Mathlib -- why\nimport Mathlib.Tactic\n\n/-- doc -/\ntheorem t : True := trivial"), "/- a /- nested -/ b -/\n\nimport Mathlib -- why\nimport Mathlib.Tactic\n");
  assert.equal(headerOf("module\npublic import Mathlib\nmeta import Lean\nimportant"), "module\npublic import Mathlib\nmeta import Lean\n");
  assert.equal(headerOf("example : True := trivial\n"), "");
  assert.equal(headerOf("importance : Nat := 1\n"), "");
  assert.equal(headerOf("/- never closed\nimport Mathlib\n"), "");
  assert.equal(headerOf("example : True := trivial\nimport Mathlib\n"), "", "an import after a command is not a header");
  assert.equal(headerOf(""), "");
  assert.equal(headerOf("module\nexample : True := trivial\n"), "module", "module alone is a header: what is loaded must match the body's");
});

test("loading a library never counts against a proof's time, wherever the imports sit and whenever they change", { skip }, async (t) => {
  // Two seconds is less than Mathlib takes to load (six at the very least here).
  const lean = new LeanServer({ timeoutMs: 2000 });
  t.after(() => lean.stop());
  const clean = async (text: string) => assert.deepEqual((await lean.check("lsp-header", text)).diagnostics, []);
  // A new document whose first line is a comment.
  await clean("-- my notes\nimport Mathlib\nexample : (2 : ℝ) + 2 = 4 := by norm_num\n");
  // The same header again: nothing to load, well inside the limit.
  const quick = Date.now();
  await clean("-- my notes\nimport Mathlib\nexample : (3 : ℝ) + 3 = 6 := by norm_num\n");
  assert.ok(Date.now() - quick < 2000);
  // The import lines change on an open document: Lean loads again.
  await clean("example : True := trivial\n");
  await clean("/- other notes -/\n\nimport Mathlib\nexample : (2 : ℝ) + 2 = 4 := by norm_num\n");
  // And an endless file with such a header is still stopped by the short limit.
  await assert.rejects(lean.check("lsp-header", "/- other notes -/\n\nimport Mathlib\npartial def spin (n : Nat) : Nat := spin (n + 1)\n#eval spin 0\n"), (e: Error) => e instanceof LeanTimeout && /2 seconds on this/.test(e.message));
});

test("a file with no imports still loads Lean's core library, and that load does not count against a proof's time either", { skip }, async (t) => {
  // One second is less than the core library takes to load (about two here).
  const lean = new LeanServer({ timeoutMs: 1000 });
  t.after(() => lean.stop());
  const clean = async (key: string, text: string) => assert.deepEqual((await lean.check(key, text)).diagnostics, []);
  // A new document with no imports at all.
  await clean("lsp-bare", "example : True := trivial\n");
  // Its imports removed: Lean starts the document over on the core library alone.
  await clean("lsp-unimport", "import Mathlib\nexample : True := trivial\n");
  await clean("lsp-unimport", "example : 1 + 1 = 2 := rfl\n");
});

test("a file that crashes its Lean worker is reported, not run again, and the next check works", { skip }, async (t) => {
  const lean = new LeanServer();
  t.after(() => lean.stop());
  await lean.check("lsp-crash", fine(1));
  // A hundred million calls deep: the worker runs out of stack and dies.
  const deep = "import Mathlib\ndef deep : Nat → Nat\n  | 0 => 0\n  | n + 1 => deep n + 1\n#eval deep 100000000\n";
  await assert.rejects(lean.check("lsp-crash", deep), (e: Error) => e instanceof LeanUnavailable && !(e instanceof LeanTimeout) && /^Lean crashed while checking this\./.test(e.message) && !/file:/.test(e.message));
  // The server itself did not go anywhere,
  assert.equal(lean.health().state, "ready");
  // and the document is replaced: a good proof is checked.
  assert.deepEqual((await lean.check("lsp-crash", fine(2))).diagnostics, []);
});

test("a Lean that dies is started again by itself, once; twice in a row it stays stopped until restarted", { skip }, async (t) => {
  const lean = new LeanServer();
  t.after(() => lean.stop());
  await lean.check("lsp-dies", fine(1));

  // Killed by hand in the middle of a check: the check is not lost.
  const during = lean.check("lsp-dies", fine(2));
  await new Promise((r) => setImmediate(r));
  lean.crash();
  assert.deepEqual((await during).diagnostics, []);
  assert.equal(lean.health().state, "ready");

  // Killed while idle: it comes back by itself, says so meanwhile, and
  // loads the library again without waiting to be asked for a check.
  lean.crash();
  await until(() => lean.health().state !== "ready");
  assert.deepEqual(lean.health(), { state: "restarting", problem: null });
  await until(() => lean.health().state === "ready", 150_000);
  assert.equal(lean.health().state, "ready", "it did not load its library again by itself");
  const quick = Date.now();
  assert.deepEqual((await lean.check("lsp-dies", fine(3))).diagnostics, []);
  assert.ok(Date.now() - quick < 5000, `the check after it took ${Date.now() - quick} ms`);

  // Killed twice with no check finishing in between: not started again.
  lean.crash();
  await until(() => lean.health().state === "restarting");
  await sleep(200);
  lean.crash();
  await until(() => lean.health().state === "down");
  assert.deepEqual(lean.health(), { state: "down", problem: "The Lean server stopped unexpectedly (SIGKILL)." });
  // Not by a check either: it is refused at once, with the way out.
  await assert.rejects(lean.check("lsp-dies", fine(4)), (e: Error) => e instanceof LeanUnavailable && /stopped unexpectedly \(SIGKILL\)\. Lean is stopped: restart it to check proofs\.$/.test(e.message));
  assert.equal(lean.health().state, "down", "it stays down until asked");

  // The Restart button.
  await lean.restart();
  assert.deepEqual(lean.health(), { state: "restarting", problem: null }, "running, and Mathlib not loaded yet");
  assert.deepEqual((await lean.check("lsp-dies", fine(4))).diagnostics, []);
  assert.deepEqual(lean.health(), { state: "ready", problem: null });
});

test("the toolchain is read from the project", () => {
  assert.match(leanToolchain() ?? "", /^leanprover\/lean4:v\d+\.\d+\.\d+/);
  assert.equal(leanToolchain(os.tmpdir()), null);
});

test("a folder with no Lean project is a reason, not a hang", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lii-nolean-"));
  const lean = new LeanServer({ dir });
  await assert.rejects(lean.check("exercise", "example : True := trivial\n"), (e: Error) => e instanceof LeanUnavailable && /no Lean project/.test(e.message));
  fs.writeFileSync(path.join(dir, "lakefile.toml"), "");
  await assert.rejects(lean.check("exercise", "example : True := trivial\n"), (e: Error) => e instanceof LeanUnavailable && /lean:setup/.test(e.message));
  lean.stop();
});

test("a closed server stays closed: a check that was waiting does not start Lean again", { skip }, async (t) => {
  const lean = new LeanServer();
  // Were the guard ever lost, this keeps the test from leaving a Lean running.
  t.after(() => lean.stop());
  const waiting = lean.check("exercise", source("exact hP"), []);
  waiting.catch(() => {});
  lean.close();
  await assert.rejects(waiting, LeanUnavailable);
  await assert.rejects(lean.check("exercise", source("exact hP"), []), (e: Error) => e instanceof LeanUnavailable && /shut down/.test(e.message));
});
