import { NextResponse } from "next/server";

import { createSession, createUser, SESSION_DAYS } from "@/lib/server/auth";
import { isResponse, requireDb, setSessionCookie } from "@/lib/server/http";

export async function POST(req: Request) {
  const db = await requireDb();
  if (isResponse(db)) return db;

  let body: { email?: string; password?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof body.email !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ error: "email and password are required." }, { status: 422 });
  }

  const result = await createUser(db, body.email, body.password);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });

  const token = await createSession(db, result.user.id);
  await setSessionCookie(token, SESSION_DAYS * 24 * 60 * 60);
  return NextResponse.json({ user: result.user });
}
