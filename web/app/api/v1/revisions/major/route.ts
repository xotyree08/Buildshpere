import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import { isResponse, requireUser } from "@/lib/server/http";
import { consumeCredit, getLicense, LICENSE_REQUIRED_MESSAGE } from "@/lib/server/licenses";
import { clientKey, RATE_LIMITED_MESSAGE, rateLimit } from "@/lib/server/ratelimit";

/**
 * Spend one of the project's major-revision rounds.
 *
 * The design loop runs in the browser, so the client asks before applying a
 * change it has classified as major and only commits when this succeeds.
 * That ordering matters: a revision the customer wasn't entitled to must
 * never land, and a round must never be charged for a change that was then
 * refused by the engine.
 *
 * Minor changes never reach here — finishes, fixtures, furniture, and small
 * adjustments don't call this route at all, so they cost nothing by
 * construction rather than by a rule someone has to remember.
 *
 * Unlicensed and account-less projects are unmetered: a plan living only in
 * a browser has nothing to bill against, and the free tier stays free.
 */
export async function POST(req: Request) {
  const verdict = rateLimit(clientKey(req, "major-revision"), 30, 10 * 60_000);
  if (!verdict.allowed) {
    return NextResponse.json(
      { error: RATE_LIMITED_MESSAGE },
      { status: 429, headers: { "retry-after": String(verdict.retryAfterSeconds) } },
    );
  }

  let body: { projectId?: string; summary?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const db = await getDb();
  if (!db) return NextResponse.json({ metered: false });

  const user = await requireUser(db);
  // Signed out: the project is local-only, so there is nothing to charge.
  if (isResponse(user)) return NextResponse.json({ metered: false });

  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  const license = projectId ? await getLicense(db, user.id, projectId) : null;
  // An unlicensed project is still free to design — the license gates the
  // paid deliverables, not the act of changing your mind.
  if (!license) return NextResponse.json({ metered: false });

  const note = typeof body.summary === "string" ? body.summary.slice(0, 200) : "major revision";
  const spend = await consumeCredit(db, user.id, projectId, "major_revision", note);
  if (!spend.ok) return NextResponse.json({ error: spend.error }, { status: 402 });

  return NextResponse.json({ metered: true, remaining: spend.remaining });
}
