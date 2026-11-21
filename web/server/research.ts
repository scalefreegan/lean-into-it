// Research maps (Field notes, bead lii-2zo.4): the Tutor searches the web
// about a result in the news and makes a plain-language map of it, saved
// with its sources and the date.
//
//   GET    /api/research        → ResearchListReply: the maps (newest first) and the run, if any
//   POST   /api/research        {question} → 202 ResearchJob: a run is started
//   DELETE /api/research/run    → {ok}: Stop the run, or put away how the last one ended
//   GET    /api/research/<id>   → ResearchMap
//   DELETE /api/research/<id>   → {ok}
//
// A run takes minutes, so it does not hang on the request: it goes on when
// the page is left, and the page asks how it is doing (GET). Its result, a
// saved map or a sentence saying why not, is kept until the next run.
//
// A research turn is the headless `claude -p` (scripts/claude.mjs) with
// WebSearch and WebFetch added and nothing that writes or runs; it takes the
// Tutor's one-turn slot (tutor.ts claimTutor). Its reply ends in a JSON map
// that web/shared/research.ts readMap holds to the rules (every claim
// sourced, "claimed" apart from "formally verified", concepts resolved
// against the path). Each source link is then opened once from here (never
// one on this machine or a private network, redirects followed by hand and
// checked again), and an item whose every source did not open moves to
// "could not confirm" (settleLinks). Offline, nothing is started: the reply
// says the feature needs the internet. Saved maps open offline.
//
// The question goes to the web search: it is the learner's own words about
// a public result, and the page says so before they ask.

import type { IncomingMessage, ServerResponse } from "node:http";
import { lookup } from "node:dns/promises";
import { lookup as dnsLookup } from "node:dns";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { DEFAULT_MODEL, REPO_ROOT, startClaude, sweepRunDirs } from "../../scripts/claude.mjs";
import { deleteResearchMap, researchMap, researchMapList, saveResearchMap, type ResearchRow } from "../../scripts/db/progress.ts";
import { MAP_FORMAT, pathConcepts, readMap, settleLinks, type ResearchMap, type ResearchMapBody, type ResearchSource } from "../shared/research.ts";
import type { ResearchJob, ResearchListReply, ResearchRequest } from "../shared/wire.ts";
import { learnerId, rawDb } from "./db.ts";
import { loadContent } from "./loader.ts";
import { HttpError, methodNotAllowed, readJsonBody, sendJson } from "./sse.ts";
import { claimTutor, releaseTutor, tutorBusy } from "./tutor.ts";

export const MAX_QUESTION = 1000;
/** Searching and reading several pages takes a while. */
const RESEARCH_TURNS = 40;
const RESEARCH_SECONDS = 600;

export const OFFLINE = "Research maps need the internet, to search for the result and read its sources, and this Mac does not seem to be online. Saved maps still open.";

/* ------------------------------- the prompt ------------------------------- */

export const RESEARCH_PROMPT = `Field notes. The learner is learning mathematical proof and Lean 4 in Lean Into It, and asks about a result in the news (an AI-assisted proof, a newly formalised theorem, a claimed solution). Search the web and read the sources yourself (WebSearch, then WebFetch on the pages you cite), then make a plain-language map of it for them. You cannot write files or run commands.
  - Keep apart what was CLAIMED (announced, argued informally, reported) and what was FORMALLY VERIFIED (checked by a proof assistant: say which, e.g. Lean 4 with Mathlib, Coq, Isabelle; and what exactly the formal statement says, when it says less than the headline). Most news is claims. If nothing was formally verified, or you could not find that it was, say so plainly in verifiedNote.
  - Every claimed, verified and open item cites the numbers of sources that say it, and every source is a page you opened in this turn, with its real URL. Never cite a page from memory. Prefer the original paper, preprint, repository or the authors' own announcement to news reports, and name who claimed what and when.
  - Say plainly what you could not confirm, in "unconfirmed": a date you could not pin down, a claim only one outlet makes, a formal proof whose repository you could not find. Do not smooth anything over.
  - "open": what is still open, disputed or under review, with who says so.
  - "concepts": the concepts of the learner's path the result rests on, by id, from the list you are given, each with a short "why". Only ids from that list.
  - Write for a learner, in plain words; no jargon left unexplained.
Reply with a short paragraph for the learner, then end with ONE fenced \`\`\`json block holding the map, in exactly this shape:
${MAP_FORMAT}`;

/** What the run is asked: the question, today's date, and the concepts it may link. */
export function researchPrompt(question: string, content: Parameters<typeof pathConcepts>[0], today = new Date()): string {
  const concepts = pathConcepts(content)
    .map((c) => `- ${c.id}: ${c.title}${c.where.kind === "outline" ? ` (outlined, level ${c.where.level}, not yet written)` : ""}`)
    .join("\n");
  return `Today is ${today.toISOString().slice(0, 10)}.\n\nThe learner asks:\n${question}\n\nThe concepts of their path (id: title):\n${concepts}`;
}

/* ---------------------- the run, the network, the links -------------------- */

export type ResearchAgent = (a: { prompt: string; systemPrompt: string; signal: AbortSignal }) => Promise<string>;
const claudeResearch: ResearchAgent = async ({ prompt, systemPrompt, signal }) =>
  (await startClaude({ prompt, systemPrompt, model: DEFAULT_MODEL, cwd: REPO_ROOT, signal, web: true, maxTurns: RESEARCH_TURNS, timeoutSec: RESEARCH_SECONDS }).result).text;
let agent: ResearchAgent = claudeResearch;
/** Tests only: null puts the real run back. */
export function setResearchAgent(a: ResearchAgent | null): void {
  agent = a ?? claudeResearch;
}

/** Whether the internet answers: the name the Tutor's own runs need resolves. */
const realOnline = async (): Promise<boolean> => {
  try {
    await Promise.race([lookup("api.anthropic.com"), new Promise((_, no) => setTimeout(() => no(new Error("timeout")), 3000))]);
    return true;
  } catch {
    return false;
  }
};
let online: () => Promise<boolean> = realOnline;
/** Tests only. */
export function setOnline(f: (() => Promise<boolean>) | null): void {
  online = f ?? realOnline;
}

/** An IPv6 address as its 8 groups, or null. */
function groups6(ip: string): number[] | null {
  let x = ip.toLowerCase();
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(x);
  if (v4) {
    const [a, b, c, d] = v4[1].split(".").map(Number);
    x = x.slice(0, -v4[1].length) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = x.split("::");
  const part = (p: string | undefined) => (p ? p.split(":").map((h) => parseInt(h, 16)) : []);
  const h = part(head);
  const t = part(tail);
  const out = x.includes("::") ? [...h, ...Array(8 - h.length - t.length).fill(0), ...t] : h;
  return out.length === 8 && out.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffff) ? out : null;
}

/** An address on this machine or a private network (or one that hides an IPv4 one): never fetched for a link check. */
export function privateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b, c] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0 && c === 0) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (v !== 6) return true;
  const g = groups6(ip);
  if (!g) return true;
  const v4 = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  // An IPv4 address carried inside: mapped (::ffff:), compatible (::a.b.c.d), NAT64 (64:ff9b::/96), 6to4 (2002::/16).
  if (g.slice(0, 5).every((n) => n === 0) && (g[5] === 0xffff || g[5] === 0)) return g[5] === 0 && g[6] === 0 && g[7] <= 1 ? true : privateAddress(v4(g[6], g[7]));
  if (g[0] === 0x64 && g[1] === 0xff9b) return privateAddress(v4(g[6], g[7]));
  if (g[0] === 0x2002) return privateAddress(v4(g[1], g[2]));
  return (g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0 || (g[0] & 0xff00) === 0xff00;
}

class PrivateHost extends Error {}

/** DNS for a link check: refuses a private answer, so the address checked is the one connected to (no rebinding). */
const guardedLookup = (hostname: string, options: object, callback: (err: Error | null, address?: string | { address: string; family: number }[], family?: number) => void) => {
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) return callback(new PrivateHost(hostname));
  dnsLookup(hostname, { ...options, all: true }, (err, all) => {
    if (err) return callback(err);
    const list = all as { address: string; family: number }[];
    if (!list.length) return callback(Object.assign(new Error("no address"), { code: "ENOTFOUND" }));
    if (list.some((a) => privateAddress(a.address))) return callback(new PrivateHost(hostname));
    if ((options as { all?: boolean }).all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
};

/** One request, no body read: its status and where it redirects. */
function probe(url: URL, method: "HEAD" | "GET", signal: AbortSignal): Promise<{ status: number; location: string | null }> {
  return new Promise((resolve, reject) => {
    if (isIP(url.hostname.replace(/^\[|\]$/g, "")) && privateAddress(url.hostname.replace(/^\[|\]$/g, ""))) return reject(new PrivateHost(url.hostname));
    const req = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, { method, lookup: guardedLookup as never, signal, timeout: 8000 }, (res) => {
      res.resume();
      resolve({ status: res.statusCode ?? 0, location: typeof res.headers.location === "string" ? res.headers.location : null });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

/**
 * Whether a link opens: a HEAD, or a GET where HEAD is refused; any status
 * under 400, redirects followed by hand (at most 3), every hop's address
 * checked as it is connected to. `false`: it did not open (or its name does
 * not exist); "private": a host on this machine or a private network, never
 * fetched; null: not known (a timeout, a temporary DNS failure, stopped).
 * No user agent of the app's own is sent.
 */
const realOpens = async (url: string, signal: AbortSignal): Promise<boolean | "private" | null> => {
  const ask = async (method: "HEAD" | "GET"): Promise<number> => {
    let at = new URL(url);
    for (let hop = 0; hop <= 3; hop++) {
      const { status, location } = await probe(at, method, signal);
      if (!(status >= 300 && status < 400 && location)) return status;
      at = new URL(location, at);
      if (at.protocol !== "https:" && at.protocol !== "http:") return 999;
    }
    return 999;
  };
  try {
    if ((await ask("HEAD")) < 400) return true;
    return (await ask("GET")) < 400;
  } catch (e) {
    if (e instanceof PrivateHost) return "private";
    if (signal.aborted) return null;
    const code = (e as { code?: string }).code;
    return code === "ENOTFOUND" ? false : code === "EAI_AGAIN" || (e as Error).message === "timeout" ? null : false;
  }
};
let opens: (url: string, signal: AbortSignal) => Promise<boolean | "private" | null> = realOpens;
/** Tests only. */
export function setLinkCheck(f: ((url: string) => Promise<boolean | "private" | null>) | null): void {
  opens = f ?? realOpens;
}

/** The whole link stage's limit: after it, a link not yet checked is not known. */
const LINKS_SECONDS = 60;

/** Each source checked once, four at a time, within LINKS_SECONDS. */
export async function checkLinks(sources: ResearchSource[], signal?: AbortSignal): Promise<ResearchSource[]> {
  const out: ResearchSource[] = sources.map((s) => ({ ...s, reachable: null }));
  const limit = AbortSignal.any([AbortSignal.timeout(LINKS_SECONDS * 1000), ...(signal ? [signal] : [])]);
  let next = 0;
  const worker = async () => {
    while (next < out.length && !limit.aborted) {
      const s = out[next++];
      const r = await opens(s.url, limit);
      if (r === "private") {
        s.reachable = false;
        s.private = true;
      } else s.reachable = r;
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, out.length) }, worker));
  return out;
}

/** A run's failure that means the network is down, said as such. */
const OFFLINE_RE = /ENOTFOUND|EAI_AGAIN|getaddrinfo|ENETUNREACH|fetch failed|network (is )?(down|unreachable)|unable to connect|connection error/i;

/* -------------------------------- the routes ------------------------------- */

const toMap = (r: ResearchRow): ResearchMap => ({ ...(r.map as ResearchMapBody), id: r.id, madeAt: new Date(r.createdAt).toISOString() });

/** The run going on, or the last one's result. One at a time (the Tutor's slot). */
const state = ((globalThis as { __leanIntoItResearch?: { job: ResearchJob | null; ctrl: AbortController | null; done: Promise<void> } }).__leanIntoItResearch ??= {
  job: null,
  ctrl: null,
  done: Promise.resolve(),
});
/** Tests only: when the run in progress has finished. */
export const researchSettled = (): Promise<void> => state.done;

async function run(question: string, ctrl: AbortController): Promise<void> {
  const job = state.job!;
  let stage = "start";
  try {
    sweepRunDirs();
    const content = loadContent();
    stage = "run";
    let reply: string;
    try {
      reply = await agent({ prompt: researchPrompt(question, content), systemPrompt: RESEARCH_PROMPT, signal: ctrl.signal });
    } catch (e) {
      const message = (e as Error)?.message || String(e);
      job.error = ctrl.signal.aborted || message === "stopped" ? "Stopped." : OFFLINE_RE.test(message) ? OFFLINE : message;
      return;
    }
    const read = readMap(reply, question, content);
    if ("error" in read) {
      job.error = read.error;
      return;
    }
    stage = "save";
    const map = settleLinks({ ...read.map, sources: await checkLinks(read.map.sources, ctrl.signal) });
    if (ctrl.signal.aborted) {
      job.error = "Stopped.";
      return;
    }
    const row = await saveResearchMap(rawDb(), await learnerId(), { question: map.question, title: map.title, map });
    job.mapId = row.id;
  } catch (e) {
    console.error("[lean-into-it] research:", e);
    job.error = stage === "start" ? `The run could not start: ${(e as Error)?.message || e}` : "The map could not be saved.";
  } finally {
    job.running = false;
    state.ctrl = null;
    releaseTutor();
  }
}

async function start(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody<Partial<ResearchRequest>>(req);
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) throw new HttpError(400, "say which result to map");
  if (question.length > MAX_QUESTION) throw new HttpError(413, "that question is too long");
  if (!(await online())) throw new HttpError(503, OFFLINE, "offline");
  if (!claimTutor()) throw new HttpError(409, "the Tutor is busy with another turn; wait for it to finish");
  const ctrl = new AbortController();
  state.ctrl = ctrl;
  state.job = { question, startedAt: new Date().toISOString(), running: true };
  state.done = run(question, ctrl);
  sendJson(res, 202, state.job);
}

export async function handleResearch(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const route = (req.url ?? "/").split("?")[0].replace(/\/+$/, "");
  if (route === "") {
    if (req.method === "GET") {
      const rows = await researchMapList(rawDb(), await learnerId());
      return sendJson(res, 200, { maps: rows.map((r) => ({ id: r.id, title: r.title, question: r.question, madeAt: new Date(r.createdAt).toISOString() })), busy: tutorBusy(), job: state.job } satisfies ResearchListReply);
    }
    if (req.method === "POST") return start(req, res);
    return methodNotAllowed(res, "GET, POST");
  }
  if (route === "/run") {
    if (req.method !== "DELETE") return methodNotAllowed(res, "DELETE");
    // Stop a run going on; or put away how the last one ended.
    if (state.job?.running) state.ctrl?.abort();
    else state.job = null;
    return sendJson(res, 200, { ok: true });
  }
  const m = /^\/(\d{1,15})$/.exec(route);
  if (!m) return sendJson(res, 404, { error: "no such route" });
  const id = Number(m[1]);
  if (req.method === "GET") {
    const row = await researchMap(rawDb(), await learnerId(), id);
    if (!row) throw new HttpError(404, "no such map");
    return sendJson(res, 200, toMap(row));
  }
  if (req.method === "DELETE") {
    if (!(await deleteResearchMap(rawDb(), await learnerId(), id))) throw new HttpError(404, "no such map");
    if (state.job?.mapId === id) state.job = null;
    return sendJson(res, 200, { ok: true });
  }
  return methodNotAllowed(res, "GET, DELETE");
}
