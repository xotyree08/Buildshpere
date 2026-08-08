import { createHmac } from "crypto";
import { newDb } from "pg-mem";
import { beforeEach, describe, expect, it } from "vitest";

import { addonInfo, tierInfo } from "../../catalog/licenses";
import { createUser, type AuthUser } from "../auth";
import { ensureSchema, type Db } from "../db";
import { getLicense, grantLicense } from "../licenses";
import {
  createAddonCheckout,
  createLicenseCheckout,
  handleStripeEvent,
  STRIPE_UNCONFIGURED,
  stripeConfigured,
  verifyStripeSignature,
  type StripeEnv,
} from "./stripe";

const ENV: StripeEnv = {
  STRIPE_SECRET_KEY: "sk_test_x",
  STRIPE_WEBHOOK_SECRET: "whsec_test",
};

function sign(payload: string, secret: string, t: number): string {
  const mac = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return `t=${t},v1=${mac}`;
}

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
  const signup = await createUser(db, "buyer@example.com", "hunter2hunter2");
  if (!signup.ok) throw new Error("signup failed");
  user = signup.user;
});

describe("stripe seam (L1: webhook is the only write path)", () => {
  it("refuses loudly when unconfigured — the exact-fix message, nothing charged", async () => {
    expect(stripeConfigured({})).toBe(false);
    expect(stripeConfigured(ENV)).toBe(true);
    const res = await createLicenseCheckout({}, async () => ({ status: 200, json: async () => ({}) }), {
      userId: "u1",
      email: "a@b.co",
      projectId: "p1",
      tier: "complete",
      successUrl: "s",
      cancelUrl: "c",
    });
    expect(res).toEqual({ ok: false, error: STRIPE_UNCONFIGURED });
  });

  it("license checkout is one-time (mode=payment) with inline price and full metadata", async () => {
    let sent = "";
    const res = await createLicenseCheckout(
      ENV,
      async (_url, init) => {
        sent = String(init.body);
        return { status: 200, json: async () => ({ url: "https://checkout.stripe.com/c/pay_x" }) };
      },
      { userId: "u1", email: "a@b.co", projectId: "p1", tier: "complete", successUrl: "s", cancelUrl: "c" },
    );
    expect(res).toEqual({ ok: true, url: "https://checkout.stripe.com/c/pay_x" });
    const params = new URLSearchParams(sent);
    expect(params.get("mode")).toBe("payment");
    expect(params.get("line_items[0][price_data][unit_amount]")).toBe(String(tierInfo("complete")!.priceCents));
    expect(params.get("metadata[kind]")).toBe("license");
    expect(params.get("metadata[userId]")).toBe("u1");
    expect(params.get("metadata[projectId]")).toBe("p1");
    expect(params.get("metadata[tier]")).toBe("complete");
  });

  it("addon checkout prices from the catalog and refuses unknown keys", async () => {
    let sent = "";
    const res = await createAddonCheckout(
      ENV,
      async (_url, init) => {
        sent = String(init.body);
        return { status: 200, json: async () => ({ url: "https://checkout.stripe.com/c/pay_a" }) };
      },
      { userId: "u1", email: "a@b.co", projectId: "p1", addon: "renders25", successUrl: "s", cancelUrl: "c" },
    );
    expect(res).toEqual({ ok: true, url: "https://checkout.stripe.com/c/pay_a" });
    const params = new URLSearchParams(sent);
    expect(params.get("mode")).toBe("payment");
    expect(params.get("line_items[0][price_data][unit_amount]")).toBe(String(addonInfo("renders25")!.priceCents));
    expect(params.get("metadata[addon]")).toBe("renders25");

    const unknown = await createAddonCheckout(ENV, async () => ({ status: 200, json: async () => ({}) }), {
      userId: "u1",
      email: "a@b.co",
      projectId: "p1",
      addon: "renders9000",
      successUrl: "s",
      cancelUrl: "c",
    });
    expect(unknown).toEqual({ ok: false, error: "Unknown add-on: renders9000" });
  });

  it("signature verification: valid passes; wrong secret, stale timestamp, garbage all fail", () => {
    const payload = '{"type":"x"}';
    const now = 1_700_000_000_000;
    const t = Math.floor(now / 1000);
    expect(verifyStripeSignature(payload, sign(payload, "whsec_test", t), "whsec_test", now)).toBe(true);
    expect(verifyStripeSignature(payload, sign(payload, "whsec_WRONG", t), "whsec_test", now)).toBe(false);
    const stale = t - 3600;
    expect(verifyStripeSignature(payload, sign(payload, "whsec_test", stale), "whsec_test", now)).toBe(false);
    expect(verifyStripeSignature(payload, "not-a-header", "whsec_test", now)).toBe(false);
    expect(verifyStripeSignature(payload, null, "whsec_test", now)).toBe(false);
  });

  it("a completed license checkout licenses exactly the metadata project", async () => {
    const result = await handleStripeEvent(db, {
      type: "checkout.session.completed",
      data: { object: { metadata: { kind: "license", userId: user.id, projectId: "p1", tier: "design" } } },
    });
    expect(result.handled).toBe("licensed p1 as design");
    const license = await getLicense(db, user.id, "p1");
    expect(license?.tier).toBe("design");
    expect(license?.remaining.premium_render).toBe(tierInfo("design")!.allowances.premium_render);
  });

  it("a completed addon checkout credits the pack; unlicensed projects get nothing", async () => {
    const orphan = await handleStripeEvent(db, {
      type: "checkout.session.completed",
      data: { object: { metadata: { kind: "addon", userId: user.id, projectId: "p1", addon: "renders10" } } },
    });
    expect(orphan.handled).toContain("ignored");

    await grantLicense(db, { userId: user.id, projectId: "p1", tier: "concept", source: "stripe" });
    const credited = await handleStripeEvent(db, {
      type: "checkout.session.completed",
      data: { object: { metadata: { kind: "addon", userId: user.id, projectId: "p1", addon: "renders10" } } },
    });
    expect(credited.handled).toBe("credited 10 premium_render to p1");
    expect((await getLicense(db, user.id, "p1"))?.remaining.premium_render).toBe(20);
  });

  it("unknown events and forged bare events are inert", async () => {
    const ignored = await handleStripeEvent(db, { type: "invoice.paid", data: { object: {} } });
    expect(ignored.handled).toContain("ignored");
    const inert = await handleStripeEvent(db, { type: "checkout.session.completed", data: { object: {} } });
    expect(inert.handled).toContain("ignored");
    const badTier = await handleStripeEvent(db, {
      type: "checkout.session.completed",
      data: { object: { metadata: { kind: "license", userId: user.id, projectId: "p1", tier: "platinum" } } },
    });
    expect(badTier.handled).toContain("ignored");
    expect(await getLicense(db, user.id, "p1")).toBeNull();
  });
});
