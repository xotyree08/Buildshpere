import { newDb } from "pg-mem";
import { beforeEach, describe, expect, it } from "vitest";

import { recordAudit } from "./audit";
import { createSession, createUser, getSessionUser, type AuthUser } from "./auth";
import { ensureSchema, type Db } from "./db";
import { deleteAccount, exportAccountData, loginThrottled, THROTTLE_MAX_FAILURES } from "./privacy";
import { upsertProject } from "./projects";
import { saveProfile } from "./pros";
import { createShareLink, getSharedProject } from "./shares";
import type { StoredProject } from "../store";

function project(id: string, name: string): StoredProject {
  return {
    project: { id, ownerId: "server", name, addressText: null, lotWidthFt: 60, lotDepthFt: 120, budgetCents: null, status: "designing" },
    brief: null,
    packages: [],
    regionCode: "US_NATIONAL",
  };
}

async function testDb(): Promise<Db> {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  const pool = new Pool() as unknown as Db;
  await ensureSchema(pool);
  return pool;
}

let db: Db;
let user: AuthUser;
beforeEach(async () => {
  db = await testDb();
  const signup = await createUser(db, "privacy@example.com", "hunter2hunter2");
  if (!signup.ok) throw new Error("signup failed");
  user = signup.user;
});

describe("login throttling", () => {
  it("locks after the failure ceiling within the window; old failures age out", async () => {
    const now = Date.now();
    expect(await loginThrottled(db, "privacy@example.com", now)).toBe(false);
    for (let i = 0; i < THROTTLE_MAX_FAILURES; i++) {
      await recordAudit(db, "anon", "auth.login_failed", "privacy@example.com");
    }
    expect(await loginThrottled(db, "privacy@example.com", now)).toBe(true);
    // A different email is unaffected.
    expect(await loginThrottled(db, "other@example.com", now)).toBe(false);
    // Sixteen minutes later the window has passed.
    expect(await loginThrottled(db, "privacy@example.com", now + 16 * 60 * 1000)).toBe(false);
  });
});

describe("account export", () => {
  it("includes everything owned and nothing secret", async () => {
    await upsertProject(db, user.id, project("p1", "Exported Home"));
    await recordAudit(db, user.id, "auth.login");
    const data = await exportAccountData(db, user);
    expect(data.format).toBe("buildsphere-account");
    expect(data.user.email).toBe("privacy@example.com");
    expect((data.projects[0] as StoredProject).project.name).toBe("Exported Home");
    expect(data.auditEvents.length).toBeGreaterThan(0);
    expect(JSON.stringify(data)).not.toContain("scrypt$");
    expect(JSON.stringify(data)).not.toContain("password");
  });
});

describe("account deletion", () => {
  it("wrong password changes nothing; right password cascades and kills sessions and share links", async () => {
    await upsertProject(db, user.id, project("p1", "Doomed Home"));
    const share = await createShareLink(db, user.id, "p1");
    if (!share.ok) throw new Error("share failed");
    const session = await createSession(db, user.id);

    const denied = await deleteAccount(db, user, "wrong-password");
    expect(denied.ok).toBe(false);
    expect(await getSessionUser(db, session)).not.toBeNull();

    const deleted = await deleteAccount(db, user, "hunter2hunter2");
    expect(deleted.ok).toBe(true);
    expect(await getSessionUser(db, session)).toBeNull();
    expect(await getSharedProject(db, share.token)).toBeNull();
    expect((await db.query("select * from projects where owner_id = $1", [user.id])).rows).toEqual([]);
    expect((await db.query("select * from users where id = $1", [user.id])).rows).toEqual([]);
    // The audit trail is retained and records the deletion.
    const trail = await db.query(
      "select event from audit_events where actor_id = $1 and event = 'account.deleted'",
      [user.id],
    );
    expect(trail.rows).toHaveLength(1);
  });

  it("a professional's unapproved claims return to the queue on deletion", async () => {
    const ownerSignup = await createUser(db, "owner@example.com", "hunter2hunter2");
    if (!ownerSignup.ok) throw new Error("signup failed");
    await saveProfile(db, user.id, { fullName: "Ada Architect", discipline: "architect", licenseNumber: "TX-1", licenseState: "TX" });
    await db.query(
      "insert into review_requests (id, project_id, owner_id, project_name, status, note, professional_id, professional_email, created_at, updated_at, invited) values ('r1','p9',$1,'Home','claimed',null,$2,$3,'2026-01-01','2026-01-01','open')",
      [ownerSignup.user.id, user.id, user.email],
    );
    const deleted = await deleteAccount(db, user, "hunter2hunter2");
    expect(deleted.ok).toBe(true);
    const row = (await db.query("select status, professional_id from review_requests where id = 'r1'")).rows[0];
    expect(row.status).toBe("requested");
    expect(row.professional_id).toBeNull();
  });
});
