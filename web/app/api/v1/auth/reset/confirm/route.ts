import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/server/audit";
import { resetPassword } from "@/lib/server/auth";
import { isResponse, requireDb } from "@/lib/server/http";

export async function POST(req: Request) {
  const db = await requireDb();
  if (isResponse(db)) return db;

  let body: { token?: string; password?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof body.token !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ error: "token and password are required." }, { status: 422 });
  }

  const result = await resetPassword(db, body.token, body.password);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  await recordAudit(db, result.userId, "auth.reset_completed");
  return NextResponse.json({ message: "Password updated — sign in with the new one. All other sessions were signed out." });
}
