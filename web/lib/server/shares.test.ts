import { newDb } from "pg-mem";
import { beforeEach, describe, expect, it } from "vitest";

import type { StoredProject } from "../store";
import { createUser } from "./auth";
import { ensureSchema, type Db } from "./db";
import { upsertProject } from "./projects";
import { createShareLink, getSharedProject, hasShareLink, revokeShareLink } from "./shares";

/** Real SQL against an in-memory Postgres engine — no host required. */
async function testDb(): Promise<Db> {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  const pool = new Pool() as unknown as Db;
  await ensureSchema(pool);
  return pool;
}

function project(id: string, name: string): StoredProject {
  return {
    project: {
      id,
      ownerId: "server",
      name,
      addressText: null,
      lotWidthFt: 60,
      lotDepthFt: 120,
      budgetCents: 45000000,
      status: "designing",
    },
    brief: null,
    packages: [],
    regionCode: "US_NATIONAL",
  };
}

let db: Db;
let ownerId: string;
beforeEach(async () => {
  db = await testDb();
  const signup = await createUser(db, "owner@example.com", "hunter2hunter2");
  if (!signup.ok) throw new Error("signup failed");
  ownerId = signup.user.id;
  await upsertProject(db, ownerId, project("p1", "Shared Home"));
});

describe("share links", () => {
  it("mints a link that resolves to the project; only the hash is at rest", async () => {
    const created = await createShareLink(db, ownerId, "p1");
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const shared = await getSharedProject(db, created.token);
    expect(shared?.project.name).toBe("Shared Home");

    const raw = await db.query("select token_hash from share_links");
    expect(raw.rows[0].token_hash).not.toBe(created.token);
    expect(await hasShareLink(db, ownerId, "p1")).toBe(true);
  });

  it("refuses to share a project the caller does not own", async () => {
    const other = await createUser(db, "other@example.com", "hunter2hunter2");
    if (!other.ok) throw new Error("signup failed");
    const created = await createShareLink(db, other.user.id, "p1");
    expect(created.ok).toBe(false);
    if (!created.ok) expect(created.error).toContain("Sync");
  });

  it("creating again rotates the token — the old link dies", async () => {
    const first = await createShareLink(db, ownerId, "p1");
    const second = await createShareLink(db, ownerId, "p1");
    if (!first.ok || !second.ok) throw new Error("create failed");

    expect(second.token).not.toBe(first.token);
    expect(await getSharedProject(db, first.token)).toBeNull();
    expect((await getSharedProject(db, second.token))?.project.id).toBe("p1");
  });

  it("revoking kills the link; unknown and malformed tokens resolve to nothing", async () => {
    const created = await createShareLink(db, ownerId, "p1");
    if (!created.ok) throw new Error("create failed");

    await revokeShareLink(db, ownerId, "p1");
    expect(await getSharedProject(db, created.token)).toBeNull();
    expect(await hasShareLink(db, ownerId, "p1")).toBe(false);

    expect(await getSharedProject(db, "0".repeat(64))).toBeNull();
    expect(await getSharedProject(db, "not-a-token'; drop table projects; --")).toBeNull();
    expect(await getSharedProject(db, "")).toBeNull();
  });

  it("a non-owner cannot revoke someone else's link", async () => {
    const created = await createShareLink(db, ownerId, "p1");
    if (!created.ok) throw new Error("create failed");
    const other = await createUser(db, "other@example.com", "hunter2hunter2");
    if (!other.ok) throw new Error("signup failed");

    await revokeShareLink(db, other.user.id, "p1");
    expect((await getSharedProject(db, created.token))?.project.id).toBe("p1");
  });
});
