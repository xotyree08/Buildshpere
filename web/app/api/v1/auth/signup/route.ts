import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/server/audit";
import { createEmailVerification, createSession, createUser, SESSION_DAYS } from "@/lib/server/auth";
import { emailConfigured, sendEmail, type EmailEnv } from "@/lib/server/email";
import { isResponse, requireDb, setSessionCookie } from "@/lib/server/http";
import { verificationEmail } from "@/lib/server/verifymail";

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

  const result = await createUser(db, body.email, body.password);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });

  const token = await createSession(db, result.user.id);
  await setSessionCookie(token, SESSION_DAYS * 24 * 60 * 60);
  await recordAudit(db, result.user.id, "auth.signup");

  // Best-effort: a verification email when the provider is configured.
  // Signup never fails because an email couldn't be sent.
  const env = process.env as EmailEnv;
  if (emailConfigured(env)) {
    try {
      const verifyToken = await createEmailVerification(db, result.user.id);
      await sendEmail(env, verificationEmail(result.user.email, verifyToken), fetch);
    } catch {
      // The account page offers a resend.
    }
  }

  return NextResponse.json({ user: result.user });
}
