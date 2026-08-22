import { NextResponse } from "next/server";

import { isResponse, requireDb, requireUser } from "@/lib/server/http";
import { DIRECTORY_DISCLAIMER, searchProfessionals, setListed } from "@/lib/server/marketplace";

export async function GET(req: Request) {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const url = new URL(req.url);
  const professionals = await searchProfessionals(db, {
    discipline: url.searchParams.get("discipline") ?? undefined,
    state: url.searchParams.get("state") ?? undefined,
    query: url.searchParams.get("q") ?? undefined,
  });
  // Repeated at the envelope as well as per entry: a caller that renders a
  // heading has somewhere honest to put it.
  return NextResponse.json({ professionals, disclaimer: DIRECTORY_DISCLAIMER });
}

/** Opt in or out of the directory. */
export async function PUT(req: Request) {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;

  let body: { listed?: unknown };
  try {
    body = (await req.json()) as { listed?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof body.listed !== "boolean") {
    return NextResponse.json({ error: "listed must be true or false." }, { status: 422 });
  }

  const result = await setListed(db, user.id, body.listed);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
  return NextResponse.json({ listed: body.listed });
}
