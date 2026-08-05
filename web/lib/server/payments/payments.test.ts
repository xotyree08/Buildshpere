import { newDb } from "pg-mem";
import { beforeEach, describe, expect, it } from "vitest";

import { createUser } from "../auth";
import { ensureSchema, type Db } from "../db";
import {
  APPLE_UNCONFIGURED,
  GOOGLE_UNCONFIGURED,
  listEntitlements,
  validateAndGrant,
} from "./index";
import { validateAppleReceipt, type FetchLike } from "./apple";
import { buildServiceJwt, validateGooglePurchase } from "./google";
import { generateKeyPairSync } from "crypto";

const NOW = 1_800_000_000_000;

/** Scripted fetch: returns queued JSON bodies in order, records calls. */
function scriptedFetch(bodies: unknown[]): { fetch: FetchLike; calls: { url: string; body: string }[] } {
  const calls: { url: string; body: string }[] = [];
  const queue = [...bodies];
  return {
    calls,
    fetch: async (url, init) => {
      calls.push({ url, body: init.body });
      const body = queue.shift();
      return { json: async () => body };
    },
  };
}

async function testDb(): Promise<Db> {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  const pool = new Pool() as unknown as Db;
  await ensureSchema(pool);
  return pool;
}

let db: Db;
let userId: string;
beforeEach(async () => {
  db = await testDb();
  const signup = await createUser(db, "buyer@example.com", "hunter2hunter2");
  if (!signup.ok) throw new Error("signup failed");
  userId = signup.user.id;
});

describe("apple receipt validation", () => {
  it("accepts a live subscription and retries sandbox on 21007", async () => {
    const { fetch, calls } = scriptedFetch([
      { status: 21007 },
      {
        status: 0,
        latest_receipt_info: [
          { product_id: "buildsphere_plus_monthly", expires_date_ms: String(NOW + 1000) },
        ],
      },
    ]);
    const result = await validateAppleReceipt("receipt", "secret", NOW, fetch);
    expect(result).toEqual({ ok: true, productId: "buildsphere_plus_monthly" });
    expect(calls[0].url).toContain("buy.itunes.apple.com");
    expect(calls[1].url).toContain("sandbox.itunes.apple.com");
  });

  it("rejects bad status, empty, and expired receipts with reasons", async () => {
    const bad = await validateAppleReceipt("r", "s", NOW, scriptedFetch([{ status: 21003 }]).fetch);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain("21003");

    const expired = await validateAppleReceipt(
      "r",
      "s",
      NOW,
      scriptedFetch([
        { status: 0, latest_receipt_info: [{ product_id: "p", expires_date_ms: String(NOW - 1) }] },
      ]).fetch,
    );
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.error).toContain("expired");
  });
});

describe("google purchase validation", () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const account = {
    client_email: "svc@play.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };

  it("signs a well-formed RS256 service JWT", () => {
    const jwt = buildServiceJwt(account, 1000);
    const [header, claims, sig] = jwt.split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    const parsed = JSON.parse(Buffer.from(claims, "base64url").toString());
    expect(parsed.iss).toBe(account.client_email);
    expect(parsed.exp - parsed.iat).toBe(3600);
    expect(sig.length).toBeGreaterThan(100);
  });

  it("grants an active purchase; rejects expired and pending ones", async () => {
    const base = { account, packageName: "com.buildsphere.app", productId: "buildsphere_plus_monthly", purchaseToken: "tok", now: NOW };

    const active = await validateGooglePurchase(base, scriptedFetch([
      { access_token: "at" },
      { paymentState: 1, expiryTimeMillis: String(NOW + 1000) },
    ]).fetch);
    expect(active).toEqual({ ok: true, productId: "buildsphere_plus_monthly" });

    const expired = await validateGooglePurchase(base, scriptedFetch([
      { access_token: "at" },
      { paymentState: 1, expiryTimeMillis: String(NOW - 1) },
    ]).fetch);
    expect(expired.ok).toBe(false);

    const pending = await validateGooglePurchase(base, scriptedFetch([
      { access_token: "at" },
      { paymentState: 0 },
    ]).fetch);
    expect(pending.ok).toBe(false);
    if (!pending.ok) expect(pending.error).toContain("pending");
  });
});

describe("validateAndGrant — the only road to an entitlement (L1)", () => {
  it("unconfigured deployments refuse with the exact fix and grant nothing", async () => {
    const apple = await validateAndGrant(db, userId, { platform: "apple", productId: "p", verificationData: "r" }, {}, scriptedFetch([]).fetch, NOW);
    expect(apple).toEqual({ granted: false, error: APPLE_UNCONFIGURED });

    const google = await validateAndGrant(db, userId, { platform: "google", productId: "p", verificationData: "t" }, {}, scriptedFetch([]).fetch, NOW);
    expect(google).toEqual({ granted: false, error: GOOGLE_UNCONFIGURED });

    expect(await listEntitlements(db, userId)).toEqual([]);
  });

  it("a validated apple receipt grants exactly its own product", async () => {
    const env = { APPLE_SHARED_SECRET: "secret" };
    const receiptFor = (productId: string) =>
      scriptedFetch([{ status: 0, latest_receipt_info: [{ product_id: productId, expires_date_ms: String(NOW + 1000) }] }]).fetch;

    // Receipt for a different product than claimed → refused.
    const mismatch = await validateAndGrant(
      db, userId,
      { platform: "apple", productId: "buildsphere_plus_yearly", verificationData: "r" },
      env, receiptFor("buildsphere_plus_monthly"), NOW,
    );
    expect(mismatch.granted).toBe(false);
    expect(await listEntitlements(db, userId)).toEqual([]);

    // Matching receipt → granted, idempotent on re-validation (restore).
    for (let i = 0; i < 2; i++) {
      const granted = await validateAndGrant(
        db, userId,
        { platform: "apple", productId: "buildsphere_plus_monthly", verificationData: "r" },
        env, receiptFor("buildsphere_plus_monthly"), NOW,
      );
      expect(granted).toEqual({ granted: true });
    }
    expect(await listEntitlements(db, userId)).toEqual([
      { productId: "buildsphere_plus_monthly", platform: "apple", status: "active" },
    ]);
  });

  it("entitlements are per-user — one buyer unlocks nothing for anyone else", async () => {
    const other = await createUser(db, "other@example.com", "hunter2hunter2");
    if (!other.ok) throw new Error("signup failed");
    await validateAndGrant(
      db, userId,
      { platform: "apple", productId: "buildsphere_plus_monthly", verificationData: "r" },
      { APPLE_SHARED_SECRET: "s" },
      scriptedFetch([{ status: 0, latest_receipt_info: [{ product_id: "buildsphere_plus_monthly", expires_date_ms: String(NOW + 1000) }] }]).fetch,
      NOW,
    );
    expect(await listEntitlements(db, other.user.id)).toEqual([]);
  });
});
