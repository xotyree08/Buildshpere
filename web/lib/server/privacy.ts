/**
 * Privacy rights and auth hardening (spec §11.1/§11.2): brute-force
 * throttling driven by the audit trail, a complete machine-readable
 * account export, and account deletion that verifies the password,
 * cascades everything the user owns, and retains only the append-only
 * audit trail (lawful-retention carve-out, recorded as such).
 */

import type { AuthUser } from "./auth";
import { verifyPassword } from "./auth";
import { recordAudit } from "./audit";
import type { Db } from "./db";

export const THROTTLE_WINDOW_MS = 15 * 60 * 1000;
export const THROTTLE_MAX_FAILURES = 5;
export const THROTTLE_MESSAGE =
  "Too many failed sign-in attempts for this email — wait 15 minutes and try again.";

/** True when this email has hit the failed-login ceiling inside the window. */
export async function loginThrottled(db: Db, email: string, now: number): Promise<boolean> {
  const since = new Date(now - THROTTLE_WINDOW_MS).toISOString();
  const res = await db.query(
    "select count(*) as n from audit_events where actor_id = 'anon' and event = 'auth.login_failed' and subject = $1 and created_at > $2",
    [email.trim().toLowerCase(), since],
  );
  return Number(res.rows[0]?.n ?? 0) >= THROTTLE_MAX_FAILURES;
}

export interface AccountExport {
  format: "buildsphere-account";
  exportedAt: string;
  user: { id: string; email: string; role: string };
  professionalProfile: Record<string, unknown> | null;
  projects: unknown[];
  entitlements: unknown[];
  auditEvents: unknown[];
}

/** Everything the account owns, no secrets (no hashes, no tokens). */
export async function exportAccountData(db: Db, user: AuthUser): Promise<AccountExport> {
  const profile = await db.query(
    "select full_name, discipline, license_number, license_state, status, submitted_at from professional_profiles where user_id = $1",
    [user.id],
  );
  const projects = await db.query("select data from projects where owner_id = $1", [user.id]);
  const entitlements = await db.query(
    "select product_id, platform, status, created_at from entitlements where user_id = $1",
    [user.id],
  );
  const audit = await db.query(
    "select event, subject, detail, created_at from audit_events where actor_id = $1 order by created_at desc",
    [user.id],
  );
  return {
    format: "buildsphere-account",
    exportedAt: new Date().toISOString(),
    user: { id: user.id, email: user.email, role: user.role },
    professionalProfile: (profile.rows[0] as Record<string, unknown> | undefined) ?? null,
    projects: projects.rows.map((r) => (typeof r.data === "string" ? JSON.parse(r.data) : r.data)),
    entitlements: entitlements.rows,
    auditEvents: audit.rows,
  };
}

export type DeleteResult = { ok: true } | { ok: false; error: string };

/**
 * Delete the account and everything it owns. The password re-check is the
 * §3.1 "high-risk actions require reauthentication" rule. The audit trail
 * is retained (append-only, lawful retention) and records the deletion.
 */
export async function deleteAccount(db: Db, user: AuthUser, password: string): Promise<DeleteResult> {
  const row = (await db.query("select password_hash from users where id = $1", [user.id])).rows[0];
  if (!row) return { ok: false, error: "Account not found." };
  if (!verifyPassword(password, String(row.password_hash))) {
    return { ok: false, error: "Password is incorrect — account unchanged." };
  }

  await recordAudit(db, user.id, "account.deleted", null, "all owned data removed; audit trail retained");
  await db.query("delete from auth_sessions where user_id = $1", [user.id]);
  await db.query(
    "delete from share_links where project_id in (select id from projects where owner_id = $1)",
    [user.id],
  );
  await db.query("delete from review_invites where owner_id = $1", [user.id]);
  await db.query("delete from review_requests where owner_id = $1", [user.id]);
  // Reviews they were reviewing (not owning) go back to the queue unclaimed.
  await db.query(
    "update review_requests set professional_id = null, professional_email = null, status = 'requested' where professional_id = $1 and status != 'approved'",
    [user.id],
  );
  await db.query("delete from professional_profiles where user_id = $1", [user.id]);
  await db.query("delete from entitlements where user_id = $1", [user.id]);
  await db.query("delete from projects where owner_id = $1", [user.id]);
  await db.query("delete from users where id = $1", [user.id]);
  return { ok: true };
}
