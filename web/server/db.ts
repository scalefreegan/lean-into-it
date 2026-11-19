// The database handle: one pg Pool and one Drizzle instance for the whole
// dev server, made on first use so that importing this module (as api.ts
// does, and so the tests do) never opens a connection. scripts/db/ holds the
// schema, migrations and setup CLI. Ported from Fret Not, minus its logins.

import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { databaseUrl, readerRole, redact } from "../../scripts/db/config.mjs";
import { describeMigrations, migrationState } from "../../scripts/db/migrations.mjs";
import { ensureLearner, type Db } from "../../scripts/db/progress.ts";
import * as schema from "../../scripts/db/schema.ts";

export { schema };
export type { Db };

let pool: pg.Pool | null = null;
let db: Db | null = null;
/** A database handed in from outside (setDb): the tests' PGlite. */
let injected: Db | null = null;
let learner: Promise<string> | null = null;

/** Serve every route from this handle instead of the pool: the tests run the
 *  real handlers on an in-process PGlite, with no Postgres server. null goes
 *  back to the pool. */
export function setDb(handle: Db | null): void {
  injected = handle;
  learner = null;
}

function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({ connectionString: databaseUrl(), max: 10 });
    // An idle client's connection dropping (Postgres restarted) emits here;
    // unhandled, it would take the dev server down with it.
    pool.on("error", (e) => console.error("[lean-into-it] postgres pool:", e.message));
  }
  return pool;
}

/** The Drizzle instance over the shared pool. */
export function rawDb(): Db {
  if (injected) return injected;
  if (!db) db = drizzle(getPool(), { schema });
  return db;
}

/** The one learner's id (created on first use), looked up once per process. */
export function learnerId(): Promise<string> {
  learner ??= ensureLearner(rawDb()).catch((e) => {
    learner = null;
    throw e;
  });
  return learner;
}

/** Close the pool (tests, shutdown). The next call makes a new one. */
export async function closeDb(): Promise<void> {
  const p = pool;
  pool = null;
  db = null;
  learner = null;
  await p?.end();
}

const FIX = "Run `npm run db:setup` (creates the database if needed and applies migrations), then start the server again.";

/**
 * The boot check: the database answers and its recorded migrations match the
 * committed ones exactly. Throws an Error whose message says what is wrong
 * and what to run; a half-migrated schema would otherwise fail later, far
 * from the cause. It only reads; migrating is always an explicit
 * `npm run db:setup`. In a linked worktree with no DATABASE_URL,
 * databaseUrl() throws before anything connects (config.mjs).
 */
export async function checkDatabase(url?: string): Promise<{ applied: number; total: number }> {
  url ??= databaseUrl();
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 });
  const where = redact(url);
  try {
    await client.connect();
  } catch (e) {
    const err = e as { code?: string; message?: string };
    const why =
      err.code === "3D000" ? "the database does not exist"
      : err.code === "ECONNREFUSED" ? "nothing is listening (is Postgres running? brew services start postgresql@17)"
      : err.message || String(e);
    throw new Error(`Lean Into It cannot reach its database at ${where}: ${why}.\n${FIX}`);
  }
  try {
    const state = await migrationState(async (text: string, params?: unknown[]) => (await client.query(text, params)).rows);
    if (state.status !== "current") {
      const fix =
        state.status === "ahead" || state.status === "diverged"
          ? "This checkout can't migrate it; point DATABASE_URL at a database for this branch (or update the checkout)."
          : FIX;
      throw new Error(`Lean Into It's database at ${where} is ${describeMigrations(state)}.\n${fix}`);
    }
    // The Tutor's history tools read as this role (migration 0005). A name
    // other than the one db:setup ran with has no grants here: say so now,
    // not in the middle of a Tutor turn. Never fatal: only those tools fail.
    try {
      const role = readerRole();
      const { rows } = await client.query("select has_table_privilege(r.oid, 'public.attempts', 'select') as ok from pg_roles r where r.rolname = $1", [role]);
      if (!rows[0]?.ok) console.warn(`[lean-into-it] the Tutor's read-only role ${role} ${rows[0] ? "has no grants in" : "does not exist for"} ${where}, so the Tutor cannot read the attempt history. Was \`npm run db:setup\` run with another LEAN_INTO_IT_READER_ROLE?`);
    } catch (e) {
      console.warn(`[lean-into-it] the Tutor's read-only role could not be checked (${(e as Error)?.message || e}); the Tutor may not be able to read the attempt history.`);
    }
    return { applied: state.applied, total: state.total };
  } finally {
    await client.end().catch(() => {});
  }
}
