/**
 * Server store plumbing (ADR-009's promised swap, ADR-012). A lazy pg Pool
 * from DATABASE_URL; when unset, callers return 503 with the exact fix
 * (LESSONS_LEARNED.md L4) and the app keeps its localStorage behavior.
 *
 * SQL is deliberately conservative (no db-side defaults for ids/timestamps —
 * the app supplies them) so the same statements run on any Postgres,
 * including the in-memory engine the tests use.
 */

import { Pool } from "pg";

export const SCHEMA_SQL = `
create table if not exists users (
  id text primary key,
  email text not null,
  password_hash text not null,
  display_name text,
  email_confirmed_at timestamp,
  created_at timestamp not null
);
create unique index if not exists users_email on users(email);

create table if not exists auth_sessions (
  token_hash text primary key,
  user_id text not null,
  created_at timestamp not null,
  expires_at timestamp not null
);
create index if not exists auth_sessions_user on auth_sessions(user_id);

create table if not exists projects (
  id text primary key,
  owner_id text not null,
  name text not null,
  status text not null,
  data jsonb not null,
  created_at timestamp not null,
  updated_at timestamp not null
);
create index if not exists projects_owner on projects(owner_id);
`;

/** Minimal query surface both pg.Pool and the test engine satisfy. */
export interface Db {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export async function ensureSchema(db: Db): Promise<void> {
  // Idempotent by inspection: skip when the schema is already present
  // (re-running index DDL also trips the in-memory test engine).
  const existing = await db.query(
    "select 1 from information_schema.tables where table_name = 'users'",
  );
  if (existing.rows.length > 0) return;
  for (const statement of SCHEMA_SQL.split(";")) {
    const sql = statement.trim();
    if (sql) await db.query(sql);
  }
}

let pool: Pool | null = null;
let schemaReady = false;

export function dbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** The process-wide pool, schema applied once; null when unconfigured. */
export async function getDb(): Promise<Db | null> {
  if (!dbConfigured()) return null;
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  }
  if (!schemaReady) {
    await ensureSchema(pool);
    schemaReady = true;
  }
  return pool;
}

export const DB_UNCONFIGURED_MESSAGE =
  "Accounts are not configured on this deployment — set DATABASE_URL and redeploy. Projects continue to work in this browser's local storage.";
