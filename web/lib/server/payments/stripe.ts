/**
 * Stripe seam for web subscriptions. Same iron rules as the store
 * validators (L1/L2/L4): entitlements are never client-writable — the
 * only web write path is a signature-verified Stripe webhook — and an
 * unconfigured deployment refuses loudly with the exact fix. No Stripe
 * SDK: two REST calls and an HMAC keep the dependency surface at zero.
 */

import { createHmac, timingSafeEqual } from "crypto";

import type { Db } from "../db";
import { recordEntitlement } from "./index";

export interface StripeEnv {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_MONTHLY?: string;
  STRIPE_PRICE_YEARLY?: string;
}

export const STRIPE_UNCONFIGURED =
  "Web subscriptions are not configured on this deployment — set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_MONTHLY, and STRIPE_PRICE_YEARLY, then redeploy. Nothing was charged.";

export type StripePlan = "monthly" | "yearly";

/** The same product ids the mobile stores use, so one entitlement row serves all platforms. */
export const PLAN_PRODUCTS: Record<StripePlan, string> = {
  monthly: "buildsphere_plus_monthly",
  yearly: "buildsphere_plus_yearly",
};

export function stripeConfigured(env: StripeEnv): boolean {
  return Boolean(
    env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET && env.STRIPE_PRICE_MONTHLY && env.STRIPE_PRICE_YEARLY,
  );
}

export type FetchLike = (url: string, init: RequestInit) => Promise<{ status: number; json(): Promise<unknown> }>;

/**
 * Create a Checkout Session and return its redirect URL. The user id
 * rides in client_reference_id and metadata so the webhook can grant
 * the entitlement to the right account without trusting the client.
 */
export async function createCheckoutSession(
  env: StripeEnv,
  fetchFn: FetchLike,
  opts: { userId: string; email: string; plan: StripePlan; successUrl: string; cancelUrl: string },
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!stripeConfigured(env)) return { ok: false, error: STRIPE_UNCONFIGURED };
  const price = opts.plan === "yearly" ? env.STRIPE_PRICE_YEARLY! : env.STRIPE_PRICE_MONTHLY!;
  const body = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    client_reference_id: opts.userId,
    customer_email: opts.email,
    "metadata[userId]": opts.userId,
    "metadata[productId]": PLAN_PRODUCTS[opts.plan],
    "subscription_data[metadata][userId]": opts.userId,
    "subscription_data[metadata][productId]": PLAN_PRODUCTS[opts.plan],
  });
  try {
    const res = await fetchFn("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    const data = (await res.json()) as { url?: string; error?: { message?: string } };
    if (res.status !== 200 || !data.url) {
      return { ok: false, error: data.error?.message ?? `Stripe refused the checkout (HTTP ${res.status}).` };
    }
    return { ok: true, url: data.url };
  } catch {
    return { ok: false, error: "Could not reach Stripe — try again in a moment." };
  }
}

/**
 * Verify a Stripe-Signature header (t=timestamp,v1=hmac of "t.payload").
 * Rejects stale timestamps (replay) and non-matching signatures, in
 * constant time.
 */
export function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  nowMs: number,
  toleranceSeconds = 300,
): boolean {
  if (!header) return false;
  const parts = new Map<string, string[]>();
  for (const piece of header.split(",")) {
    const [k, v] = piece.split("=", 2);
    if (!k || v === undefined) continue;
    const key = k.trim();
    parts.set(key, [...(parts.get(key) ?? []), v.trim()]);
  }
  const t = Number(parts.get("t")?.[0]);
  if (!Number.isFinite(t) || Math.abs(nowMs / 1000 - t) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  for (const candidate of parts.get("v1") ?? []) {
    const candidateBuf = Buffer.from(candidate, "utf8");
    if (candidateBuf.length === expectedBuf.length && timingSafeEqual(candidateBuf, expectedBuf)) {
      return true;
    }
  }
  return false;
}

/**
 * Apply a verified webhook event. Grants on completed checkouts; a
 * canceled subscription marks the entitlement canceled. Unknown event
 * types are acknowledged and ignored — Stripe sends many.
 */
export async function handleStripeEvent(db: Db, event: unknown): Promise<{ handled: string }> {
  const e = (event ?? {}) as { type?: string; data?: { object?: Record<string, unknown> } };
  const obj = e.data?.object ?? {};
  const metadata = (obj.metadata ?? {}) as Record<string, unknown>;

  if (e.type === "checkout.session.completed") {
    const userId = typeof obj.client_reference_id === "string" ? obj.client_reference_id : String(metadata.userId ?? "");
    const productId = String(metadata.productId ?? "");
    if (!userId || !productId) return { handled: "ignored: completed session without user/product metadata" };
    await recordEntitlement(db, userId, productId, "stripe");
    return { handled: `granted ${productId}` };
  }

  if (e.type === "customer.subscription.deleted") {
    const userId = String(metadata.userId ?? "");
    const productId = String(metadata.productId ?? "");
    if (!userId || !productId) return { handled: "ignored: deleted subscription without metadata" };
    await db.query(
      "update entitlements set status = 'canceled', updated_at = $1 where user_id = $2 and product_id = $3",
      [new Date().toISOString(), userId, productId],
    );
    return { handled: `canceled ${productId}` };
  }

  return { handled: `ignored: ${e.type ?? "unknown"}` };
}
