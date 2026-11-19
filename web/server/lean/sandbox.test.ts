import assert from "node:assert/strict";
import { test } from "node:test";
import { EMPTY_DIR, SYSTEM_READS, sandboxEnv, sandboxProfile, type SandboxSetup } from "./sandbox.ts";

// The profile as text; lean.test.ts runs a real Lean under it.

const paths = { sysroot: "/Users/me/.elan/toolchains/lean4", leanDir: "/Users/me/app/lean", workDir: EMPTY_DIR };
const lines = sandboxProfile(paths).split("\n");
const about = (re: RegExp) => lines.filter((l) => re.test(l));

test("everything is denied unless a line names it: there is no rule that allows a whole kind of thing", () => {
  assert.equal(lines[0], "(version 1)");
  assert.equal(lines[1], "(deny default)");
  // Every allow but fork carries a filter: a place, a name, or self.
  for (const l of lines.filter((x) => x.startsWith("(allow") && x !== "(allow process-fork)")) assert.match(l, /\((subpath|literal|sysctl-name|sysctl-name-prefix|target) /, l);
  assert.deepEqual(about(/mach-/), ["(deny mach-lookup)"]);
  assert.deepEqual(about(/network/), ["(deny network*)"]);
  assert.deepEqual(about(/ipc|iokit|file-ioctl|process-info/), []);
});

test("it may read the system's libraries, the toolchain, lean/ and the empty folder, by name, and nowhere a person's files live", () => {
  const reads = about(/^\(allow file-read\*/).join(" ");
  for (const p of [...SYSTEM_READS, paths.sysroot, paths.leanDir, EMPTY_DIR]) assert.ok(reads.includes(`(subpath "${p}")`), p);
  const places = [...reads.matchAll(/\(subpath "([^"]+)"\)/g)].map((m) => m[1]);
  for (const p of places) {
    // Nothing above the two folders of the user's that Lean needs, and no home, Homebrew, /Library data or temp folder.
    assert.ok(!["/", "/Users", "/Users/me", "/Users/me/app", "/opt", "/Library", "/private", "/private/var", "/private/etc", "/private/tmp", "/Applications", "/Volumes"].includes(p), p);
  }
  assert.ok(reads.includes('(literal "/")'), "the root folder's own names, not what is under them");
  // The folders above may be looked at (size, date), each by name; nothing else may.
  const meta = about(/^\(allow file-read-metadata/).join(" ");
  for (const p of ["/Users", "/Users/me", "/Users/me/app", "/Users/me/.elan"]) assert.ok(meta.includes(`(literal "${p}")`), p);
  assert.ok(!/subpath/.test(meta));
});

test("it may write nothing, and run only lean itself", () => {
  assert.deepEqual(about(/file-write/), ['(allow file-write-data (literal "/dev/null"))']);
  assert.deepEqual(about(/process-exec/), ['(allow process-exec (literal "/Users/me/.elan/toolchains/lean4/bin/lean"))']);
});

test("a path that could end its string and add rules of its own is refused", () => {
  for (const bad of ['/Users/me/a")(allow default)("', "/Users/me/a\\b", "relative/path", "/Users/me/a\nb"]) {
    assert.throws(() => sandboxProfile({ ...paths, leanDir: bad }), /sandbox path/, bad);
  }
});

test("the sandboxed Lean is told where the libraries are and nothing of the user's environment; it runs in the system's empty folder", () => {
  const env = sandboxEnv({ ...paths, lean: "/x/bin/lean", leanPath: "/a:/b", profile: "" } as SandboxSetup);
  assert.deepEqual(env, { LEAN_PATH: "/a:/b", LEAN_SYSROOT: paths.sysroot, LAKE: "/private/var/empty/no-lake", PATH: `${paths.sysroot}/bin`, HOME: EMPTY_DIR, TMPDIR: EMPTY_DIR });
});
