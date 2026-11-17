import assert from "node:assert/strict";
import { test } from "node:test";
import { localHost, sameOrigin } from "./api.ts";

// /api/check and /api/playground hand text to Lean, which can run code
// while elaborating it. These two rules are what keeps another website from
// reaching them.

test("a request from another origin is refused", () => {
  assert.equal(sameOrigin("http://evil.example", "localhost:38800"), false);
  assert.equal(sameOrigin("http://localhost:9999", "localhost:38800"), false);
  assert.equal(sameOrigin("null", "localhost:38800"), false);
  assert.equal(sameOrigin("http://localhost:38800", undefined), false);
});

test("the app's own page, and a request with no Origin, are allowed", () => {
  assert.equal(sameOrigin("http://localhost:38800", "localhost:38800"), true);
  assert.equal(sameOrigin(undefined, "localhost:38800"), true);
});

test("only this machine's names count as the host (DNS rebinding sends a matching Origin and Host)", () => {
  assert.equal(localHost("localhost:38800"), true);
  assert.equal(localHost("127.0.0.1:38800"), true);
  assert.equal(localHost("[::1]:38800"), true);
  assert.equal(localHost("LOCALHOST:38800"), true);
  assert.equal(localHost("evil.example:38800"), false);
  assert.equal(localHost("localhost.evil.example"), false);
  assert.equal(localHost(undefined), false);
});
