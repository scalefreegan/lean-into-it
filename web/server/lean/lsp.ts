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
  /** A check that takes longer than this restarts the server. */
  timeoutMs?: number;
  /** How long the server may take to answer `initialize`. */
  bootTimeoutMs?: number;
}

export class LeanServer {
  private dir: string;
  private maxDocs: number;
  private timeoutMs: number;
  private bootTimeoutMs: number;
  private proc: ChildProcessWithoutNullStreams | null = null;
  private starting: Promise<void> | null = null;
  /** Bumped by every stop: what was opened or queued before it is stale. */
  private generation = 0;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private docs = new Map<string, Doc>();
  private buffer = Buffer.alloc(0);

  constructor(opts: LeanServerOptions = {}) {
    this.dir = opts.dir ?? LEAN_DIR;
    this.maxDocs = opts.maxDocs ?? 3;
    this.timeoutMs = opts.timeoutMs ?? 120_000;
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
    return run;
  }

  /** Stop the server; the next check starts a new one. */
  stop(): void {
    const proc = this.proc;
    this.generation++;
    this.proc = null;
    this.starting = null;
    this.docs.clear();
    this.buffer = Buffer.alloc(0);
    for (const p of this.pending.values()) p.reject(new LeanUnavailable("the Lean server stopped"));
    this.pending.clear();
    proc?.kill("SIGKILL");
  }

  private start(): Promise<void> {
    if (!this.starting) {
      const starting: Promise<void> = this.boot().catch((e) => {
        // Only a boot that is still the current one may stop the server: a
        // boot that lost to a stop() must not kill what was started after it.
        if (this.starting === starting) this.stop();
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
        this.stop();
        console.error(`[lean-into-it] lean server ${why}`);
      }
    };
    proc.on("error", (e) => gone(`failed to start: ${e.message} (is elan installed? brew install elan-init)`));
    proc.on("exit", (code) => gone(`exited (${code})`));
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

  private doc(key: string): Doc {
    const safe = key.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80) || "scratch";
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
      const d = this.docs.get(oldest)!;
      this.docs.delete(oldest);
      if (d.version > 0) this.notify("textDocument/didClose", { textDocument: { uri: d.uri } });
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
    const version = ++doc.version;
    if (version === 1) {
      this.notify("textDocument/didOpen", { textDocument: { uri: doc.uri, languageId: "lean4", version, text: source } });
    } else {
      this.notify("textDocument/didChange", { textDocument: { uri: doc.uri, version }, contentChanges: [{ text: source }] });
    }
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        // A proof that never finishes (or a wedged worker) would hold every
        // later check. Only the process this check ran on is killed: by now
        // a newer one may be serving other checks.
        if (this.proc === proc) this.stop();
        reject(new LeanUnavailable(`Lean took longer than ${Math.round(this.timeoutMs / 1000)} seconds and was restarted.`));
      }, this.timeoutMs);
    });
    try {
      return await Promise.race([this.elaborate(doc, version, positions), timeout]);
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
