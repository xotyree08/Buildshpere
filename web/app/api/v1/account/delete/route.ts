import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { SESSION_COOKIE } from "@/lib/server/auth";
import { isResponse, requireDb, requireUser } from "@/lib/server/http";
import { deleteAccount } from "@/lib/server/privacy";

/** The §11.2 deletion right — password re-check per §3.1 (high-risk reauth). */
export async function POST(req: Request) {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;

  let body: { password?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof body.password !== "string") {
    return NextResponse.json({ error: "password is required to delete the account." }, { status: 422 });
  }

  const result = await deleteAccount(db, user, body.password);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 403 });
  (await cookies()).delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
