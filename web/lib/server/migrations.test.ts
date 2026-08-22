/**
 * The schema has to arrive on databases that already exist, not just on empty
 * ones. The code this replaces could not guarantee that: it recovered each
 * table's DDL by slicing SCHEMA_SQL between two `create table` lines, so a
 * table appended to the end got no migration at all — created on a fresh
 * database, never on a live one. Every test passed, because tests start empty
 * and take the create-everything path.
 *
 * These run migrations against a database that is already populated, which is
 * the case the old design could not express.
 */

import { newDb } from "pg-mem";
import { describe, expect, it } from "vitest";

import { ensureSchema, MIGRATIONS, SCHEMA_SQL, type Db, type Migration } from "./db";

function fresh(): Db {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  return new Pool() as unknown as Db;
}

async function tables(d: Db): Promise<Set<string>> {
  const rows = await d.query("select table_name from information_schema.tables");
  return new Set(rows.rows.map((r) => String(r.table_name)));
}

async function ledger(d: Db): Promise<string[]> {
  const rows = await d.query("select id from schema_migrations");
  return rows.rows.map((r) => String(r.id)).sort();
}

describe("the migration ledger", () => {
  it("builds the whole schema on an empty database", async () => {
    const d = fresh();
    await ensureSchema(d);
    const t = await tables(d);
    for (const name of ["users", "projects", "auth_sessions", "audit_events", "free_usage"]) {
      expect(t.has(name), `${name} should exist`).toBe(true);
    }
  });

  it("records every migration it ran", async () => {
    const d = fresh();
    await ensureSchema(d);
    expect(await ledger(d)).toEqual(MIGRATIONS.map((m) => m.id).sort());
  });

  it("is idempotent — running twice changes nothing and does not throw", async () => {
    const d = fresh();
    await ensureSchema(d);
    const before = await ledger(d);
    await ensureSchema(d);
    expect(await ledger(d)).toEqual(before);
  });

  it("applies a newly appended migration to a database that already exists", async () => {
    // The failure the old design could not catch. Build a database, then add a
    // migration the way a new feature would, and run again.
    const d = fresh();
    await ensureSchema(d);
    expect((await tables(d)).has("late_arrival")).toBe(false);

    const added: Migration = {
      id: "9999-late-arrival",
      sql: "create table if not exists late_arrival (id text primary key)",
    };
    MIGRATIONS.push(added);
    try {
      await ensureSchema(d);
      expect((await tables(d)).has("late_arrival"), "appended table should be created").toBe(true);
      expect(await ledger(d)).toContain("9999-late-arrival");
    } finally {
      MIGRATIONS.pop();
    }
  });

  it("adopts a legacy database without re-running its DDL", async () => {
    // A database as the probe-and-slice code left it: every table present, no
    // ledger. Built here the same way that code built it — straight from the
    // schema — rather than by dropping the ledger, so the simulation is real.
    const d = fresh();
    for (const statement of SCHEMA_SQL.split(";")) {
      const sql = statement.trim();
      if (sql) await d.query(sql);
    }
    await d.query("alter table users add column role text not null default 'homeowner'");
    await d.query("alter table review_requests add column invited text not null default 'open'");
    await d.query("insert into users (id, email, password_hash, created_at) values ($1,$2,$3,$4)", [
      "u1",
      "keep@example.com",
      "x",
      new Date().toISOString(),
    ]);

    // Re-running the base DDL here would throw; adoption must record instead.
    await expect(ensureSchema(d)).resolves.toBeUndefined();
    expect(await ledger(d)).toEqual(MIGRATIONS.map((m) => m.id).sort());

    // Adoption must not disturb what is already there.
    const rows = await d.query("select email from users");
    expect(rows.rows).toHaveLength(1);
  });

  it("has unique, non-empty migration ids", async () => {
    const ids = MIGRATIONS.map((m) => m.id);
    expect(new Set(ids).size, "ids must be unique").toBe(ids.length);
    for (const id of ids) expect(id.trim().length).toBeGreaterThan(0);
  });
});

describe("the base migration is frozen", () => {
  /**
   * `0001-base` is a snapshot of SCHEMA_SQL as it stood when the ledger
   * landed. Databases created before that adopted it without running it, so
   * editing SCHEMA_SQL now changes what NEW databases get and nothing else —
   * which is precisely the silent divergence the ledger exists to end.
   *
   * If this fails you almost certainly want to append a migration instead. If
   * you genuinely meant to change the base — a rename before any deployment,
   * say — update the hash in the same commit and say why.
   */
  const FROZEN = "9ff9a17b19ddde6e25adfd610972324f66028a63acd35a63706bb885f51c29c1";

  it("SCHEMA_SQL has not drifted from what 0001-base installed", async () => {
    const { createHash } = await import("node:crypto");
    const actual = createHash("sha256").update(SCHEMA_SQL).digest("hex");
    expect(
      actual,
      "SCHEMA_SQL changed. Existing databases will NOT pick this up — append a migration to MIGRATIONS instead.",
    ).toBe(FROZEN);
  });

  it("0001-base is still the schema itself, not a copy that can drift", () => {
    expect(MIGRATIONS[0].id).toBe("0001-base");
    expect(MIGRATIONS[0].sql).toBe(SCHEMA_SQL);
  });
});
