import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { deleteSession, SESSION_COOKIE } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";

export async function POST() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value ?? "";
  const db = await getDb();
  if (db && token) await deleteSession(db, token);
  jar.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
