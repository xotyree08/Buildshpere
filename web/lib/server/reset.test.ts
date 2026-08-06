import { newDb } from "pg-mem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  authenticate,
  createPasswordReset,
  createSession,
  createUser,
  getSessionUser,
  resetPassword,
} from "./auth";
import { ensureSchema, type Db } from "./db";
import { DEFAULT_FROM, EMAIL_UNCONFIGURED, sendEmail } from "./email";

async function testDb(): Promise<Db> {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  const pool = new Pool() as unknown as Db;
  await ensureSchema(pool);
  return pool;
}

let db: Db;
beforeEach(async () => {
  db = await testDb();
  const signup = await createUser(db, "reset@example.com", "old-password-1");
  if (!signup.ok) throw new Error("signup failed");
});

describe("password reset tokens", () => {
  it("full flow: token sets a new password and the old one stops working", async () => {
    const reset = await createPasswordReset(db, "reset@example.com");
    expect(reset).not.toBeNull();
    const result = await resetPassword(db, reset!.token, "new-password-1");
    expect(result.ok).toBe(true);
    expect(await authenticate(db, "reset@example.com", "new-password-1")).not.toBeNull();
    expect(await authenticate(db, "reset@example.com", "old-password-1")).toBeNull();
  });

  it("unknown emails yield no token (route answers identically anyway)", async () => {
    expect(await createPasswordReset(db, "nobody@example.com")).toBeNull();
  });

  it("tokens are single-use", async () => {
    const reset = await createPasswordReset(db, "reset@example.com");
    expect((await resetPassword(db, reset!.token, "new-password-1")).ok).toBe(true);
    const again = await resetPassword(db, reset!.token, "other-password-1");
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toMatch(/already used|invalid/i);
  });

  it("tokens expire after an hour", async () => {
    const now = Date.now();
    const reset = await createPasswordReset(db, "reset@example.com", now);
    const late = await resetPassword(db, reset!.token, "new-password-1", now + 61 * 60 * 1000);
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.error).toMatch(/expired/i);
  });

  it("a reset revokes every existing session", async () => {
    const user = await authenticate(db, "reset@example.com", "old-password-1");
    const session = await createSession(db, user!.id);
    expect(await getSessionUser(db, session)).not.toBeNull();
    const reset = await createPasswordReset(db, "reset@example.com");
    await resetPassword(db, reset!.token, "new-password-1");
    expect(await getSessionUser(db, session)).toBeNull();
  });

  it("rejects short passwords without consuming the token", async () => {
    const reset = await createPasswordReset(db, "reset@example.com");
    const short = await resetPassword(db, reset!.token, "short");
    expect(short.ok).toBe(false);
    expect((await resetPassword(db, reset!.token, "long-enough-1")).ok).toBe(true);
  });

  it("garbage tokens fail cleanly", async () => {
    const result = await resetPassword(db, "not-a-real-token", "long-enough-1");
    expect(result.ok).toBe(false);
  });
});

describe("email seam", () => {
  it("unconfigured deployments refuse with the exact fix and never call the network", async () => {
    const fetchFn = vi.fn();
    const result = await sendEmail({}, { to: "a@b.co", subject: "s", text: "t" }, fetchFn);
    expect(result).toEqual({ ok: false, error: EMAIL_UNCONFIGURED });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("sends through Resend with the bearer key and configured sender", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const result = await sendEmail(
      { RESEND_API_KEY: "re_test", EMAIL_FROM: "BuildSphere <no-reply@onbuildsphere.com>" },
      { to: "a@b.co", subject: "Reset", text: "link" },
      fetchFn,
    );
    expect(result.ok).toBe(true);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test");
    const body = JSON.parse(String(init.body)) as { from: string; to: string[] };
    expect(body.from).toContain("onbuildsphere.com");
    expect(body.to).toEqual(["a@b.co"]);
  });

  it("provider refusals surface the real status, not a silent success", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("invalid key", { status: 401 }));
    const result = await sendEmail({ RESEND_API_KEY: "bad" }, { to: "a@b.co", subject: "s", text: "t" }, fetchFn);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("401");
  });

  it("falls back to the onboarding sender when EMAIL_FROM is unset", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    await sendEmail({ RESEND_API_KEY: "re_test" }, { to: "a@b.co", subject: "s", text: "t" }, fetchFn);
    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body)).from).toBe(DEFAULT_FROM);
  });
});
