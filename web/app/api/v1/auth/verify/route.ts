import { NextResponse } from "next/server";

import { verifyEmail } from "@/lib/server/auth";
import { recordAudit } from "@/lib/server/audit";
import { isResponse, requireDb } from "@/lib/server/http";

const ACCOUNT = "https://onbuildsphere.com/app/account";

/** The link in the verification email lands here and bounces to the account page. */
export async function GET(req: Request) {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const result = await verifyEmail(db, token);
  if (!result.ok) {
    return NextResponse.redirect(`${ACCOUNT}?verify_error=${encodeURIComponent(result.error)}`);
  }
  await recordAudit(db, result.userId, "auth.email_verified");
  return NextResponse.redirect(`${ACCOUNT}?verified=1`);
}
