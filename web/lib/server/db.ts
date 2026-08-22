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

create table if not exists email_verifications (
  token_hash text primary key,
  user_id text not null,
  created_at timestamp not null,
  expires_at timestamp not null,
  used_at timestamp
);
create index if not exists email_verifications_user on email_verifications(user_id);

create table if not exists project_licenses (
  id text primary key,
  user_id text not null,
  project_id text not null,
  tier text not null,
  status text not null,
  source text not null,
  purchased_at timestamp not null,
  expires_at timestamp
);
create unique index if not exists project_licenses_project on project_licenses(project_id);
create index if not exists project_licenses_user on project_licenses(user_id);

create table if not exists usage_credits (
  id text primary key,
  license_id text not null,
  kind text not null,
  delta integer not null,
  note text,
  created_at timestamp not null
);
create index if not exists usage_credits_license on usage_credits(license_id, kind);

create table if not exists free_usage (
  user_id text not null,
  project_id text not null,
  kind text not null,
  used integer not null,
  updated_at timestamp not null,
  primary key (user_id, project_id, kind)
);
`;

/** Minimal query surface both pg.Pool and the test engine satisfy. */
export interface Db {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/**
 * The migration ledger.
 *
 * Append-only and ordered: each entry runs once per database, and which ones
 * have run is recorded in `schema_migrations` rather than guessed at.
 *
 * What this replaces: a hundred and fifty lines that probed
 * `information_schema` for one table per feature and then recovered that
 * table's DDL by slicing SCHEMA_SQL between the literal text of two
 * `create table` lines. It worked, but only by accident of ordering — the
 * `entitlements` probe applied three tables because its slice happened to run
 * to `audit_events`, and the `audit_events` probe applied everything after it
 * because its slice had no end. Two consequences, both silent:
 *
 *   - Reordering or renaming a table in SCHEMA_SQL changed which migrations
 *     applied, with nothing to catch it.
 *   - A table appended to SCHEMA_SQL got no probe at all, so it was created on
 *     a fresh database and never on an existing one. Tests start empty and
 *     take the create-everything path, so the suite stayed green while
 *     production was missing a table.
 *
 * Adding a table now means appending one entry here. Nothing else.
 */
export interface Migration {
  /** Stable, unique, never reused — this is what the ledger records. */
  id: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  { id: "0001-base", sql: SCHEMA_SQL },
  {
    id: "0002-users-role",
    sql: "alter table users add column role text not null default 'homeowner'",
  },
  {
    id: "0003-review-requests-invited",
    sql: "alter table review_requests add column invited text not null default 'open'",
  },
  {
    id: "0004-organizations",
    sql: `create table if not exists organizations (
  id text primary key,
  name text not null,
  created_by text not null,
  created_at timestamp not null
);
create table if not exists org_members (
  org_id text not null,
  user_id text not null,
  role text not null,
  added_at timestamp not null,
  primary key (org_id, user_id)
);
create index if not exists org_members_user on org_members(user_id)`,
  },
  {
    // Nullable on purpose: a project with no org is a personal project and
    // behaves exactly as it did before organizations existed.
    id: "0005-projects-org",
    sql: "alter table projects add column org_id text",
  },
  {
    id: "0006-mfa",
    sql: `create table if not exists user_mfa (
  user_id text primary key,
  secret text not null,
  confirmed_at timestamp,
  created_at timestamp not null
);
create table if not exists mfa_recovery_codes (
  user_id text not null,
  code_hash text not null,
  used_at timestamp,
  primary key (user_id, code_hash)
)`,
  },
];

const LEDGER_SQL = `create table if not exists schema_migrations (
  id text primary key,
  applied_at timestamp not null
)`;

async function applied(db: Db): Promise<Set<string>> {
  const rows = await db.query("select id from schema_migrations");
  return new Set(rows.rows.map((r) => String(r.id)));
}

async function record(db: Db, id: string): Promise<void> {
  await db.query("insert into schema_migrations (id, applied_at) values ($1, $2)", [
    id,
    new Date().toISOString(),
  ]);
}

async function run(db: Db, migration: Migration): Promise<void> {
  for (const statement of migration.sql.split(";")) {
    const sql = statement.trim();
    if (sql) await db.query(sql);
  }
}

export async function ensureSchema(db: Db): Promise<void> {
  const hadLedger = await db.query(
    "select 1 from information_schema.tables where table_name = 'schema_migrations'",
  );

  if (hadLedger.rows.length === 0) {
    // Guarded rather than `create table if not exists`: on the in-memory
    // engine the tests use, re-running that still trips over the primary
    // key's implicit index.
    await db.query(LEDGER_SQL);
    // No ledger yet. Either this database is new, or it predates the ledger
    // and was brought to the current schema by the probe-and-slice code this
    // replaces. Tell them apart by whether `users` exists, and adopt the
    // legacy one by recording every migration WITHOUT running it — its tables
    // are already there, and re-running index DDL is not idempotent on the
    // in-memory engine the tests use.
    const legacy = await db.query(
      "select 1 from information_schema.tables where table_name = 'users'",
    );
    if (legacy.rows.length > 0) {
      for (const migration of MIGRATIONS) await record(db, migration.id);
      return;
    }
  }

  const done = await applied(db);
  for (const migration of MIGRATIONS) {
    if (done.has(migration.id)) continue;
    await run(db, migration);
    await record(db, migration.id);
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
