import assert from "node:assert/strict";
import { test } from "node:test";
import { buildArgs, childEnv, classifyExit, DENIED, READ_TOOLS, SECRET_PATHS, secretDenials, WEB_TOOLS, LOCAL_FETCH } from "../claude.mjs";

// The Tutor's sandbox, pinned without spawning anything.

const after = (args, flag) => args[args.indexOf(flag) + 1];

test("a Tutor turn may only read: Read, Glob and Grep exist, every way to write or run is denied", () => {
  const args = buildArgs({ systemPrompt: "be kind", mcpConfigPath: "/tmp/x/mcp.json", repoRoot: "/r" });
  assert.equal(after(args, "--tools"), "Read,Glob,Grep");
  for (const flag of ["-p", "--restricted", "--no-session-persistence", "--strict-mcp-config"]) assert.ok(args.includes(flag), flag);
  assert.equal(after(args, "--permission-prompts"), "none");
  assert.equal(after(args, "--mcp-config"), "/tmp/x/mcp.json");
  assert.equal(after(args, "--append-system-prompt"), "be kind");
  const denied = args.slice(args.indexOf("--disallowedTools") + 1, args.indexOf("--append-system-prompt"));
  for (const t of ["Bash", "Edit", "Write", "WebFetch", "WebSearch", "Agent"]) assert.ok(denied.includes(t), t);
  assert.ok(denied.includes("Read(//r/.env*)") && denied.includes("Grep(//r/**/.env*)"));
  const allowed = args.slice(args.indexOf("--allowedTools") + 1, args.indexOf("--disallowedTools"));
  assert.deepEqual(allowed, READ_TOOLS);
  assert.ok(!DENIED.some((t) => READ_TOOLS.includes(t)));
  assert.equal(secretDenials("/r").length, READ_TOOLS.length * SECRET_PATHS.length);
  assert.ok(denied.includes("Read(//r/.claude/**)") && denied.includes("Glob(//r/.beads/**)"));
  // No prompt argument: the transcript goes in on stdin.
  assert.ok(!args.some((a) => a.includes("Conversation so far")));
});

test("a research turn may search and fetch the web and nothing else: no file tools, nothing on this machine", () => {
  const args = buildArgs({ systemPrompt: "s", mcpConfigPath: "/tmp/x/mcp.json", repoRoot: "/run", web: true });
  assert.equal(after(args, "--tools"), "WebSearch,WebFetch");
  assert.deepEqual(args.slice(args.indexOf("--allowedTools") + 1, args.indexOf("--disallowedTools")), WEB_TOOLS);
  const denied = args.slice(args.indexOf("--disallowedTools") + 1, args.indexOf("--append-system-prompt"));
  for (const t of WEB_TOOLS) assert.ok(!denied.includes(t), t);
  for (const t of ["Bash", "Edit", "Write", "Agent", "Task", ...READ_TOOLS, ...LOCAL_FETCH]) assert.ok(denied.includes(t), t);
  assert.ok(LOCAL_FETCH.includes("WebFetch(domain:localhost)") && LOCAL_FETCH.includes("WebFetch(domain:127.0.0.1)"));
  assert.ok(buildArgs({ systemPrompt: "s", repoRoot: "/run", web: true, localNames: ["my-mac.t.ts.net"] }).includes("WebFetch(domain:my-mac.t.ts.net)"), "nor by its tailnet name");
  assert.throws(() => buildArgs({ web: true, write: { contentDir: "/r/content" }, repoRoot: "/r" }), /search the web or write lessons, not both/);
});

test("MCP tools are granted one by one, by exact name, on top of the read tools", () => {
  const tools = ["mcp__history__recent_attempts", "mcp__history__trouble"];
  const args = buildArgs({ systemPrompt: "s", mcpConfigPath: "/tmp/x/mcp.json", repoRoot: "/r", mcpTools: tools });
  assert.deepEqual(args.slice(args.indexOf("--allowedTools") + 1, args.indexOf("--disallowedTools")), [...READ_TOOLS, ...tools]);
  assert.equal(after(args, "--tools"), "Read,Glob,Grep");
  assert.ok(args.includes("--strict-mcp-config"));
  for (const bad of ["mcp__history__*", "mcp__history", "Bash", "mcp__history__x y"]) assert.throws(() => buildArgs({ mcpTools: [bad] }), /not an MCP tool name/, bad);
});

test("the run bills the Claude Code login, not an API key, and is not a child session", () => {
  const env = childEnv({ PATH: "/bin", ANTHROPIC_API_KEY: "k", CLAUDECODE: "1", CLAUDE_CODE_ENTRYPOINT: "cli", ANTHROPIC_AUTH_TOKEN: "t", ANTHROPIC_BASE_URL: "u", HOME: "/h" });
  assert.deepEqual(env, { PATH: "/bin", HOME: "/h" });
});

test("a finished run is read from its envelope; known failures say what to do", () => {
  assert.deepEqual(classifyExit({ code: 0, stdout: JSON.stringify({ type: "result", result: "hi" }), stderr: "" }), { ok: true, text: "hi" });
  const auth = classifyExit({ code: 1, stdout: "", stderr: "Please run /login" });
  assert.equal(auth.ok, false);
  assert.match(auth.message, /sign-in has expired/);
  assert.match(classifyExit({ code: 0, stdout: JSON.stringify({ is_error: true, result: "usage limit reached|1900000000" }), stderr: "" }).message, /usage limit/);
  assert.match(classifyExit({ code: 2, stdout: "", stderr: "" }).message, /no error output/);
});

test("with the reaper armed, Ctrl-C still ends the process", async () => {
  const { spawn } = await import("node:child_process");
  const url = new URL("../claude.mjs", import.meta.url).href;
  const child = spawn(process.execPath, ["--input-type=module", "-e", `const m = await import(${JSON.stringify(url)}); m.armReaper(); process.kill(process.pid, "SIGINT"); setTimeout(() => process.exit(7), 3000);`]);
  const [code, signal] = await new Promise((r) => child.on("exit", (c, s) => r([c, s])));
  assert.equal(signal, "SIGINT", `exited ${code} instead of by the signal`);
});
