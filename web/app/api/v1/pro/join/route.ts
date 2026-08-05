import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/server/audit";
import { isResponse, requireDb, requireUser } from "@/lib/server/http";
import { acceptReviewInvite } from "@/lib/server/pros";

/** A signed-in user accepts an invite: becomes a professional and claims the review. */
export async function POST(req: Request) {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;

  let body: { token?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof body.token !== "string") return NextResponse.json({ error: "token is required." }, { status: 422 });

  const result = await acceptReviewInvite(db, user, body.token);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  await recordAudit(db, user.id, "pro.invite_accepted", result.review.projectId);
  return NextResponse.json({ review: result.review });
}
