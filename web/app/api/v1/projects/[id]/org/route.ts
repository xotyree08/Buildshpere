import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/server/audit";
import { isResponse, requireDb, requireUser } from "@/lib/server/http";
import { setProjectOrg } from "@/lib/server/orgs";

/** Attach a project to an organization, or detach it with orgId: null. */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;
  const { id } = await ctx.params;

  let body: { orgId?: unknown };
  try {
    body = (await req.json()) as { orgId?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (body.orgId !== null && typeof body.orgId !== "string") {
    return NextResponse.json({ error: "orgId must be a string, or null to detach." }, { status: 422 });
  }

  const result = await setProjectOrg(db, user.id, id, body.orgId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 403 });
  await recordAudit(db, user.id, body.orgId ? "project.org.attached" : "project.org.detached", id, body.orgId);
  return NextResponse.json({ ok: true });
}
