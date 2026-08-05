import { NextResponse } from "next/server";

import { isResponse, requireDb, requireUser } from "@/lib/server/http";
import { validateAndGrant, type ValidateRequest } from "@/lib/server/payments";
import type { FetchLike } from "@/lib/server/payments/apple";

/**
 * The only write path to entitlements (L1): the client sends the store's
 * verification payload; the server validates with Apple/Google and records
 * ownership. Every failure names its reason — nothing silent (L2).
 */
export async function POST(req: Request) {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;

  let body: Partial<ValidateRequest>;
  try {
    body = (await req.json()) as Partial<ValidateRequest>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (
    (body.platform !== "apple" && body.platform !== "google") ||
    typeof body.productId !== "string" ||
    typeof body.verificationData !== "string" ||
    body.verificationData.length === 0
  ) {
    return NextResponse.json(
      { error: "platform ('apple'|'google'), productId, and verificationData are required." },
      { status: 422 },
    );
  }

  const outcome = await validateAndGrant(
    db,
    user.id,
    body as ValidateRequest,
    {
      APPLE_SHARED_SECRET: process.env.APPLE_SHARED_SECRET,
      GOOGLE_SERVICE_ACCOUNT_JSON: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
      ANDROID_PACKAGE_NAME: process.env.ANDROID_PACKAGE_NAME,
    },
    fetch as unknown as FetchLike,
    Date.now(),
  );
  if (!outcome.granted) {
    return NextResponse.json({ granted: false, error: outcome.error }, { status: 409 });
  }
  return NextResponse.json({ granted: true });
}
