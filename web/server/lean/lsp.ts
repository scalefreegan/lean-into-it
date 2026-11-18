// A warm Lean: one `lake serve` (the Lean language server) kept running in
// lean/, spoken to over stdio in JSON-RPC. A check is a document change
// followed by a wait for that version's diagnostics and a few goal queries.
// The first check of a document pays for `import Mathlib` (a few seconds);
// later checks of the same document only re-elaborate what changed, which is
// what makes a click on the proof board feel immediate.
//
// Lean elaborates whatever text it is given with this user's permissions
// (a `#eval` can run a process). The only callers are the same-origin API
// routes on localhost; see docs/PRD.md, Trust and safety.

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT } from "../../../scripts/env.mjs";

export const LEAN_DIR = path.join(ROOT, "lean");

export interface Position {
  line: number;
  character: number;
}

export interface LeanDiagnostic {
  severity: "error" | "warning" | "info";
  message: string;
  start: Position;
  end: Position;
}

export interface LeanCheck {
  diagnostics: LeanDiagnostic[];
  /** One entry per requested position: the goals there as Lean prints them,
   *  or null where the position is not inside a proof. */
  goals: (string[] | null)[];
}

export class LeanUnavailable extends Error {}
/** One check ran out of time. Lean itself is still there for the next. */
export class LeanTimeout extends LeanUnavailable {}
/** The server process went away by itself, taking the checks it held. */
class LeanCrashed extends LeanUnavailable {}

/** `starting`: first start, Mathlib not yet loaded. `restarting`: the same
 *  after a stop. `down`: it cannot run, or stopped twice in a row. */
export type LeanState = "starting" | "ready" | "restarting" | "down";

export interface LeanHealth {
  state: LeanState;
  /** Why it is down, in a sentence; null otherwise. */
  problem: string | null;
}

/** The Lean version the project pins (lean/lean-toolchain), or null. */
export function leanToolchain(dir = LEAN_DIR): string | null {
  try {
    return fs.readFileSync(path.join(dir, "lean-toolchain"), "utf8").trim() || null;
  } catch {
    return null;
  }
}

/** elan's and Homebrew's bin directories ahead of PATH: the Dock app starts
 *  the server without the shell profile that would add them. */
export function leanEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const extra = [path.join(os.homedir(), ".elan", "bin"), "/opt/homebrew/bin", "/usr/local/bin"];
  return { ...env, PATH: [...extra, env.PATH ?? ""].filter(Boolean).join(path.delimiter) };
}

/** Why Lean can't run here, as a sentence with the command that fixes it; null when it can. */
export function leanProblem(dir = LEAN_DIR): string | null {
  if (!fs.existsSync(path.join(dir, "lakefile.toml"))) return `There is no Lean project at ${dir}.`;
  if (!fs.existsSync(path.join(dir, ".lake", "packages", "mathlib"))) {
    return "Lean's libraries are not installed yet. Run `npm run lean:setup` (a one-time download of about 7 GB), then try again.";
  }
  return null;
}

/** The import lines a source opens with, or "" when it has none. */
function importsOf(source: string): string {
  return /^(\s*import[^\n]*\n)+/.exec(source)?.[0] ?? "";
}

const SEVERITY = ["error", "error", "warning", "info", "info"] as const;

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

interface Doc {
  key: string;
  uri: string;
  /** The server process this document was opened on. A document from an
   *  earlier process means nothing to the current one. */
  generation: number;
  version: number;
  /** The diagnostics last published for each version. */
  published: Map<number, LeanDiagnostic[]>;
  /** Checks of one document run one at a time. */
  tail: Promise<unknown>;
  /** Checks queued or running; a document with any is never evicted. */
  active: number;
  lastUsed: number;
}

export interface LeanServerOptions {
  dir?: string;
  /** How many documents (each a Lean worker process holding Mathlib) stay open. */
  maxDocs?: number;
  /** How long one check may take once its document has Mathlib loaded. A
   *  check that runs past it is given up on and its document closed, which
   *  ends the Lean worker that was running it. */
  timeoutMs?: number;
  /** How long the first check of a document may take: it pays for
   *  `import Mathlib`. Past it the whole server is restarted. */
  loadTimeoutMs?: number;
  /** How long the server may take to answer `initialize`. */
  bootTimeoutMs?: number;
}

export class LeanServer {
  private dir: string;
  private maxDocs: number;
  private timeoutMs: number;
  private loadTimeoutMs: number;
  private bootTimeoutMs: number;
  /** A check has finished on the current server process: Mathlib is loaded. */
  private warm = false;
  /** A check has finished on some server process since this object was made. */
  private everWarm = false;
  /** Times in a row the server went away or failed to start with no check
   *  finishing in between. It is brought back by itself once, not for ever. */
  private failures = 0;
  private lastFailure: string | null = null;
  private proc: ChildProcessWithoutNullStreams | null = null;
  private starting: Promise<void> | null = null;
  private closed = false;
  /** Bumped by every stop: what was opened or queued before it is stale. */
  private generation = 0;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private docs = new Map<string, Doc>();
  private buffer = Buffer.alloc(0);

  constructor(opts: LeanServerOptions = {}) {
    this.dir = opts.dir ?? LEAN_DIR;
    this.maxDocs = opts.maxDocs ?? 3;
    this.timeoutMs = opts.timeoutMs ?? 20_000;
    this.loadTimeoutMs = opts.loadTimeoutMs ?? 120_000;
    this.bootTimeoutMs = opts.bootTimeoutMs ?? 60_000;
  }

  /**
   * Elaborate `source` as the document named `key` and report its
   * diagnostics and the goals at `positions`. Reusing a key reuses the
   * document, so only the changed tail is re-elaborated.
   */
  check(key: string, source: string, positions: Position[] = []): Promise<LeanCheck> {
    return this.enqueue(key, source, positions, true);
  }

  private async enqueue(key: string, source: string, positions: Position[], mayRetry: boolean): Promise<LeanCheck> {
    await this.start();
    const doc = this.doc(key);
    doc.active++;
    const attempt = () => this.checkDoc(doc, source, positions, mayRetry);
    const run = doc.tail.then(attempt, attempt).finally(() => {
      doc.active--;
    });
    doc.tail = run.catch(() => {});
    try {
      return await run;
    } catch (e) {
      // The server died under this check, or the worker for its document
      // did (Lean answers the request with an error). Neither is the
      // proof's doing as far as anyone knows, so it is tried once more, on
      // a fresh server or a fresh document. A second loss is reported.
      const lost = e instanceof LeanCrashed || !(e instanceof LeanUnavailable);
      if (!lost || !mayRetry || this.closed) throw e instanceof LeanUnavailable ? e : new LeanUnavailable(`Lean could not check this: ${(e as Error).message}`);
      if (!(e instanceof LeanCrashed)) this.drop(doc);
      return this.enqueue(key, source, positions, false);
    }
  }

  /** Whether Lean can check a proof right now, and if not, why. */
  health(): LeanHealth {
    const missing = leanProblem(this.dir);
    if (missing) return { state: "down", problem: missing };
    if (this.closed) return { state: "down", problem: "The Lean server was shut down." };
    if (this.proc && this.warm) return { state: "ready", problem: null };
    if (!this.starting && this.failures > 1) return { state: "down", problem: this.lastFailure ?? "Lean stopped and did not come back." };
    return { state: this.everWarm || this.failures > 0 ? "restarting" : "starting", problem: null };
  }

  /** Stop the server and start a new one now, forgetting earlier failures.
   *  For the Restart button. Resolves once the new server answers. */
  restart(): Promise<void> {
    this.stop();
    this.failures = 0;
    this.lastFailure = null;
    return this.start();
  }

  /** Stop the server; the next check starts a new one. */
  stop(why: LeanUnavailable = new LeanUnavailable("the Lean server stopped")): void {
    const proc = this.proc;
    this.generation++;
    this.proc = null;
    this.starting = null;
    this.warm = false;
    this.docs.clear();
    this.buffer = Buffer.alloc(0);
    for (const p of this.pending.values()) p.reject(why);
    this.pending.clear();
    // Only ever the child this object spawned: never a pid from anywhere else.
    proc?.kill("SIGKILL");
  }

  /** The server went away, or had to be killed, without being asked to
   *  stop. It is started again at once, so the next check does not wait for
   *  it; but only once in a row, so a Lean that cannot stay up is reported
   *  and not restarted for ever. */
  private lost(why: string, error: LeanUnavailable): void {
    this.failures++;
    this.lastFailure = why;
    this.stop(error);
    if (this.failures <= 1 && !this.closed) this.start().catch(() => {});
  }

  /** Close one document, which ends the Lean worker elaborating it. Checks
   *  waiting on it see that it is gone and open a new one. */
  private drop(doc: Doc): void {
    if (this.docs.get(this.safe(doc.key)) === doc) this.docs.delete(this.safe(doc.key));
    const open = doc.generation === this.generation && doc.version > 0;
    doc.generation = -1;
    if (open) this.notify("textDocument/didClose", { textDocument: { uri: doc.uri } });
  }

  /** For tests: end the server process the way a crash would, with none of
   *  stop()'s bookkeeping. Only the child this object spawned. */
  crash(): void {
    this.proc?.kill("SIGKILL");
  }

  /** Stop for good: unlike stop(), no later check starts a server again.
   *  For a dev server that is going away; its waiting checks are refused. */
  close(): void {
    this.closed = true;
    this.stop();
  }

  private start(): Promise<void> {
    if (this.closed) return Promise.reject(new LeanUnavailable("the Lean server was shut down"));
    if (!this.starting) {
      const starting: Promise<void> = this.boot().catch((e) => {
        // Only a boot that is still the current one may stop the server: a
        // boot that lost to a stop() must not kill what was started after it.
        if (this.starting === starting) {
          this.failures++;
          this.lastFailure = (e as Error).message;
          this.stop();
        }
        throw e;
      });
      this.starting = starting;
    }
    return this.starting;
  }

  private async boot(): Promise<void> {
    const problem = leanProblem(this.dir);
    if (problem) throw new LeanUnavailable(problem);
    const proc = spawn("lake", ["serve"], { cwd: this.dir, env: leanEnv(), stdio: ["pipe", "pipe", "pipe"] });
    this.proc = proc;
    // Output a killed process had already written can still arrive after its
    // successor has started; only the current process is listened to.
    proc.stdout.on("data", (chunk: Buffer) => {
      if (this.proc === proc) this.onData(chunk);
    });
    proc.stderr.on("data", () => {}); // Lean logs worker chatter here; nothing a learner needs
    const gone = (why: string) => {
      if (this.proc === proc) {
        console.error(`[lean-into-it] lean server ${why}`);
        this.lost(`The Lean server ${why}.`, new LeanCrashed("the Lean server stopped by itself"));
      }
    };
    proc.on("error", (e) => gone(`failed to start: ${e.message} (is elan installed? brew install elan-init)`));
    proc.on("exit", (code, signal) => gone(`stopped unexpectedly (${signal ?? `exit code ${code}`})`));
    proc.stdin.on("error", () => {}); // a write to a dead server; the exit handler reports it
    let timer: NodeJS.Timeout | undefined;
    const slow = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new LeanUnavailable(`Lean did not start within ${Math.round(this.bootTimeoutMs / 1000)} seconds.`)), this.bootTimeoutMs);
    });
    try {
      await Promise.race([
        this.request("initialize", { processId: process.pid, rootUri: pathToFileURL(this.dir).toString(), capabilities: {} }),
        slow,
      ]);
    } finally {
      clearTimeout(timer);
    }
    this.notify("initialized", {});
  }

  private safe(key: string): string {
    return key.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80) || "scratch";
  }

  private doc(key: string): Doc {
    const safe = this.safe(key);
    let doc = this.docs.get(safe);
    if (!doc) {
      doc = {
        key,
        // A path inside the Lake project, so imports resolve; the file never exists on disk.
        uri: pathToFileURL(path.join(this.dir, "Scratch", `${safe}.lean`)).toString(),
        generation: this.generation,
        version: 0,
        published: new Map(),
        tail: Promise.resolve(),
        active: 0,
        lastUsed: 0,
      };
      this.docs.set(safe, doc);
      this.evict(safe);
    }
    doc.lastUsed = Date.now();
    return doc;
  }

  /** Close the least recently used idle documents beyond the limit. */
  private evict(keep: string): void {
    while (this.docs.size > this.maxDocs) {
      let oldest: string | null = null;
      for (const [k, d] of this.docs) {
        // A document with a check queued or running still has diagnostics on the way.
        if (k === keep || d.active > 0) continue;
        if (oldest === null || d.lastUsed < this.docs.get(oldest)!.lastUsed) oldest = k;
      }
      if (oldest === null) return;
      this.drop(this.docs.get(oldest)!);
    }
  }

  private async checkDoc(doc: Doc, source: string, positions: Position[], mayRetry: boolean): Promise<LeanCheck> {
    const proc = this.proc;
    if (doc.generation !== this.generation || !proc) {
      // The server was stopped while this check waited its turn. Its
      // document died with that server, so it starts again on a new one
      // (once: a check that keeps losing its server is reported).
      if (mayRetry) return this.enqueue(doc.key, source, positions, false);
      throw new LeanUnavailable("Lean was restarted while this proof was waiting to be checked. Try again.");
    }
    // A new document first loads its imports, alone and with the long
    // limit that Mathlib needs. The proof itself then always runs under the
    // short one, whether or not it is the first thing its document sees:
    // Lean keeps the loaded imports when only the text after them changes.
    const imports = importsOf(source);
    if (doc.version === 0 && imports && imports !== source) await this.timed(doc, proc, imports, [], true);
    return this.timed(doc, proc, source, positions, imports === source);
  }

  /** Send one version of a document and wait for Lean's answer, for at most
   *  the time its kind allows. `loading`: the text is imports alone. */
  private async timed(doc: Doc, proc: ChildProcessWithoutNullStreams, source: string, positions: Position[], loading: boolean): Promise<LeanCheck> {
    if (doc.generation !== this.generation || this.proc !== proc) throw new LeanCrashed("the Lean server stopped by itself");
    const version = ++doc.version;
    if (version === 1) {
      this.notify("textDocument/didOpen", { textDocument: { uri: doc.uri, languageId: "lean4", version, text: source } });
    } else {
      this.notify("textDocument/didChange", { textDocument: { uri: doc.uri, version }, contentChanges: [{ text: source }] });
    }
    const limit = loading ? this.loadTimeoutMs : this.timeoutMs;
    const seconds = Math.round(limit / 1000);
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        // A proof that never finishes would hold every later check of its
        // document. Closing the document ends the worker running it and
        // leaves the rest of Lean warm. If Lean could not even load its
        // library in time, the server itself is wedged and is replaced:
        // only the process this check ran on, since by now a newer one may
        // be serving other checks.
        if (!loading) {
          this.drop(doc);
          // Open it again with its imports alone, so that the library is
          // loading while the learner reads why the check stopped.
          const imports = importsOf(source);
          if (imports && !this.closed) this.check(doc.key, imports).catch(() => {});
        } else if (this.proc === proc) this.lost(`Lean did not finish loading its library within ${seconds} seconds.`, new LeanUnavailable("the Lean server was restarted"));
        reject(
          new LeanTimeout(
            loading
              ? `Lean took longer than ${seconds} seconds to load its library and was restarted. Try again in a moment.`
              : `Lean took longer than ${seconds} seconds on this and gave up. A step such as simp or decide on the wrong goal can run for a very long time. Change the last step and check again.`,
          ),
        );
      }, limit);
    });
    try {
      const result = await Promise.race([this.elaborate(doc, version, positions), timeout]);
      if (this.proc === proc) {
        this.warm = true;
        this.everWarm = true;
        this.failures = 0;
        this.lastFailure = null;
      }
      return result;
    } finally {
      clearTimeout(timer);
    }
  }

  private async elaborate(doc: Doc, version: number, positions: Position[]): Promise<LeanCheck> {
    await this.request("textDocument/waitForDiagnostics", { uri: doc.uri, version });
    const goals: (string[] | null)[] = [];
    for (const position of positions) {
      const reply = (await this.request("$/lean/plainGoal", { textDocument: { uri: doc.uri }, position })) as { goals?: string[] } | null;
      goals.push(reply?.goals ?? null);
    }
    const diagnostics = doc.published.get(version) ?? [];
    for (const v of doc.published.keys()) if (v < version) doc.published.delete(v);
    return { diagnostics, goals };
  }

  private request(method: string, params: unknown): Promise<unknown> {
    const proc = this.proc;
    // With no server to hear it, a request would wait for an answer that never comes.
    if (!proc || !proc.stdin.writable) return Promise.reject(new LeanUnavailable("the Lean server is not running"));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send({ jsonrpc: "2.0", id, method, params });
    });
  }

  private notify(method: string, params: unknown): void {
    this.send({ jsonrpc: "2.0", method, params });
  }

  private send(message: unknown): void {
    const proc = this.proc;
    if (!proc || !proc.stdin.writable) return;
    const body = Buffer.from(JSON.stringify(message), "utf8");
    proc.stdin.write(Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "ascii"), body]));
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      const length = /Content-Length: (\d+)/i.exec(this.buffer.subarray(0, headerEnd).toString("ascii"));
      if (!length) {
        this.buffer = this.buffer.subarray(headerEnd + 4);
        continue;
      }
      const end = headerEnd + 4 + Number(length[1]);
      if (this.buffer.length < end) return;
      const body = this.buffer.subarray(headerEnd + 4, end).toString("utf8");
      this.buffer = this.buffer.subarray(end);
      try {
        this.onMessage(JSON.parse(body));
      } catch (e) {
        console.error("[lean-into-it] unreadable message from the Lean server:", (e as Error).message);
      }
    }
  }

  private onMessage(msg: { id?: number; method?: string; params?: unknown; result?: unknown; error?: { message?: string } }): void {
    if (msg.method === "textDocument/publishDiagnostics") {
      const p = msg.params as { uri: string; version?: number; diagnostics: RawDiagnostic[] };
      for (const doc of this.docs.values()) {
        if (doc.uri === p.uri && typeof p.version === "number") doc.published.set(p.version, p.diagnostics.map(toDiagnostic));
      }
      return;
    }
    if (msg.method !== undefined) {
      // A request from the server (e.g. client/registerCapability) wants an answer; notifications do not.
      if (msg.id !== undefined) this.send({ jsonrpc: "2.0", id: msg.id, result: null });
      return;
    }
    if (msg.id === undefined) return;
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    this.pending.delete(msg.id);
    if (msg.error) pending.reject(new Error(msg.error.message || "the Lean server refused the request"));
    else pending.resolve(msg.result);
  }
}

interface RawDiagnostic {
  severity?: number;
  message: string;
  range: { start: Position; end: Position };
  fullRange?: { start: Position; end: Position };
}

function toDiagnostic(d: RawDiagnostic): LeanDiagnostic {
  const range = d.fullRange ?? d.range;
  return { severity: SEVERITY[d.severity ?? 1] ?? "error", message: d.message, start: range.start, end: range.end };
}

let shared: LeanServer | null = null;

/** The dev server's one Lean. */
export function leanServer(): LeanServer {
  shared ??= new LeanServer();
  return shared;
}
