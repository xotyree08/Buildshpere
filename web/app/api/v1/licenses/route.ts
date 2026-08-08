import { NextResponse } from "next/server";

import { isResponse, requireDb, requireUser } from "@/lib/server/http";
import { listLicenses } from "@/lib/server/licenses";

/** The signed-in user's project licenses with live credit balances. */
export async function GET() {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;
  return NextResponse.json({ licenses: await listLicenses(db, user.id) });
}
