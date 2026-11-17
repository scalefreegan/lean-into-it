import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { assemble, endOfBody, toSource } from "../shared/proof.ts";
import { LeanServer, LeanUnavailable, leanProblem } from "./lean/lsp.ts";

// How the Lean client behaves when its server stops, is slow or is absent.
// The first and second tests start a real `lake serve`; where Lean is not
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

test("a check that runs out of time is refused with a reason", { skip }, async (t) => {
  // 50 ms is far less than loading Mathlib takes, so the first check of a cold server cannot finish.
  const lean = new LeanServer({ timeoutMs: 50 });
  t.after(() => lean.stop());
  const started = Date.now();
  await assert.rejects(lean.check("exercise", source("exact hP"), []), (e: Error) => e instanceof LeanUnavailable && /took longer/.test(e.message));
  assert.ok(Date.now() - started < 30_000);
});

test("a folder with no Lean project is a reason, not a hang", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lii-nolean-"));
  const lean = new LeanServer({ dir });
  await assert.rejects(lean.check("exercise", "example : True := trivial\n"), (e: Error) => e instanceof LeanUnavailable && /no Lean project/.test(e.message));
  fs.writeFileSync(path.join(dir, "lakefile.toml"), "");
  await assert.rejects(lean.check("exercise", "example : True := trivial\n"), (e: Error) => e instanceof LeanUnavailable && /lean:setup/.test(e.message));
  lean.stop();
});
