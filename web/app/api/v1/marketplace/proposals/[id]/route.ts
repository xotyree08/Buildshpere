import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/server/audit";
import { isResponse, requireDb, requireUser } from "@/lib/server/http";
import { acceptProposal, withdrawProposal } from "@/lib/server/marketplace";

type Ctx = { params: Promise<{ id: string }> };

/** Accept — owner only. Every other bid on the request is declined with it. */
export async function POST(_req: Request, ctx: Ctx) {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;
  const { id } = await ctx.params;

  const result = await acceptProposal(db, user.id, id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
  await recordAudit(db, user.id, "marketplace.proposal_accepted", id);
  return NextResponse.json({ ok: true });
}

/** Withdraw your own. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;
  const { id } = await ctx.params;

  const result = await withdrawProposal(db, user.id, id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
  await recordAudit(db, user.id, "marketplace.proposal_withdrawn", id);
  return NextResponse.json({ ok: true });
}
