import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/server/audit";
import { isResponse, requireDb, requireUser } from "@/lib/server/http";
import { deleteIssue, resolveIssue } from "@/lib/server/markup";

type Ctx = { params: Promise<{ issueId: string }> };

/** Resolve an issue. */
export async function POST(_req: Request, ctx: Ctx) {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;
  const { issueId } = await ctx.params;

  const result = await resolveIssue(db, user.id, issueId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
  await recordAudit(db, user.id, "markup.resolved", issueId);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;
  const { issueId } = await ctx.params;

  const result = await deleteIssue(db, user.id, issueId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
  await recordAudit(db, user.id, "markup.deleted", issueId);
  return NextResponse.json({ ok: true });
}
