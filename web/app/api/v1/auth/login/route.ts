import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/server/audit";
import { loginThrottled, THROTTLE_MESSAGE } from "@/lib/server/privacy";
import { authenticate, createSession, SESSION_DAYS } from "@/lib/server/auth";
import { isMfaEnabled, verifySecondFactor } from "@/lib/server/mfa";
import { isResponse, requireDb, setSessionCookie } from "@/lib/server/http";

export async function POST(req: Request) {
  const db = await requireDb();
  if (isResponse(db)) return db;

  let body: { email?: string; password?: string; code?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof body.email !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ error: "email and password are required." }, { status: 422 });
  }

  if (await loginThrottled(db, body.email, Date.now())) {
    return NextResponse.json({ error: THROTTLE_MESSAGE }, { status: 429 });
  }

  const user = await authenticate(db, body.email, body.password);
  if (!user) {
    // Failed logins are auditable (spec 11.3) but keyed to no account, so
    // one person's attempts never appear in another user's trail.
    await recordAudit(db, "anon", "auth.login_failed", body.email.trim().toLowerCase());
    return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
  }

  // Second factor, when the account has one. The password is re-verified on
  // this same request rather than held in a pending challenge — one fewer
  // piece of half-authenticated state to get wrong, and no window in which a
  // challenge token is as good as a session.
  if (await isMfaEnabled(db, user.id)) {
    if (typeof body.code !== "string" || body.code.trim() === "") {
      // Not an error the user did anything about: tell the client to ask.
      return NextResponse.json({ mfaRequired: true }, { status: 401 });
    }
    if (!(await verifySecondFactor(db, user.id, body.code))) {
      await recordAudit(db, user.id, "auth.mfa_failed");
      return NextResponse.json(
        { mfaRequired: true, error: "That code is not right." },
        { status: 401 },
      );
    }
  }

  const token = await createSession(db, user.id);
  await setSessionCookie(token, SESSION_DAYS * 24 * 60 * 60);
  await recordAudit(db, user.id, "auth.login");
  return NextResponse.json({ user });
}
