import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import type { ErrorReply } from "../shared/wire.ts";
import { handleCheck, handleLean, handlePlayground, warmLean } from "./check.ts";
import { checkDatabase, setDb, type Db } from "./db.ts";
import { leanServer } from "./lean/lsp.ts";
import { loadContent } from "./loader.ts";
import { handleProgress } from "./progress.ts";
import { HttpError, INTERNAL_ERROR, methodNotAllowed, sendJson } from "./sse.ts";

// The whole "backend": dev-server-only middleware on the Vite server, bound
// to localhost. Same shape as Fret Not's, without logins: there is one
// learner, and the only wall is the same-origin check.

/**
 * Reject cross-origin requests. Without this, any website the user visits
 * while the app is up can POST to these routes — a text/plain body is a
 * CORS "simple request" (no preflight), so the browser sends it — and
 * /api/check and /api/playground hand their text to Lean, which can run
 * arbitrary code while elaborating it. A request with no Origin (same-origin
 * navigation, curl) is allowed; one whose Origin host doesn't match the
 * request Host is refused. Pure, so a test pins the rule rather than the
 * wiring.
 */
export function sameOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return true; // no Origin → not a cross-site fetch
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Only this machine's own names. The same-origin check compares Origin with
 * Host, and a page on another site that resolves its own name to 127.0.0.1
 * (DNS rebinding) sends a matching pair; its Host is still not localhost.
 */
export function localHost(host: string | undefined): boolean {
  if (!host) return false;
  const name = host.replace(/:\d+$/, "").toLowerCase();
  return name === "localhost" || name === "127.0.0.1" || name === "[::1]";
}

type Handler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;

/**
 * Every route goes through here: the local-host and same-origin checks
 * first, then a JSON error envelope for anything thrown. No exceptions — a
 * route that bypasses wrap() is the bug the rule in CLAUDE.md exists to
 * prevent.
 */
export function wrap(fn: Handler): Handler {
  return (req, res) => {
    if (!localHost(req.headers.host) || !sameOrigin(req.headers.origin, req.headers.host)) {
      sendJson(res, 403, { error: "cross-origin request refused" } satisfies ErrorReply);
      return;
    }
    return Promise.resolve()
      .then(() => fn(req, res))
      .catch((e) => {
        const known = e instanceof HttpError;
        const status = known ? e.status : 500;
        if (!known) console.error(`[lean-into-it] ${req.method} ${req.url}:`, e);
        // Headers already out: there is no envelope left to send, and
        // sendJson's writeHead would throw inside this catch. Cut the socket
        // so the client sees a broken response rather than a hung one.
        if (res.headersSent) { res.destroy(); return; }
        if (res.writableEnded) return;
        // Only an HttpError's sentence is meant for the client; anything
        // else is logged above and answered with the generic line.
        const reply: ErrorReply = known ? { error: e.message, ...(e.code ? { code: e.code } : {}) } : { error: INTERNAL_ERROR };
        sendJson(res, status, reply);
      });
  };
}

function handleContent(req: IncomingMessage, res: ServerResponse): void {
  if (req.method !== "GET") return methodNotAllowed(res, "GET");
  sendJson(res, 200, loadContent());
}

export function apiPlugins(opts: { checkDatabase?: boolean; db?: Db; warm?: boolean } = {}): Plugin {
  // The tests hand in an in-process PGlite: the real routes, no server.
  if (opts.db) setDb(opts.db);
  return {
    name: "lean-into-it-api",
    apply: "serve",
    // Vite closes the old server when it restarts itself (a server file was
    // edited). Without this each restart left a Lean, holding Mathlib, behind.
    closeBundle() {
      leanServer().close();
    },
    configureServer(server) {
      // The curriculum, re-read from content/ on every request, so an edit
      // is live at once.
      server.middlewares.use("/api/content", wrap(handleContent));
      // Lean: an exercise's proof, the free playground, and whether Lean is
      // installed.
      server.middlewares.use("/api/check", wrap(handleCheck));
      server.middlewares.use("/api/playground", wrap(handlePlayground));
      server.middlewares.use("/api/lean", wrap(handleLean));
      server.middlewares.use("/api/progress", wrap(handleProgress));
      // Anything else under /api is a typo, not the SPA shell: answer in the
      // envelope the client already parses instead of index.html.
      server.middlewares.use("/api", wrap((_req, res) => sendJson(res, 404, { error: "no such route" })));
      // Lean is a child process; it must not outlive the dev server.
      server.httpServer?.once("close", () => leanServer().close());
      if (opts.warm !== false) warmLean();
      // The boot check: Vite awaits this hook, so a database that is
      // missing, down or behind on migrations stops `npm run dev` with
      // checkDatabase's message (what to run) instead of starting a server
      // whose first database route fails far from the cause.
      if (opts.checkDatabase === false) return;
      return checkDatabase().then(({ applied }) => {
        server.config.logger.info(`  database ready (${applied} migration(s) applied)`);
      });
    },
  };
}
