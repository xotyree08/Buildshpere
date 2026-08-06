import { NextResponse } from "next/server";

import { isResponse, requireDb } from "@/lib/server/http";
import { handleStripeEvent, verifyStripeSignature } from "@/lib/server/payments/stripe";

/**
 * Stripe webhook — the ONLY write path for web entitlements (L1). The
 * signature proves the event came from Stripe; an unverified payload is
 * rejected before anything reads it.
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET is not set — configure it and redeploy." },
      { status: 503 },
    );
  }

  const payload = await req.text();
  if (!verifyStripeSignature(payload, req.headers.get("stripe-signature"), secret, Date.now())) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  const db = await requireDb();
  if (isResponse(db)) return db;

  try {
    const result = await handleStripeEvent(db, JSON.parse(payload));
    return NextResponse.json({ received: true, ...result });
  } catch {
    return NextResponse.json({ error: "Malformed event payload." }, { status: 400 });
  }
}
