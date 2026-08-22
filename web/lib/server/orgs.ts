/**
 * Organizations (BS-ID-002).
 *
 * Every professional workflow in the spec assumes a firm — a review claimed
 * by "the architect" is really claimed by someone at a practice, and when
 * they leave, the work must not leave with them. Until now a project belonged
 * to exactly one person.
 *
 * Additive by design. `projects.org_id` is nullable, and a project without one
 * is a personal project that behaves precisely as it did before this file
 * existed. Nothing migrates; nothing changes hands. An owner attaches a
 * project to an organization when they want to, and can detach it again.
 *
 * Ownership is still enforced in every WHERE (L1). The rule widens from "the
 * owner" to "the owner, or a member of the organization the project belongs
 * to" — and never further.
 */

import type { Db } from "./db";

/**
 * What a member may do.
 *
 * `owner` is the only role that can delete the organization or remove the last
 * owner; `admin` manages membership; `member` works on projects. Kept small on
 * purpose — a permission model grows fastest when nobody can say what a role
 * is for.
 */
export type OrgRole = "owner" | "admin" | "member";

export const ORG_ROLES: OrgRole[] = ["owner", "admin", "member"];

export interface Organization {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
}

export interface OrgMember {
  orgId: string;
  userId: string;
  role: OrgRole;
  addedAt: string;
}

export type OrgResult<T> = { ok: true; value: T } | { ok: false; error: string };

const MAX_NAME = 80;

export function isOrgRole(value: unknown): value is OrgRole {
  return typeof value === "string" && (ORG_ROLES as string[]).includes(value);
}

function fail<T>(error: string): OrgResult<T> {
  return { ok: false, error };
}

/** Create an organization; the creator becomes its first owner. */
export async function createOrg(db: Db, userId: string, rawName: string): Promise<OrgResult<Organization>> {
  const name = rawName.trim();
  if (name.length === 0) return fail("An organization needs a name.");
  if (name.length > MAX_NAME) return fail(`Keep the name to ${MAX_NAME} characters or fewer.`);

  const now = new Date().toISOString();
  const id = `org_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
  await db.query(
    "insert into organizations (id, name, created_by, created_at) values ($1, $2, $3, $4)",
    [id, name, userId, now],
  );
  await db.query(
    "insert into org_members (org_id, user_id, role, added_at) values ($1, $2, $3, $4)",
    [id, userId, "owner", now],
  );
  return { ok: true, value: { id, name, createdBy: userId, createdAt: now } };
}

/** The caller's role in an organization, or null if they are not a member. */
export async function roleOf(db: Db, orgId: string, userId: string): Promise<OrgRole | null> {
  const res = await db.query("select role from org_members where org_id = $1 and user_id = $2", [
    orgId,
    userId,
  ]);
  const role = res.rows[0]?.role;
  return isOrgRole(role) ? role : null;
}

export async function listOrgs(db: Db, userId: string): Promise<(Organization & { role: OrgRole })[]> {
  const res = await db.query(
    `select o.id, o.name, o.created_by, o.created_at, m.role
       from organizations o
       join org_members m on m.org_id = o.id
      where m.user_id = $1
      order by o.created_at`,
    [userId],
  );
  return res.rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    createdBy: String(r.created_by),
    createdAt: String(r.created_at),
    role: (isOrgRole(r.role) ? r.role : "member") as OrgRole,
  }));
}

export async function listMembers(db: Db, orgId: string): Promise<OrgMember[]> {
  const res = await db.query(
    "select org_id, user_id, role, added_at from org_members where org_id = $1 order by added_at",
    [orgId],
  );
  return res.rows.map((r) => ({
    orgId: String(r.org_id),
    userId: String(r.user_id),
    role: (isOrgRole(r.role) ? r.role : "member") as OrgRole,
    addedAt: String(r.added_at),
  }));
}

async function ownerCount(db: Db, orgId: string): Promise<number> {
  const res = await db.query(
    "select count(*) as n from org_members where org_id = $1 and role = 'owner'",
    [orgId],
  );
  return Number(res.rows[0]?.n ?? 0);
}

/** Add someone, or change what an existing member may do. */
export async function setMember(
  db: Db,
  actorId: string,
  orgId: string,
  userId: string,
  role: OrgRole,
): Promise<OrgResult<OrgMember>> {
  const actor = await roleOf(db, orgId, actorId);
  if (actor === null) return fail("You are not a member of that organization.");
  if (actor === "member") return fail("Only an owner or admin can change membership.");
  // An admin must not be able to mint owners — that is how a permission model
  // quietly loses its top rung.
  if (role === "owner" && actor !== "owner") return fail("Only an owner can grant ownership.");

  const existing = await roleOf(db, orgId, userId);
  if (existing === "owner" && role !== "owner" && (await ownerCount(db, orgId)) === 1) {
    return fail("That is the last owner — promote someone else first.");
  }

  const now = new Date().toISOString();
  if (existing === null) {
    await db.query(
      "insert into org_members (org_id, user_id, role, added_at) values ($1, $2, $3, $4)",
      [orgId, userId, role, now],
    );
    return { ok: true, value: { orgId, userId, role, addedAt: now } };
  }
  await db.query("update org_members set role = $1 where org_id = $2 and user_id = $3", [
    role,
    orgId,
    userId,
  ]);
  return { ok: true, value: { orgId, userId, role, addedAt: now } };
}

export async function removeMember(
  db: Db,
  actorId: string,
  orgId: string,
  userId: string,
): Promise<OrgResult<null>> {
  const actor = await roleOf(db, orgId, actorId);
  if (actor === null) return fail("You are not a member of that organization.");
  // Leaving on your own account is always allowed; removing someone else is not.
  if (actor === "member" && actorId !== userId) return fail("Only an owner or admin can remove a member.");

  const target = await roleOf(db, orgId, userId);
  if (target === null) return fail("That person is not a member.");
  if (target === "owner" && actor !== "owner") return fail("Only an owner can remove an owner.");
  if (target === "owner" && (await ownerCount(db, orgId)) === 1) {
    return fail("That is the last owner — an organization cannot be left without one.");
  }

  await db.query("delete from org_members where org_id = $1 and user_id = $2", [orgId, userId]);
  return { ok: true, value: null };
}

/**
 * Move a project into an organization, or back out of one.
 *
 * Only the project's own owner may do this: an org admin cannot reach across
 * and claim someone's personal project, and a member cannot quietly move a
 * project out of the firm.
 */
export async function setProjectOrg(
  db: Db,
  ownerId: string,
  projectId: string,
  orgId: string | null,
): Promise<OrgResult<null>> {
  const owned = await db.query("select 1 from projects where id = $1 and owner_id = $2", [
    projectId,
    ownerId,
  ]);
  if (owned.rows.length === 0) return fail("That is not your project.");

  if (orgId !== null) {
    const role = await roleOf(db, orgId, ownerId);
    if (role === null) return fail("You are not a member of that organization.");
  }

  await db.query("update projects set org_id = $1 where id = $2 and owner_id = $3", [
    orgId,
    projectId,
    ownerId,
  ]);
  return { ok: true, value: null };
}

/**
 * Whether a user may see a project: they own it, or they are a member of the
 * organization it belongs to. This is the whole widening — there is no third
 * clause, and adding one should be hard.
 */
export async function canAccessProject(db: Db, userId: string, projectId: string): Promise<boolean> {
  const res = await db.query(
    `select 1
       from projects p
       left join org_members m on m.org_id = p.org_id and m.user_id = $2
      where p.id = $1 and (p.owner_id = $2 or m.user_id is not null)
      limit 1`,
    [projectId, userId],
  );
  return res.rows.length > 0;
}

/**
 * The projects an organization holds.
 *
 * Deliberately separate from `listProjects`, which stays owner-only. The
 * client treats that list as "mine" and syncs it back; folding a colleague's
 * project into it would invite the client to re-upload the project under its
 * own ownership. An organization's projects are a different view, read here
 * and nowhere else.
 */
export async function listOrgProjects(
  db: Db,
  userId: string,
  orgId: string,
): Promise<OrgResult<{ id: string; name: string; status: string; ownerId: string; updatedAt: string }[]>> {
  const role = await roleOf(db, orgId, userId);
  if (role === null) return fail("You are not a member of that organization.");
  const res = await db.query(
    "select id, name, status, owner_id, updated_at from projects where org_id = $1 order by updated_at desc",
    [orgId],
  );
  return {
    ok: true,
    value: res.rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      status: String(r.status),
      ownerId: String(r.owner_id),
      updatedAt: String(r.updated_at),
    })),
  };
}
