import { NextResponse } from "next/server";

import { isResponse, requireDb } from "@/lib/server/http";
import { getSharedProject } from "@/lib/server/shares";

/** Public read-only project lookup — the capability token IS the authorization. */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const db = await requireDb();
  if (isResponse(db)) return db;

  const { token } = await ctx.params;
  const project = await getSharedProject(db, token);
  if (!project) {
    return NextResponse.json(
      { error: "This share link is invalid or was revoked by the owner." },
      { status: 404 },
    );
  }
  return NextResponse.json({ project });
}
