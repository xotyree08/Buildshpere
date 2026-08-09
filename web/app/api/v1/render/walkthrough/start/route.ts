import { NextResponse } from "next/server";

import { WALKTHROUGH_SHOTS } from "@/lib/catalog/licenses";
import { getDb } from "@/lib/server/db";
import { isResponse, requireUser } from "@/lib/server/http";
import { LICENSE_REQUIRED_MESSAGE, reserveWalkthrough } from "@/lib/server/licenses";
import { PHOTOREAL_UNCONFIGURED } from "@/lib/server/photoreal";
import { clientKey, RATE_LIMITED_MESSAGE, rateLimit } from "@/lib/server/ratelimit";

/**
 * Begin a photoreal walkthrough: spend the project's `walkthrough` credit
 * once and reserve the stops it pays for. Each stop is then rendered by
 * /render/walkthrough/shot in its own request — a tour is far too many image
 * renders to finish inside one.
 */
export async function POST(req: Request) {
  const verdict = rateLimit(clientKey(req, "walkthrough-start"), 4, 10 * 60_000);
  if (!verdict.allowed) {
    return NextResponse.json(
      { error: RATE_LIMITED_MESSAGE },
      { status: 429, headers: { "retry-after": String(verdict.retryAfterSeconds) } },
    );
  }

  if (!process.env.REPLICATE_API_TOKEN) {
    return NextResponse.json({ error: PHOTOREAL_UNCONFIGURED }, { status: 503 });
  }

  let body: { projectId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // Without accounts configured (local development) there is nothing to meter;
  // the shot endpoint is equally unmetered, so the tour still runs.
  const db = await getDb();
  if (!db) return NextResponse.json({ shots: WALKTHROUGH_SHOTS });

  const user = await requireUser(db);
  if (isResponse(user)) return NextResponse.json({ error: LICENSE_REQUIRED_MESSAGE }, { status: 402 });

  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  const reserved = await reserveWalkthrough(db, user.id, projectId);
  if (!reserved.ok) return NextResponse.json({ error: reserved.error }, { status: 402 });

  return NextResponse.json({ shots: reserved.shots, remaining: reserved.remaining });
}
