import { NextResponse } from "next/server";

import { isResponse, requireDb, requireUser } from "@/lib/server/http";
import { recordAudit } from "@/lib/server/audit";
import { notify } from "@/lib/server/notifications";
import { listOpenReviews, listReviewsForOwner, requestReview } from "@/lib/server/reviews";

/** Owner: their reviews. Professional: the open queue plus their claims. */
export async function GET() {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;

  const reviews =
    user.role === "professional" ? await listOpenReviews(db, user.id) : await listReviewsForOwner(db, user.id);
  return NextResponse.json({ role: user.role, reviews });
}

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

  const result = await requestReview(db, user, body.projectId, body.projectName.slice(0, 200));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  await recordAudit(db, user.id, "review.requested", body.projectId);
  // Tell the professional who already holds this review that it's back.
  if (result.review.professionalId && result.review.professionalId !== user.id) {
    await notify(db, result.review.professionalId, "review.rerequested", `"${result.review.projectName}" was revised and re-requested for review.`, result.review.projectId);
  }
  return NextResponse.json({ review: result.review });
}
