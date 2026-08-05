import { NextResponse } from "next/server";

import { isResponse, requireDb, requireUser } from "@/lib/server/http";
import { listNotifications, markAllRead, unreadCount } from "@/lib/server/notifications";

export async function GET() {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;
  return NextResponse.json({
    notifications: await listNotifications(db, user.id),
    unread: await unreadCount(db, user.id),
  });
}

/** Mark everything read — the only write, scoped to the caller (L1). */
export async function POST() {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;
  await markAllRead(db, user.id);
  return NextResponse.json({ ok: true });
}
