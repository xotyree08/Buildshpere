import { NextResponse } from "next/server";

import { addonInfo, tierInfo } from "@/lib/catalog/licenses";
import { isResponse, requireDb, requireUser } from "@/lib/server/http";
import {
  createAddonCheckout,
  createLicenseCheckout,
  STRIPE_UNCONFIGURED,
  stripeConfigured,
  type StripeEnv,
} from "@/lib/server/payments/stripe";

const BASE = "https://onbuildsphere.com";

/**
 * Start a one-time purchase — a project license ({ projectId, tier }) or a
 * usage add-on ({ projectId, addon }) — and return the Stripe Checkout URL.
 * The grant itself happens only when the verified webhook confirms payment.
 */
export async function POST(req: Request) {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;

  const env = process.env as StripeEnv;
  if (!stripeConfigured(env)) {
    return NextResponse.json({ error: STRIPE_UNCONFIGURED }, { status: 503 });
  }

  let body: { projectId?: string; tier?: string; addon?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
  if (!projectId) {
    return NextResponse.json({ error: "projectId is required — licenses attach to one project." }, { status: 422 });
  }

  const back = `${BASE}/app/project/${encodeURIComponent(projectId)}`;
  const common = {
    userId: user.id,
    email: user.email,
    projectId,
    successUrl: `${back}?licensed=1`,
    cancelUrl: back,
  };

  if (body.tier !== undefined) {
    const tier = tierInfo(body.tier);
    if (!tier) return NextResponse.json({ error: "tier must be concept, design, complete, or buildplus." }, { status: 422 });
    const session = await createLicenseCheckout(env, fetch, { ...common, tier: tier.key });
    if (!session.ok) return NextResponse.json({ error: session.error }, { status: 502 });
    return NextResponse.json({ url: session.url });
  }

  if (body.addon !== undefined) {
    if (!addonInfo(body.addon)) {
      return NextResponse.json({ error: "Unknown add-on." }, { status: 422 });
    }
    const session = await createAddonCheckout(env, fetch, { ...common, addon: body.addon });
    if (!session.ok) return NextResponse.json({ error: session.error }, { status: 502 });
    return NextResponse.json({ url: session.url });
  }

  return NextResponse.json({ error: "Provide either a tier or an addon." }, { status: 422 });
}
