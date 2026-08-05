/**
 * In-app notification center (spec §14): the always-available channel —
 * email/SMS/push arrive with their providers; until then nothing important
 * is silent. Notifications are created server-side on workflow events and
 * only ever read/marked by their owner (L1 in every WHERE).
 */

import { randomUUID } from "crypto";

import type { Db } from "./db";

export interface Notification {
  id: string;
  kind: string;
  message: string;
  projectId: string | null;
  createdAt: string;
  readAt: string | null;
}

export async function notify(
  db: Db,
  userId: string,
  kind: string,
  message: string,
  projectId?: string | null,
): Promise<void> {
  await db.query(
    "insert into notifications (id, user_id, kind, message, project_id, created_at, read_at) values ($1, $2, $3, $4, $5, $6, null)",
    [randomUUID(), userId, kind, message.slice(0, 500), projectId ?? null, new Date().toISOString()],
  );
}

export async function listNotifications(db: Db, userId: string, limit = 50): Promise<Notification[]> {
  const res = await db.query(
    "select id, kind, message, project_id, created_at, read_at from notifications where user_id = $1 order by created_at desc limit " +
      Math.min(Math.max(1, Math.floor(limit)), 200),
    [userId],
  );
  return res.rows.map((r) => ({
    id: String(r.id),
    kind: String(r.kind),
    message: String(r.message),
    projectId: (r.project_id as string | null) ?? null,
    createdAt: String(r.created_at),
    readAt: (r.read_at as string | null) ?? null,
  }));
}

export async function unreadCount(db: Db, userId: string): Promise<number> {
  const res = await db.query(
    "select count(*) as n from notifications where user_id = $1 and read_at is null",
    [userId],
  );
  return Number(res.rows[0]?.n ?? 0);
}

/** Mark all of the user's notifications read. Idempotent. */
export async function markAllRead(db: Db, userId: string): Promise<void> {
  await db.query("update notifications set read_at = $1 where user_id = $2 and read_at is null", [
    new Date().toISOString(),
    userId,
  ]);
}
