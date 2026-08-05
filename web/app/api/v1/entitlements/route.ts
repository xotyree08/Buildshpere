import { NextResponse } from "next/server";

import { isResponse, requireDb, requireUser } from "@/lib/server/http";
import { listEntitlements } from "@/lib/server/payments";

/** Read-only: what the server says this user owns. There is no write verb
 * here by design — entitlements are only written via validated receipts. */
export async function GET() {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;
  return NextResponse.json({ entitlements: await listEntitlements(db, user.id) });
}
