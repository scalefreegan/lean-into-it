// The memory one Lean worker really uses, watched while it runs a check
// (bead lii-au3). Lean's own limit (`-M`) compares resident size
// (check_memory: getrusage, then task_info's resident_size), and macOS takes
// pages out of a process's resident set, by compressing or swapping them,
// when memory is short. So a runaway check can pass any -M just when
// stopping it matters: one was seen at a footprint of 9.9 GB with never more
// than 6.7 GB resident. The footprint counts those pages. It leaves out
// Mathlib's files, which are mapped in and cost nothing to give back.
//
// This only looks: it reads `ps` and `footprint` and calls back. What to do
// about a worker over the limit is lsp.ts's, which closes its document.

import { execFile } from "node:child_process";
import fs from "node:fs";

/** macOS's own; elsewhere there is no watch, and Lean's -M is all there is. */
export const FOOTPRINT = "/usr/bin/footprint";
/** Most checks are over in a fraction of this: they are never looked at. */
const FIRST_MS = 1000;
const EVERY_MS = 400;
/** `footprint` reads a worker past the limit page by page: this long at most. */
const LOOK_MS = 10_000;

/** The worker for `uri` under the server process `server` (itself or any
 *  process below it), from `ps -axo pid=,ppid=,command=`; null when there is none. Pure. */
export function workerIn(ps: string, server: number, uri: string): number | null {
  const rows = ps.split("\n").flatMap((l) => {
    const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(l);
    return m ? [{ pid: Number(m[1]), ppid: Number(m[2]), command: m[3].trim() }] : [];
  });
  const parent = new Map(rows.map((r) => [r.pid, r.ppid]));
  const under = (pid: number) => {
    const seen = new Set<number>();
    for (let at: number | undefined = pid; at !== undefined && !seen.has(at); at = parent.get(at)) {
      if (at === server) return true;
      seen.add(at);
    }
    return false;
  };
  return rows.filter((r) => / --worker /.test(r.command) && r.command.endsWith(` ${uri}`) && under(r.pid)).at(-1)?.pid ?? null;
}

/** The megabytes in `footprint -f bytes`'s report; null when it gives none. Pure. */
export function footprintMb(report: string): number | null {
  const m = /Footprint: (\d+) B\b/.exec(report);
  return m ? Number(m[1]) / (1024 * 1024) : null;
}

/** What a program prints; "" when it cannot be run. Never rejects: starting
 *  one can throw (no memory for it, say), and a watch that fails is a look
 *  missed, not a reason for the dev server to die. */
export const run = (file: string, args: string[]) =>
  new Promise<string>((resolve) => {
    try {
      execFile(file, args, { timeout: LOOK_MS, maxBuffer: 16 * 1024 * 1024 }, (_e, stdout) => resolve(stdout ?? ""));
    } catch {
      resolve("");
    }
  });

/** Look at the worker's footprint until it is over `limitMb` (then `over` is
 *  called, once) or the function returned here is called. */
export function watchMemory(o: { server: number; uri: string; limitMb: number; over: () => void }): () => void {
  if (!fs.existsSync(FOOTPRINT)) return () => {};
  let done = false;
  let timer: NodeJS.Timeout;
  const look = async () => {
    const pid = workerIn(await run("/bin/ps", ["-axwwo", "pid=,ppid=,command="]), o.server, o.uri);
    if (done) return;
    // With --minFootprint a worker under the limit is passed over at once
    // (some 20 ms), and reported, which takes half a second and more of
    // reading its pages, only when it is over.
    const used = pid === null ? null : footprintMb(await run(FOOTPRINT, ["-f", "bytes", "--noCategories", "--minFootprint", String(Math.floor(o.limitMb)), "-p", String(pid)]));
    if (done) return;
    if (used !== null && used > o.limitMb) {
      done = true;
      return o.over();
    }
    timer = setTimeout(() => void look(), EVERY_MS);
  };
  timer = setTimeout(() => void look(), FIRST_MS);
  return () => {
    done = true;
    clearTimeout(timer);
  };
}
