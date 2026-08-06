import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/server/audit";
import { createPasswordReset, RESET_TOKEN_MINUTES } from "@/lib/server/auth";
import { emailConfigured, EMAIL_UNCONFIGURED, sendEmail, type EmailEnv } from "@/lib/server/email";
import { isResponse, requireDb } from "@/lib/server/http";

/** Max reset requests per email per window — the audit trail is the counter. */
const RESET_MAX_PER_WINDOW = 3;
const RESET_WINDOW_MS = 15 * 60 * 1000;

const GENERIC_RESPONSE =
  "If that email has an account, a reset link is on its way. It expires in an hour.";

export async function POST(req: Request) {
  const db = await requireDb();
  if (isResponse(db)) return db;

  let body: { email?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof body.email !== "string" || !body.email.includes("@")) {
    return NextResponse.json({ error: "email is required." }, { status: 422 });
  }
  const email = body.email.trim().toLowerCase();

  // Config problems are loud (L4) — they're ours, not the requester's.
  const emailEnv = process.env as EmailEnv;
  if (!emailConfigured(emailEnv)) {
    return NextResponse.json({ error: EMAIL_UNCONFIGURED }, { status: 503 });
  }

  // Throttle per target email so the endpoint can't spam an inbox.
  const since = new Date(Date.now() - RESET_WINDOW_MS).toISOString();
  const recent = await db.query(
    "select count(*) as n from audit_events where event = 'auth.reset_requested' and subject = $1 and created_at > $2",
    [email, since],
  );
  if (Number(recent.rows[0]?.n ?? 0) >= RESET_MAX_PER_WINDOW) {
    return NextResponse.json(
      { error: "Too many reset requests for this email — wait 15 minutes and try again." },
      { status: 429 },
    );
  }

  const reset = await createPasswordReset(db, email);
  await recordAudit(db, reset?.userId ?? "anon", "auth.reset_requested", email);

  if (reset) {
    const origin = new URL(req.url).origin;
    const sent = await sendEmail(
      emailEnv,
      {
        to: email,
        subject: "Reset your BuildSphere password",
        text: `Someone (hopefully you) asked to reset the password for this BuildSphere account.\n\nReset it here within ${RESET_TOKEN_MINUTES} minutes:\n${origin}/reset?token=${reset.token}\n\nIf this wasn't you, ignore this email — your password is unchanged.`,
      },
      fetch,
    );
    // Provider failure is loud (L2): a swallowed error here means a
    // customer waiting forever for an email that never comes.
    if (!sent.ok) return NextResponse.json({ error: sent.error }, { status: 502 });
  }

  // Identical response whether or not the account exists (no enumeration).
  return NextResponse.json({ message: GENERIC_RESPONSE });
}
