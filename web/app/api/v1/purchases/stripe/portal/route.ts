import { NextResponse } from "next/server";

import { isResponse, requireDb, requireUser } from "@/lib/server/http";
import { createPortalSession, type StripeEnv } from "@/lib/server/payments/stripe";

/** Manage/cancel a web subscription: returns a Stripe Billing Portal URL. */
export async function POST() {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;

  const session = await createPortalSession(process.env as StripeEnv, fetch, {
    email: user.email,
    returnUrl: "https://onbuildsphere.com/app/account",
  });
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: 502 });
  return NextResponse.json({ url: session.url });
}
