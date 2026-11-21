import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { test } from "node:test";
import { ensureLearner } from "../../scripts/db/progress.ts";
import { freshDb } from "../../scripts/tests/testdb.mjs";
import type { ResearchMap } from "../shared/research.ts";
import type { ResearchJob, ResearchListReply } from "../shared/wire.ts";
import { setDb } from "./db.ts";
import { loadContent } from "./loader.ts";
import { handleResearch, OFFLINE, privateAddress, RESEARCH_PROMPT, researchPrompt, researchSettled, setLinkCheck, setOnline, setResearchAgent, type ResearchAgent } from "./research.ts";
import { claimTutor, releaseTutor } from "./tutor.ts";

// Field notes without the web: the run, the network check and the link
// check are stand-ins; the routes run on PGlite. The run's argv (WebSearch
// and WebFetch, nothing that writes) is pinned in scripts/tests/claude.test.mjs.

function call<T>(method: string, url: string, body?: unknown): Promise<{ status: number; reply: T }> {
  const req = Object.assign(Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]), { method, headers: {}, url }) as unknown as IncomingMessage;
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
  return handleResearch(req, res).then(
    () => ({ status, reply: JSON.parse(text) as T }),
    (e: { status?: number; message: string; code?: string }) => ({ status: e.status ?? 500, reply: { error: e.message, code: e.code } as T }),
  );
}

const MAP = {
  title: "A result",
  summary: "Someone proved something.",
  claimed: [{ text: "A team announced a proof.", sources: [1] }],
  verified: [],
  verifiedNote: "Nothing about it has been formally verified.",
  concepts: [{ id: "induction", why: "By induction." }],
  open: [],
  unconfirmed: [],
  sources: [
    { n: 1, title: "Up", url: "https://example.org/up" },
    { n: 2, title: "Down", url: "https://example.org/down" },
  ],
};
const reply = (o: unknown) => `A paragraph.\n\n\`\`\`json\n${JSON.stringify(o)}\n\`\`\``;

async function setup(t: { after: (fn: () => Promise<void>) => void }, agent: ResearchAgent, { up = true } = {}) {
  const fresh = await freshDb();
  setDb(fresh.db);
  setResearchAgent(agent);
  setOnline(async () => up);
  setLinkCheck(async (url) => !url.endsWith("/down"));
  t.after(async () => {
    setResearchAgent(null);
    setOnline(null);
    setLinkCheck(null);
    setDb(null);
    await fresh.close();
  });
  return { db: fresh.db, query: fresh.query, learner: await ensureLearner(fresh.db) };
}

test("the prompt keeps claimed apart from verified, asks for sources it opened, and lists the path's concepts", () => {
  assert.match(RESEARCH_PROMPT, /CLAIMED/);
  assert.match(RESEARCH_PROMPT, /FORMALLY VERIFIED/);
  assert.match(RESEARCH_PROMPT, /page you opened in this turn/);
  assert.match(RESEARCH_PROMPT, /```json/);
  const p = researchPrompt("What about X?", loadContent(), new Date("2026-11-21T12:00:00Z"));
  assert.match(p, /^Today is 2026-11-21\./);
  assert.match(p, /What about X\?/);
  assert.match(p, /- implication: /);
  assert.match(p, /- limit-definition: .*\(outlined, level 5, not yet written\)/);
});

test("a map is made, its links checked, saved with its date, listed, reopened and deleted", async (t) => {
  const asked: string[] = [];
  const { query } = await setup(t, async ({ prompt, systemPrompt }) => {
    asked.push(prompt);
    assert.equal(systemPrompt, RESEARCH_PROMPT);
    return reply(MAP);
  });
  const started = await call<ResearchJob>("POST", "/", { question: "What happened with X?" });
  assert.equal(started.status, 202);
  assert.equal(started.reply.running, true);
  await researchSettled();
  const list = await call<ResearchListReply>("GET", "/");
  assert.equal(list.reply.job?.running, false);
  assert.equal(list.reply.job?.error, undefined);
  const id = list.reply.job!.mapId!;
  assert.deepEqual(list.reply.maps.map((m) => [m.id, m.title]), [[id, "A result"]]);
  assert.equal(list.reply.busy, false);
  const made = await call<ResearchMap>("GET", `/${id}`);
  assert.equal(made.reply.title, "A result");
  assert.equal(made.reply.question, "What happened with X?");
  assert.deepEqual(made.reply.sources.map((s) => s.reachable), [true, false]);
  assert.ok(!Number.isNaN(Date.parse(made.reply.madeAt)));
  assert.match(asked[0], /What happened with X\?/);
  const rows = await query("select title, question from research_maps");
  assert.deepEqual(rows, [{ title: "A result", question: "What happened with X?" }]);

  assert.equal((await call("DELETE", `/${made.reply.id}`)).status, 200);
  assert.equal((await call("GET", `/${made.reply.id}`)).status, 404);
  assert.equal((await call("DELETE", `/${made.reply.id}`)).status, 404);
});

test("offline, nothing is started and the reply says the feature needs the internet", async (t) => {
  let ran = false;
  await setup(
    t,
    async () => {
      ran = true;
      return reply(MAP);
    },
    { up: false },
  );
  const r = await call<{ error: string; code: string }>("POST", "/", { question: "X?" });
  assert.equal(r.status, 503);
  assert.equal(r.reply.error, OFFLINE);
  assert.equal(r.reply.code, "offline");
  assert.equal(ran, false);
});

test("a reply that is no map is not saved, and says why", async (t) => {
  const { query } = await setup(t, async () => reply({ ...MAP, sources: [] }));
  assert.equal((await call("POST", "/", { question: "X?" })).status, 202);
  await researchSettled();
  assert.match((await call<ResearchListReply>("GET", "/")).reply.job!.error!, /cited no sources/);
  assert.equal((await query("select count(*)::int as n from research_maps"))[0].n, 0);
});

test("one Tutor turn at a time: busy is refused, and the slot is freed after a failure", async (t) => {
  await setup(t, async () => {
    throw new Error("claude exited 1: boom");
  });
  assert.ok(claimTutor());
  try {
    const busy = await call<{ error: string }>("POST", "/", { question: "X?" });
    assert.equal(busy.status, 409);
    assert.equal((await call<ResearchListReply>("GET", "/")).reply.busy, true);
  } finally {
    releaseTutor();
  }
  assert.equal((await call("POST", "/", { question: "X?" })).status, 202);
  await researchSettled();
  assert.match((await call<ResearchListReply>("GET", "/")).reply.job!.error!, /boom/);
  assert.ok(claimTutor(), "the slot was given back");
  releaseTutor();
});

test("the question is required and bounded; unknown routes and methods are refused", async (t) => {
  await setup(t, async () => reply(MAP));
  assert.equal((await call("POST", "/", { question: "  " })).status, 400);
  assert.equal((await call("POST", "/", { question: "x".repeat(1001) })).status, 413);
  assert.equal((await call("GET", "/abc")).status, 404);
  assert.equal((await call("PUT", "/")).status, 405);
});

test("Stop ends the run, saves nothing, and frees the slot; a network failure is said as offline", async (t) => {
  const { query } = await setup(t, ({ signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("stopped")))));
  assert.equal((await call("POST", "/", { question: "X?" })).status, 202);
  assert.equal((await call("POST", "/", { question: "Y?" })).status, 409, "one run at a time");
  assert.equal((await call("DELETE", "/run")).status, 200);
  await researchSettled();
  assert.equal((await call<ResearchListReply>("GET", "/")).reply.job!.error, "Stopped.");
  assert.equal((await query("select count(*)::int as n from research_maps"))[0].n, 0);
  assert.ok(claimTutor());
  releaseTutor();
  setResearchAgent(async () => {
    throw new Error("claude exited 1: getaddrinfo ENOTFOUND api.anthropic.com");
  });
  await call("POST", "/", { question: "X?" });
  await researchSettled();
  assert.equal((await call<ResearchListReply>("GET", "/")).reply.job!.error, OFFLINE);
});

test("a link on this machine or a private network is never checked, nor one that hides an IPv4 one", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.0.1", "192.0.0.8", "::1", "::", "fc00::1", "fe80::1", "fec0::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::7f00:1", "::127.0.0.1", "64:ff9b::a00:1", "2002:c0a8:101::1", "not an ip"]) assert.ok(privateAddress(ip), ip);
  for (const ip of ["93.184.216.34", "172.32.0.1", "8.8.8.8", "2606:2800:220:1:248:1893:25c8:1946", "::ffff:8.8.8.8", "64:ff9b::808:808", "2002:808:808::1"]) assert.ok(!privateAddress(ip), ip);
});

test("a private source backs nothing; a finished run's result is put away, or cleared with its map", async (t) => {
  await setup(t, async () => reply({ ...MAP, sources: [{ n: 1, title: "LAN", url: "http://10.0.0.1/" }, { n: 2, title: "Up", url: "https://example.org/up" }] }));
  setLinkCheck(async (url) => (url.includes("10.0.0.1") ? "private" : true));
  await call("POST", "/", { question: "X?" });
  await researchSettled();
  const job = (await call<ResearchListReply>("GET", "/")).reply.job!;
  const map = (await call<ResearchMap>("GET", `/${job.mapId}`)).reply;
  assert.deepEqual(map.sources.map((s) => [s.reachable, s.private ?? false]), [[false, true], [true, false]]);
  assert.deepEqual(map.claimed, [], "its only source was private");
  assert.equal((await call("DELETE", "/run")).status, 200);
  assert.equal((await call<ResearchListReply>("GET", "/")).reply.job, null, "put away");
  await call("POST", "/", { question: "Y?" });
  await researchSettled();
  const again = (await call<ResearchListReply>("GET", "/")).reply.job!;
  await call("DELETE", `/${again.mapId}`);
  assert.equal((await call<ResearchListReply>("GET", "/")).reply.job, null, "cleared with its map");
});
