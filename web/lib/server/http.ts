import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getSessionUser, SESSION_COOKIE, type AuthUser } from "./auth";
import { DB_UNCONFIGURED_MESSAGE, getDb, type Db } from "./db";

export async function requireDb(): Promise<Db | NextResponse> {
  const db = await getDb();
  if (!db) return NextResponse.json({ error: DB_UNCONFIGURED_MESSAGE }, { status: 503 });
  return db;
}

export async function requireUser(db: Db): Promise<AuthUser | NextResponse> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value ?? "";
  const user = await getSessionUser(db, token);
  if (!user) return NextResponse.json({ error: "Sign in to sync projects." }, { status: 401 });
  return user;
}

export async function setSessionCookie(token: string, maxAgeSeconds: number): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

export function isResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}
