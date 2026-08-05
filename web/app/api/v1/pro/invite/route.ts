import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/server/audit";
import { isResponse, requireDb, requireUser } from "@/lib/server/http";
import { createReviewInvite } from "@/lib/server/pros";

/** Owner mints a single-use invite link for THEIR professional (rotates any unused one). */
export async function POST(req: Request) {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;

  let body: { projectId?: string; projectName?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof body.projectId !== "string" || typeof body.projectName !== "string" || !body.projectId) {
    return NextResponse.json({ error: "projectId and projectName are required." }, { status: 422 });
  }

  const result = await createReviewInvite(db, user, body.projectId, body.projectName.slice(0, 200));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  await recordAudit(db, user.id, "pro.invite_created", body.projectId);
  return NextResponse.json({ token: result.token });
}
