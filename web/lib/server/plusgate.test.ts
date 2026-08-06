import { newDb } from "pg-mem";
import { beforeEach, describe, expect, it } from "vitest";

import { createUser, type AuthUser } from "./auth";
import { ensureSchema, type Db } from "./db";
import { recordEntitlement } from "./payments/index";
import { canSyncNewProject, FREE_SYNC_LIMIT, hasPlus, upsertProject } from "./projects";
import type { StoredProject } from "../store";

async function testDb(): Promise<Db> {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  const pool = new Pool() as unknown as Db;
  await ensureSchema(pool);
  return pool;
}

function entry(id: string): StoredProject {
  return {
    project: {
      id,
      ownerId: "local",
      name: `Project ${id}`,
      addressText: null,
      lotWidthFt: 60,
      lotDepthFt: 120,
      budgetCents: 45_000_000,
      status: "designing",
    },
    brief: null,
    packages: [],
    regionCode: "US_NATIONAL",
  };
}

let db: Db;
let user: AuthUser;
beforeEach(async () => {
  db = await testDb();
  const signup = await createUser(db, "gated@example.com", "hunter2hunter2");
  if (!signup.ok) throw new Error("signup failed");
  user = signup.user;
});

describe("free-tier sync gate (never retroactive)", () => {
  it("free accounts sync up to the limit; the next NEW project is refused", async () => {
    for (let i = 0; i < FREE_SYNC_LIMIT; i++) {
      expect(await canSyncNewProject(db, user.id, `p${i}`)).toBe(true);
      await upsertProject(db, user.id, entry(`p${i}`));
    }
    expect(await canSyncNewProject(db, user.id, "p-one-more")).toBe(false);
  });

  it("updates to already-synced projects always pass at the cap", async () => {
    for (let i = 0; i < FREE_SYNC_LIMIT; i++) await upsertProject(db, user.id, entry(`p${i}`));
    expect(await canSyncNewProject(db, user.id, "p0")).toBe(true);
  });

  it("an active Plus entitlement on any platform lifts the limit", async () => {
    for (let i = 0; i < FREE_SYNC_LIMIT; i++) await upsertProject(db, user.id, entry(`p${i}`));
    await recordEntitlement(db, user.id, "buildsphere_plus_monthly", "stripe");
    expect(await hasPlus(db, user.id)).toBe(true);
    expect(await canSyncNewProject(db, user.id, "p-plus")).toBe(true);
  });

  it("a canceled subscription does not count as Plus", async () => {
    await recordEntitlement(db, user.id, "buildsphere_plus_yearly", "apple");
    await db.query("update entitlements set status = 'canceled' where user_id = $1", [user.id]);
    expect(await hasPlus(db, user.id)).toBe(false);
    for (let i = 0; i < FREE_SYNC_LIMIT; i++) await upsertProject(db, user.id, entry(`p${i}`));
    expect(await canSyncNewProject(db, user.id, "p-one-more")).toBe(false);
  });

  it("one user's project count never gates another user", async () => {
    for (let i = 0; i < FREE_SYNC_LIMIT; i++) await upsertProject(db, user.id, entry(`p${i}`));
    const other = await createUser(db, "other@example.com", "hunter2hunter2");
    if (!other.ok) throw new Error("signup failed");
    expect(await canSyncNewProject(db, other.user.id, "fresh")).toBe(true);
  });
});
