import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import { ADMIN_UNCONFIGURED_MESSAGE, isAdminEmail } from "@/lib/server/errors";
import { isResponse, requireDb, requireUser } from "@/lib/server/http";
import { dayOf, listMetrics, normalizePath, recordHit } from "@/lib/server/metrics";
import { clientKey, rateLimit } from "@/lib/server/ratelimit";

/**
 * Page-view beacon. Stores exactly (day, path, count) — no cookies, no
 * IPs, no identifiers — the shape the privacy policy promises. Never
 * fails loudly back to the page; a lost count is a lost count.
 */
export async function POST(req: Request) {
  // Generous cap: real browsing never hits it, a junk loop does.
  if (!rateLimit(clientKey(req, "metrics"), 120, 10 * 60_000).allowed) {
    return NextResponse.json({ ok: true });
  }
  try {
    const body = (await req.json()) as { path?: string };
    const path = normalizePath(body.path);
    if (path) {
      const db = await getDb();
      if (db) await recordHit(db, path);
    }
  } catch {
    // Malformed or storage-less — acknowledge anyway.
  }
  return NextResponse.json({ ok: true });
}

/** Last 30 days of counts, admins only. */
export async function GET() {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;
  if (!process.env.ADMIN_EMAILS) {
    return NextResponse.json({ error: ADMIN_UNCONFIGURED_MESSAGE }, { status: 503 });
  }
  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ error: "This page is for deployment admins." }, { status: 403 });
  }
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 30);
  return NextResponse.json({ metrics: await listMetrics(db, dayOf(since)) });
}
