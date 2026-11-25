import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ViteDevServer } from "vite";
import { apiPlugins, fromApp, localHost, localOnly, sameOrigin, setPublicHosts, wrap } from "./api.ts";
import { parsePublicHosts, readPublicHosts } from "./publichost.ts";
import { HttpError } from "./sse.ts";

// /api/check and /api/playground hand text to Lean, which can run code
// while elaborating it. These two rules are what keeps another website from
// reaching them.

test("a request from another origin is refused", () => {
  assert.equal(sameOrigin("http://evil.example", "localhost:38800"), false);
  assert.equal(sameOrigin("http://localhost:9999", "localhost:38800"), false);
  assert.equal(sameOrigin("null", "localhost:38800"), false);
  assert.equal(sameOrigin("http://localhost:38800", undefined), false);
});

test("the app's own page, and a request with no Origin, are allowed", () => {
  assert.equal(sameOrigin("http://localhost:38800", "localhost:38800"), true);
  assert.equal(sameOrigin(undefined, "localhost:38800"), true);
});

test("only this machine's names count as the host (DNS rebinding sends a matching Origin and Host)", () => {
  assert.equal(localHost("localhost:38800"), true);
  assert.equal(localHost("127.0.0.1:38800"), true);
  assert.equal(localHost("[::1]:38800"), true);
  assert.equal(localHost("LOCALHOST:38800"), true);
  assert.equal(localHost("evil.example:38800"), false);
  assert.equal(localHost("localhost.evil.example"), false);
  assert.equal(localHost(undefined), false);
});

test("a configured tailnet name (LEAN_PUBLIC_HOST) also counts as this machine, nothing else does", () => {
  const hosts = ["my-mac.tailnet.ts.net", "other-name.tailnet.ts.net"];
  assert.equal(localHost("my-mac.tailnet.ts.net:38800", hosts), true);
  assert.equal(localHost("MY-MAC.TAILNET.TS.NET:38800", hosts), true, "case-insensitive, like the loopback names");
  assert.equal(localHost("other-name.tailnet.ts.net", hosts), true);
  assert.equal(localHost("localhost:38800", hosts), true, "the loopback names still work alongside a configured one");
  assert.equal(localHost("third.tailnet.ts.net:38800", hosts), false);
  assert.equal(localHost("x.my-mac.tailnet.ts.net:38800", hosts), false);
  assert.equal(localHost("my-mac.tailnet.ts.net:38800", []), false, "none configured: only localhost");
  assert.equal(localHost("my-mac.tailnet.ts.net:38800"), false, "the default is none");
});

test("under a tailnet name a request must come from an https page the browser calls same-origin", async (t) => {
  const host = "my-mac.tailnet.ts.net:38800";
  const site = { "sec-fetch-site": "same-origin" };
  const cases: [string, Record<string, string>, boolean][] = [
    ["the app's page", { host, origin: `https://${host}`, ...site, "x-lean-into-it": "1" }, true],
    ["its GET, which has no Origin", { host, ...site }, true],
    ["a rebound http page with the marker", { host, origin: `http://${host}`, "x-lean-into-it": "1" }, false],
    ["a rebound http page's GET with the marker", { host, "x-lean-into-it": "1" }, false],
    ["an http Origin, whatever else it says", { host, origin: `http://${host}`, ...site }, false],
    ["an opaque Origin", { host, origin: "null", ...site }, false],
    ["another site", { host, origin: "https://evil.example", "sec-fetch-site": "cross-site", "x-lean-into-it": "1" }, false],
    ["a typed address", { host, "sec-fetch-site": "none", "x-lean-into-it": "1" }, false],
    ["nothing but the host", { host }, false],
    ["another tailnet name", { host: "other.tailnet.ts.net", ...site }, false],
  ];
  const run = async (headers: Record<string, string>) => {
    let ran = false;
    await call(wrap(() => void (ran = true)), headers);
    return ran;
  };
  setPublicHosts(["my-mac.tailnet.ts.net"]);
  t.after(() => setPublicHosts([]));
  for (const [name, headers, ok] of cases) assert.equal(await run(headers), ok, name);
  assert.equal(await run(OWN), true, "localhost is as before");
  // Building the plugin with no names (the line was removed, Vite restarted) takes them away.
  apiPlugins({ checkDatabase: false, warm: false });
  for (const [name, headers] of cases) assert.equal(await run(headers), false, `revoked: ${name}`);
});

test("Vite's open-in-editor route is for this machine only", async () => {
  for (const [host, ok] of [["localhost:38800", true], ["my-mac.tailnet.ts.net:38800", false], ["evil.example", false]] as const) {
    let passed = false;
    const sent = await call((req, res) => localOnly(req, res, () => void (passed = true)), { host }, "GET");
    assert.deepEqual([passed, sent.status], ok ? [true, 0] : [false, 403], host);
  }
});

test("LEAN_PUBLIC_HOST: which names are taken, and where they are read from", (t) => {
  const dropped: string[] = [];
  const bad = [".ts.net", "ts.net", "*.t.ts.net", "https://a.t.ts.net", "a.t.ts.net:38800", "a.t.ts.net.", "a.t.ts.net/x", "-a.t.ts.net", "mymac", "evil.example", "100.64.0.1", "a.ts.net.evil.example"];
  assert.deepEqual(parsePublicHosts(`My-Mac.t.ts.net, ,b.t.ts.net,b.t.ts.net,${bad.join(",")}`, (e) => dropped.push(e)), ["my-mac.t.ts.net", "b.t.ts.net"]);
  assert.deepEqual(dropped, bad);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lii-env-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "env");
  fs.writeFileSync(file, 'export LEAN_PUBLIC_HOST="file.t.ts.net"\n');
  assert.deepEqual(readPublicHosts({}, file), ["file.t.ts.net"]);
  assert.deepEqual(readPublicHosts({ LEAN_PUBLIC_HOST: "shell.t.ts.net" }, file), ["shell.t.ts.net"], "the shell wins");
  assert.deepEqual(readPublicHosts({ LEAN_PUBLIC_HOST: "" }, file), [], "set but empty is off");
  assert.deepEqual(readPublicHosts({ LEAN_PUBLIC_HOST: "*" }, file), [], "a bad shell value does not fall back to the file");
  fs.writeFileSync(file, "OTHER=1\n");
  assert.deepEqual(readPublicHosts({}, file), [], "taken out of the file: gone at the next read");
  assert.deepEqual(readPublicHosts({}, path.join(dir, "none")), []);
});

test("LEAN_PUBLIC_HOST: the file is the one LEAN_INTO_IT_ENV_FILE names, and reading it leaves process.env alone", (t) => {
  const was = process.env.LEAN_INTO_IT_ENV_FILE;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lii-env-"));
  t.after(() => {
    if (was === undefined) delete process.env.LEAN_INTO_IT_ENV_FILE;
    else process.env.LEAN_INTO_IT_ENV_FILE = was;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  process.env.LEAN_INTO_IT_ENV_FILE = path.join(dir, "env");
  assert.deepEqual(readPublicHosts({}), []);
  fs.writeFileSync(path.join(dir, "env"), "LEAN_PUBLIC_HOST=a.t.ts.net\n");
  const env = {};
  assert.deepEqual(readPublicHosts(env), ["a.t.ts.net"]);
  assert.deepEqual(env, {});
});

test("a request from the app: the browser says same-origin, or the app's marker where the browser says nothing", () => {
  assert.equal(fromApp({ "sec-fetch-site": "same-origin" }), true, "an <audio> element cannot add a header");
  assert.equal(fromApp({ "x-lean-into-it": "1" }), true, "the MCP helper, the app's fetch in an older browser");
  assert.equal(fromApp({}), false);
  assert.equal(fromApp({ "x-lean-into-it": "yes" }), false);
  for (const site of ["cross-site", "same-site", "none"]) assert.equal(fromApp({ "sec-fetch-site": site, "x-lean-into-it": "1" }), false, site);
});

/** A request as connect would hand it over, and a response that records what was sent. */
function call(handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>, headers: Record<string, string>, method = "POST") {
  const sent = { status: 0, body: "" };
  const req = { method, url: "/", headers } as unknown as IncomingMessage;
  const res = {
    headersSent: false,
    writableEnded: false,
    writeHead(code: number) {
      sent.status = code;
      return this;
    },
    end(chunk?: string) {
      sent.body = chunk ?? "";
    },
  } as unknown as ServerResponse;
  return Promise.resolve(handler(req, res)).then(() => sent);
}

const OWN = { host: "localhost:38800", origin: "http://localhost:38800", "x-lean-into-it": "1" };
const FOREIGN: [string, Record<string, string>][] = [
  ["another site", { host: "localhost:38800", origin: "http://evil.example" }],
  ["an opaque origin", { host: "localhost:38800", origin: "null" }],
  ["another port on this machine", { host: "localhost:38800", origin: "http://localhost:5173" }],
  ["a rebinding host with a matching origin", { host: "evil.example:38800", origin: "http://evil.example:38800" }],
  ["a foreign host and no origin", { host: "evil.example:38800" }],
  ["no host at all", {}],
  ["this machine without the app's marker (curl, a fetch tool)", { host: "localhost:38800" }],
  ["the marker from a page the browser says is another site", { host: "localhost:38800", "x-lean-into-it": "1", "sec-fetch-site": "cross-site" }],
  ["a typed address, without the marker", { host: "localhost:38800", "sec-fetch-site": "none" }],
];

test("wrap() refuses a foreign request before the handler runs", async () => {
  for (const [name, headers] of FOREIGN) {
    let ran = false;
    const sent = await call(wrap(() => void (ran = true)), headers);
    assert.equal(sent.status, 403, name);
    assert.equal(ran, false, `${name}: the handler must not run`);
  }
});

test("wrap() runs the handler for the app's own page, and turns a thrown error into an envelope", async () => {
  let ran = false;
  await call(wrap(() => void (ran = true)), OWN);
  assert.equal(ran, true);
  const refused = await call(wrap(() => { throw new HttpError(404, "no such exercise"); }), OWN);
  assert.deepEqual([refused.status, JSON.parse(refused.body)], [404, { error: "no such exercise" }]);
  const crashed = await call(wrap(() => { throw new Error("secret detail"); }), OWN);
  assert.equal(crashed.status, 500);
  assert.doesNotMatch(crashed.body, /secret detail/);
});

test("every route the plugin mounts is behind wrap()", async () => {
  const mounted: [string, (req: IncomingMessage, res: ServerResponse) => void | Promise<void>][] = [];
  const server = { middlewares: { use: (route: string, handler: (typeof mounted)[number][1]) => void mounted.push([route, handler]) }, config: { logger: { info() {} } } };
  const plugin = apiPlugins({ checkDatabase: false, warm: false });
  await (plugin.configureServer as (server: ViteDevServer) => unknown)(server as unknown as ViteDevServer);
  // The one thing outside /api is the guard in front of a Vite route of its own (tested above).
  assert.deepEqual(mounted.splice(mounted.findIndex(([route]) => route === "/__open-in-editor"), 1).map(([, handler]) => handler), [localOnly]);
  const routes = mounted.map(([route]) => route);
  for (const route of ["/api/content", "/api/check", "/api/playground", "/api/lean", "/api/progress", "/api/research", "/api"]) assert.ok(routes.includes(route), `${route} is mounted`);
  assert.ok(routes.every((r) => r === "/api" || r.startsWith("/api/")), "nothing is mounted outside /api");
  // A route that skipped wrap() would run its handler here and answer something other than 403.
  for (const [route, handler] of mounted) {
    for (const [name, headers] of FOREIGN) {
      const sent = await call(handler, headers);
      assert.equal(sent.status, 403, `${route}, ${name}`);
    }
  }
});
