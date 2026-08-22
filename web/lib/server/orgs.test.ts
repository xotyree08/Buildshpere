/**
 * Organizations widen who may see a project from "the owner" to "the owner or
 * a member of its organization". That is a change to an authorization rule,
 * so most of what is worth testing is the edges: who may promote, who may
 * remove, and whether a personal project stays personal.
 */

import { newDb } from "pg-mem";
import { beforeEach, describe, expect, it } from "vitest";

import { ensureSchema, type Db } from "./db";
import {
  canAccessProject,
  createOrg,
  listMembers,
  listOrgs,
  removeMember,
  roleOf,
  setMember,
  setProjectOrg,
} from "./orgs";

let db: Db;

async function user(id: string): Promise<string> {
  await db.query(
    "insert into users (id, email, password_hash, created_at) values ($1, $2, $3, $4)",
    [id, `${id}@example.com`, "x", new Date().toISOString()],
  );
  return id;
}

async function project(id: string, ownerId: string): Promise<string> {
  const now = new Date().toISOString();
  await db.query(
    "insert into projects (id, owner_id, name, status, data, created_at, updated_at) values ($1,$2,$3,$4,$5,$6,$6)",
    [id, ownerId, id, "draft", JSON.stringify({ project: { id, name: id } }), now],
  );
  return id;
}

beforeEach(async () => {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  db = new Pool() as unknown as Db;
  await ensureSchema(db);
});

describe("creating an organization", () => {
  it("makes the creator its first owner", async () => {
    await user("u1");
    const created = await createOrg(db, "u1", "Meridian Architects");
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(await roleOf(db, created.value.id, "u1")).toBe("owner");
    expect(await listOrgs(db, "u1")).toHaveLength(1);
  });

  it("refuses a blank name", async () => {
    await user("u1");
    const created = await createOrg(db, "u1", "   ");
    expect(created).toMatchObject({ ok: false });
  });
});

describe("membership", () => {
  let orgId: string;

  beforeEach(async () => {
    await user("owner");
    await user("admin");
    await user("member");
    await user("stranger");
    const created = await createOrg(db, "owner", "Meridian");
    if (!created.ok) throw new Error(created.error);
    orgId = created.value.id;
    await setMember(db, "owner", orgId, "admin", "admin");
    await setMember(db, "owner", orgId, "member", "member");
  });

  it("an admin can add and change members", async () => {
    const added = await setMember(db, "admin", orgId, "stranger", "member");
    expect(added.ok).toBe(true);
    expect(await roleOf(db, orgId, "stranger")).toBe("member");
  });

  it("an admin cannot mint owners", async () => {
    // Otherwise the top rung of the permission model quietly stops meaning
    // anything: any admin could promote themselves.
    const promoted = await setMember(db, "admin", orgId, "admin", "owner");
    expect(promoted).toMatchObject({ ok: false });
    expect(await roleOf(db, orgId, "admin")).toBe("admin");
  });

  it("a plain member cannot change membership", async () => {
    const attempt = await setMember(db, "member", orgId, "stranger", "member");
    expect(attempt).toMatchObject({ ok: false });
  });

  it("someone outside the organization cannot touch it at all", async () => {
    const attempt = await setMember(db, "stranger", orgId, "stranger", "owner");
    expect(attempt).toMatchObject({ ok: false });
    expect(await roleOf(db, orgId, "stranger")).toBeNull();
  });

  it("the last owner cannot be demoted or removed", async () => {
    expect(await setMember(db, "owner", orgId, "owner", "member")).toMatchObject({ ok: false });
    expect(await removeMember(db, "owner", orgId, "owner")).toMatchObject({ ok: false });
    expect(await roleOf(db, orgId, "owner")).toBe("owner");
  });

  it("once there are two owners, one may step down", async () => {
    await setMember(db, "owner", orgId, "admin", "owner");
    const stepped = await setMember(db, "owner", orgId, "owner", "member");
    expect(stepped.ok).toBe(true);
    expect(await roleOf(db, orgId, "owner")).toBe("member");
  });

  it("an admin cannot remove an owner", async () => {
    await setMember(db, "owner", orgId, "admin", "owner");
    const removed = await removeMember(db, "member", orgId, "owner");
    expect(removed).toMatchObject({ ok: false });
  });

  it("anyone may leave on their own account", async () => {
    const left = await removeMember(db, "member", orgId, "member");
    expect(left.ok).toBe(true);
    expect(await listMembers(db, orgId)).toHaveLength(2);
  });
});

describe("what an organization can see", () => {
  let orgId: string;

  beforeEach(async () => {
    await user("owner");
    await user("colleague");
    await user("stranger");
    const created = await createOrg(db, "owner", "Meridian");
    if (!created.ok) throw new Error(created.error);
    orgId = created.value.id;
    await setMember(db, "owner", orgId, "colleague", "member");
    await project("p1", "owner");
  });

  it("a personal project stays personal", async () => {
    expect(await canAccessProject(db, "owner", "p1")).toBe(true);
    expect(await canAccessProject(db, "colleague", "p1")).toBe(false);
    expect(await canAccessProject(db, "stranger", "p1")).toBe(false);
  });

  it("attaching it to the organization lets colleagues in, and nobody else", async () => {
    expect((await setProjectOrg(db, "owner", "p1", orgId)).ok).toBe(true);
    expect(await canAccessProject(db, "colleague", "p1")).toBe(true);
    expect(await canAccessProject(db, "stranger", "p1")).toBe(false);
  });

  it("detaching it takes the colleagues back out", async () => {
    await setProjectOrg(db, "owner", "p1", orgId);
    expect((await setProjectOrg(db, "owner", "p1", null)).ok).toBe(true);
    expect(await canAccessProject(db, "colleague", "p1")).toBe(false);
    expect(await canAccessProject(db, "owner", "p1")).toBe(true);
  });

  it("only the project's owner may move it", async () => {
    // Not even an org owner can reach across and claim someone's project.
    const attempt = await setProjectOrg(db, "colleague", "p1", orgId);
    expect(attempt).toMatchObject({ ok: false });
    expect(await canAccessProject(db, "colleague", "p1")).toBe(false);
  });

  it("a project cannot be moved into an organization the owner is not in", async () => {
    await user("outsider");
    const theirs = await createOrg(db, "outsider", "Somewhere Else");
    if (!theirs.ok) throw new Error(theirs.error);
    const attempt = await setProjectOrg(db, "owner", "p1", theirs.value.id);
    expect(attempt).toMatchObject({ ok: false });
  });

  it("a project nobody owns is not accessible to anybody", async () => {
    expect(await canAccessProject(db, "owner", "does-not-exist")).toBe(false);
  });
});
