/**
 * Append-only audit trail (spec §11.3). This module deliberately exports no
 * update or delete — audit rows are written once and only ever read. Events
 * record WHO did WHAT to WHICH subject; detail is a short human-readable
 * clause, never secrets, receipts, or document content.
 */

import { randomUUID } from "crypto";

import type { Db } from "./db";

export interface AuditEvent {
  id: string;
  actorId: string;
  event: string;
  subject: string | null;
  detail: string | null;
  createdAt: string;
}

export async function recordAudit(
  db: Db,
  actorId: string,
  event: string,
  subject?: string | null,
  detail?: string | null,
): Promise<void> {
  await db.query(
    "insert into audit_events (id, actor_id, event, subject, detail, created_at) values ($1, $2, $3, $4, $5, $6)",
    [randomUUID(), actorId, event, subject ?? null, detail ?? null, new Date().toISOString()],
  );
}

/** A user's own trail, newest first. Ownership enforced in SQL (L1). */
export async function listAuditEvents(db: Db, actorId: string, limit = 100): Promise<AuditEvent[]> {
  const res = await db.query(
    "select id, actor_id, event, subject, detail, created_at from audit_events where actor_id = $1 order by created_at desc limit " +
      Math.min(Math.max(1, Math.floor(limit)), 500),
    [actorId],
  );
  return res.rows.map((r) => ({
    id: String(r.id),
    actorId: String(r.actor_id),
    event: String(r.event),
    subject: (r.subject as string | null) ?? null,
    detail: (r.detail as string | null) ?? null,
    createdAt: String(r.created_at),
  }));
}
