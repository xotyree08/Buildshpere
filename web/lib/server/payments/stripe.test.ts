import { createHmac } from "crypto";
import { newDb } from "pg-mem";
import { beforeEach, describe, expect, it } from "vitest";

import { createUser, type AuthUser } from "../auth";
import { ensureSchema, type Db } from "../db";
import { listEntitlements } from "./index";
import {
  createCheckoutSession,
  handleStripeEvent,
  PLAN_PRODUCTS,
  STRIPE_UNCONFIGURED,
  stripeConfigured,
  verifyStripeSignature,
  type StripeEnv,
} from "./stripe";

const ENV: StripeEnv = {
  STRIPE_SECRET_KEY: "sk_test_x",
  STRIPE_WEBHOOK_SECRET: "whsec_test",
  STRIPE_PRICE_MONTHLY: "price_month",
  STRIPE_PRICE_YEARLY: "price_year",
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
    const res = await createCheckoutSession({}, async () => ({ status: 200, json: async () => ({}) }), {
      userId: "u1",
      email: "a@b.co",
      plan: "monthly",
      successUrl: "s",
      cancelUrl: "c",
    });
    expect(res).toEqual({ ok: false, error: STRIPE_UNCONFIGURED });
  });

  it("checkout carries the user and product in metadata and returns Stripe's URL", async () => {
    let sent = "";
    const res = await createCheckoutSession(
      ENV,
      async (_url, init) => {
        sent = String(init.body);
        return { status: 200, json: async () => ({ url: "https://checkout.stripe.com/c/pay_x" }) };
      },
      { userId: "u1", email: "a@b.co", plan: "yearly", successUrl: "s", cancelUrl: "c" },
    );
    expect(res).toEqual({ ok: true, url: "https://checkout.stripe.com/c/pay_x" });
    const params = new URLSearchParams(sent);
    expect(params.get("mode")).toBe("subscription");
    expect(params.get("line_items[0][price]")).toBe("price_year");
    expect(params.get("client_reference_id")).toBe("u1");
    expect(params.get("metadata[productId]")).toBe(PLAN_PRODUCTS.yearly);
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

  it("a completed checkout grants exactly the metadata product to the referenced user", async () => {
    const result = await handleStripeEvent(db, {
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: user.id,
          metadata: { userId: user.id, productId: "buildsphere_plus_monthly" },
        },
      },
    });
    expect(result.handled).toBe("granted buildsphere_plus_monthly");
    const owned = await listEntitlements(db, user.id);
    expect(owned).toEqual([{ productId: "buildsphere_plus_monthly", platform: "stripe", status: "active" }]);
  });

  it("a deleted subscription cancels the entitlement; unknown events are ignored", async () => {
    await handleStripeEvent(db, {
      type: "checkout.session.completed",
      data: { object: { client_reference_id: user.id, metadata: { productId: "buildsphere_plus_yearly" } } },
    });
    const canceled = await handleStripeEvent(db, {
      type: "customer.subscription.deleted",
      data: { object: { metadata: { userId: user.id, productId: "buildsphere_plus_yearly" } } },
    });
    expect(canceled.handled).toBe("canceled buildsphere_plus_yearly");
    expect((await listEntitlements(db, user.id))[0].status).toBe("canceled");

    const ignored = await handleStripeEvent(db, { type: "invoice.paid", data: { object: {} } });
    expect(ignored.handled).toContain("ignored");
    // Events without metadata grant nothing (a forged bare event is inert).
    const inert = await handleStripeEvent(db, { type: "checkout.session.completed", data: { object: {} } });
    expect(inert.handled).toContain("ignored");
  });
});
