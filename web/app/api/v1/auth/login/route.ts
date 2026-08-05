import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/server/audit";
import { loginThrottled, THROTTLE_MESSAGE } from "@/lib/server/privacy";
import { authenticate, createSession, SESSION_DAYS } from "@/lib/server/auth";
import { isResponse, requireDb, setSessionCookie } from "@/lib/server/http";

export async function POST(req: Request) {
  const db = await requireDb();
  if (isResponse(db)) return db;

  let body: { email?: string; password?: string };
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

  const token = await createSession(db, user.id);
  await setSessionCookie(token, SESSION_DAYS * 24 * 60 * 60);
  await recordAudit(db, user.id, "auth.login");
  return NextResponse.json({ user });
}
