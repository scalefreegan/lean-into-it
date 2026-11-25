import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import type { ErrorReply } from "../shared/wire.ts";
import { handleCheck, handleGallery, handleLean, handlePlayground, warmLean } from "./check.ts";
import { checkDatabase, setDb, type Db } from "./db.ts";
import { closeLean } from "./lean/lsp.ts";
import { loadContent } from "./loader.ts";
import { fromApp, localHost, loopbackHost, mayCall, sameOrigin, setPublicHosts } from "./origin.ts";
import { handleProgress } from "./progress.ts";
import { handleTutor, sweepAuthoring } from "./tutor.ts";
import { handleResearch } from "./research.ts";
import { handleTts } from "./tts.ts";
import { HttpError, INTERNAL_ERROR, methodNotAllowed, sendJson } from "./sse.ts";

// The whole "backend": dev-server-only middleware on the Vite server, bound
// to localhost. Same shape as Fret Not's, without logins: there is one
// learner, and the only wall is wrap(): this machine (or the owner's own
// tailnet name for it), this origin, this app.

export { fromApp, localHost, sameOrigin, setPublicHosts };

type Handler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;

/**
 * Every route goes through here: the local-host, same-origin and
 * from-the-app checks first, then a JSON error envelope for anything thrown. No exceptions — a
 * route that bypasses wrap() is the bug the rule in CLAUDE.md exists to
 * prevent.
 */
export function wrap(fn: Handler): Handler {
  return (req, res) => {
    if (!mayCall(req.headers)) {
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

/** Passes a request on only when it came to a loopback name. */
export function localOnly(req: IncomingMessage, res: ServerResponse, next: () => void): void {
  if (loopbackHost(req.headers.host)) return next();
  sendJson(res, 403, { error: "only on this machine" } satisfies ErrorReply);
}

function handleContent(req: IncomingMessage, res: ServerResponse): void {
  if (req.method !== "GET") return methodNotAllowed(res, "GET");
  sendJson(res, 200, loadContent());
}

export function apiPlugins(opts: { checkDatabase?: boolean; db?: Db; warm?: boolean; publicHosts?: readonly string[] } = {}): Plugin {
  // The tests hand in an in-process PGlite: the real routes, no server.
  if (opts.db) setDb(opts.db);
  setPublicHosts(opts.publicHosts ?? []);
  return {
    name: "lean-into-it-api",
    apply: "serve",
    // Vite closes the old server when it restarts itself (a server file was
    // edited). Without this each restart left a Lean, holding Mathlib, behind.
    closeBundle() {
      closeLean();
    },
    configureServer(server) {
      // Vite's own route that opens a file in this machine's editor: not for
      // another device. Plugin middleware runs before Vite's.
      server.middlewares.use("/__open-in-editor", localOnly);
      // The curriculum, re-read from content/ on every request, so an edit
      // is live at once.
      server.middlewares.use("/api/content", wrap(handleContent));
      // Lean: an exercise's proof, the free playground, and whether Lean is
      // installed.
      server.middlewares.use("/api/check", wrap(handleCheck));
      server.middlewares.use("/api/playground", wrap(handlePlayground));
      server.middlewares.use("/api/gallery", wrap(handleGallery));
      server.middlewares.use("/api/lean", wrap(handleLean));
      server.middlewares.use("/api/progress", wrap(handleProgress));
      // The Tutor: explain and hint, read-only, never grading.
      server.middlewares.use("/api/tutor", wrap(handleTutor));
      // Field notes: the Tutor's research maps, made from the web and saved.
      server.middlewares.use("/api/research", wrap(handleResearch));
      // Listen mode: text read aloud by ElevenLabs, cached under data/.
      server.middlewares.use("/api/tts", wrap(handleTts));
      // Anything else under /api is a typo, not the SPA shell: answer in the
      // envelope the client already parses instead of index.html.
      server.middlewares.use("/api", wrap((_req, res) => sendJson(res, 404, { error: "no such route" })));
      // Lean is a child process; it must not outlive the dev server.
      server.httpServer?.once("close", () => closeLean());
      if (opts.warm !== false) warmLean();
      // A Tutor worktree a killed server left in the temp folder.
      sweepAuthoring();
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
