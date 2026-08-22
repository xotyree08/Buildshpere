/**
 * Enrolment, and the two properties that matter once a second factor is real:
 * a half-finished enrolment must never lock anyone out, and a recovery code
 * must work exactly once.
 */

import { newDb } from "pg-mem";
import { beforeEach, describe, expect, it } from "vitest";

import { ensureSchema, type Db } from "./db";
import {
  beginEnrolment,
  confirmEnrolment,
  disableMfa,
  isMfaEnabled,
  RECOVERY_CODE_COUNT,
  totp,
  TOTP_STEP_SECONDS,
  unusedRecoveryCount,
  verifySecondFactor,
} from "./mfa";

let db: Db;
const NOW = 1_700_000_000_000;

beforeEach(async () => {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  db = new Pool() as unknown as Db;
  await ensureSchema(db);
  await db.query(
    "insert into users (id, email, password_hash, created_at) values ($1,$2,$3,$4)",
    ["u1", "someone@example.com", "x", new Date(NOW).toISOString()],
  );
});

async function enrol(): Promise<string[]> {
  const { secret } = await beginEnrolment(db, "u1", "someone@example.com");
  const confirmed = await confirmEnrolment(db, "u1", totp(secret, NOW), NOW);
  if (!confirmed.ok) throw new Error(confirmed.error);
  return confirmed.value.recoveryCodes;
}

describe("enrolment", () => {
  it("is not active until a code proves the authenticator works", async () => {
    await beginEnrolment(db, "u1", "someone@example.com");
    // An account locked behind a secret nobody managed to scan is worse than
    // no second factor at all.
    expect(await isMfaEnabled(db, "u1")).toBe(false);
  });

  it("refuses to confirm on a wrong code, and stays off", async () => {
    await beginEnrolment(db, "u1", "someone@example.com");
    const attempt = await confirmEnrolment(db, "u1", "000000", NOW);
    expect(attempt).toMatchObject({ ok: false });
    expect(await isMfaEnabled(db, "u1")).toBe(false);
  });

  it("cannot be confirmed before it is started", async () => {
    expect(await confirmEnrolment(db, "u1", "123456", NOW)).toMatchObject({ ok: false });
  });

  it("turns on and issues recovery codes exactly once", async () => {
    const codes = await enrol();
    expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
    expect(await isMfaEnabled(db, "u1")).toBe(true);
    expect(await unusedRecoveryCount(db, "u1")).toBe(RECOVERY_CODE_COUNT);
    // Re-confirming must not mint a second set.
    expect(await confirmEnrolment(db, "u1", "123456", NOW)).toMatchObject({ ok: false });
  });

  it("restarting enrolment replaces an unconfirmed secret rather than piling up", async () => {
    await beginEnrolment(db, "u1", "someone@example.com");
    const second = await beginEnrolment(db, "u1", "someone@example.com");
    const confirmed = await confirmEnrolment(db, "u1", totp(second.secret, NOW), NOW);
    expect(confirmed.ok).toBe(true);
  });
});

describe("the second factor at sign-in", () => {
  it("accepts a current authenticator code", async () => {
    const { secret } = await beginEnrolment(db, "u1", "someone@example.com");
    await confirmEnrolment(db, "u1", totp(secret, NOW), NOW);
    expect(await verifySecondFactor(db, "u1", totp(secret, NOW), NOW)).toBe(true);
  });

  it("rejects a stale one", async () => {
    const { secret } = await beginEnrolment(db, "u1", "someone@example.com");
    await confirmEnrolment(db, "u1", totp(secret, NOW), NOW);
    const old = totp(secret, NOW - TOTP_STEP_SECONDS * 1000 * 5);
    expect(await verifySecondFactor(db, "u1", old, NOW)).toBe(false);
  });

  it("spends a recovery code, and will not take it twice", async () => {
    const codes = await enrol();
    expect(await verifySecondFactor(db, "u1", codes[0], NOW)).toBe(true);
    expect(await verifySecondFactor(db, "u1", codes[0], NOW)).toBe(false);
    expect(await unusedRecoveryCount(db, "u1")).toBe(RECOVERY_CODE_COUNT - 1);
  });

  it("accepts a recovery code however it was written down", async () => {
    const codes = await enrol();
    expect(await verifySecondFactor(db, "u1", codes[1].toLowerCase().replace("-", " "), NOW)).toBe(true);
  });

  it("refuses everything for someone who never enrolled", async () => {
    expect(await verifySecondFactor(db, "u1", "123456", NOW)).toBe(false);
  });
});

describe("turning it off", () => {
  it("needs a code that still works", async () => {
    const { secret } = await beginEnrolment(db, "u1", "someone@example.com");
    await confirmEnrolment(db, "u1", totp(secret, NOW), NOW);
    expect(await disableMfa(db, "u1", "000000", NOW)).toMatchObject({ ok: false });
    expect(await isMfaEnabled(db, "u1")).toBe(true);

    expect((await disableMfa(db, "u1", totp(secret, NOW), NOW)).ok).toBe(true);
    expect(await isMfaEnabled(db, "u1")).toBe(false);
  });

  it("clears the recovery codes with it", async () => {
    const codes = await enrol();
    await disableMfa(db, "u1", codes[0], NOW);
    expect(await unusedRecoveryCount(db, "u1")).toBe(0);
  });

  it("is refused when it was never on", async () => {
    expect(await disableMfa(db, "u1", "123456", NOW)).toMatchObject({ ok: false });
  });
});
