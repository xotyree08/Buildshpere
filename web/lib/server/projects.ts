/**
 * Per-user project persistence, mirroring the client's StoredProject shape
 * (ADR-009: the swap is mechanical). Ownership is enforced in every WHERE —
 * no query can touch another user's rows (LESSONS_LEARNED.md L1 discipline
 * ahead of entitlements). Every write reports success or throws; callers
 * surface failures (L2).
 */

import type { StoredProject } from "../store";
import type { Db } from "./db";

/** Cloud-synced projects included free. Local projects stay unlimited. */
export const FREE_SYNC_LIMIT = 3;

export const PLUS_REQUIRED_MESSAGE =
  `The free tier syncs ${FREE_SYNC_LIMIT} projects to your account — this browser keeps unlimited local projects either way. BuildSphere Plus (account page) lifts the sync limit.`;

/** Whether the user holds an active Plus entitlement on any platform. */
export async function hasPlus(db: Db, userId: string): Promise<boolean> {
  const res = await db.query(
    "select 1 from entitlements where user_id = $1 and product_id like 'buildsphere_plus%' and status = 'active' limit 1",
    [userId],
  );
  return res.rows.length > 0;
}

/**
 * Free-tier gate for NEW project syncs. Updates to already-synced projects
 * always pass — nothing a customer already has moves behind the paywall.
 */
export async function canSyncNewProject(db: Db, ownerId: string, projectId: string): Promise<boolean> {
  const existing = await db.query(
    "select 1 from projects where id = $1 and owner_id = $2",
    [projectId, ownerId],
  );
  if (existing.rows.length > 0) return true;
  const count = await db.query("select count(*) as n from projects where owner_id = $1", [ownerId]);
  if (Number(count.rows[0]?.n ?? 0) < FREE_SYNC_LIMIT) return true;
  return hasPlus(db, ownerId);
}

export async function upsertProject(db: Db, ownerId: string, entry: StoredProject): Promise<void> {
  const now = new Date().toISOString();
  await db.query(
    `insert into projects (id, owner_id, name, status, data, created_at, updated_at)
     values ($1, $2, $3, $4, $5, $6, $6)
     on conflict (id) do update set
       name = excluded.name,
       status = excluded.status,
       data = excluded.data,
       updated_at = excluded.updated_at
     where projects.owner_id = excluded.owner_id`,
    [entry.project.id, ownerId, entry.project.name, entry.project.status, JSON.stringify(entry), now],
  );
}

export async function listProjects(db: Db, ownerId: string): Promise<StoredProject[]> {
  const res = await db.query(
    "select data from projects where owner_id = $1 order by updated_at desc",
    [ownerId],
  );
  return res.rows.map((row) => (typeof row.data === "string" ? JSON.parse(row.data) : row.data) as StoredProject);
}

export async function deleteProject(db: Db, ownerId: string, projectId: string): Promise<void> {
  await db.query("delete from projects where id = $1 and owner_id = $2", [projectId, ownerId]);
}
