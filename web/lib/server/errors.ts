/**
 * Production error reports (LESSONS_LEARNED.md L3: nothing important is
 * silent). Client crashes POST here and land in Postgres so they survive
 * log rotation and are reviewable in-app by an admin — no third-party
 * tracker, no PII beyond what the browser sends about the failure itself.
 */

import { randomUUID } from "crypto";

import type { Db } from "./db";

export interface ErrorReport {
  id: string;
  kind: string;
  message: string;
  stack: string | null;
  url: string | null;
  userAgent: string | null;
  createdAt: string;
}

export const ERROR_KINDS = ["boundary", "window", "promise"] as const;

/** Clamp an incoming report to safe shapes; unknown kinds become "window". */
export function sanitizeReport(raw: unknown): { kind: string; message: string; stack: string | null; url: string | null } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const kind = ERROR_KINDS.includes(r.kind as (typeof ERROR_KINDS)[number]) ? String(r.kind) : "window";
  const message = typeof r.message === "string" && r.message.trim() ? r.message.trim().slice(0, 500) : "unknown";
  const stack = typeof r.stack === "string" && r.stack.trim() ? r.stack.slice(0, 4000) : null;
  const url = typeof r.url === "string" && r.url.trim() ? r.url.slice(0, 300) : null;
  return { kind, message, stack, url };
}

export async function recordError(
  db: Db,
  report: { kind: string; message: string; stack: string | null; url: string | null },
  userAgent: string | null,
): Promise<void> {
  await db.query(
    "insert into error_reports (id, kind, message, stack, url, user_agent, created_at) values ($1, $2, $3, $4, $5, $6, $7)",
    [
      randomUUID(),
      report.kind,
      report.message,
      report.stack,
      report.url,
      userAgent ? userAgent.slice(0, 300) : null,
      new Date().toISOString(),
    ],
  );
}

export async function listErrors(db: Db, limit = 100): Promise<ErrorReport[]> {
  const res = await db.query(
    "select id, kind, message, stack, url, user_agent, created_at from error_reports order by created_at desc limit " +
      Math.min(Math.max(1, Math.floor(limit)), 500),
  );
  return res.rows.map((r) => ({
    id: String(r.id),
    kind: String(r.kind),
    message: String(r.message),
    stack: (r.stack as string | null) ?? null,
    url: (r.url as string | null) ?? null,
    userAgent: (r.user_agent as string | null) ?? null,
    createdAt: String(r.created_at),
  }));
}

/**
 * Admin gate: ADMIN_EMAILS is a comma-separated allowlist in the
 * deployment env. No entry, no admins — the honest default.
 */
export function isAdminEmail(email: string, env: { ADMIN_EMAILS?: string } = process.env as { ADMIN_EMAILS?: string }): boolean {
  const list = (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}

export const ADMIN_UNCONFIGURED_MESSAGE =
  "Admin access is not configured — set ADMIN_EMAILS to a comma-separated list of account emails and redeploy.";
