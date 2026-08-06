import { NextResponse } from "next/server";

import { isResponse, requireDb, requireUser } from "@/lib/server/http";
import {
  createCheckoutSession,
  STRIPE_UNCONFIGURED,
  stripeConfigured,
  type StripeEnv,
  type StripePlan,
} from "@/lib/server/payments/stripe";

const BASE = "https://onbuildsphere.com";

/** Start a web subscription: returns the Stripe Checkout URL to redirect to. */
export async function POST(req: Request) {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;

  const env = process.env as StripeEnv;
  if (!stripeConfigured(env)) {
    return NextResponse.json({ error: STRIPE_UNCONFIGURED }, { status: 503 });
  }

  let plan: StripePlan;
  try {
    const body = (await req.json()) as { plan?: string };
    if (body.plan !== "monthly" && body.plan !== "yearly") {
      return NextResponse.json({ error: "plan must be 'monthly' or 'yearly'." }, { status: 422 });
    }
    plan = body.plan;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const session = await createCheckoutSession(env, fetch, {
    userId: user.id,
    email: user.email,
    plan,
    successUrl: `${BASE}/app/account?upgraded=1`,
    cancelUrl: `${BASE}/app/account`,
  });
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: 502 });
  return NextResponse.json({ url: session.url });
}
