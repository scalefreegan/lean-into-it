#!/usr/bin/env node
// The Tutor's way to ask Lean, as proof partner in the Playground (bead
// lii-2zo.3): a stdio MCP server with one tool, started by a Playground
// turn's `claude -p` run through its --mcp-config (web/server/tutor.ts).
//
//   lean_check(lean, goals_after_line?)
//       a scratch Lean file (Mathlib is imported for it): every message
//       Lean gives, whether it accepted it, whether a `sorry` is left, and
//       the goals after a given line
//
// It does not run Lean. It posts to the app that started it
// (/api/tutor/lean, web/server/partner.ts), which searches the text for
// anything that would run a program and checks it in a scratch document,
// never the learner's file. Where to post and the turn's token come from
// the environment (LII_LEAN_URL, LII_LEAN_TOKEN), never from a tool
// argument: the URL must be this machine's, so nothing the model says can
// send the text anywhere else. The process ends when its stdin closes.

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

export const SERVER_NAME = "lean";
export const TOOL_NAMES = ["lean_check"];
export const MCP_TOOLS = TOOL_NAMES.map((t) => `mcp__${SERVER_NAME}__${t}`);

/** Characters of scratch Lean (web/shared/partner.ts MAX_SCRATCH). */
const MAX_LEAN = 20_000;
/** A check has 20 seconds in the app; a first one also loads Mathlib. */
const TIMEOUT_MS = 90_000;
const TOKEN = /^[A-Za-z0-9_-]{20,100}$/;

/** Where to post and with what, from the environment. Throws when either
 *  is missing or the URL is not this machine's own. */
export function configFromEnv(env = process.env) {
  const token = env.LII_LEAN_TOKEN ?? "";
  let url;
  try {
    url = new URL(env.LII_LEAN_URL ?? "");
  } catch {
    throw new Error("LII_LEAN_URL must be a URL");
  }
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/api/tutor/lean" || url.search || url.username) {
    throw new Error("LII_LEAN_URL must be this machine's /api/tutor/lean");
  }
  if (!TOKEN.test(token)) throw new Error("LII_LEAN_TOKEN is missing or malformed");
  return { url: url.toString(), origin: url.origin, token };
}

/** The app's reply as the Tutor reads it: plain data, short keys spelt out. */
export function shape(reply) {
  if (!reply.ran) return { ran: false, refused: reply.refused, note: "Nothing was sent to Lean. Rewrite it without these and ask again." };
  return {
    ran: true,
    accepted: reply.accepted,
    ...(reply.accepted && reply.sorry ? { note: "Accepted with `sorry` standing in for a proof: the statement makes sense to Lean, and nothing is proved yet." } : {}),
    messages: reply.messages,
    ...(reply.more ? { messagesLeftOut: reply.more } : {}),
    ...(reply.goals === null ? {} : { goalsAfterLine: reply.goals.length ? reply.goals : "no goals left" }),
  };
}

const result = (data) => ({ content: [{ type: "text", text: JSON.stringify(data) }] });
const failure = (message) => ({ content: [{ type: "text", text: message }], isError: true });

/** `ask({lean, goalsAfterLine}) → PartnerReply`, or throws an Error whose
 *  message the Tutor may read. Injectable for the tests. */
export function createLeanServer(ask) {
  const server = new McpServer({ name: SERVER_NAME, version: "1.0.0" });
  server.registerTool(
    "lean_check",
    {
      title: "Ask Lean about scratch Lean",
      description:
        "Check Lean 4 with the app's own Lean and Mathlib, in a scratch file that is not the learner's. Give the file's text WITHOUT `import Mathlib` (it is added). You get every message Lean gives with its line (errors, what #check prints, what exact? / apply? / rw? found), whether Lean accepted the file, and, if you pass goals_after_line, the goals after the tactic on that line. Use it to: see that a statement elaborates (end it `:= by sorry`); find a lemma (state the fact as an `example` and prove it with `exact?`, or #check a name you guess); try a next step and read the goals it leaves. A check has 20 seconds. Not run: #eval, IO, anything that runs a program; of the # commands only #check, #check_failure, #print, #reduce, #synth.",
      inputSchema: {
        lean: z.string().min(1).max(MAX_LEAN).describe("the scratch file, without the import"),
        goals_after_line: z.number().int().min(1).max(2_000).optional().describe("a 1-based line of `lean`: also return the goals at the end of that line"),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ lean, goals_after_line }) => {
      try {
        return result(shape(await ask({ lean, goalsAfterLine: goals_after_line })));
      } catch (e) {
        return failure(`Lean could not be asked: ${e?.message || e}`);
      }
    },
  );
  return server;
}

/** Post to the app. An HTTP error's sentence is the app's own (its error
 *  envelope), meant to be read. */
export function httpAsk({ url, origin, token }, fetchFn = fetch) {
  return async ({ lean, goalsAfterLine }) => {
    let res;
    try {
      res = await fetchFn(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify({ token, lean, ...(goalsAfterLine ? { goalsAfterLine } : {}) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "error",
      });
    } catch (e) {
      throw new Error(e?.name === "TimeoutError" ? "the app took too long to answer" : "the app could not be reached");
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(typeof body?.error === "string" ? body.error : `the app answered ${res.status}`);
    if (!body || typeof body.ran !== "boolean") throw new Error("the app's answer could not be read");
    return body;
  };
}

async function main() {
  const server = createLeanServer(httpAsk(configFromEnv()));
  const shutdown = () => process.exit(0);
  process.stdin.on("end", shutdown);
  process.stdin.on("close", shutdown);
  server.server.onclose = shutdown;
  await server.connect(new StdioServerTransport());
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(self)) {
  main().catch((e) => {
    console.error(`[lean-mcp] ${e?.message || e}`);
    process.exit(1);
  });
}
