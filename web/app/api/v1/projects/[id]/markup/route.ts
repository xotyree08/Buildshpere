import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/server/audit";
import { isResponse, requireDb, requireUser } from "@/lib/server/http";
import { addIssue, isSheet, listIssues } from "@/lib/server/markup";

type Ctx = { params: Promise<{ id: string }> };

/**
 * `version` is the design version the caller is looking at, so the server can
 * say which pins still point at that drawing. Required, not defaulted: a
 * default would quietly report every issue as current.
 */
export async function GET(req: Request, ctx: Ctx) {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;
  const { id } = await ctx.params;

  const raw = new URL(req.url).searchParams.get("version");
  const version = Number(raw);
  if (raw === null || !Number.isInteger(version) || version < 0) {
    return NextResponse.json({ error: "version is required." }, { status: 422 });
  }

  const result = await listIssues(db, user.id, id, version);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 403 });
  return NextResponse.json({ issues: result.value });
}

export async function POST(req: Request, ctx: Ctx) {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;
  const { id } = await ctx.params;

  let body: { sheet?: unknown; version?: unknown; x?: unknown; y?: unknown; body?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (
    !isSheet(body.sheet) ||
    typeof body.version !== "number" ||
    typeof body.x !== "number" ||
    typeof body.y !== "number" ||
    typeof body.body !== "string"
  ) {
    return NextResponse.json(
      { error: "sheet, version, x, y and body are required." },
      { status: 422 },
    );
  }

  const added = await addIssue(db, user.id, {
    projectId: id,
    sheet: body.sheet,
    version: body.version,
    x: body.x,
    y: body.y,
    body: body.body,
  });
  if (!added.ok) return NextResponse.json({ error: added.error }, { status: 422 });
  await recordAudit(db, user.id, "markup.raised", id, added.value.sheet);
  return NextResponse.json({ issue: added.value }, { status: 201 });
}
