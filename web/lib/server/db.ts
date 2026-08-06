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

create table if not exists review_requests (
  id text primary key,
  project_id text not null,
  owner_id text not null,
  project_name text not null,
  status text not null,
  note text,
  professional_id text,
  professional_email text,
  created_at timestamp not null,
  updated_at timestamp not null
);
create unique index if not exists review_requests_project on review_requests(project_id);
create index if not exists review_requests_owner on review_requests(owner_id);

create table if not exists share_links (
  token_hash text primary key,
  project_id text not null,
  owner_id text not null,
  created_at timestamp not null
);
create unique index if not exists share_links_project on share_links(project_id);

create table if not exists entitlements (
  id text primary key,
  user_id text not null,
  product_id text not null,
  platform text not null,
  status text not null,
  created_at timestamp not null,
  updated_at timestamp not null
);
create unique index if not exists entitlements_user_product on entitlements(user_id, product_id);

create table if not exists professional_profiles (
  user_id text primary key,
  full_name text not null,
  discipline text not null,
  license_number text not null,
  license_state text not null,
  status text not null,
  submitted_at timestamp not null
);

create table if not exists review_invites (
  token_hash text primary key,
  review_id text not null,
  owner_id text not null,
  created_at timestamp not null,
  used_by text,
  used_at timestamp
);
create index if not exists review_invites_review on review_invites(review_id);

create table if not exists notifications (
  id text primary key,
  user_id text not null,
  kind text not null,
  message text not null,
  project_id text,
  created_at timestamp not null,
  read_at timestamp
);
create index if not exists notifications_user on notifications(user_id, created_at);

create table if not exists audit_events (
  id text primary key,
  actor_id text not null,
  event text not null,
  subject text,
  detail text,
  created_at timestamp not null
);
create index if not exists audit_events_actor on audit_events(actor_id, created_at);

create table if not exists password_resets (
  token_hash text primary key,
  user_id text not null,
  created_at timestamp not null,
  expires_at timestamp not null,
  used_at timestamp
);
create index if not exists password_resets_user on password_resets(user_id);

create table if not exists error_reports (
  id text primary key,
  kind text not null,
  message text not null,
  stack text,
  url text,
  user_agent text,
  created_at timestamp not null
);
create index if not exists error_reports_created on error_reports(created_at);

create table if not exists metrics_daily (
  day text not null,
  path text not null,
  hits integer not null,
  primary key (day, path)
);
`;

/** Minimal query surface both pg.Pool and the test engine satisfy. */
export interface Db {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export async function ensureSchema(db: Db): Promise<void> {
  // Idempotent by inspection: apply base DDL only when absent
  // (re-running index DDL also trips the in-memory test engine).
  const existing = await db.query(
    "select 1 from information_schema.tables where table_name = 'users'",
  );
  if (existing.rows.length === 0) {
    for (const statement of SCHEMA_SQL.split(";")) {
      const sql = statement.trim();
      if (sql) await db.query(sql);
    }
  }
  // Incremental migrations for databases created before a column existed.
  const roleCol = await db.query(
    "select 1 from information_schema.columns where table_name = 'users' and column_name = 'role'",
  );
  if (roleCol.rows.length === 0) {
    await db.query("alter table users add column role text not null default 'homeowner'");
  }
  const reviews = await db.query(
    "select 1 from information_schema.tables where table_name = 'review_requests'",
  );
  if (reviews.rows.length === 0) {
    const start = SCHEMA_SQL.indexOf("create table if not exists review_requests");
    const end = SCHEMA_SQL.indexOf("create table if not exists share_links");
    for (const statement of SCHEMA_SQL.slice(start, end).split(";")) {
      const sql = statement.trim();
      if (sql) await db.query(sql);
    }
  }
  const shares = await db.query(
    "select 1 from information_schema.tables where table_name = 'share_links'",
  );
  if (shares.rows.length === 0) {
    const start = SCHEMA_SQL.indexOf("create table if not exists share_links");
    const end = SCHEMA_SQL.indexOf("create table if not exists entitlements");
    for (const statement of SCHEMA_SQL.slice(start, end).split(";")) {
      const sql = statement.trim();
      if (sql) await db.query(sql);
    }
  }
  const entitlements = await db.query(
    "select 1 from information_schema.tables where table_name = 'entitlements'",
  );
  if (entitlements.rows.length === 0) {
    const start = SCHEMA_SQL.indexOf("create table if not exists entitlements");
    const end = SCHEMA_SQL.indexOf("create table if not exists audit_events");
    for (const statement of SCHEMA_SQL.slice(start, end).split(";")) {
      const sql = statement.trim();
      if (sql) await db.query(sql);
    }
  }
  const audit = await db.query(
    "select 1 from information_schema.tables where table_name = 'audit_events'",
  );
  if (audit.rows.length === 0) {
    const start = SCHEMA_SQL.indexOf("create table if not exists audit_events");
    for (const statement of SCHEMA_SQL.slice(start).split(";")) {
      const sql = statement.trim();
      if (sql) await db.query(sql);
    }
  }
  const pros = await db.query(
    "select 1 from information_schema.tables where table_name = 'professional_profiles'",
  );
  if (pros.rows.length === 0) {
    const start = SCHEMA_SQL.indexOf("create table if not exists professional_profiles");
    const end = SCHEMA_SQL.indexOf("create table if not exists notifications");
    for (const statement of SCHEMA_SQL.slice(start, end).split(";")) {
      const sql = statement.trim();
      if (sql) await db.query(sql);
    }
  }
  const notif = await db.query(
    "select 1 from information_schema.tables where table_name = 'notifications'",
  );
  if (notif.rows.length === 0) {
    const start = SCHEMA_SQL.indexOf("create table if not exists notifications");
    const end = SCHEMA_SQL.indexOf("create table if not exists audit_events");
    for (const statement of SCHEMA_SQL.slice(start, end).split(";")) {
      const sql = statement.trim();
      if (sql) await db.query(sql);
    }
  }
  const invitedCol = await db.query(
    "select 1 from information_schema.columns where table_name = 'review_requests' and column_name = 'invited'",
  );
  if (invitedCol.rows.length === 0) {
    await db.query("alter table review_requests add column invited text not null default 'open'");
  }
  const resets = await db.query(
    "select 1 from information_schema.tables where table_name = 'password_resets'",
  );
  if (resets.rows.length === 0) {
    const start = SCHEMA_SQL.indexOf("create table if not exists password_resets");
    const end = SCHEMA_SQL.indexOf("create table if not exists error_reports");
    for (const statement of SCHEMA_SQL.slice(start, end).split(";")) {
      const sql = statement.trim();
      if (sql) await db.query(sql);
    }
  }
  const errors = await db.query(
    "select 1 from information_schema.tables where table_name = 'error_reports'",
  );
  if (errors.rows.length === 0) {
    const start = SCHEMA_SQL.indexOf("create table if not exists error_reports");
    const end = SCHEMA_SQL.indexOf("create table if not exists metrics_daily");
    for (const statement of SCHEMA_SQL.slice(start, end).split(";")) {
      const sql = statement.trim();
      if (sql) await db.query(sql);
    }
  }
  const metrics = await db.query(
    "select 1 from information_schema.tables where table_name = 'metrics_daily'",
  );
  if (metrics.rows.length === 0) {
    const start = SCHEMA_SQL.indexOf("create table if not exists metrics_daily");
    for (const statement of SCHEMA_SQL.slice(start).split(";")) {
      const sql = statement.trim();
      if (sql) await db.query(sql);
    }
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
