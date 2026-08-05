/**
 * Email + password auth (LESSONS_LEARNED.md L7: boring, complete, testable).
 * Passwords: scrypt with per-user salt, constant-time compare, no external
 * dependency. Sessions: random 256-bit tokens, only the SHA-256 hash at
 * rest — a leaked database never yields a usable cookie.
 */

import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from "crypto";

import type { Db } from "./db";

const SCRYPT_N = 16384;
const KEY_LEN = 64;
export const SESSION_DAYS = 30;
export const MIN_PASSWORD_LENGTH = 8;

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  /** 'homeowner' | 'professional' — license verification arrives with full Phase 2 (L8). */
  role: string;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N }).toString("hex");
  return `scrypt$${SCRYPT_N}$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "scrypt") return false;
  const n = Number(parts[1]);
  if (!Number.isFinite(n) || n < 1024) return false;
  const expected = Buffer.from(parts[3], "hex");
  const actual = scryptSync(password, parts[2], expected.length, { N: n });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function tokenHash(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export type SignupResult = { ok: true; user: AuthUser } | { ok: false; error: string };

export async function createUser(db: Db, email: string, password: string): Promise<SignupResult> {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return { ok: false, error: "Enter a valid email address." };
  if (password.length < MIN_PASSWORD_LENGTH)
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };

  const existing = await db.query("select id from users where email = $1", [normalized]);
  if (existing.rows.length > 0) return { ok: false, error: "That email is already registered — sign in instead." };

  const id = randomUUID();
  await db.query(
    "insert into users (id, email, password_hash, display_name, email_confirmed_at, created_at, role) values ($1, $2, $3, $4, $5, $6, $7)",
    [id, normalized, hashPassword(password), null, null, new Date().toISOString(), "homeowner"],
  );
  return { ok: true, user: { id, email: normalized, displayName: null, role: "homeowner" } };
}

/** Role change gated by an access code; the route enforces the code. */
export async function setRole(db: Db, userId: string, role: "homeowner" | "professional"): Promise<void> {
  await db.query("update users set role = $1 where id = $2", [role, userId]);
}

export async function authenticate(db: Db, email: string, password: string): Promise<AuthUser | null> {
  const normalized = email.trim().toLowerCase();
  const res = await db.query(
    "select id, email, password_hash, display_name, role from users where email = $1",
    [normalized],
  );
  const row = res.rows[0];
  if (!row) return null;
  if (!verifyPassword(password, String(row.password_hash))) return null;
  return {
    id: String(row.id),
    email: String(row.email),
    displayName: (row.display_name as string | null) ?? null,
    role: String(row.role ?? "homeowner"),
  };
}

/** Create a session; returns the raw token for the cookie (hash stored). */
export async function createSession(db: Db, userId: string): Promise<string> {
  const raw = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.query(
    "insert into auth_sessions (token_hash, user_id, created_at, expires_at) values ($1, $2, $3, $4)",
    [tokenHash(raw), userId, new Date().toISOString(), expires.toISOString()],
  );
  return raw;
}

export async function getSessionUser(db: Db, rawToken: string): Promise<AuthUser | null> {
  if (!rawToken) return null;
  const res = await db.query(
    "select u.id, u.email, u.display_name, u.role, s.expires_at from auth_sessions s join users u on u.id = s.user_id where s.token_hash = $1",
    [tokenHash(rawToken)],
  );
  const row = res.rows[0];
  if (!row) return null;
  if (new Date(String(row.expires_at)).getTime() < Date.now()) {
    await db.query("delete from auth_sessions where token_hash = $1", [tokenHash(rawToken)]);
    return null;
  }
  return {
    id: String(row.id),
    email: String(row.email),
    displayName: (row.display_name as string | null) ?? null,
    role: String(row.role ?? "homeowner"),
  };
}

export async function deleteSession(db: Db, rawToken: string): Promise<void> {
  if (rawToken) await db.query("delete from auth_sessions where token_hash = $1", [tokenHash(rawToken)]);
}

export const SESSION_COOKIE = "bs_session";

// ---------- Password reset ----------
// Same token discipline as sessions and share links: 256-bit random,
// only the hash at rest, single-use, short-lived.

export const RESET_TOKEN_MINUTES = 60;

/** Returns null for unknown emails — the route answers identically either
 * way so the endpoint can't be used to enumerate accounts. */
export async function createPasswordReset(
  db: Db,
  email: string,
  now: number = Date.now(),
): Promise<{ token: string; userId: string } | null> {
  const normalized = email.trim().toLowerCase();
  const res = await db.query("select id from users where email = $1", [normalized]);
  const row = res.rows[0];
  if (!row) return null;
  const raw = randomBytes(32).toString("hex");
  await db.query(
    "insert into password_resets (token_hash, user_id, created_at, expires_at) values ($1, $2, $3, $4)",
    [
      tokenHash(raw),
      String(row.id),
      new Date(now).toISOString(),
      new Date(now + RESET_TOKEN_MINUTES * 60 * 1000).toISOString(),
    ],
  );
  return { token: raw, userId: String(row.id) };
}

export type ResetResult = { ok: true; userId: string } | { ok: false; error: string };

/** Single-use: consumes the token, sets the password, and revokes every
 * existing session — a reset always signs everyone else out. */
export async function resetPassword(
  db: Db,
  rawToken: string,
  newPassword: string,
  now: number = Date.now(),
): Promise<ResetResult> {
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  const res = await db.query(
    "select token_hash, user_id, expires_at, used_at from password_resets where token_hash = $1",
    [tokenHash(rawToken)],
  );
  const row = res.rows[0];
  if (!row || row.used_at != null) {
    return { ok: false, error: "This reset link is invalid or was already used — request a new one." };
  }
  if (new Date(String(row.expires_at)).getTime() < now) {
    return { ok: false, error: "This reset link has expired — request a new one." };
  }
  const userId = String(row.user_id);
  await db.query("update password_resets set used_at = $1 where token_hash = $2", [
    new Date(now).toISOString(),
    tokenHash(rawToken),
  ]);
  await db.query("update users set password_hash = $1 where id = $2", [hashPassword(newPassword), userId]);
  await db.query("delete from auth_sessions where user_id = $1", [userId]);
  return { ok: true, userId };
}
