import { NextResponse } from "next/server";

import { isResponse, requireDb, requireUser } from "@/lib/server/http";

export async function GET() {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;
  return NextResponse.json({ user });
}
