import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { wordsFromAlignment, type CharAlignment, type SpokenWord } from "../shared/tts/alignment.ts";
import type { ListenSettings, TtsSpeakReply, TtsVoice, TtsVoicesReply } from "../shared/wire.ts";
import { ROOT, envFile, parseEnv } from "../../scripts/env.mjs";
import { listenSettings, setListenSettings } from "../../scripts/db/progress.ts";
import { learnerId, rawDb } from "./db.ts";
import { HttpError, methodNotAllowed, readJsonBody, sendJson, subPath } from "./sse.ts";
import { DEFAULT_ELEVEN_MODEL, ELEVEN_MODELS, isElevenModel } from "./tts-models.ts";

// Listen mode: lesson prose, exercise sentences and Tutor replies read
// aloud by ElevenLabs, with the per-word timings that let the page move a
// highlight in step. Ported from Fret Not (web/server/tts.ts), without
// logins.
//
// What leaves this machine: the text to be read, to api.elevenlabs.io, and
// only when the learner presses play on something not read before. The key
// is read here and sent in a header; it never reaches the browser.
//
//   data/tts-cache/<hash>.mp3    the audio (the hash is of text, voice and model)
//   data/tts-cache/<hash>.json   {words: SpokenWord[]} for that audio

/* --------------------------------- the key -------------------------------- */

/** The ElevenLabs key: the process environment, else the checkout's
 *  .env.local (scripts/env.mjs; a file because the Dock app starts without
 *  the shell's environment). Read per call, so a new key needs no restart. */
export function apiKey(env: NodeJS.ProcessEnv = process.env, file: string = envFile()): string {
  const fromEnv = (env.ELEVENLABS_API_KEY || "").trim();
  if (fromEnv) return fromEnv;
  try {
    return (parseEnv(fs.readFileSync(file, "utf8")).ELEVENLABS_API_KEY || "").trim();
  } catch {
    return "";
  }
}

export const NO_KEY = "Listen mode needs an ElevenLabs key. Add a line ELEVENLABS_API_KEY=… to the file .env.local in the repo's root (it is not tracked by git); no restart is needed.";

/* ------------------------------ request shapes ----------------------------- */

// {url, init}, built pure so a test can pin what goes over the wire (and
// that the key goes only in a header) without a network call.

export function speakRequest({ key, voiceId, text, modelId }: { key: string; voiceId: string; text: string; modelId: string }): { url: string; init: RequestInit } {
  return {
    url: `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`,
    init: {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ text, model_id: modelId }),
    },
  };
}

export function voicesRequest({ key }: { key: string }): { url: string; init: RequestInit } {
  return { url: "https://api.elevenlabs.io/v2/voices?page_size=100", init: { method: "GET", headers: { "xi-api-key": key } } };
}

/* ---------------------------------- cache ---------------------------------- */

interface CacheEntry {
  words: SpokenWord[];
}

/** LEAN_INTO_IT_DATA_DIR (the tests' own), else <repo>/data, which git ignores. */
export function dataDir(): string {
  const override = process.env.LEAN_INTO_IT_DATA_DIR;
  return override ? path.resolve(ROOT, override) : path.join(ROOT, "data");
}

const cacheDir = () => path.join(dataDir(), "tts-cache");

/** The same text in the same voice with the same model is the same audio, so asking again costs nothing. */
export function cacheKey(text: string, voiceId: string, modelId: string): string {
  return crypto.createHash("sha256").update(text).update("\u0000").update(voiceId).update("\u0000").update(modelId).digest("hex");
}

function cachePaths(key: string): { audio: string; meta: string } {
  return { audio: path.join(cacheDir(), `${key}.mp3`), meta: path.join(cacheDir(), `${key}.json`) };
}

function readCache(key: string): CacheEntry | null {
  const { audio, meta } = cachePaths(key);
  if (!fs.existsSync(audio) || !fs.existsSync(meta)) return null;
  try {
    return JSON.parse(fs.readFileSync(meta, "utf8")) as CacheEntry;
  } catch {
    return null; // a torn write: ask again rather than serve a mismatch
  }
}

function writeCache(key: string, audio: Buffer, entry: CacheEntry): void {
  fs.mkdirSync(cacheDir(), { recursive: true });
  const { audio: audioPath, meta: metaPath } = cachePaths(key);
  // Whole file, then rename: a crash mid-write leaves no half entry.
  const tmpAudio = `${audioPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpAudio, audio);
  fs.renameSync(tmpAudio, audioPath);
  const tmpMeta = `${metaPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpMeta, JSON.stringify(entry));
  fs.renameSync(tmpMeta, metaPath);
}

/* -------------------------------- settings -------------------------------- */

/** One passage. A lesson block is a few hundred characters; this is a bound on what one request can spend. */
export const MAX_SPEAK_CHARS = 5000;
const VOICE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export async function settingsReply(): Promise<ListenSettings> {
  const row = await listenSettings(rawDb(), await learnerId());
  return { on: row.listenMode, voiceId: row.ttsVoiceId, modelId: isElevenModel(row.ttsModelId) ? row.ttsModelId : DEFAULT_ELEVEN_MODEL, models: ELEVEN_MODELS, configured: apiKey().length > 0 };
}

async function putSettings(raw: unknown): Promise<ListenSettings> {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const patch: Parameters<typeof setListenSettings>[2] = {};
  if ("on" in body) {
    if (typeof body.on !== "boolean") throw new HttpError(400, "`on` must be true or false");
    patch.listenMode = body.on;
  }
  if ("voiceId" in body) {
    if (typeof body.voiceId !== "string" || !VOICE_ID.test(body.voiceId)) throw new HttpError(400, "`voiceId` is not a voice id");
    patch.ttsVoiceId = body.voiceId;
  }
  if ("modelId" in body) {
    if (!isElevenModel(body.modelId)) throw new HttpError(400, "`modelId` is not one of the models on offer");
    patch.ttsModelId = body.modelId;
  }
  await setListenSettings(rawDb(), await learnerId(), patch);
  return settingsReply();
}

/* --------------------------------- routes --------------------------------- */

function requireKey(): string {
  const key = apiKey();
  if (!key) throw new HttpError(400, NO_KEY, "tts_no_key");
  return key;
}

/** ElevenLabs' own reason, when its error body has one, never the raw body. */
async function upstreamReason(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: { message?: unknown } | string };
    const message = typeof body.detail === "string" ? body.detail : body.detail?.message;
    return typeof message === "string" ? `: ${message.slice(0, 200)}` : "";
  } catch {
    return "";
  }
}

/** Requests to ElevenLabs under way, by cache key: a second ask for the same passage waits for the first. */
const inFlight = new Map<string, Promise<TtsSpeakReply>>();

/** Speak `text` in the stored voice and model: from the cache, else from
 *  ElevenLabs once. A request the browser gave up on (Skip) is still
 *  finished and kept: it is paid for either way, and the passage is then
 *  there when it is wanted. */
async function speak(text: string): Promise<TtsSpeakReply> {
  const { voiceId, modelId } = await settingsReply();
  if (!voiceId) throw new HttpError(400, "Choose a voice before using Listen mode.", "tts_no_voice");
  const hash = cacheKey(text, voiceId, modelId);
  const cached = readCache(hash);
  if (cached) return { audioUrl: `/api/tts/audio/${hash}.mp3`, words: cached.words };
  let asked = inFlight.get(hash);
  if (!asked) {
    asked = fromElevenLabs(text, voiceId, modelId, hash).finally(() => inFlight.delete(hash));
    inFlight.set(hash, asked);
  }
  return asked;
}

async function fromElevenLabs(text: string, voiceId: string, modelId: string, hash: string): Promise<TtsSpeakReply> {
  const { url, init } = speakRequest({ key: requireKey(), voiceId, text, modelId });
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
  } catch {
    throw new HttpError(502, "ElevenLabs could not be reached. Is this machine online?", "tts_upstream");
  }
  if (!res.ok) {
    const why = await upstreamReason(res);
    if (res.status === 401) throw new HttpError(502, `ElevenLabs did not accept the key in .env.local${why}`, "tts_bad_key");
    throw new HttpError(502, `ElevenLabs refused the request (${res.status})${why}`, "tts_upstream");
  }
  const json = (await res.json()) as { audio_base64?: unknown; alignment?: CharAlignment };
  if (typeof json.audio_base64 !== "string" || !json.alignment) throw new HttpError(502, "ElevenLabs answered without audio or word timings.", "tts_upstream");
  const words = wordsFromAlignment(json.alignment);
  writeCache(hash, Buffer.from(json.audio_base64, "base64"), { words });
  return { audioUrl: `/api/tts/audio/${hash}.mp3`, words };
}

async function voices(): Promise<TtsVoicesReply> {
  const { url, init } = voicesRequest({ key: requireKey() });
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new HttpError(502, "ElevenLabs could not be reached. Is this machine online?", "tts_upstream");
  }
  if (res.status === 401) throw new HttpError(502, `ElevenLabs did not accept the key in .env.local${await upstreamReason(res)}`, "tts_bad_key");
  if (!res.ok) throw new HttpError(502, `ElevenLabs refused the voice list (${res.status})${await upstreamReason(res)}`, "tts_upstream");
  const json = (await res.json()) as { voices?: { voice_id: string; name: string }[] };
  const list: TtsVoice[] = (json.voices ?? []).filter((v) => typeof v.voice_id === "string" && VOICE_ID.test(v.voice_id)).map((v) => ({ id: v.voice_id, name: String(v.name) }));
  return { voices: list };
}

const AUDIO_RE = /^audio\/([0-9a-f]{64})\.mp3$/;

/** A cached passage's audio. Byte ranges are honoured: without them a browser cannot seek in it. */
function sendAudio(req: IncomingMessage, res: ServerResponse, file: string): void {
  let size: number;
  try {
    size = fs.statSync(file).size;
  } catch {
    return sendJson(res, 404, { error: "no such cached audio" });
  }
  // The name is a hash of what the bytes are, so they can be kept for good.
  const headers = { "Content-Type": "audio/mpeg", "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=31536000, immutable" };
  let start = 0;
  let end = size - 1;
  let status = 200;
  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (m && (m[1] || m[2])) {
      if (m[1]) {
        start = Number(m[1]);
        if (m[2]) end = Math.min(Number(m[2]), size - 1);
      } else start = Math.max(0, size - Number(m[2])); // the last n bytes
      if (start > end || start >= size) {
        res.writeHead(416, { "Content-Range": `bytes */${size}` });
        res.end();
        return;
      }
      status = 206;
    } // anything else (several ranges, another unit): the whole file, as the standard allows
  }
  res.writeHead(status, { ...headers, "Content-Length": end - start + 1, ...(status === 206 ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}) });
  if (size === 0) return void res.end();
  // A file that goes away mid-read ends this reply, not the server.
  fs.createReadStream(file, { start, end }).on("error", () => res.destroy()).pipe(res);
}

/** /api/tts/settings, /voices, /speak and /audio/<hash>.mp3. */
export async function handleTts(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const seg = subPath(req);
  const audio = AUDIO_RE.exec(seg);
  if (audio) {
    if (req.method !== "GET") return methodNotAllowed(res, "GET");
    return sendAudio(req, res, cachePaths(audio[1]).audio);
  }
  if (seg === "settings") {
    if (req.method === "GET") return sendJson(res, 200, await settingsReply());
    if (req.method === "PUT") return sendJson(res, 200, await putSettings(await readJsonBody(req)));
    return methodNotAllowed(res, "GET, PUT");
  }
  if (seg === "voices") {
    if (req.method !== "GET") return methodNotAllowed(res, "GET");
    return sendJson(res, 200, await voices());
  }
  if (seg === "speak") {
    if (req.method !== "POST") return methodNotAllowed(res, "POST");
    const body = await readJsonBody<{ text?: unknown }>(req);
    if (typeof body?.text !== "string" || !body.text.trim()) throw new HttpError(400, "`text` must be a non-empty string");
    if (body.text.length > MAX_SPEAK_CHARS) throw new HttpError(413, `One passage can be at most ${MAX_SPEAK_CHARS} characters.`);
    return sendJson(res, 200, await speak(body.text));
  }
  sendJson(res, 404, { error: "no such route" });
}
