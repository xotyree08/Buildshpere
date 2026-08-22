import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/server/audit";
import { isResponse, requireDb, requireUser } from "@/lib/server/http";
import { listOpenRequests, openRequest } from "@/lib/server/marketplace";

/** Open requests this professional may bid on. */
export async function GET() {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;
  return NextResponse.json({ requests: await listOpenRequests(db, user.id) });
}

export async function POST(req: Request) {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;

  let body: { projectId?: unknown; discipline?: unknown; scope?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof body.projectId !== "string" || typeof body.discipline !== "string" || typeof body.scope !== "string") {
    return NextResponse.json({ error: "projectId, discipline and scope are required." }, { status: 422 });
  }

  const opened = await openRequest(db, user.id, {
    projectId: body.projectId,
    discipline: body.discipline,
    scope: body.scope,
  });
  if (!opened.ok) return NextResponse.json({ error: opened.error }, { status: 422 });
  await recordAudit(db, user.id, "marketplace.request_opened", opened.value.id, opened.value.discipline);
  return NextResponse.json({ request: opened.value }, { status: 201 });
}
