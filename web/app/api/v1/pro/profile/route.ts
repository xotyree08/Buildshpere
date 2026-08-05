import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/server/audit";
import { isResponse, requireDb, requireUser } from "@/lib/server/http";
import { getProfile, saveProfile } from "@/lib/server/pros";

export async function GET() {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;
  return NextResponse.json({ profile: await getProfile(db, user.id) });
}

export async function PUT(req: Request) {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;
  if (user.role !== "professional") {
    return NextResponse.json({ error: "Professional access required — accept an invite or enter the access code first." }, { status: 403 });
  }

  let body: { fullName?: string; discipline?: string; licenseNumber?: string; licenseState?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const result = await saveProfile(db, user.id, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
  await recordAudit(db, user.id, "pro.profile_saved", null, `${result.profile.discipline} · ${result.profile.licenseState}`);
  return NextResponse.json({ profile: result.profile });
}
