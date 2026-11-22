import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { freshDb } from "../../scripts/tests/testdb.mjs";
import { ensureLearner, listenSettings, setListenSettings } from "../../scripts/db/progress.ts";
import type { ListenSettings, TtsSpeakReply, TtsVoicesReply } from "../shared/wire.ts";
import { wrap } from "./api.ts";
import { setDb, type Db } from "./db.ts";
import { apiKey, cacheKey, dataDir, handleTts, MAX_SPEAK_CHARS, speakRequest, voicesRequest } from "./tts.ts";
import { DEFAULT_ELEVEN_MODEL } from "./tts-models.ts";

// Listen mode's server, with ElevenLabs stood in for: no test here reaches
// the network, and the cache is a temporary folder. The database is PGlite.

test("the key comes from the environment first, then the env file, and is empty when neither has it", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lii-tts-env-"));
  const file = path.join(tmp, ".env.local");
  fs.writeFileSync(file, "ELEVENLABS_API_KEY=from-file\n");
  try {
    assert.equal(apiKey({}, file), "from-file");
    assert.equal(apiKey({ ELEVENLABS_API_KEY: "from-env" }, file), "from-env");
    assert.equal(apiKey({}, path.join(tmp, "missing.env")), "");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("the cache key is the same for the same text, voice and model, and changes with any of them", () => {
  const a = cacheKey("hello", "voice1", "eleven_v4");
  assert.equal(a, cacheKey("hello", "voice1", "eleven_v4"));
  assert.notEqual(a, cacheKey("hello there", "voice1", "eleven_v4"));
  assert.notEqual(a, cacheKey("hello", "voice2", "eleven_v4"));
  assert.notEqual(a, cacheKey("hello", "voice1", "eleven_flash_v2_5"));
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("the key goes to ElevenLabs in a header and nowhere else", () => {
  const speak = speakRequest({ key: "secret", voiceId: "v id/odd", text: "hi", modelId: "eleven_v4" });
  assert.ok(speak.url.startsWith("https://api.elevenlabs.io/v1/text-to-speech/v%20id%2Fodd/with-timestamps"));
  assert.ok(!speak.url.includes("secret"));
  assert.equal((speak.init.headers as Record<string, string>)["xi-api-key"], "secret");
  assert.deepEqual(JSON.parse(speak.init.body as string), { text: "hi", model_id: "eleven_v4" });
  const voices = voicesRequest({ key: "secret" });
  assert.equal(voices.url, "https://api.elevenlabs.io/v2/voices?page_size=100");
  assert.equal((voices.init.headers as Record<string, string>)["xi-api-key"], "secret");
});

/* ------------------------- the routes, behind real HTTP ------------------------ */

let tmp = "";
let server: http.Server;
let base = "";
let db: Db;
let closeDb: () => Promise<void>;
let learner = "";
let realFetch: typeof fetch;
let upstream: { url: string; key: string | undefined; body: string }[] = [];
let upstreamStatus = 200;
const saved = { data: process.env.LEAN_INTO_IT_DATA_DIR, envFile: process.env.LEAN_INTO_IT_ENV_FILE, key: process.env.ELEVENLABS_API_KEY };
const envPath = () => path.join(tmp, ".env.local");

const ALIGNMENT = {
  characters: [..."hi there"],
  character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7],
  character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
};

async function call<T = unknown>(method: string, route: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; json: T; text: string }> {
  const res = await realFetch(`${base}/api/tts${route}`, {
    method,
    headers: { "X-Lean-Into-It": "1", ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(5000),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* audio */
  }
  return { status: res.status, json: json as T, text };
}

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lii-tts-"));
  process.env.LEAN_INTO_IT_DATA_DIR = path.join(tmp, "data");
  process.env.LEAN_INTO_IT_ENV_FILE = envPath();
  delete process.env.ELEVENLABS_API_KEY;
  if (!dataDir().startsWith(tmp + path.sep)) throw new Error(`test isolation failed: ${dataDir()} is not under ${tmp}`);
  fs.writeFileSync(envPath(), "ELEVENLABS_API_KEY=test-key\n");

  realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const href = url.toString();
    // Only ElevenLabs is stood in for; anything else here is a mistake.
    if (!href.startsWith("https://api.elevenlabs.io/")) throw new Error(`a test reached for ${href}`);
    upstream.push({ url: href, key: (init?.headers as Record<string, string> | undefined)?.["xi-api-key"], body: typeof init?.body === "string" ? init.body : "" });
    if (upstreamStatus !== 200) return new Response(JSON.stringify({ detail: { status: "nope", message: "the reason ElevenLabs gave" } }), { status: upstreamStatus });
    if (href.includes("/with-timestamps")) return new Response(JSON.stringify({ audio_base64: Buffer.from("fake mp3 bytes").toString("base64"), alignment: ALIGNMENT }), { status: 200 });
    if (href.includes("/v2/voices")) return new Response(JSON.stringify({ voices: [{ voice_id: "v1", name: "Test Voice", preview_url: "https://example.invalid/p.mp3" }, { voice_id: "bad id!", name: "Odd" }] }), { status: 200 });
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  const fresh = await freshDb();
  db = fresh.db;
  closeDb = fresh.close;
  setDb(db);
  learner = await ensureLearner(db);
  // Mounted as the dev server mounts it: behind wrap(), with the prefix stripped.
  const handler = wrap(handleTts);
  server = http.createServer((req, res) => {
    req.url = (req.url ?? "/").replace(/^\/api\/tts/, "") || "/";
    void handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  globalThis.fetch = realFetch;
  try {
    server?.closeAllConnections();
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  } finally {
    for (const [key, value] of [["LEAN_INTO_IT_DATA_DIR", saved.data], ["LEAN_INTO_IT_ENV_FILE", saved.envFile], ["ELEVENLABS_API_KEY", saved.key]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
    setDb(null);
    await closeDb?.();
  }
});

test("settings start off: Listen mode off, no voice, the default model; and say whether there is a key, never the key", async () => {
  const { status, json, text } = await call<ListenSettings>("GET", "/settings");
  assert.equal(status, 200);
  assert.deepEqual([json.on, json.voiceId, json.modelId, json.configured], [false, null, DEFAULT_ELEVEN_MODEL, true]);
  assert.ok(json.models.some((m) => m.id === DEFAULT_ELEVEN_MODEL));
  assert.ok(!text.includes("test-key"));
});

test("speaking before a voice is chosen is refused in words, and nothing is sent", async () => {
  upstream = [];
  const { status, json } = await call<{ error: string; code: string }>("POST", "/speak", { text: "hello" });
  assert.equal(status, 400);
  assert.match(json.error, /choose a voice/i);
  assert.equal(json.code, "tts_no_voice");
  assert.equal(upstream.length, 0);
});

test("settings are kept for the learner; a made-up model or a malformed voice is refused", async () => {
  const put = await call<ListenSettings>("PUT", "/settings", { on: true, voiceId: "v1", modelId: "eleven_flash_v2_5" });
  assert.equal(put.status, 200);
  assert.deepEqual([put.json.on, put.json.voiceId, put.json.modelId], [true, "v1", "eleven_flash_v2_5"]);
  assert.deepEqual(await listenSettings(db, learner), { listenMode: true, ttsVoiceId: "v1", ttsModelId: "eleven_flash_v2_5" });
  // Only what is given changes.
  assert.equal((await call<ListenSettings>("PUT", "/settings", { on: false })).json.voiceId, "v1");
  assert.equal((await call("PUT", "/settings", { modelId: "gpt-9" })).status, 400);
  assert.equal((await call("PUT", "/settings", { voiceId: "../../etc" })).status, 400);
  assert.equal((await call("PUT", "/settings", { on: "yes" })).status, 400);
  assert.equal((await call("POST", "/settings", {})).status, 405);
  await setListenSettings(db, learner, { ttsModelId: "eleven_v4" });
});

test("a passage is sent to ElevenLabs once: the second listen is the cache, and the audio is served from it", async () => {
  upstream = [];
  const first = await call<TtsSpeakReply>("POST", "/speak", { text: "hi there" });
  assert.equal(first.status, 200);
  assert.equal(upstream.length, 1);
  assert.equal(upstream[0].key, "test-key");
  assert.deepEqual(JSON.parse(upstream[0].body), { text: "hi there", model_id: "eleven_v4" });
  assert.deepEqual(first.json.words.map((w) => [w.text, w.startMs, w.endMs]), [["hi", 0, 200], ["there", 300, 800]]);
  assert.equal(first.json.audioUrl, `/api/tts/audio/${cacheKey("hi there", "v1", "eleven_v4")}.mp3`);
  assert.ok(!JSON.stringify(first.json).includes("test-key"));

  const second = await call<TtsSpeakReply>("POST", "/speak", { text: "hi there" });
  assert.equal(upstream.length, 1, "no second call for the same text, voice and model");
  assert.deepEqual(second.json, first.json);

  // Another model is other audio: one more call.
  await setListenSettings(db, learner, { ttsModelId: "eleven_flash_v2_5" });
  await call("POST", "/speak", { text: "hi there" });
  assert.equal(upstream.length, 2);
  await setListenSettings(db, learner, { ttsModelId: "eleven_v4" });

  // As an <audio> element asks: no header of the app's, but the browser says it is this page.
  const audio = await realFetch(`${base}${first.json.audioUrl}`, { headers: { "Sec-Fetch-Site": "same-origin" } });
  assert.equal(audio.status, 200);
  assert.equal(audio.headers.get("content-type"), "audio/mpeg");
  assert.equal(Buffer.from(await audio.arrayBuffer()).toString(), "fake mp3 bytes");
  // The cache is where the tests put it, not the repo's data/.
  assert.ok(fs.existsSync(path.join(tmp, "data", "tts-cache", `${cacheKey("hi there", "v1", "eleven_v4")}.mp3`)));
});

test("two asks for a passage at the same moment are one request to ElevenLabs", async () => {
  upstream = [];
  const [a, b] = await Promise.all([call<TtsSpeakReply>("POST", "/speak", { text: "said twice at once" }), call<TtsSpeakReply>("POST", "/speak", { text: "said twice at once" })]);
  assert.deepEqual([a.status, b.status], [200, 200]);
  assert.deepEqual(a.json, b.json);
  assert.equal(upstream.length, 1);
});

test("the audio can be asked for in byte ranges, which is what lets a browser seek in it", async () => {
  const url = `${base}/api/tts/audio/${cacheKey("hi there", "v1", "eleven_v4")}.mp3`;
  const whole = await realFetch(url, { headers: { "Sec-Fetch-Site": "same-origin" } });
  assert.equal(whole.headers.get("accept-ranges"), "bytes");
  const ask = async (range: string) => {
    const res = await realFetch(url, { headers: { Range: range, "Sec-Fetch-Site": "same-origin" } });
    return [res.status, res.headers.get("content-range"), Buffer.from(await res.arrayBuffer()).toString()];
  };
  // The file is "fake mp3 bytes": 14 bytes.
  assert.deepEqual(await ask("bytes=5-7"), [206, "bytes 5-7/14", "mp3"]);
  assert.deepEqual(await ask("bytes=9-"), [206, "bytes 9-13/14", "bytes"]);
  assert.deepEqual(await ask("bytes=-4"), [206, "bytes 10-13/14", "ytes"]);
  assert.deepEqual(await ask("bytes=5-999"), [206, "bytes 5-13/14", "mp3 bytes"]);
  assert.deepEqual(await ask("bytes=20-"), [416, "bytes */14", ""]);
  assert.deepEqual(await ask("lines=1-2"), [200, null, "fake mp3 bytes"]);
});

test("a cached passage still plays with no key at all", async () => {
  fs.writeFileSync(envPath(), "");
  try {
    upstream = [];
    assert.equal((await call("POST", "/speak", { text: "hi there" })).status, 200);
    assert.equal(upstream.length, 0);
  } finally {
    fs.writeFileSync(envPath(), "ELEVENLABS_API_KEY=test-key\n");
  }
});

test("without a key: settings say so, and speaking or listing voices answers with how to add one", async () => {
  fs.writeFileSync(envPath(), "# no key yet\n");
  try {
    upstream = [];
    assert.equal((await call<ListenSettings>("GET", "/settings")).json.configured, false);
    for (const [method, route, body] of [["POST", "/speak", { text: "something new" }], ["GET", "/voices", undefined]] as const) {
      const { status, json } = await call<{ error: string; code: string }>(method, route, body);
      assert.equal(status, 400, route);
      assert.equal(json.code, "tts_no_key");
      assert.match(json.error, /ELEVENLABS_API_KEY=.*\.env\.local/);
    }
    assert.equal(upstream.length, 0);
  } finally {
    fs.writeFileSync(envPath(), "ELEVENLABS_API_KEY=test-key\n");
  }
});

test("what is asked for is bounded: empty text, text that is not text, and a passage too long are refused unsent", async () => {
  upstream = [];
  assert.equal((await call("POST", "/speak", { text: "   " })).status, 400);
  assert.equal((await call("POST", "/speak", { text: 5 })).status, 400);
  assert.equal((await call("POST", "/speak", { text: "x".repeat(MAX_SPEAK_CHARS + 1) })).status, 413);
  assert.equal((await call("GET", "/speak")).status, 405);
  assert.equal(upstream.length, 0);
});

test("a refusal from ElevenLabs reaches the page as a sentence with its reason, and nothing is cached", async () => {
  upstreamStatus = 401;
  try {
    const bad = await call<{ error: string; code: string }>("POST", "/speak", { text: "never said before" });
    assert.equal(bad.status, 502);
    assert.equal(bad.json.code, "tts_bad_key");
    assert.match(bad.json.error, /did not accept the key.*the reason ElevenLabs gave/);
    assert.ok(!bad.json.error.includes("test-key"));
    upstreamStatus = 429;
    const busy = await call<{ error: string; code: string }>("POST", "/speak", { text: "never said before" });
    assert.equal(busy.json.code, "tts_upstream");
    assert.match(busy.json.error, /429/);
  } finally {
    upstreamStatus = 200;
  }
  assert.ok(!fs.existsSync(path.join(tmp, "data", "tts-cache", `${cacheKey("never said before", "v1", "eleven_v4")}.mp3`)));
});

test("the voice list is ElevenLabs' own, as ids and names only", async () => {
  const { status, json } = await call<TtsVoicesReply>("GET", "/voices");
  assert.equal(status, 200);
  assert.deepEqual(json.voices, [{ id: "v1", name: "Test Voice" }]);
});

test("audio that was never made is a 404, a path that is not a hash is no route, and another site is refused", async () => {
  assert.equal((await call("GET", `/audio/${"0".repeat(64)}.mp3`)).status, 404);
  assert.equal((await call("GET", "/audio/..%2F..%2F.env.local")).status, 404);
  assert.equal((await call("GET", "/nothing")).status, 404);
  const cross = await call("POST", "/speak", { text: "hi there" }, { Origin: "https://example.com" });
  assert.equal(cross.status, 403);
});
