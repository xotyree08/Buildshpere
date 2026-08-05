import { NextResponse } from "next/server";

import { isResponse, requireDb, requireUser } from "@/lib/server/http";
import { recordAudit } from "@/lib/server/audit";
import { createShareLink, hasShareLink, revokeShareLink } from "@/lib/server/shares";

/**
 * Owner-side share-link management. The public token lookup lives at
 * /api/v1/shared/[token] — this route never returns an existing token
 * (only its hash is stored; creating again rotates it).
 */

export async function GET(req: Request) {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;

  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId query parameter is required." }, { status: 422 });
  return NextResponse.json({ active: await hasShareLink(db, user.id, projectId) });
}

export async function POST(req: Request) {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;

  let body: { projectId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.projectId) return NextResponse.json({ error: "projectId is required." }, { status: 422 });

  const result = await createShareLink(db, user.id, body.projectId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  await recordAudit(db, user.id, "share.create", body.projectId);
  return NextResponse.json({ token: result.token });
}

export async function DELETE(req: Request) {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;

  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId query parameter is required." }, { status: 422 });
  await revokeShareLink(db, user.id, projectId);
  await recordAudit(db, user.id, "share.revoke", projectId);
  return NextResponse.json({ ok: true });
}
