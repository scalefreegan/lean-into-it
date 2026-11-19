// The Tutor's Lean, shut in (bead lii-2zo.6). Scratch Lean written by the
// Tutor's model is checked by a Lean process of its own, started under
// macOS's sandbox (`sandbox-exec`) with a profile that lets it do what
// checking a proof needs and nothing else:
//
//   read     the Lean toolchain, this project's lean/ folder (Mathlib's
//            compiled files), the system's own libraries; nothing else
//            under /Users, /Volumes or the temp folders: not the home
//            folder, not the repository, not .env files
//   write    nothing (only /dev/null and its like)
//   run      the toolchain's own programs (lean starts a worker per file);
//            no shell, no git, no curl
//   network  nothing
//
// It is not `lake serve`: lake runs git and reads the user's git settings.
// The library path lake would set is asked for once, outside the sandbox
// (`lake env`), and `lean --server` is started with it from an empty
// folder. The word filter in web/shared/partner.ts stays in front as the
// outer layer; this is the wall that holds when a text gets past it.
//
// Pure except `sandboxSetup`, which asks lake where things are.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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

/**
 * The profile, in the sandbox's own language. Later rules win. Everything
 * is denied unless allowed; reading is allowed broadly for the system and
 * then taken away for every place a person's files live.
 */
export function sandboxProfile({ sysroot, leanDir, workDir }: SandboxPaths): string {
  return [
    "(version 1)",
    "(deny default)",
    // What any process needs to start and run: its own signals and info, shared memory, Mach services.
    "(allow process-fork)",
    "(allow signal (target self))",
    "(allow sysctl-read)",
    "(allow mach-lookup)",
    "(allow ipc-posix-shm-read*)",
    // Reading: the system, then not where people's files are, then the two places Lean needs.
    "(allow file-read*)",
    '(deny file-read* (subpath "/Users") (subpath "/Volumes") (subpath "/private/tmp") (subpath "/private/var/folders") (subpath "/private/var/root") (subpath "/Library/Keychains") (subpath "/private/etc/ssh"))',
    `(allow file-read* (subpath ${q(sysroot)}) (subpath ${q(leanDir)}) (subpath ${q(workDir)}))`,
    // Looking at a folder's name on the way to those is not reading it.
    "(allow file-read-metadata)",
    // Writing: nowhere.
    '(allow file-write-data (literal "/dev/null") (literal "/dev/dtracehelper"))',
    // Running: the toolchain's own programs only.
    `(allow process-exec (subpath ${q(path.join(sysroot, "bin"))}))`,
    // (deny default) covers the network; said again so that it is seen.
    "(deny network*)",
  ].join("\n");
}

export interface SandboxSetup extends SandboxPaths {
  lean: string;
  leanPath: string;
  profile: string;
}

/**
 * Where the toolchain and the libraries are, asked of lake once, outside
 * the sandbox; and the empty folder to run in. Throws a sentence when this
 * machine cannot do it (no sandbox-exec: not macOS).
 */
export function sandboxSetup(leanDir: string, env: NodeJS.ProcessEnv): SandboxSetup {
  if (!fs.existsSync(SANDBOX_EXEC)) throw new Error("this machine has no sandbox-exec (it is part of macOS), and the Tutor's Lean is not run without it");
  const ask = (name: string) => execFileSync("lake", ["env", "printenv", name], { cwd: leanDir, env, encoding: "utf8", timeout: 60_000, stdio: ["ignore", "pipe", "ignore"] }).trim();
  const sysroot = fs.realpathSync(ask("LEAN_SYSROOT"));
  const leanPath = ask("LEAN_PATH");
  // realpath: the sandbox matches the real path (/tmp is /private/tmp).
  const workDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lean-into-it-sandbox-")));
  const paths = { sysroot, leanDir: fs.realpathSync(leanDir), workDir };
  return { ...paths, lean: path.join(sysroot, "bin", "lean"), leanPath, profile: sandboxProfile(paths) };
}

/** The sandboxed server's environment: where the libraries are, and nothing of the user's. */
export function sandboxEnv(s: SandboxSetup): NodeJS.ProcessEnv {
  return { LEAN_PATH: s.leanPath, LEAN_SYSROOT: s.sysroot, PATH: path.join(s.sysroot, "bin"), HOME: s.workDir, TMPDIR: s.workDir };
}
