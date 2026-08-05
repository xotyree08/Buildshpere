import { NextResponse } from "next/server";

import { setRole } from "@/lib/server/auth";
import { isResponse, requireDb, requireUser } from "@/lib/server/http";

/**
 * Professional access via a deployment-set code — the interim gate until
 * license verification ships with full Phase 2 (LESSONS_LEARNED.md L8:
 * we don't fake verification, we gate honestly and label it).
 */
export async function POST(req: Request) {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;

  const expected = process.env.PROFESSIONAL_ACCESS_CODE;
  if (!expected) {
    return NextResponse.json(
      { error: "Professional access is not enabled — set PROFESSIONAL_ACCESS_CODE in the deployment env." },
      { status: 503 },
    );
  }

  let body: { code?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (body.code !== expected) {
    return NextResponse.json({ error: "That access code is not valid." }, { status: 403 });
  }

  await setRole(db, user.id, "professional");
  return NextResponse.json({ ok: true, role: "professional" });
}
