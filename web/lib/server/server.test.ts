import { newDb } from "pg-mem";
import { beforeEach, describe, expect, it } from "vitest";

import type { StoredProject } from "../store";
import {
  authenticate,
  createSession,
  createUser,
  deleteSession,
  getSessionUser,
  hashPassword,
  verifyPassword,
} from "./auth";
import { ensureSchema, type Db } from "./db";
import { deleteProject, listProjects, upsertProject } from "./projects";

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
beforeEach(async () => {
  db = await testDb();
});

describe("schema", () => {
  it("is idempotent — applying twice is safe", async () => {
    await ensureSchema(db);
    const res = await db.query("select count(*) as n from users");
    expect(Number(res.rows[0].n)).toBe(0);
  });
});

describe("passwords", () => {
  it("hashes with scrypt and verifies constant-time", () => {
    const stored = hashPassword("correct horse battery");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("correct horse battery", stored)).toBe(true);
    expect(verifyPassword("wrong password!", stored)).toBe(false);
  });

  it("rejects malformed stored hashes instead of throwing", () => {
    expect(verifyPassword("x", "not-a-hash")).toBe(false);
    expect(verifyPassword("x", "scrypt$12$oops")).toBe(false);
  });
});

describe("accounts", () => {
  it("signs up, normalizes email, and rejects duplicates", async () => {
    const first = await createUser(db, "  Person@Example.COM ", "longenough1");
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.user.email).toBe("person@example.com");

    const dupe = await createUser(db, "person@example.com", "longenough2");
    expect(dupe.ok).toBe(false);
  });

  it("rejects invalid emails and short passwords with clear messages", async () => {
    expect((await createUser(db, "not-an-email", "longenough1")).ok).toBe(false);
    expect((await createUser(db, "a@b.co", "short")).ok).toBe(false);
  });

  it("authenticates the right password only", async () => {
    await createUser(db, "a@b.co", "hunter2hunter2");
    expect(await authenticate(db, "a@b.co", "hunter2hunter2")).not.toBeNull();
    expect(await authenticate(db, "a@b.co", "wrong-password")).toBeNull();
    expect(await authenticate(db, "nobody@b.co", "hunter2hunter2")).toBeNull();
  });
});

describe("sessions", () => {
  it("round-trips a session and stores only the hash", async () => {
    const signup = await createUser(db, "a@b.co", "hunter2hunter2");
    if (!signup.ok) throw new Error("signup failed");
    const token = await createSession(db, signup.user.id);

    const user = await getSessionUser(db, token);
    expect(user?.email).toBe("a@b.co");

    const raw = await db.query("select token_hash from auth_sessions");
    expect(raw.rows[0].token_hash).not.toBe(token); // hash at rest, never the cookie value

    await deleteSession(db, token);
    expect(await getSessionUser(db, token)).toBeNull();
  });

  it("rejects unknown and empty tokens", async () => {
    expect(await getSessionUser(db, "deadbeef")).toBeNull();
    expect(await getSessionUser(db, "")).toBeNull();
  });
});

describe("project sync", () => {
  it("upserts, lists, and deletes per owner", async () => {
    const a = await createUser(db, "a@b.co", "hunter2hunter2");
    if (!a.ok) throw new Error("signup failed");

    await upsertProject(db, a.user.id, project("p1", "First Home"));
    await upsertProject(db, a.user.id, project("p1", "Renamed Home"));
    await upsertProject(db, a.user.id, project("p2", "Second Home"));

    const listed = await listProjects(db, a.user.id);
    expect(listed).toHaveLength(2);
    expect(listed.map((p) => p.project.name)).toContain("Renamed Home");

    await deleteProject(db, a.user.id, "p1");
    expect(await listProjects(db, a.user.id)).toHaveLength(1);
  });

  it("ownership is enforced in every query — no cross-user reads, writes, or deletes", async () => {
    const a = await createUser(db, "a@b.co", "hunter2hunter2");
    const b = await createUser(db, "b@b.co", "hunter2hunter2");
    if (!a.ok || !b.ok) throw new Error("signup failed");

    await upsertProject(db, a.user.id, project("pa", "A's Home"));

    // B sees nothing of A's.
    expect(await listProjects(db, b.user.id)).toHaveLength(0);

    // B cannot hijack A's project id — the guarded upsert must not steal it.
    await upsertProject(db, b.user.id, project("pa", "Stolen?"));
    const aProjects = await listProjects(db, a.user.id);
    expect(aProjects).toHaveLength(1);
    expect(aProjects[0].project.name).toBe("A's Home");

    // B cannot delete A's project.
    await deleteProject(db, b.user.id, "pa");
    expect(await listProjects(db, a.user.id)).toHaveLength(1);
  });
});
