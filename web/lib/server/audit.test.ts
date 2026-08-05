import { newDb } from "pg-mem";
import { beforeEach, describe, expect, it } from "vitest";

import * as auditModule from "./audit";
import { listAuditEvents, recordAudit } from "./audit";
import { createUser } from "./auth";
import { ensureSchema, type Db } from "./db";

async function testDb(): Promise<Db> {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  const pool = new Pool() as unknown as Db;
  await ensureSchema(pool);
  return pool;
}

let db: Db;
let userId: string;
beforeEach(async () => {
  db = await testDb();
  const signup = await createUser(db, "auditee@example.com", "hunter2hunter2");
  if (!signup.ok) throw new Error("signup failed");
  userId = signup.user.id;
});

describe("audit trail (§11.3)", () => {
  it("records and lists a user's own events, newest first", async () => {
    await recordAudit(db, userId, "auth.login");
    await recordAudit(db, userId, "project.upsert", "p1", "Craftsman Dream");
    const events = await listAuditEvents(db, userId);
    expect(events.map((e) => e.event)).toContain("auth.login");
    const upsert = events.find((e) => e.event === "project.upsert");
    expect(upsert?.subject).toBe("p1");
    expect(upsert?.detail).toBe("Craftsman Dream");
    for (const e of events) expect(e.actorId).toBe(userId);
  });

  it("one user's trail never shows another's events — including anon failures", async () => {
    const other = await createUser(db, "other@example.com", "hunter2hunter2");
    if (!other.ok) throw new Error("signup failed");
    await recordAudit(db, other.user.id, "auth.login");
    await recordAudit(db, "anon", "auth.login_failed", "auditee@example.com");

    const mine = await listAuditEvents(db, userId);
    expect(mine).toEqual([]);
  });

  it("the module is append-only by construction — no update or delete export", () => {
    const exported = Object.keys(auditModule);
    expect(exported.sort()).toEqual(["listAuditEvents", "recordAudit"]);
  });
});
