// The headless Claude Code CLI: the Tutor's runtime. Mirrors Fret Not's
// scripts/claude.mjs, cut down to two profiles: a turn that may READ the
// repository (Read, Glob, Grep) and do nothing else, and a writing turn
// (lesson authoring) that may also Edit and Write under the content/ of a
// git worktree made for it (web/server/turn.ts), never the repository.
// Neither runs a command, and the Tutor never grades.
//
// The prompt (the transcript) goes in on STDIN from a temp file opened
// read-only: an argument would one day cross macOS's ~1 MB argv cap, and a
// pipe left open stalls the CLI, while a file simply ends. The system prompt
// goes on the command line (--append-system-prompt). The run is detached so
// its whole process group can be killed, and it runs on the user's Claude
// Code login, never an API key. Only processes this module spawned are ever
// signalled.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The Tutor's model. Explanations and hints are short: Sonnet is enough. */
export const DEFAULT_MODEL = "claude-sonnet-5-5";

/* ------------------------------ failure hints ----------------------------- */

const AUTH_ERROR_RE = /invalid api key|please run \/login|not logged in|log ?in again|login expired|oauth token.{0,40}(expired|revoked|invalid)|authentication[_ ]?error|credentials?.{0,20}(expired|invalid|missing)|unauthorized|re-?authenticate/i;
const LIMIT_ERROR_RE = /usage limit reached|session limit|hit your .{0,20}limit|limit will reset|out of (extra )?usage|rate.?limit(ed|_error)?|\b429\b/i;
const OVERLOAD_ERROR_RE = /overloaded_error|overloaded|529|api.{0,20}(unavailable|internal server error)/i;
const AUTH_FIX = "open a terminal, run `claude`, type `/login` and finish the browser sign-in, then ask again.";

/** A known CLI failure in words the learner can act on, or null. */
export function failureHint(text) {
  if (AUTH_ERROR_RE.test(text)) return `The Claude Code sign-in has expired: ${AUTH_FIX}`;
  if (LIMIT_ERROR_RE.test(text)) {
    const m = text.match(/limit reached\|(\d{9,13})/);
    const reset = m ? new Date(Number(m[1]) * (m[1].length <= 10 ? 1000 : 1)).toLocaleString() : null;
    return `The Claude usage limit is reached. Wait for it to reset${reset ? ` (about ${reset})` : ""} and ask again.`;
  }
  if (OVERLOAD_ERROR_RE.test(text)) return "Claude is overloaded right now. Ask again in a minute.";
  return null;
}

/* ------------------------------- the sandbox ------------------------------ */

/** The only built-in tools the run has at all (`--tools`): a cap, not a list
 *  to race against a registry that grows every release. */
export const READ_TOOLS = ["Read", "Glob", "Grep"];

/** Denied outright as well (`--disallowedTools`), the second layer. */
export const DENIED = [
  "Bash", "PowerShell", "Edit", "Write", "MultiEdit", "NotebookEdit", "WebFetch", "WebSearch",
  "Task", "Agent", "Workflow", "SendMessage", "EnterWorktree", "ExitWorktree",
  "ReadMcpResourceTool", "ReadMcpResourceDirTool", "ListMcpResourcesTool",
  "TaskCreate", "TaskOutput", "TaskStop",
];

/** What no turn may read, under root: the env files (DATABASE_URL), the
 *  local tool state (.claude/, the beads database, browser captures) and
 *  Lean's build tree (gigabytes of Mathlib, no use to a tutor). */
export const SECRET_PATHS = [".env*", "**/.env*", ".claude/**", ".beads/**", ".playwright-mcp/**", "lean/.lake/**", "**/node_modules/**"];
export function secretDenials(root = REPO_ROOT) {
  const base = path.resolve(root).replace(/^\/+/, "");
  return READ_TOOLS.flatMap((tool) => SECRET_PATHS.map((p) => `${tool}(//${base}/${p})`));
}

/**
 * A writing turn's grants: Edit and Write, approved ONLY for paths under the
 * content directory of its own worktree, in the CLI's path-scoped rule
 * syntax (`Edit(//abs/path/**)`, where `//` is the filesystem root). An
 * Edit or Write anywhere else would prompt, and a prompt is a denial.
 * Throws when the directory is not inside the run's root.
 */
export function contentGrants(contentDir, repoRoot) {
  const dir = path.resolve(contentDir);
  const rel = path.relative(path.resolve(repoRoot), dir);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel) || /[()"\s]/.test(dir)) throw new Error(`the content directory must be inside the run's root (${repoRoot}), with no space, quote or bracket in its path; got ${contentDir}`);
  const rulePath = dir.replace(/^\/+/, "");
  return [`Edit(//${rulePath}/**)`, `Write(//${rulePath}/**)`];
}

/** Inside that grant, nothing named `.git` (a nested repository's config can run commands). */
export function contentDenials(contentDir, repoRoot) {
  const base = contentGrants(contentDir, repoRoot)[0].slice("Edit(".length, -"/**)".length);
  return ["Edit", "Write"].flatMap((tool) => [`${tool}(${base}/.git)`, `${tool}(${base}/**/.git)`, `${tool}(${base}/.git/**)`, `${tool}(${base}/**/.git/**)`]);
}

/** MCP tools a run may be granted, by exact name: never a wildcard, so a
 *  server that grows a tool does not hand it to the Tutor unasked. */
const MCP_TOOL_RE = /^mcp__[a-z][a-z0-9_-]*__[a-z][a-z0-9_]*$/;

/**
 * The argv for one run: pure, so a test pins the sandbox without spawning.
 *   --restricted               ignores the user's and the repo's settings
 *                              files (no hooks, no rules of theirs), confines
 *                              the file tools to cwd, refuses bypassPermissions
 *   --permission-prompts none  nobody is there to answer: a prompt is a denial
 *   --mcp-config <file> --strict-mcp-config
 *                              only the servers in that file load (none of
 *                              the user's mail, calendar…); the file holds
 *                              the read-only history server or nothing, and
 *                              its tools are allowed one by one (`mcpTools`)
 *   --no-session-persistence   the server keeps the history; nothing to resume
 */
export function buildArgs({ systemPrompt, model = DEFAULT_MODEL, maxTurns = 12, mcpConfigPath, repoRoot = REPO_ROOT, mcpTools = [], write = null }) {
  for (const t of mcpTools) if (!MCP_TOOL_RE.test(t)) throw new Error(`not an MCP tool name: ${t}`);
  // A writing turn (`write: { contentDir }`, lesson authoring): Edit and
  // Write exist, granted only under that folder; `repoRoot` is its worktree.
  const tools = write ? [...READ_TOOLS, "Edit", "Write"] : READ_TOOLS;
  const grants = write ? contentGrants(write.contentDir, repoRoot) : [];
  const denied = write ? [...DENIED.filter((t) => t !== "Edit" && t !== "Write"), ...contentDenials(write.contentDir, repoRoot)] : DENIED;
  const args = [
    "-p",
    "--output-format", "json",
    "--max-turns", String(maxTurns),
    "--model", model,
    "--restricted",
    "--permission-prompts", "none",
    "--no-session-persistence",
    "--tools", tools.join(","),
    "--allowedTools", ...READ_TOOLS, ...grants, ...mcpTools,
    "--disallowedTools", ...denied, ...secretDenials(repoRoot),
  ];
  if (systemPrompt) args.push("--append-system-prompt", systemPrompt);
  if (mcpConfigPath) args.push("--mcp-config", mcpConfigPath, "--strict-mcp-config");
  return args;
}

/** The child's environment: the server's, minus an API key (the run bills
 *  the Claude Code login) and the markers of a parent Claude Code session,
 *  which a nested CLI reads as "I am a child" (the dev server is often
 *  started from inside one). */
export function childEnv(env = process.env) {
  const out = {};
  for (const [k, v] of Object.entries(env)) {
    if (k === "ANTHROPIC_API_KEY" || k === "ANTHROPIC_AUTH_TOKEN" || k === "ANTHROPIC_BASE_URL" || k === "CLAUDECODE" || k.startsWith("CLAUDE_CODE_")) continue;
    out[k] = v;
  }
  return out;
}

/* --------------------------------- running -------------------------------- */

/** The result envelope: the whole output when it is one JSON object, else
 *  the last `{"type":"result"}` line. null when the run died first. */
export function resultEnvelope(stdout) {
  try {
    const whole = JSON.parse(stdout);
    if (whole && typeof whole === "object" && !Array.isArray(whole)) return whole;
  } catch { /* not one envelope */ }
  const lines = stdout.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line.startsWith("{")) continue;
    try {
      const obj = JSON.parse(line);
      if (obj && obj.type === "result") return obj;
    } catch { /* a torn line */ }
  }
  return null;
}

/** A finished run: { ok: true, text } or { ok: false, message }. Pure. */
export function classifyExit({ code, stdout, stderr }) {
  const wrapper = resultEnvelope(stdout);
  if (code !== 0 || (wrapper && wrapper.is_error)) {
    const errors = wrapper && Array.isArray(wrapper.errors) ? wrapper.errors.filter((e) => typeof e === "string").join("; ") : "";
    const resultText = wrapper && wrapper.result ? String(wrapper.result) : "";
    const hint = failureHint(wrapper ? `${stderr}\n${resultText}` : `${stderr}\n${stdout}`);
    if (hint) return { ok: false, message: hint };
    const detail = stderr.trim() || resultText || errors || stdout.trim();
    return {
      ok: false,
      message: detail ? `claude exited ${code}: ${detail.slice(0, 800)}` : `claude exited ${code} with no error output, most often an expired sign-in: ${AUTH_FIX}`,
    };
  }
  return { ok: true, text: wrapper && typeof wrapper.result === "string" ? wrapper.result : stdout };
}

// Runs are detached (their own process group), so nothing ends them for
// free when this process dies. Every live kill handle is kept, and a fatal
// signal kills them all. The set lives on globalThis because Vite
// re-evaluates server modules on edit.
const reaper = (globalThis.__leanIntoItReaper ??= { liveKills: new Set(), armed: false });

export function armReaper() {
  if (reaper.armed) return;
  reaper.armed = true;
  for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"]) {
    const onSignal = () => {
      for (const kill of reaper.liveKills) {
        try { kill(); } catch { /* already gone */ }
      }
      // A listener replaces Node's default exit on the signal. When nothing
      // else handles it (Vite only listens for SIGTERM), stop listening and
      // raise it again, so Ctrl-C and closing the terminal still end the server.
      if (process.listenerCount(sig) === 1) {
        process.off(sig, onSignal);
        reaper.armed = false;
        process.kill(process.pid, sig);
      }
    };
    process.on(sig, onSignal);
  }
}

const RUN_DIR_PREFIX = "lean-into-it-tutor-";

/** Delete run temp directories (they hold the transcript) that a killed
 *  server left behind, older than any run. Never throws. */
export function sweepRunDirs({ maxAgeMs = 45 * 60_000, now = Date.now(), tmp = os.tmpdir() } = {}) {
  let removed = 0;
  try {
    for (const name of fs.readdirSync(tmp)) {
      if (!name.startsWith(RUN_DIR_PREFIX)) continue;
      const dir = path.join(tmp, name);
      try {
        const st = fs.lstatSync(dir);
        if (!st.isDirectory() || now - st.mtimeMs < maxAgeMs) continue;
        fs.rmSync(dir, { recursive: true, force: true });
        removed++;
      } catch { /* gone, or not ours */ }
    }
  } catch { /* no temp folder */ }
  return removed;
}

/**
 * Start one run in `cwd`: read-only, or with `write: { contentDir }` able
 * to Edit and Write under that folder alone (a worktree's content/). Returns { result, kill }; `result`
 * resolves to { text } (the final reply) and rejects with a sentence the
 * learner may read. `signal` aborting kills the run. `mcpServers` is the
 * --mcp-config file's `mcpServers` (none by default) and `mcpTools` their
 * tools the run may call, by full name.
 */
export function startClaude({ prompt, systemPrompt, model = DEFAULT_MODEL, cwd = REPO_ROOT, signal, maxTurns = 12, timeoutSec = 180, mcpServers = {}, mcpTools = [], write = null }) {
  let dir = fs.mkdtempSync(path.join(os.tmpdir(), RUN_DIR_PREFIX));
  const cleanup = () => {
    if (!dir) return;
    const d = dir;
    dir = null;
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* the OS will */ }
  };
  let proc;
  let fd = null;
  try {
    const mcpConfigPath = path.join(dir, "mcp.json");
    fs.writeFileSync(mcpConfigPath, JSON.stringify({ mcpServers }), { mode: 0o600 });
    const promptPath = path.join(dir, "prompt.txt");
    fs.writeFileSync(promptPath, String(prompt ?? ""), { mode: 0o600 });
    fd = fs.openSync(promptPath, "r");
    proc = spawn("claude", buildArgs({ systemPrompt, model, maxTurns, mcpConfigPath, repoRoot: cwd, mcpTools, write }), { cwd, env: childEnv(), stdio: [fd, "pipe", "pipe"], detached: true });
  } catch (e) {
    cleanup();
    throw e;
  } finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch { /* closed */ } }
  }

  let killed = false;
  let timedOut = false;
  const kill = () => {
    killed = true;
    if (!proc.pid) return;
    try { process.kill(-proc.pid, "SIGKILL"); } catch { /* gone */ }
  };
  armReaper();
  reaper.liveKills.add(kill);
  const done = () => { reaper.liveKills.delete(kill); cleanup(); };
  proc.on("close", done);
  proc.on("error", done);
  if (signal) {
    if (signal.aborted) kill();
    else signal.addEventListener("abort", kill, { once: true });
  }

  const result = new Promise((resolve, reject) => {
    let stdout = "", stderr = "";
    proc.stdout.setEncoding("utf8");
    proc.stdout.on("data", (d) => { stdout += d; });
    proc.stderr.on("data", (d) => { stderr += d; });
    const timer = setTimeout(() => { timedOut = true; kill(); }, timeoutSec * 1000);
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err.code === "ENOENT" ? new Error("The `claude` command is not installed (Claude Code, https://claude.com/claude-code), so the Tutor cannot answer.") : err);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", kill);
      if (timedOut) return reject(new Error(`the Tutor took longer than ${timeoutSec} seconds`));
      if (killed) return reject(new Error("stopped"));
      const verdict = classifyExit({ code, stdout, stderr });
      if (!verdict.ok) return reject(new Error(verdict.message));
      resolve({ text: verdict.text });
    });
  });
  return { result, kill };
}
