import { NextResponse } from "next/server";

import { isResponse, requireDb, requireUser } from "@/lib/server/http";
import { recordAudit } from "@/lib/server/audit";
import { getProfile } from "@/lib/server/pros";
import { actOnReview, type ReviewAction } from "@/lib/server/reviews";

const ACTIONS: ReviewAction[] = ["claim", "approve", "request_changes"];

export async function POST(req: Request) {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;

  let body: { reviewId?: string; action?: string; note?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof body.reviewId !== "string" || !ACTIONS.includes(body.action as ReviewAction)) {
    return NextResponse.json({ error: "reviewId and a valid action are required." }, { status: 422 });
  }

  // Onboarding completes before authority: approvals and change requests
  // are recorded with credentials, so a profile must exist first.
  if (body.action !== "claim" && !(await getProfile(db, user.id))) {
    return NextResponse.json(
      { error: "Complete your professional profile (name, discipline, license) before acting on a review." },
      { status: 409 },
    );
  }
  const result = await actOnReview(db, user, body.reviewId, body.action as ReviewAction, body.note);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 403 });
  await recordAudit(db, user.id, `review.${body.action}`, result.review.projectId);
  return NextResponse.json({ review: result.review });
}
