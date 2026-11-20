// A warm Lean: one `lake serve` (the Lean language server) kept running in
// lean/, spoken to over stdio in JSON-RPC. A check is a document change
// followed by a wait for that version's diagnostics and a few goal queries.
// The first check of a document pays for `import Mathlib` (a few seconds);
// later checks of the same document only re-elaborate what changed, which is
// what makes a click on the proof board feel immediate.
//
// Nothing here may wait for ever. A check has a time limit, after which its
// document is closed (that ends the Lean worker running it); loading a
// library has a longer one, after which the server is replaced; a server
// that dies is started again once, and after a second time in a row stays
// stopped until restart(). Only the child process spawned here is ever
// signalled.
//
// Lean elaborates whatever text it is given with this user's permissions
// (a `#eval` can run a process). The only callers are the same-origin API
// routes on localhost; see docs/PRD.md, Trust and safety.
// The exception is a server made with `sandboxed` (tutorLean, for text the
// Tutor's model wrote): that one is `lean --server` under the OS sandbox
// (sandbox.ts), which can read only Lean's own files, write nothing and
// run nothing else.

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { SANDBOX_EXEC, sandboxEnv, sandboxSetup, type SandboxSetup } from "./sandbox.ts";
import { fromReply, refsIn, type IdGoal } from "../../shared/interactive.ts";
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
  /** The same goals as data, from Lean's RPC (web/shared/interactive.ts):
   *  null where `goals` is null, where they were not asked for (`check`'s
   *  `structured`), or where the RPC failed and the printed goals stand in. */
  structured: (IdGoal[] | null)[];
}

/** Lean's answer to an RPC call on a session it has dropped (its file
 *  worker restarted, or the session went unused): connect again. */
const RPC_NEEDS_RECONNECT = -32900;

export class LeanUnavailable extends Error {}
/** One check ran out of time. Lean itself is still there for the next. */
export class LeanTimeout extends LeanUnavailable {}
/** A check lost its server or its document through no doing of its own (the
 *  process died, or was replaced while the check waited). Tried once more. */
class Lost extends LeanUnavailable {}
/** Lean answered a request with an error. */
class LeanRefused extends Error {
  code: number | undefined;
  constructor(message: string, code?: number) {
    super(message);
    this.code = code;
  }
}
/** Lean's code for "the worker for this file crashed". */
const WORKER_CRASHED = -32902;

/** `starting`: first start, Mathlib not yet loaded. `restarting`: the same
 *  after a stop. `down`: there is no Lean process and none is on its way. */
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

/**
 * A source's header: everything up to the end of its last import line, with
 * the blank lines and comments around the imports. "" when it imports
 * nothing. This is the part Lean pays for with a library load, and a
 * document whose header is unchanged keeps what it loaded.
 */
export function headerOf(source: string): string {
  let i = 0;
  let end = 0;
  for (;;) {
    while (i < source.length && /\s/.test(source[i]!)) i++;
    if (source.startsWith("--", i)) {
      const nl = source.indexOf("\n", i);
      i = nl < 0 ? source.length : nl + 1;
      continue;
    }
    if (source.startsWith("/-", i)) {
      // Block comments nest.
      let depth = 1;
      i += 2;
      while (i < source.length && depth > 0) {
        const two = source.slice(i, i + 2);
        if (two === "/-") depth++;
        else if (two === "-/") depth--;
        i += two === "/-" || two === "-/" ? 2 : 1;
      }
      if (depth > 0) break;
      continue;
    }
    const rest = source.slice(i);
    const word = /^(module|prelude)(?![\w.])/.exec(rest);
    if (word) {
      // Part of the header too: the load step must send it, or the body's
      // header would differ from what was loaded and load again.
      i += word[0].length;
      end = i;
      continue;
    }
    const line = /^((public|private|meta)\s+)*import(?![\w.])[^\n]*\n?/.exec(rest);
    if (!line) break;
    i += line[0].length;
    end = i;
  }
  return source.slice(0, end);
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
  /** The header (headerOf) Lean has finished loading for this document;
   *  null until it has loaded one. */
  header: string | null;
  /** The source of a check that ran out of time on this document. */
  timedOut?: string;
  /** The diagnostics last published for each version. */
  published: Map<number, LeanDiagnostic[]>;
  /** Checks of one document run one at a time. */
  tail: Promise<unknown>;
  /** Checks queued or running; a document with any is never evicted. */
  active: number;
  lastUsed: number;
  /** The RPC session for structured goals, made on first use. */
  rpc?: string;
}

export interface LeanServerOptions {
  dir?: string;
  /** How many documents (each a Lean worker process holding Mathlib) stay open. */
  maxDocs?: number;
  /** How long one check may take once its document has Mathlib loaded. A
   *  check that runs past it is given up on and its document closed, which
   *  ends the Lean worker that was running it. */
  timeoutMs?: number;
  /** How long a document may take to load its imports (`import Mathlib`),
   *  which it does when it is new or its import lines change. Past it the
   *  whole server is restarted. */
  loadTimeoutMs?: number;
  /** How long the server may take to answer `initialize`. */
  bootTimeoutMs?: number;
  /** Run Lean under the OS sandbox (sandbox.ts): it reads only the
   *  toolchain, lean/ and the system's libraries, writes nothing, runs
   *  nothing but itself, and has no network. For Lean the learner did not
   *  write. */
  sandboxed?: boolean;
}

export class LeanServer {
  private dir: string;
  private maxDocs: number;
  private timeoutMs: number;
  private loadTimeoutMs: number;
  private bootTimeoutMs: number;
  private sandboxed: boolean;
  private sandbox: SandboxSetup | null = null;
  /** A check has finished on the current server process: Mathlib is loaded. */
  private warm = false;
  /** A check has finished on some server process since this object was made. */
  private everWarm = false;
  /** Times in a row the server went away or failed to start with no check
   *  finishing in between. After the second it stays stopped until restart(). */
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
    this.sandboxed = opts.sandboxed ?? false;
  }

  /** The folder documents are named under: the Lake project, or the sandbox's empty one. */
  private root(): string {
    return this.sandbox?.workDir ?? this.dir;
  }

  /** The Lean process: `lake serve`, or `lean --server` shut in. A sandbox
   *  that cannot be set up is a reason Lean is unavailable, never a
   *  fall-back to running without one. */
  private async launch(): Promise<ChildProcessWithoutNullStreams> {
    if (!this.sandboxed) return spawn("lake", ["serve"], { cwd: this.dir, env: leanEnv(), stdio: ["pipe", "pipe", "pipe"] });
    try {
      this.sandbox ??= await sandboxSetup(this.dir, leanEnv());
    } catch (e) {
      throw new LeanUnavailable(`The sandbox for the Tutor's Lean could not be set up: ${(e as Error)?.message || e}.`);
    }
    const s = this.sandbox;
    return spawn(SANDBOX_EXEC, ["-p", s.profile, s.lean, "--server"], { cwd: s.workDir, env: sandboxEnv(s), stdio: ["pipe", "pipe", "pipe"] });
  }

  /**
   * Elaborate `source` as the document named `key` and report its
   * diagnostics and the goals at `positions` (with `structured`, also as
   * Lean's data: web/shared/interactive.ts). Reusing a key reuses the
   * document, so only the changed tail is re-elaborated.
   */
  check(key: string, source: string, positions: Position[] = [], structured = false): Promise<LeanCheck> {
    return this.enqueue(key, source, positions, true, structured);
  }

  private async enqueue(key: string, source: string, positions: Position[], mayRetry: boolean, structured: boolean): Promise<LeanCheck> {
    await this.start();
    const doc = this.doc(key);
    doc.active++;
    const attempt = () => this.checkDoc(doc, source, positions, structured);
    const run = doc.tail.then(attempt, attempt).finally(() => {
      doc.active--;
    });
    doc.tail = run.catch(() => {});
    try {
      return await run;
    } catch (e) {
      if (e instanceof Lost) {
        // Its server or its document went away under it. That is not the
        // proof's doing, so it is tried once more, on what replaced them.
        if (mayRetry && !this.closed) return this.enqueue(key, source, positions, false, structured);
        throw new LeanUnavailable("Lean stopped twice while this was being checked. Try again.");
      }
      if (e instanceof LeanRefused) {
        // The worker for this document crashed, most likely on this very
        // text (Lean's own guess is a stack overflow). It is not run again:
        // a second crash would cost another library load, and a program in
        // it would run twice. The document is replaced, so the next check
        // finds the library loaded.
        const crashed = e.code === WORKER_CRASHED;
        if (crashed) this.replace(doc, source);
        throw new LeanUnavailable(
          crashed
            ? "Lean crashed while checking this. The usual cause is a definition that calls itself without end. Lean is running again: change the proof, or check it once more."
            : `Lean could not check this: ${e.message.replace(/file:\/\/\S+/g, "this file")}`,
        );
      }
      throw e;
    }
  }

  /** Whether Lean can check a proof right now, and if not, why. */
  health(): LeanHealth {
    const missing = leanProblem(this.dir);
    if (missing) return { state: "down", problem: missing };
    if (this.closed) return { state: "down", problem: "The Lean server was shut down." };
    if (this.proc && this.warm) return { state: "ready", problem: null };
    // A process that is starting, or is up with its library not yet loaded.
    if (this.proc || this.starting) return { state: this.everWarm || this.failures > 0 ? "restarting" : "starting", problem: null };
    return { state: "down", problem: this.lastFailure ?? "Lean is not running." };
  }

  /** Stop the server and start a new one now, forgetting earlier failures.
   *  For the Restart button. Resolves once the new server answers. */
  restart(): Promise<void> {
    this.stop();
    this.failures = 0;
    this.lastFailure = null;
    // Asked again: the toolchain may have moved (npm run lean:setup).
    this.sandbox = null;
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
   *  stop. The first time it is started again at once, and the documents it
   *  had open start loading their libraries again, so the next check finds
   *  Lean as it was. A second time in a row it stays stopped (start() then
   *  refuses) until restart(). Returns whether it was started again. */
  private lost(why: string, error: LeanUnavailable): boolean {
    this.failures++;
    this.lastFailure = why;
    // A document with no imports ("") loads Lean's core library too: it is re-warmed as well.
    const open = [...this.docs.values()].flatMap((d) => (d.header !== null ? [[d.key, d.header] as const] : []));
    this.stop(error);
    if (this.failures > 1 || this.closed) return false;
    this.start().then(
      () => {
        for (const [key, header] of open) this.check(key, header).catch(() => {});
      },
      () => {},
    );
    return true;
  }

  /** Close one document, which ends the Lean worker elaborating it. Checks
   *  waiting on it see that it is gone and open a new one. */
  private drop(doc: Doc): void {
    if (this.docs.get(this.safe(doc.key)) === doc) this.docs.delete(this.safe(doc.key));
    const open = doc.generation === this.generation && doc.version > 0;
    doc.generation = -1;
    if (open) this.notify("textDocument/didClose", { textDocument: { uri: doc.uri } });
  }

  /** Drop a document whose worker is stuck or dead, and open it again with
   *  its header alone, so that its library is loading while the learner
   *  reads what happened. */
  private replace(doc: Doc, source: string): void {
    this.drop(doc);
    if (!this.closed) this.check(doc.key, headerOf(source)).catch(() => {});
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
      // Two failures in a row: it is not started again by a check, only by restart().
      if (this.failures > 1) return Promise.reject(new LeanUnavailable(`${this.lastFailure ?? "Lean has stopped."} Lean is stopped: restart it to check proofs.`));
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
    const generation = this.generation;
    const proc = await this.launch();
    // Stopped while the sandbox was being set up: this boot is no longer wanted.
    if (generation !== this.generation || this.closed) {
      proc.kill("SIGKILL");
      throw new LeanUnavailable("the Lean server stopped");
    }
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
        this.lost(`The Lean server ${why}.`, new Lost("the Lean server stopped by itself"));
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
        this.request("initialize", { processId: process.pid, rootUri: pathToFileURL(this.root()).toString(), capabilities: {} }),
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
        uri: pathToFileURL(path.join(this.root(), "Scratch", `${safe}.lean`)).toString(),
        generation: this.generation,
        version: 0,
        header: null,
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

  private async checkDoc(doc: Doc, source: string, positions: Position[], structured: boolean): Promise<LeanCheck> {
    const proc = this.proc;
    if (doc.generation !== this.generation || !proc) {
      // The same text as the check that just ran out of time here, asked
      // for while that one was running: it would only run out of time again.
      if (doc.timedOut === source) throw this.tooLong();
      // Otherwise the server was stopped, or the document closed, while
      // this check waited its turn: it starts again on what replaced them.
      throw new Lost("Lean was restarted while this proof was waiting to be checked. Try again.");
    }
    // Imports are loaded as a step of their own, with the long limit that
    // Mathlib needs: when the document is new, and when its import lines
    // change (Lean then starts the document over). The text after them
    // always runs under the short limit: Lean keeps the loaded imports when
    // only that text changes.
    // A file with no imports still costs a load (a second or two: a fresh
    // worker and Lean's own core library) when it is new or its imports were
    // just removed: that load is a step of its own too, so it never counts
    // against the proof.
    const header = headerOf(source);
    if (header !== doc.header) {
      const loaded = await this.timed(doc, proc, header, header === source ? positions : [], true, structured);
      doc.header = header;
      if (header === source) return loaded;
    }
    const result = await this.timed(doc, proc, source, positions, false, structured);
    doc.header = header;
    return result;
  }

  private tooLong(): LeanTimeout {
    const seconds = Math.round(this.timeoutMs / 1000);
    return new LeanTimeout(
      `Lean took longer than ${seconds} seconds on this and gave up. A step such as simp or decide on the wrong goal can run for a very long time. Change the last step and check again.`,
    );
  }

  /** Send one version of a document and wait for Lean's answer, for at most
   *  the time its kind allows. `loading`: the text is a header alone. */
  private async timed(doc: Doc, proc: ChildProcessWithoutNullStreams, source: string, positions: Position[], loading: boolean, structured: boolean): Promise<LeanCheck> {
    if (doc.generation !== this.generation || this.proc !== proc) throw new Lost("the Lean server was stopped");
    const version = ++doc.version;
    if (version === 1) {
      this.notify("textDocument/didOpen", { textDocument: { uri: doc.uri, languageId: "lean4", version, text: source } });
    } else {
      this.notify("textDocument/didChange", { textDocument: { uri: doc.uri, version }, contentChanges: [{ text: source }] });
    }
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => {
          if (!loading) {
            // A proof that never finishes would hold every later check of
            // its document. Closing the document ends the worker running
            // it and leaves the rest of Lean warm.
            doc.timedOut = source;
            this.replace(doc, source);
            return reject(this.tooLong());
          }
          // Lean could not even load its library in time: the server itself
          // is wedged, and is replaced. Only the process this check ran on,
          // since by now a newer one may be serving other checks. Checks of
          // other documents that go down with it are tried again.
          const seconds = Math.round(this.loadTimeoutMs / 1000);
          const again = this.proc === proc ? this.lost(`Lean did not finish loading its library within ${seconds} seconds.`, new Lost("the Lean server was restarted")) : true;
          reject(
            new LeanTimeout(
              `Lean took longer than ${seconds} seconds to load its library` +
                (again ? " and was restarted. Try again in a moment." : ", twice in a row, and has been stopped. Restart it to check proofs."),
            ),
          );
        },
        loading ? this.loadTimeoutMs : this.timeoutMs,
      );
    });
    try {
      const result = await Promise.race([this.elaborate(doc, version, positions, structured), timeout]);
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

  private async elaborate(doc: Doc, version: number, positions: Position[], structured: boolean): Promise<LeanCheck> {
    await this.request("textDocument/waitForDiagnostics", { uri: doc.uri, version });
    const goals: (string[] | null)[] = [];
    const data: (IdGoal[] | null)[] = [];
    for (const position of positions) {
      const reply = (await this.request("$/lean/plainGoal", { textDocument: { uri: doc.uri }, position })) as { goals?: string[] } | null;
      goals.push(reply?.goals ?? null);
      data.push(structured && reply?.goals ? await this.interactive(doc, position) : null);
    }
    const diagnostics = doc.published.get(version) ?? [];
    for (const v of doc.published.keys()) if (v < version) doc.published.delete(v);
    return { diagnostics, goals, structured: data };
  }

  /** The goals at `position` as data, through the document's RPC session.
   *  A session Lean has dropped is made again once; a worker that crashed is
   *  reported like any other crash (the document is opened again); any other
   *  refusal gives null, and the printed goals stand in. */
  private async interactive(doc: Doc, position: Position): Promise<IdGoal[] | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        doc.rpc ??= ((await this.request("$/lean/rpc/connect", { uri: doc.uri })) as { sessionId: string }).sessionId;
        const sessionId = doc.rpc;
        const params = { textDocument: { uri: doc.uri }, position };
        const reply = await this.request("$/lean/rpc/call", { ...params, sessionId, method: "Lean.Widget.getInteractiveGoals", params });
        // Every subexpression in the reply holds a reference in the session; let go of them, or the worker keeps them all.
        const refs = refsIn(reply);
        if (refs.length) this.notify("$/lean/rpc/release", { uri: doc.uri, sessionId, refs });
        return fromReply(reply);
      } catch (e) {
        if (!(e instanceof LeanRefused) || e.code === WORKER_CRASHED) throw e;
        doc.rpc = undefined;
        if (e.code !== RPC_NEEDS_RECONNECT) return null;
      }
    }
    return null;
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

  private onMessage(msg: { id?: number; method?: string; params?: unknown; result?: unknown; error?: { code?: number; message?: string } }): void {
    if (msg.method === "textDocument/publishDiagnostics") {
      const p = msg.params as { uri: string; version?: number; diagnostics: RawDiagnostic[] };
      for (const doc of this.docs.values()) {
        // A version this document has not sent is the last word of an
        // earlier document of the same name, closed since.
        if (doc.uri === p.uri && typeof p.version === "number" && p.version <= doc.version) doc.published.set(p.version, p.diagnostics.map(toDiagnostic));
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
    if (msg.error) pending.reject(new LeanRefused(msg.error.message || "the Lean server refused the request", msg.error.code));
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

/** The dev server's Lean for the learner's own work: exercises and the Playground. */
export function leanServer(): LeanServer {
  shared ??= new LeanServer();
  return shared;
}

let shut: LeanServer | null = null;

/** The Lean for text the Tutor's model wrote: a process of its own under
 *  the OS sandbox (sandbox.ts), one document. Started on first use. */
export function tutorLean(): LeanServer {
  // Two documents: its scratch file, and the exercises it wrote (author.ts).
  shut ??= new LeanServer({ sandboxed: true, maxDocs: 2 });
  return shut;
}

/** Stop every Lean this server started, for good: one asked for after
 *  this (a Tutor turn still running on a module Vite has replaced) is
 *  closed before it can start a process nobody would stop. */
export function closeLean(): void {
  leanServer().close();
  tutorLean().close();
}

/** Start the Tutor's Lean afresh if it has been used: with the learner's, by the Restart button. */
export function restartTutorLean(): Promise<void> {
  return shut ? shut.restart().catch(() => {}) : Promise.resolve();
}
