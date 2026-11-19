import assert from "node:assert/strict";
import { test } from "node:test";
import { sandboxEnv, sandboxProfile, type SandboxSetup } from "./sandbox.ts";

// The profile as text; lean.test.ts runs a real Lean under it.

const paths = { sysroot: "/Users/me/.elan/toolchains/lean4", leanDir: "/Users/me/app/lean", workDir: "/private/var/folders/x/lean-into-it-sandbox-1" };

test("everything is denied unless allowed; the user's files are taken out of what may be read, then Lean's own put back", () => {
  const lines = sandboxProfile(paths).split("\n");
  assert.equal(lines[0], "(version 1)");
  assert.equal(lines[1], "(deny default)");
  const at = (re: RegExp) => lines.findIndex((l) => re.test(l));
  const [readAll, denyUsers, allowLean] = [at(/^\(allow file-read\*\)$/), at(/^\(deny file-read\* \(subpath "\/Users"\)/), at(/^\(allow file-read\* \(subpath "\/Users\/me\/\.elan/)];
  assert.ok(readAll > 0 && readAll < denyUsers && denyUsers < allowLean, "later rules win, so the order is the meaning");
  for (const place of ["/Volumes", "/private/tmp", "/private/var/folders", "/Library/Keychains"]) assert.ok(lines[denyUsers].includes(`(subpath "${place}")`), place);
  assert.ok(lines[allowLean].includes('(subpath "/Users/me/app/lean")'));
  // No rule lets it write a file, reach the network, or run anything but the toolchain's programs.
  const writes = lines.filter((l) => /file-write/.test(l));
  assert.deepEqual(writes, ['(allow file-write-data (literal "/dev/null") (literal "/dev/dtracehelper"))']);
  assert.deepEqual(lines.filter((l) => /network/.test(l)), ["(deny network*)"]);
  assert.deepEqual(lines.filter((l) => /process-exec/.test(l)), ['(allow process-exec (subpath "/Users/me/.elan/toolchains/lean4/bin"))']);
});

test("a path that could end its string and add rules of its own is refused", () => {
  for (const bad of ['/Users/me/a")(allow default)("', "/Users/me/a\\b", "relative/path", "/Users/me/a\nb"]) {
    assert.throws(() => sandboxProfile({ ...paths, leanDir: bad }), /sandbox path/, bad);
  }
});

test("the sandboxed Lean is told where the libraries are and nothing of the user's environment", () => {
  const env = sandboxEnv({ ...paths, lean: "/x/bin/lean", leanPath: "/a:/b", profile: "" } as SandboxSetup);
  assert.deepEqual(env, { LEAN_PATH: "/a:/b", LEAN_SYSROOT: paths.sysroot, PATH: `${paths.sysroot}/bin`, HOME: paths.workDir, TMPDIR: paths.workDir });
});
