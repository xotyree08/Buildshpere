/**
 * Per-user project persistence, mirroring the client's StoredProject shape
 * (ADR-009: the swap is mechanical). Ownership is enforced in every WHERE —
 * no query can touch another user's rows (LESSONS_LEARNED.md L1 discipline
 * ahead of entitlements). Every write reports success or throws; callers
 * surface failures (L2).
 */

import type { StoredProject } from "../store";
import type { Db } from "./db";

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
