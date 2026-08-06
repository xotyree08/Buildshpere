import { NextResponse } from "next/server";

import { createEmailVerification } from "@/lib/server/auth";
import { emailConfigured, sendEmail, type EmailEnv } from "@/lib/server/email";
import { isResponse, requireDb, requireUser } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/ratelimit";
import { verificationEmail } from "@/lib/server/verifymail";

export async function POST() {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;

  if (user.emailConfirmedAt) {
    return NextResponse.json({ ok: true, message: "This email is already verified." });
  }
  const env = process.env as EmailEnv;
  if (!emailConfigured(env)) {
    return NextResponse.json(
      { error: "Verification emails need an email provider — set RESEND_API_KEY and EMAIL_FROM, then redeploy." },
      { status: 503 },
    );
  }
  if (!rateLimit(`verify-resend:${user.id}`, 3, 10 * 60_000).allowed) {
    return NextResponse.json({ error: "A verification email was just sent — check your inbox and spam folder." }, { status: 429 });
  }
  const token = await createEmailVerification(db, user.id);
  const sent = await sendEmail(env, verificationEmail(user.email, token), fetch);
  if (!sent.ok) return NextResponse.json({ error: sent.error }, { status: 502 });
  return NextResponse.json({ ok: true, message: `Verification email sent to ${user.email}.` });
}
