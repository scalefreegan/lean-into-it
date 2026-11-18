import assert from "node:assert/strict";
import { test } from "node:test";
import { buildArgs, childEnv, classifyExit, DENIED, READ_TOOLS, secretDenials } from "../claude.mjs";

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
  assert.equal(secretDenials("/r").length, READ_TOOLS.length * 4);
  // No prompt argument: the transcript goes in on stdin.
  assert.ok(!args.some((a) => a.includes("Conversation so far")));
});

test("the run bills the Claude Code login, not an API key, and is not a child session", () => {
  const env = childEnv({ PATH: "/bin", ANTHROPIC_API_KEY: "k", CLAUDECODE: "1", CLAUDE_CODE_ENTRYPOINT: "cli", HOME: "/h" });
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
