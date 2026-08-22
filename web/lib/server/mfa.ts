/**
 * Two-factor authentication (TOTP, RFC 6238) and single-use recovery codes.
 *
 * Implemented here rather than pulled in: TOTP is an HMAC, a counter and a
 * modulo, and the whole of it is shorter than the dependency's README. The
 * value of writing it is that it can be tested against the RFC's own vectors,
 * which is the only way to know an authenticator app will agree with it —
 * see mfa.test.ts.
 *
 * Secrets are stored as base32, which is what authenticator apps expect and
 * what the `otpauth://` URI carries. Recovery codes are stored as SHA-256
 * hashes and marked used the moment they are spent, so a stolen backup list
 * is worth nothing twice.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { Db } from "./db";

/** RFC 4648 base32, no padding — the alphabet authenticator apps use. */
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = B32.indexOf(char);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A fresh 160-bit secret, the size RFC 4226 recommends for SHA-1. */
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

/**
 * RFC 4226 HOTP. Exported because it is what the RFC's test vectors address,
 * and a TOTP implementation nobody has checked against a vector is a
 * guess that happens to typecheck.
 */
export function hotp(key: Buffer, counter: number, digits = TOTP_DIGITS): string {
  const buf = Buffer.alloc(8);
  // Counter is 64-bit big-endian. Split rather than use BigInt so the
  // arithmetic stays obvious.
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const digest = createHmac("sha1", key).update(buf).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, "0");
}

export function totp(secret: string, atMs: number = Date.now(), digits = TOTP_DIGITS): string {
  const counter = Math.floor(atMs / 1000 / TOTP_STEP_SECONDS);
  return hotp(base32Decode(secret), counter, digits);
}

/**
 * Whether a code is valid now.
 *
 * `window` steps either side are accepted, because a phone's clock and a
 * server's clock are never quite the same and a user typing a code at second
 * 29 should not be told they are wrong. One step (±30s) is the usual choice.
 */
export function verifyTotp(
  secret: string,
  code: string,
  atMs: number = Date.now(),
  window = 1,
): boolean {
  const cleaned = code.replace(/\D/g, "");
  if (cleaned.length !== TOTP_DIGITS) return false;
  const key = base32Decode(secret);
  const counter = Math.floor(atMs / 1000 / TOTP_STEP_SECONDS);
  for (let drift = -window; drift <= window; drift++) {
    const expected = hotp(key, counter + drift);
    // Constant-time: a timing oracle on a six-digit code is worth having.
    const a = Buffer.from(expected);
    const b = Buffer.from(cleaned);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

/** The URI an authenticator app scans. */
export function otpauthUrl(email: string, secret: string, issuer = "BuildSphere"): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

export const RECOVERY_CODE_COUNT = 10;

/**
 * Recovery codes, shown once and never again.
 *
 * Grouped with a dash because these get written down, and a human copying
 * twelve characters gets them wrong less often in two halves.
 */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(6).toString("hex").toUpperCase();
    return `${raw.slice(0, 6)}-${raw.slice(6)}`;
  });
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
}

/** Case and dashes are how people mistype these; neither should matter. */
export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-F0-9]/g, "");
}

// ---------------------------------------------------------------------------
// Persistence. Kept below the pure functions above so the crypto stays
// testable without a database.
// ---------------------------------------------------------------------------

export type MfaResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Start enrolment: mint a secret and hand back the URI to scan.
 *
 * Deliberately NOT active yet. `confirmed_at` stays null until the user proves
 * they can produce a code, because an account locked behind a secret nobody
 * managed to scan is worse than no second factor at all.
 */
export async function beginEnrolment(
  db: Db,
  userId: string,
  email: string,
): Promise<{ secret: string; url: string }> {
  const secret = generateSecret();
  const now = new Date().toISOString();
  await db.query("delete from user_mfa where user_id = $1 and confirmed_at is null", [userId]);
  await db.query(
    "insert into user_mfa (user_id, secret, confirmed_at, created_at) values ($1, $2, null, $3)",
    [userId, secret, now],
  );
  return { secret, url: otpauthUrl(email, secret) };
}

/** Prove the authenticator works, turn it on, and issue recovery codes once. */
export async function confirmEnrolment(
  db: Db,
  userId: string,
  code: string,
  atMs: number = Date.now(),
): Promise<MfaResult<{ recoveryCodes: string[] }>> {
  const res = await db.query("select secret, confirmed_at from user_mfa where user_id = $1", [userId]);
  const row = res.rows[0];
  if (!row) return { ok: false, error: "Start enrolment before confirming it." };
  if (row.confirmed_at) return { ok: false, error: "Two-factor authentication is already on." };
  if (!verifyTotp(String(row.secret), code, atMs)) {
    return { ok: false, error: "That code is not right. Check your authenticator and try again." };
  }

  const now = new Date().toISOString();
  await db.query("update user_mfa set confirmed_at = $1 where user_id = $2", [now, userId]);
  const recoveryCodes = generateRecoveryCodes();
  await db.query("delete from mfa_recovery_codes where user_id = $1", [userId]);
  for (const recovery of recoveryCodes) {
    await db.query(
      "insert into mfa_recovery_codes (user_id, code_hash, used_at) values ($1, $2, null)",
      [userId, hashRecoveryCode(recovery)],
    );
  }
  return { ok: true, value: { recoveryCodes } };
}

export async function isMfaEnabled(db: Db, userId: string): Promise<boolean> {
  const res = await db.query(
    "select 1 from user_mfa where user_id = $1 and confirmed_at is not null",
    [userId],
  );
  return res.rows.length > 0;
}

/**
 * Check a second factor: an authenticator code, or one recovery code.
 *
 * A recovery code is spent the moment it works. Marking it used before
 * returning means a replayed request finds it gone even if two arrive at once.
 */
export async function verifySecondFactor(
  db: Db,
  userId: string,
  code: string,
  atMs: number = Date.now(),
): Promise<boolean> {
  const res = await db.query(
    "select secret from user_mfa where user_id = $1 and confirmed_at is not null",
    [userId],
  );
  const row = res.rows[0];
  if (!row) return false;
  if (verifyTotp(String(row.secret), code, atMs)) return true;

  const hash = hashRecoveryCode(code);
  const spent = await db.query(
    "update mfa_recovery_codes set used_at = $1 where user_id = $2 and code_hash = $3 and used_at is null",
    [new Date(atMs).toISOString(), userId, hash],
  );
  const rows = (spent as { rowCount?: number }).rowCount;
  if (typeof rows === "number") return rows > 0;
  // The in-memory engine does not report rowCount on update; fall back to a read.
  const check = await db.query(
    "select used_at from mfa_recovery_codes where user_id = $1 and code_hash = $2",
    [userId, hash],
  );
  return check.rows.length > 0 && check.rows[0].used_at !== null;
}

export async function unusedRecoveryCount(db: Db, userId: string): Promise<number> {
  const res = await db.query(
    "select count(*) as n from mfa_recovery_codes where user_id = $1 and used_at is null",
    [userId],
  );
  return Number(res.rows[0]?.n ?? 0);
}

/** Turn it off — but only for someone who can still satisfy it. */
export async function disableMfa(
  db: Db,
  userId: string,
  code: string,
  atMs: number = Date.now(),
): Promise<MfaResult<null>> {
  if (!(await isMfaEnabled(db, userId))) {
    return { ok: false, error: "Two-factor authentication is not on." };
  }
  if (!(await verifySecondFactor(db, userId, code, atMs))) {
    return { ok: false, error: "That code is not right." };
  }
  await db.query("delete from user_mfa where user_id = $1", [userId]);
  await db.query("delete from mfa_recovery_codes where user_id = $1", [userId]);
  return { ok: true, value: null };
}
