import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { MCP_TOOLS, configFromEnv, createLeanServer, httpAsk, shape } from "../lean-mcp.mjs";

// The Tutor's Lean tool: its request and reply shapes, with the app stood
// in for. Nothing here starts Lean or the app.

const URL_OK = "http://localhost:38800/api/tutor/lean";
const TOKEN = "t".repeat(32);

async function connect(t, ask) {
  const client = new Client({ name: "test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([createLeanServer(ask).connect(a), client.connect(b)]);
  t.after(() => client.close());
  return async (args) => {
    const r = await client.callTool({ name: "lean_check", arguments: args });
    return { isError: r.isError === true, text: r.content[0].text, client };
  };
}

test("one read-only tool, lean_check, taking the Lean and a line; no URL, token or path among its arguments", async (t) => {
  const asked = [];
  const call = await connect(t, async (req) => (asked.push(req), { ran: true, refused: [], accepted: true, sorry: false, messages: [], goals: null }));
  const { client } = await call({ lean: "example : True := trivial" });
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((x) => x.name), ["lean_check"]);
  assert.deepEqual(MCP_TOOLS, ["mcp__lean__lean_check"]);
  assert.deepEqual(Object.keys(tools[0].inputSchema.properties).sort(), ["goals_after_line", "lean"]);
  assert.equal(tools[0].annotations.readOnlyHint, true);
  await call({ lean: "example : True := by\n  trivial", goals_after_line: 2 });
  assert.deepEqual(asked, [{ lean: "example : True := trivial", goalsAfterLine: undefined }, { lean: "example : True := by\n  trivial", goalsAfterLine: 2 }]);
  assert.equal((await call({ lean: "" })).isError, true);
  assert.equal((await call({ lean: "x".repeat(20_001) })).isError, true);
  assert.equal((await call({ lean: "x", goals_after_line: 0 })).isError, true);
  assert.equal(asked.length, 2);
});

test("the reply: Lean's messages by line, accepted or not, an open proof named as one, the goals after a line", async (t) => {
  const messages = [{ severity: "info", line: 2, message: "Try this: exact Nat.add_zero a" }];
  assert.deepEqual(shape({ ran: true, refused: [], accepted: true, sorry: false, messages, goals: null }), { ran: true, accepted: true, messages });
  assert.match(shape({ ran: true, refused: [], accepted: true, sorry: true, messages: [], goals: null }).note, /nothing is proved yet/);
  assert.equal(shape({ ran: true, refused: [], accepted: false, sorry: true, messages: [], goals: null }).note, undefined);
  assert.deepEqual(shape({ ran: true, refused: [], accepted: true, sorry: false, messages: [], goals: ["P : Prop\n⊢ P"] }).goalsAfterLine, ["P : Prop\n⊢ P"]);
  assert.equal(shape({ ran: true, refused: [], accepted: true, sorry: false, messages: [], goals: [] }).goalsAfterLine, "no goals left");
  assert.equal(shape({ ran: true, refused: [], accepted: true, sorry: false, messages: [], more: 3, goals: null }).messagesLeftOut, 3);
  const refused = shape({ ran: false, refused: ["line 1: “#eval” is not run for the Tutor."], accepted: false, sorry: false, messages: [], goals: null });
  assert.deepEqual([refused.ran, refused.refused.length, "accepted" in refused], [false, 1, false]);
  const call = await connect(t, async () => {
    throw new Error("Lean took too long");
  });
  assert.deepEqual(await call({ lean: "example : True := trivial" }).then((r) => [r.isError, r.text]), [true, "Lean could not be asked: Lean took too long"]);
});

test("it posts only to this machine's own route, with the turn's token and a matching Origin", async () => {
  assert.deepEqual(configFromEnv({ LII_LEAN_URL: URL_OK, LII_LEAN_TOKEN: TOKEN }), { url: URL_OK, origin: "http://localhost:38800", token: TOKEN });
  for (const url of ["", "https://localhost:38800/api/tutor/lean", "http://example.com/api/tutor/lean", "http://localhost:38800/api/playground", "http://localhost:38800/api/tutor/lean?x=1", "http://user@localhost:38800/api/tutor/lean", "http://localhost.evil.com/api/tutor/lean"]) {
    assert.throws(() => configFromEnv({ LII_LEAN_URL: url, LII_LEAN_TOKEN: TOKEN }), /LII_LEAN_URL/, url);
  }
  assert.throws(() => configFromEnv({ LII_LEAN_URL: URL_OK, LII_LEAN_TOKEN: "short" }), /LII_LEAN_TOKEN/);
  const sent = [];
  const ok = { ran: true, refused: [], accepted: true, sorry: false, messages: [], goals: null };
  const fake = (status, body) => async (url, init) => (sent.push({ url, init }), { ok: status < 400, status, json: async () => body });
  const cfg = configFromEnv({ LII_LEAN_URL: URL_OK, LII_LEAN_TOKEN: TOKEN });
  assert.deepEqual(await httpAsk(cfg, fake(200, ok))({ lean: "x", goalsAfterLine: 3 }), ok);
  assert.equal(sent[0].url, URL_OK);
  assert.equal(sent[0].init.method, "POST");
  assert.equal(sent[0].init.headers.Origin, "http://localhost:38800");
  assert.equal(sent[0].init.redirect, "error");
  assert.deepEqual(JSON.parse(sent[0].init.body), { token: TOKEN, lean: "x", goalsAfterLine: 3 });
  assert.deepEqual(JSON.parse((await httpAsk(cfg, fake(200, ok))({ lean: "x" }), sent[1].init.body)), { token: TOKEN, lean: "x" });
  // The app's own sentence comes through; anything else is a plain one.
  await assert.rejects(httpAsk(cfg, fake(503, { error: "Lean took longer than 20 seconds" }))({ lean: "x" }), /Lean took longer than 20 seconds/);
  await assert.rejects(httpAsk(cfg, fake(500, null))({ lean: "x" }), /the app answered 500/);
  await assert.rejects(httpAsk(cfg, fake(200, { hello: 1 }))({ lean: "x" }), /could not be read/);
  await assert.rejects(httpAsk(cfg, async () => { throw new Error("ECONNREFUSED 127.0.0.1"); })({ lean: "x" }), /^Error: the app could not be reached$/);
});
