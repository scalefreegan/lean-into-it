// Types for the plain-ESM modules the server imports from scripts/ (kept
// .mjs so the CLIs run with no build step and no dependency on web/).

declare module "*/scripts/env.mjs" {
  export const ROOT: string;
  /** LEAN_INTO_IT_ENV_FILE (resolved against the repo root), else <repo>/.env.local. */
  export function envFile(root?: string): string;
  /** KEY=VALUE lines → an object; comments, `export ` and one layer of quotes tolerated. */
  export function parseEnv(text: string): Record<string, string>;
}

declare module "*/scripts/db/config.mjs" {
  export const DEFAULT_DATABASE_URL: string;
  export const MIGRATIONS_DIR: string;
  export function isLinkedWorktree(root?: string): boolean;
  /** The shell's DATABASE_URL, else .env.local's, else the default; throws
   *  in a linked worktree with neither. */
  export function databaseUrl(env?: Record<string, string | undefined>, file?: string, root?: string): string;
  export const READER_ROLE: string;
  export const READER_ROLE_RE: RegExp;
  export const READER_TABLES: string[];
  /** The Tutor's read-only role: LEAN_INTO_IT_READER_ROLE, else lean_tutor_ro. */
  export function readerRole(env?: Record<string, string | undefined>, file?: string): string;
  /** Throws when the URL names no database. */
  export function databaseName(url: string): string;
  /** The URL with any password masked. */
  export function redact(url: string): string;
}

declare module "*/scripts/db/migrations.mjs" {
  type Migration = { sql: string[]; folderMillis: number; hash: string };
  type MigrationState = {
    status: "current" | "behind" | "skipped" | "ahead" | "diverged";
    total: number;
    applied: number;
    missing: Migration[];
    skipped: Migration[];
    unknown: { hash: string; createdAt: number | null }[];
  };
  type Query = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
  /** Read-only: the database's recorded migrations against the files, by hash. */
  export function migrationState(query: Query, disk?: Migration[]): Promise<MigrationState>;
  export function describeMigrations(state: MigrationState): string;
}

declare module "*/scripts/tests/testdb.mjs" {
  /** A fresh, fully migrated in-process PGlite database for one test. */
  export function freshDb(): Promise<{
    db: import("../../scripts/db/progress.ts").Db;
    client: unknown;
    query: (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;
    close: () => Promise<void>;
  }>;
}

declare module "*/scripts/tests/authorrepo.mjs" {
  export function authorRepo(): { root: string; content: string; git: (...args: string[]) => string; copies: () => string[]; close: () => void };
  export const LESSON_FILE: string;
  export function withExercise(raw: string, exercise: { id: string; statement?: string; solution?: string; given?: string }): string;
}

declare module "*/scripts/claude.mjs" {
  export const REPO_ROOT: string;
  export const DEFAULT_MODEL: string;
  export const READ_TOOLS: string[];
  export const DENIED: string[];
  export const SECRET_PATHS: string[];
  export function armReaper(): void;
  export function failureHint(text: string): string | null;
  export function secretDenials(root?: string): string[];
  export function buildArgs(o: { systemPrompt?: string; model?: string; maxTurns?: number; mcpConfigPath?: string; repoRoot?: string; mcpTools?: string[]; write?: { contentDir: string } | null }): string[];
  export function childEnv(env?: Record<string, string | undefined>): Record<string, string | undefined>;
  export function resultEnvelope(stdout: string): Record<string, unknown> | null;
  export function classifyExit(o: { code: number | null; stdout: string; stderr: string }): { ok: true; text: string } | { ok: false; message: string };
  export function sweepRunDirs(o?: { maxAgeMs?: number; now?: number; tmp?: string }): number;
  export function startClaude(o: { prompt: string; systemPrompt?: string; model?: string; cwd?: string; signal?: AbortSignal; maxTurns?: number; timeoutSec?: number; mcpServers?: Record<string, { command: string; args: string[]; env: Record<string, string> }>; mcpTools?: string[]; write?: { contentDir: string } | null }): { result: Promise<{ text: string }>; kill: () => void };
}

declare module "*/scripts/history-mcp.mjs" {
  /** The history server's name in an MCP config, and its tools by full name. */
  export const SERVER_NAME: string;
  export const TOOL_NAMES: string[];
  export const MCP_TOOLS: string[];
}

declare module "*/scripts/lean-mcp.mjs" {
  /** The Lean tool server's name in an MCP config, and its tools by full name. */
  export const SERVER_NAME: string;
  export const TOOL_NAMES: string[];
  export const MCP_TOOLS: string[];
}
