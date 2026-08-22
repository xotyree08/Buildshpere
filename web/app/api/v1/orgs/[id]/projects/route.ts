import { NextResponse } from "next/server";

import { isResponse, requireDb, requireUser } from "@/lib/server/http";
import { listOrgProjects } from "@/lib/server/orgs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;
  const { id } = await ctx.params;

  const result = await listOrgProjects(db, user.id, id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 403 });
  return NextResponse.json({ projects: result.value });
}
