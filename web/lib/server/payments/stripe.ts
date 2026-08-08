/**
 * Stripe seam for project licenses. Same iron rules as the store
 * validators (L1/L2/L4): licenses are never client-writable — the only
 * write path is a signature-verified Stripe webhook — and an unconfigured
 * deployment refuses loudly with the exact fix. No Stripe SDK: two REST
 * calls and an HMAC keep the dependency surface at zero.
 *
 * Pricing model (handoff §24): one home = one project license, purchased
 * once — mode "payment", never "subscription". Prices ride inline as
 * price_data from the catalog, so the dashboard needs no product setup at
 * all: an API key and a webhook are the entire Stripe configuration.
 */

import { createHmac, timingSafeEqual } from "crypto";

import { addonInfo, formatCents, tierInfo, type LicenseTier } from "../../catalog/licenses";
import type { Db } from "../db";
import { addCredits, getLicense, grantLicense } from "../licenses";

export interface StripeEnv {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
}

export const STRIPE_UNCONFIGURED =
  "Web payments are not configured on this deployment — set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET, then redeploy. Nothing was charged.";

export function stripeConfigured(env: StripeEnv): boolean {
  return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);
}

export type FetchLike = (url: string, init: RequestInit) => Promise<{ status: number; json(): Promise<unknown> }>;

async function createPaymentSession(
  env: StripeEnv,
  fetchFn: FetchLike,
  opts: {
    email: string;
    productName: string;
    amountCents: number;
    successUrl: string;
    cancelUrl: string;
    metadata: Record<string, string>;
  },
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!stripeConfigured(env)) return { ok: false, error: STRIPE_UNCONFIGURED };
  const body = new URLSearchParams({
    mode: "payment",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][product_data][name]": opts.productName,
    "line_items[0][price_data][unit_amount]": String(opts.amountCents),
    "line_items[0][quantity]": "1",
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    customer_email: opts.email,
  });
  for (const [k, v] of Object.entries(opts.metadata)) body.set(`metadata[${k}]`, v);
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
 * One-time checkout for a project license. The user and project ids ride
 * in metadata so the webhook can attach the license to the right project
 * without trusting the client at grant time.
 */
export async function createLicenseCheckout(
  env: StripeEnv,
  fetchFn: FetchLike,
  opts: { userId: string; email: string; projectId: string; tier: LicenseTier; successUrl: string; cancelUrl: string },
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const info = tierInfo(opts.tier);
  if (!info) return { ok: false, error: `Unknown license tier: ${opts.tier}` };
  return createPaymentSession(env, fetchFn, {
    email: opts.email,
    productName: `${info.label} — project license (${formatCents(info.priceCents)}, one-time)`,
    amountCents: info.priceCents,
    successUrl: opts.successUrl,
    cancelUrl: opts.cancelUrl,
    metadata: { kind: "license", userId: opts.userId, projectId: opts.projectId, tier: opts.tier },
  });
}

/** One-time checkout for a usage add-on pack on an already-licensed project. */
export async function createAddonCheckout(
  env: StripeEnv,
  fetchFn: FetchLike,
  opts: { userId: string; email: string; projectId: string; addon: string; successUrl: string; cancelUrl: string },
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const info = addonInfo(opts.addon);
  if (!info) return { ok: false, error: `Unknown add-on: ${opts.addon}` };
  return createPaymentSession(env, fetchFn, {
    email: opts.email,
    productName: `BuildSphere — ${info.label}`,
    amountCents: info.priceCents,
    successUrl: opts.successUrl,
    cancelUrl: opts.cancelUrl,
    metadata: { kind: "addon", userId: opts.userId, projectId: opts.projectId, addon: info.key },
  });
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
 * Apply a verified webhook event. Completed license checkouts grant (or
 * upgrade) the project's license; completed add-on checkouts append the
 * pack's credits. Unknown event types are acknowledged and ignored —
 * Stripe sends many.
 */
export async function handleStripeEvent(db: Db, event: unknown): Promise<{ handled: string }> {
  const e = (event ?? {}) as { type?: string; data?: { object?: Record<string, unknown> } };
  if (e.type !== "checkout.session.completed") return { handled: `ignored: ${e.type ?? "unknown"}` };

  const obj = e.data?.object ?? {};
  const metadata = (obj.metadata ?? {}) as Record<string, unknown>;
  const userId = String(metadata.userId ?? "");
  const projectId = String(metadata.projectId ?? "");
  if (!userId || !projectId) return { handled: "ignored: completed session without user/project metadata" };

  if (metadata.kind === "license") {
    const tier = tierInfo(String(metadata.tier ?? ""));
    if (!tier) return { handled: `ignored: completed session with unknown tier ${String(metadata.tier)}` };
    await grantLicense(db, { userId, projectId, tier: tier.key, source: "stripe" });
    return { handled: `licensed ${projectId} as ${tier.key}` };
  }

  if (metadata.kind === "addon") {
    const addon = addonInfo(String(metadata.addon ?? ""));
    if (!addon) return { handled: `ignored: completed session with unknown addon ${String(metadata.addon)}` };
    const license = await getLicense(db, userId, projectId);
    if (!license) return { handled: `ignored: addon for unlicensed project ${projectId}` };
    await addCredits(db, license.id, addon.grants.kind, addon.grants.amount, addon.label);
    return { handled: `credited ${addon.grants.amount} ${addon.grants.kind} to ${projectId}` };
  }

  return { handled: "ignored: completed session without a known kind" };
}
