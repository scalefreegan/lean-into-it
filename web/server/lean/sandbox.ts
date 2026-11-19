// The Tutor's Lean, shut in (bead lii-2zo.6). Scratch Lean written by the
// Tutor's model is checked by a Lean process of its own, started under
// macOS's sandbox (`sandbox-exec`) with a profile that lets it do what
// checking a proof needs and nothing else:
//
//   read     the Lean toolchain, this project's lean/ folder (Mathlib's
//            compiled files), the system's own libraries (SYSTEM_READS)
//            and nothing else: an allow-list, so not the home folder, the
//            repository, .env files, Homebrew's data (the Postgres
//            cluster) or anything not named
//   look at  (size, date) only the folders above those
//   write    nothing (only /dev/null)
//   run      lean itself (it starts a worker per file); not lake, not a
//            compiler, no shell
//   network  nothing; no Mach service either (pasteboard, Spotlight …)
//
// It is not `lake serve`: lake runs git and reads the user's git settings.
// The library path lake would set is asked for once, outside the sandbox
// (`lake env`), and `lean --server` is started with it from /var/empty,
// the system's own empty folder that nobody can write in. The word filter in web/shared/partner.ts stays in front as the
// outer layer; this is the wall that holds when a text gets past it.
//
// Pure except `sandboxSetup`, which asks lake where things are.

import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const SANDBOX_EXEC = "/usr/bin/sandbox-exec";

export interface SandboxPaths {
  /** The toolchain's root (LEAN_SYSROOT): its bin/ and lib/. */
  sysroot: string;
  /** The Lake project (lean/), whose .lake holds Mathlib's compiled files. */
  leanDir: string;
  /** The empty folder the server runs in and its documents are named under. */
  workDir: string;
}

/** A path as a profile string. A quote or backslash would end the string
 *  early and let the rest be read as rules: such a path is refused. */
function q(p: string): string {
  if (!path.isAbsolute(p) || /["\\\n\r]/.test(p)) throw new Error(`a sandbox path must be absolute, with no quote or backslash: ${JSON.stringify(p)}`);
  return `"${p}"`;
}

/** A folder and every folder above it, as literals: what a path lookup has to be able to see. */
function ancestors(p: string): string[] {
  const out: string[] = [];
  for (let at = p; ; at = path.dirname(at)) {
    out.push(at);
    if (at === path.dirname(at)) break;
  }
  return out;
}

/** What a dynamically linked program on macOS reads to start: the system's
 *  libraries and the linker's caches. No user's data lives in these. */
export const SYSTEM_READS = ["/System", "/usr/lib", "/usr/share", "/private/var/db/dyld", "/private/var/db/timezone", "/Library/Apple/System", "/dev/null", "/dev/urandom", "/dev/random", "/dev/zero"];

/**
 * The profile, in the sandbox's own language. Everything is denied unless a
 * line here allows it, and each line allows a named place or thing: there
 * is no "everything but". Reading is the system's libraries, the toolchain,
 * lean/ and the empty folder; a path's own folders may be looked at
 * (metadata) on the way to those, and nothing else may even be asked about.
 */
export function sandboxProfile({ sysroot, leanDir, workDir }: SandboxPaths): string {
  const own = [sysroot, leanDir, workDir];
  const above = [...new Set(own.flatMap(ancestors))].filter((p) => !own.includes(p));
  return [
    "(version 1)",
    "(deny default)",
    // A process may fork itself and signal itself; Lean starts one worker per file.
    "(allow process-fork)",
    "(allow signal (target self))",
    // The machine's shape (cores, memory, OS version), which the runtime asks at start.
    '(allow sysctl-read (sysctl-name-prefix "hw.") (sysctl-name-prefix "kern.os") (sysctl-name "kern.hostname") (sysctl-name "kern.maxfilesperproc") (sysctl-name "kern.argmax") (sysctl-name "kern.usrstack64") (sysctl-name "vm.loadavg") (sysctl-name-prefix "machdep.cpu."))',
    // The root folder itself (the names in it, not what is under them): the loader opens it at start.
    '(allow file-read* (literal "/"))',
    // The time zone, which the server reads to stamp its log lines: a link into /var/db/timezone.
    '(allow file-read* (literal "/etc") (literal "/var") (literal "/private/etc/localtime"))',
    '(allow file-read-metadata (literal "/private") (literal "/private/etc") (literal "/private/var") (literal "/private/var/db"))',
    `(allow file-read* ${SYSTEM_READS.map((p) => `(subpath ${q(p)})`).join(" ")})`,
    `(allow file-read* ${own.map((p) => `(subpath ${q(p)})`).join(" ")})`,
    `(allow file-read-metadata ${above.map((p) => `(literal ${q(p)})`).join(" ")})`,
    // Writing: nowhere.
    '(allow file-write-data (literal "/dev/null"))',
    // Running: lean itself, which starts its workers as `lean --worker`. Not lake, not a compiler.
    `(allow process-exec (literal ${q(path.join(sysroot, "bin", "lean"))}))`,
    // (deny default) covers the network and every Mach service; said again so that it is seen.
    "(deny network*)",
    "(deny mach-lookup)",
  ].join("\n");
}

export interface SandboxSetup extends SandboxPaths {
  lean: string;
  leanPath: string;
  profile: string;
}

/** The system's empty, unwritable folder: where the server runs and its documents are named. */
export const EMPTY_DIR = "/private/var/empty";

/**
 * Where the toolchain and the libraries are, asked of lake once, outside
 * the sandbox. Rejects with a sentence when this machine cannot do it (no
 * sandbox-exec: not macOS). Never blocks the server while lake answers.
 */
export async function sandboxSetup(leanDir: string, env: NodeJS.ProcessEnv): Promise<SandboxSetup> {
  if (!fs.existsSync(SANDBOX_EXEC) || !fs.existsSync(EMPTY_DIR)) throw new Error("this machine has no sandbox-exec (it is part of macOS), and the Tutor's Lean is not run without it");
  const ask = async (name: string) => (await execFileAsync("lake", ["env", "printenv", name], { cwd: leanDir, env, encoding: "utf8", timeout: 60_000 })).stdout.trim();
  const [root, leanPath] = await Promise.all([ask("LEAN_SYSROOT"), ask("LEAN_PATH")]);
  // realpath: the sandbox matches real paths.
  const sysroot = fs.realpathSync(root);
  const paths = { sysroot, leanDir: fs.realpathSync(leanDir), workDir: EMPTY_DIR };
  return { ...paths, lean: path.join(sysroot, "bin", "lean"), leanPath, profile: sandboxProfile(paths) };
}

/** The sandboxed server's environment: where the libraries are, and nothing of the user's. */
export function sandboxEnv(s: SandboxSetup): NodeJS.ProcessEnv {
  // LAKE names a lake that is not there: a worker that finds none takes the
  // libraries from LEAN_PATH, where one it may not run is an error.
  return { LEAN_PATH: s.leanPath, LEAN_SYSROOT: s.sysroot, LAKE: path.join(s.workDir, "no-lake"), PATH: path.join(s.sysroot, "bin"), HOME: s.workDir, TMPDIR: s.workDir };
}
