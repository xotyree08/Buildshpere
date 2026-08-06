import { newDb } from "pg-mem";
import { beforeEach, describe, expect, it } from "vitest";

import { authenticate, createEmailVerification, createUser, verifyEmail, VERIFY_TOKEN_HOURS, type AuthUser } from "./auth";
import { ensureSchema, type Db } from "./db";
import { verificationEmail } from "./verifymail";

async function testDb(): Promise<Db> {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  const pool = new Pool() as unknown as Db;
  await ensureSchema(pool);
  return pool;
}

let db: Db;
let user: AuthUser;
beforeEach(async () => {
  db = await testDb();
  const signup = await createUser(db, "new@example.com", "hunter2hunter2");
  if (!signup.ok) throw new Error("signup failed");
  user = signup.user;
});

describe("email verification", () => {
  it("a fresh account is unverified; consuming the token stamps it verified", async () => {
    expect(user.emailConfirmedAt).toBeNull();
    const token = await createEmailVerification(db, user.id);
    const result = await verifyEmail(db, token);
    expect(result).toEqual({ ok: true, userId: user.id });
    const signedIn = await authenticate(db, "new@example.com", "hunter2hunter2");
    expect(signedIn?.emailConfirmedAt).not.toBeNull();
  });

  it("tokens are single-use and garbage is rejected without a hint", async () => {
    const token = await createEmailVerification(db, user.id);
    await verifyEmail(db, token);
    const reused = await verifyEmail(db, token);
    expect(reused.ok).toBe(false);
    const junk = await verifyEmail(db, "definitely-not-a-token");
    expect(junk.ok).toBe(false);
  });

  it("tokens expire after the window", async () => {
    const t0 = Date.now();
    const token = await createEmailVerification(db, user.id, t0);
    const late = t0 + (VERIFY_TOKEN_HOURS + 1) * 60 * 60 * 1000;
    const result = await verifyEmail(db, token, late);
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("expired") });
  });

  it("the email carries the link and an honest ignore-this note", () => {
    const msg = verificationEmail("new@example.com", "tok123");
    expect(msg.to).toBe("new@example.com");
    expect(msg.text).toContain("/api/v1/auth/verify?token=tok123");
    expect(msg.text).toContain("ignore this message");
  });
});
