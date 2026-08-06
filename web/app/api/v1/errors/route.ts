import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import {
  ADMIN_UNCONFIGURED_MESSAGE,
  isAdminEmail,
  listErrors,
  recordError,
  sanitizeReport,
} from "@/lib/server/errors";
import { isResponse, requireDb, requireUser } from "@/lib/server/http";

/**
 * Client crash reports (LESSONS_LEARNED.md L3). Always logged to the
 * deployment's log stream; persisted to Postgres when configured so they
 * survive log rotation and are reviewable at /app/admin/errors. Reporting
 * never fails loudly back to the crashing client.
 */
export async function POST(req: Request) {
  try {
    const report = sanitizeReport(await req.json());
    console.error("[client-error]", { ...report, at: new Date().toISOString() });
    const db = await getDb();
    if (db) await recordError(db, report, req.headers.get("user-agent"));
  } catch {
    // Malformed report or storage failure — still acknowledge; the client
    // is already in trouble and must never enter a reporting crash loop.
  }
  return NextResponse.json({ ok: true });
}

/** Recent error reports, for admins only (ADMIN_EMAILS allowlist). */
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
  return NextResponse.json({ errors: await listErrors(db) });
}
