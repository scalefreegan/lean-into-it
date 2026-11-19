import assert from "node:assert/strict";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { READER_ROLE, READER_TABLES, readerRole } from "../db/config.mjs";
import { ensureLearner, recordAttempt, recordHint } from "../db/progress.ts";
import { CAPS, MCP_TOOLS, TOOL_NAMES, configFromEnv, createHistoryServer, fit, historyReader } from "../history-mcp.mjs";
import { freshDb } from "./testdb.mjs";

// The Tutor's read-only history tools on PGlite with the real migrations:
// the role 0005 makes, what it may and may not do, and what the tools say.

const content = () => ({
  levels: [{ id: 1, title: "One", summary: "", status: "written", topics: [], moves: ["exact", "intro", "apply"] }],
  lessons: [
    {
      id: "implies",
      title: "If, then",
      level: 1,
      exercises: [
        { id: "e1", title: "Use a fact", concept: "exact-fact", mode: "board" },
        { id: "e2", title: "Suppose", concept: "intro-implication", mode: "board" },
      ],
    },
  ],
});

async function setup(t) {
  const fresh = await freshDb();
  t.after(fresh.close);
  const learner = await ensureLearner(fresh.db);
  const reader = historyReader({ query: fresh.query, learnerId: learner, content });
  return { ...fresh, learner, reader };
}

test("the reader role exists, can log in nowhere, and may only SELECT the attempt and progress tables", async (t) => {
  const { query } = await setup(t);
  const [role] = await query("select rolcanlogin, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls from pg_roles where rolname = $1", [READER_ROLE]);
  assert.deepEqual(role, { rolcanlogin: false, rolsuper: false, rolcreaterole: false, rolcreatedb: false, rolbypassrls: false });
  const grants = await query("select table_name, privilege_type from information_schema.role_table_grants where grantee = $1 order by table_name", [READER_ROLE]);
  assert.deepEqual(grants.map((g) => `${g.table_name}:${g.privilege_type}`), [...READER_TABLES].sort().map((n) => `${n}:SELECT`));
});

test("as the reader, every write fails, and so does reading the chat or the learner's settings", async (t) => {
  const { query, db, learner } = await setup(t);
  await recordAttempt(db, learner, { lessonId: "implies", exerciseId: "e1", body: "exact hQ", solved: false, error: "Unknown identifier `hQ`" });
  const asReader = async (sql, params) => {
    await query("begin");
    try {
      await query(`set local role "${READER_ROLE}"`);
      return await query(sql, params);
    } finally {
      await query("rollback");
    }
  };
  assert.equal((await asReader("select count(*)::int as n from attempts"))[0].n, 1);
  const denied = /permission denied/;
  await assert.rejects(asReader("insert into attempts (learner_id, lesson_id, exercise_id, body, solved) values ($1, 'l', 'e', 'x', true)", [learner]), denied);
  await assert.rejects(asReader("update attempts set solved = true"), denied);
  await assert.rejects(asReader("delete from attempts"), denied);
  await assert.rejects(asReader("truncate attempts"), denied);
  await assert.rejects(asReader("insert into solved_exercises (learner_id, lesson_id, exercise_id, solution) values ($1, 'l', 'e', 'x')", [learner]), denied);
  await assert.rejects(asReader("update concept_credits set due_at = now()"), denied);
  await assert.rejects(asReader("insert into hints (learner_id, lesson_id, exercise_id, rung) values ($1, 'l', 'e', 1)", [learner]), denied);
  await assert.rejects(asReader("select * from chat_messages"), denied);
  await assert.rejects(asReader("select * from learners"), denied);
  await assert.rejects(asReader("create table x (a int)"), denied);
  assert.equal((await query("select count(*)::int as n from attempts where solved"))[0].n, 0);
});

test("a tool call reads as the reader in a read-only transaction and leaves the connection as it was", async (t) => {
  const { query, db, learner } = await setup(t);
  await recordAttempt(db, learner, { lessonId: "implies", exerciseId: "e1", body: "exact hP", solved: true });
  const seen = [];
  const spy = async (text, params) => {
    const rows = await query(text, params);
    if (/from attempts/.test(text)) seen.push((await query("select current_user as u, current_setting('transaction_read_only') as ro"))[0]);
    return rows;
  };
  await historyReader({ query: spy, learnerId: learner, content }).recentAttempts();
  assert.deepEqual(seen, [{ u: READER_ROLE, ro: "on" }]);
  assert.notEqual((await query("select current_user as u"))[0].u, READER_ROLE);
  // A role that is not the reader's is refused before anything is read.
  assert.throws(() => historyReader({ query, role: "postgres", learnerId: learner, content }), /bad role name/);
  assert.throws(() => historyReader({ query, learnerId: "everyone", content }), /uuid/);
});

test("recent_attempts: newest first, with the proof, Lean's error and the hint rung; only this learner's", async (t) => {
  const { query, db, learner, reader } = await setup(t);
  const [{ id: other }] = await query("insert into learners (name) values ('Other') returning id");
  await recordAttempt(db, other, { lessonId: "implies", exerciseId: "e1", body: "exact someoneElse", solved: false, error: "no" });
  await recordAttempt(db, learner, { lessonId: "implies", exerciseId: "e1", body: "exact hQ", solved: false, error: "Unknown identifier `hQ`\nmore", rung: 2 });
  await recordAttempt(db, learner, { lessonId: "implies", exerciseId: "e1", body: "exact hP", solved: true, rung: 3, assisted: true });
  await recordAttempt(db, learner, { lessonId: "gone", exerciseId: "x", body: "rfl\u0007", solved: true });
  const { attempts } = await reader.recentAttempts();
  assert.equal(attempts.length, 3);
  assert.ok(!JSON.stringify(attempts).includes("someoneElse"));
  assert.deepEqual(attempts[0], { when: attempts[0].when, lesson: "gone", exercise: "x", removed: true, solved: true, proof: "rfl" });
  assert.deepEqual(attempts[1], { when: attempts[1].when, lesson: "implies", exercise: "e1", lessonTitle: "If, then", exerciseTitle: "Use a fact", concept: "exact-fact", level: 1, solved: true, proof: "exact hP", hintRung: 3, assisted: true });
  assert.equal(attempts[2].leanSaid, "Unknown identifier `hQ`\nmore");
  assert.equal(attempts[2].hintRung, 2);
  assert.deepEqual((await reader.recentAttempts({ failedOnly: true })).attempts.map((a) => a.proof), ["exact hQ"]);
  assert.equal((await reader.recentAttempts({ lesson: "gone" })).attempts.length, 1);
  assert.equal((await reader.recentAttempts({ limit: 1 })).attempts.length, 1);
  assert.equal((await reader.recentAttempts({ limit: 10_000 })).attempts.length, 3);
});

test("trouble: failed checks by concept and by the move on the refused line, with the commonest errors", async (t) => {
  const { db, learner, reader } = await setup(t);
  const fail = (exerciseId, body, error) => recordAttempt(db, learner, { lessonId: "implies", exerciseId, body, solved: false, error });
  await fail("e1", "exact hQ", "Unknown identifier `hQ`");
  await fail("e1", "exact hR", "Unknown identifier `hQ`");
  await fail("e1", "intro h\nexact h2", "Type mismatch");
  await fail("e2", "apply hP", "could not unify");
  await recordAttempt(db, learner, { lessonId: "implies", exerciseId: "e2", body: "intro hP\nexact hP", solved: true });
  const r = await reader.trouble();
  assert.equal(r.checks, 5);
  assert.equal(r.failedChecks, 4);
  assert.deepEqual(r.byConcept.map((c) => [c.concept, c.failedChecks, c.checks]), [["exact-fact", 3, 3], ["intro-implication", 1, 2]]);
  assert.deepEqual(r.byConcept[0].commonErrors[0], { error: "Unknown identifier `hQ`", times: 2 });
  assert.deepEqual(r.byConcept[0].exercises, ["implies/e1"]);
  // `intro h` was accepted; the refused line is the last one.
  assert.deepEqual(r.byMove.map((m) => [m.move, m.failedChecks, m.checks]), [["exact", 3, 4], ["apply", 1, 1]]);
});

test("trouble looks back only as far as asked", async (t) => {
  const { query, db, learner } = await setup(t);
  await recordAttempt(db, learner, { lessonId: "implies", exerciseId: "e1", body: "exact hQ", solved: false, error: "no" });
  const later = historyReader({ query, learnerId: learner, content, now: () => new Date(Date.now() + 40 * 86_400_000) });
  assert.equal((await later.trouble()).failedChecks, 0);
  assert.equal((await later.trouble({ days: 60 })).failedChecks, 1);
});

test("progress: mastery per concept and move, what is due, what is solved", async (t) => {
  const { query, db, learner, reader } = await setup(t);
  for (let i = 0; i < 4; i++) await recordAttempt(db, learner, { lessonId: "implies", exerciseId: "e1", body: `exact hP -- ${i}`, solved: true });
  await recordAttempt(db, learner, { lessonId: "implies", exerciseId: "e2", body: "apply hP", solved: false, error: "no" });
  await recordHint(db, learner, "implies", "e2", 1);
  const now = await reader.progress();
  assert.equal(now.checksOnRecord, 5);
  assert.deepEqual(now.concepts.map((c) => [c.concept, c.mastery, c.mastered]), [["intro-implication", 0, false], ["exact-fact", 1, true]]);
  assert.equal(now.concepts[1].dueNow, false);
  assert.deepEqual(now.moves.map((m) => m.move), ["apply", "exact"]);
  assert.deepEqual(now.dueForReviewToday, []);
  assert.deepEqual(now.lessonsWorkedOn, [{ lesson: "implies", title: "If, then", level: 1, solved: 1, exercises: 2 }]);
  assert.equal(now.levels[0].level, 1);
  const tomorrow = await historyReader({ query, learnerId: learner, content, now: () => new Date(Date.now() + 2 * 86_400_000) }).progress();
  assert.deepEqual(tomorrow.dueForReviewToday, [{ lesson: "implies", exercise: "e1", concept: "exact-fact" }]);
  assert.equal(tomorrow.concepts[1].dueNow, true);
});

test("over MCP: three read-only tools, no learner argument, a failure in plain words", async (t) => {
  const { db, learner, reader } = await setup(t);
  await recordAttempt(db, learner, { lessonId: "implies", exerciseId: "e1", body: "exact hQ", solved: false, error: "Unknown identifier `hQ`" });
  const connect = async (r) => {
    const server = createHistoryServer(r);
    const client = new Client({ name: "test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
    t.after(() => client.close());
    return client;
  };
  const client = await connect(reader);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((x) => x.name).sort(), [...TOOL_NAMES].sort());
  assert.deepEqual(MCP_TOOLS, TOOL_NAMES.map((n) => `mcp__history__${n}`));
  for (const tool of tools) {
    assert.equal(tool.annotations.readOnlyHint, true, tool.name);
    assert.ok(!Object.keys(tool.inputSchema.properties ?? {}).some((k) => /learner|user|sql|query/i.test(k)), tool.name);
  }
  const call = async (c, name, args = {}) => {
    const r = await c.callTool({ name, arguments: args });
    return { isError: r.isError === true, text: r.content[0].text };
  };
  const recent = await call(client, "recent_attempts", { failed_only: true });
  assert.equal(JSON.parse(recent.text).attempts[0].leanSaid, "Unknown identifier `hQ`");
  assert.equal(JSON.parse((await call(client, "trouble")).text).failedChecks, 1);
  assert.equal(JSON.parse((await call(client, "progress")).text).checksOnRecord, 1);
  assert.equal((await call(client, "recent_attempts", { lesson: "x'; drop table attempts" })).isError, true);
  assert.equal((await call(client, "recent_attempts", { limit: CAPS.recentMax + 1 })).isError, true);
  const broken = await connect(historyReader({ query: async () => { throw new Error("secret detail"); }, learnerId: learner, content }));
  const failed = await call(broken, "progress");
  assert.equal(failed.isError, true);
  assert.ok(!failed.text.includes("secret"));
});

test("the scope comes from the environment, checked; a long result is cut with a note", () => {
  const env = { LII_HISTORY_LEARNER_ID: "0b0e7b5e-1111-4222-8333-444455556666", DATABASE_URL: "postgres://localhost/x" };
  assert.deepEqual(configFromEnv(env), { learnerId: env.LII_HISTORY_LEARNER_ID, url: env.DATABASE_URL, role: READER_ROLE });
  assert.throws(() => configFromEnv({ ...env, LII_HISTORY_LEARNER_ID: "me" }), /uuid/);
  assert.throws(() => configFromEnv({ ...env, DATABASE_URL: "" }), /postgres/);
  assert.throws(() => configFromEnv({ ...env, LEAN_INTO_IT_READER_ROLE: "postgres" }), /lean_tutor_ro/);
  assert.equal(readerRole({}, "/nonexistent"), READER_ROLE);
  assert.equal(readerRole({ LEAN_INTO_IT_READER_ROLE: "lean_tutor_ro_scratch" }, "/nonexistent"), "lean_tutor_ro_scratch");
  assert.throws(() => readerRole({ LEAN_INTO_IT_READER_ROLE: "postgres" }, "/nonexistent"), /must look like/);
  const big = fit({ attempts: Array.from({ length: 50 }, (_, i) => ({ i, proof: "x".repeat(400) })) }, "attempts", 5_000);
  assert.ok(big.attempts.length < 50 && Buffer.byteLength(JSON.stringify(big)) <= 5_000);
  assert.match(big.truncated, /only the first \d+ of 50 attempts/);
});
