import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/server/audit";
import { isResponse, requireDb, requireUser } from "@/lib/server/http";
import { createOrg, listOrgs } from "@/lib/server/orgs";

export async function GET() {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;
  return NextResponse.json({ organizations: await listOrgs(db, user.id) });
}

export async function POST(req: Request) {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;

  let body: { name?: unknown };
  try {
    body = (await req.json()) as { name?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof body.name !== "string") {
    return NextResponse.json({ error: "name is required." }, { status: 422 });
  }

  const created = await createOrg(db, user.id, body.name);
  if (!created.ok) return NextResponse.json({ error: created.error }, { status: 422 });
  await recordAudit(db, user.id, "org.created", created.value.id, created.value.name);
  return NextResponse.json({ organization: created.value }, { status: 201 });
}
