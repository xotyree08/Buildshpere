/**
 * Read-only share links: a capability URL a homeowner hands to family or a
 * contractor. The token is a random 256-bit secret; like sessions, only its
 * SHA-256 hash is stored — a leaked database never yields a working link.
 * One active link per project; creating again rotates the token, revoking
 * deletes it. Every query carries owner_id (L1 discipline) except the
 * public lookup, where the token itself is the authorization.
 */

import { createHash, randomBytes } from "crypto";

import type { StoredProject } from "../store";
import type { Db } from "./db";

function tokenHash(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

const TOKEN_SHAPE = /^[0-9a-f]{64}$/;

export type ShareCreateResult = { ok: true; token: string } | { ok: false; error: string };

/** Mint (or rotate) the project's share link; returns the raw token once. */
export async function createShareLink(
  db: Db,
  ownerId: string,
  projectId: string,
): Promise<ShareCreateResult> {
  const owned = await db.query("select 1 from projects where id = $1 and owner_id = $2", [
    projectId,
    ownerId,
  ]);
  if (owned.rows.length === 0) {
    return { ok: false, error: "Sync this project to your account first — the link serves the synced copy." };
  }
  const raw = randomBytes(32).toString("hex");
  await db.query("delete from share_links where project_id = $1 and owner_id = $2", [
    projectId,
    ownerId,
  ]);
  await db.query(
    "insert into share_links (token_hash, project_id, owner_id, created_at) values ($1, $2, $3, $4)",
    [tokenHash(raw), projectId, ownerId, new Date().toISOString()],
  );
  return { ok: true, token: raw };
}

export async function revokeShareLink(db: Db, ownerId: string, projectId: string): Promise<void> {
  await db.query("delete from share_links where project_id = $1 and owner_id = $2", [
    projectId,
    ownerId,
  ]);
}

/** Whether the owner's project currently has an active link (UI state only — the token is unrecoverable). */
export async function hasShareLink(db: Db, ownerId: string, projectId: string): Promise<boolean> {
  const res = await db.query("select 1 from share_links where project_id = $1 and owner_id = $2", [
    projectId,
    ownerId,
  ]);
  return res.rows.length > 0;
}

/** Public lookup: the token is the authorization. Null for anything but a live link. */
export async function getSharedProject(db: Db, rawToken: string): Promise<StoredProject | null> {
  if (!TOKEN_SHAPE.test(rawToken)) return null;
  const res = await db.query(
    "select p.data from share_links s join projects p on p.id = s.project_id where s.token_hash = $1",
    [tokenHash(rawToken)],
  );
  const row = res.rows[0];
  if (!row) return null;
  return (typeof row.data === "string" ? JSON.parse(row.data) : row.data) as StoredProject;
}
