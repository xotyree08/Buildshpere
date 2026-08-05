import { NextResponse } from "next/server";

import { listAuditEvents } from "@/lib/server/audit";
import { isResponse, requireDb, requireUser } from "@/lib/server/http";

/** A user's own audit trail — read-only; there is no write/delete verb by design. */
export async function GET() {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;
  return NextResponse.json({ events: await listAuditEvents(db, user.id) });
}
