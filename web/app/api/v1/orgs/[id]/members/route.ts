import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/server/audit";
import { isResponse, requireDb, requireUser } from "@/lib/server/http";
import { isOrgRole, listMembers, removeMember, roleOf, setMember } from "@/lib/server/orgs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;
  const { id } = await ctx.params;

  // Membership is not public: you see the roster only if you are on it.
  if ((await roleOf(db, id, user.id)) === null) {
    return NextResponse.json({ error: "You are not a member of that organization." }, { status: 403 });
  }
  return NextResponse.json({ members: await listMembers(db, id) });
}

export async function POST(req: Request, ctx: Ctx) {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;
  const { id } = await ctx.params;

  let body: { userId?: unknown; role?: unknown };
  try {
    body = (await req.json()) as { userId?: unknown; role?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof body.userId !== "string" || !isOrgRole(body.role)) {
    return NextResponse.json({ error: "userId and a valid role are required." }, { status: 422 });
  }

  const result = await setMember(db, user.id, id, body.userId, body.role);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 403 });
  await recordAudit(db, user.id, "org.member.set", id, `${body.userId} → ${body.role}`);
  return NextResponse.json({ member: result.value });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;
  const { id } = await ctx.params;

  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId is required." }, { status: 422 });

  const result = await removeMember(db, user.id, id, userId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 403 });
  await recordAudit(db, user.id, "org.member.removed", id, userId);
  return NextResponse.json({ ok: true });
}
