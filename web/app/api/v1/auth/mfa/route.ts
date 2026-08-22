import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/server/audit";
import { isResponse, requireDb, requireUser } from "@/lib/server/http";
import {
  beginEnrolment,
  confirmEnrolment,
  disableMfa,
  isMfaEnabled,
  unusedRecoveryCount,
} from "@/lib/server/mfa";

/** Whether it is on, and how many recovery codes are left. */
export async function GET() {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;
  const enabled = await isMfaEnabled(db, user.id);
  return NextResponse.json({
    enabled,
    recoveryCodesRemaining: enabled ? await unusedRecoveryCount(db, user.id) : 0,
  });
}

/**
 * Start enrolment, or finish it with a code.
 *
 * The secret is returned once, on the start call, because the user has to be
 * able to type it when a camera will not read the QR.
 */
export async function POST(req: Request) {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;

  let body: { code?: unknown };
  try {
    body = (await req.json().catch(() => ({}))) as { code?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body.code !== "string") {
    if (await isMfaEnabled(db, user.id)) {
      return NextResponse.json({ error: "Two-factor authentication is already on." }, { status: 409 });
    }
    const started = await beginEnrolment(db, user.id, user.email);
    await recordAudit(db, user.id, "auth.mfa_enrolment_started");
    return NextResponse.json({ secret: started.secret, otpauthUrl: started.url });
  }

  const confirmed = await confirmEnrolment(db, user.id, body.code);
  if (!confirmed.ok) return NextResponse.json({ error: confirmed.error }, { status: 422 });
  await recordAudit(db, user.id, "auth.mfa_enabled");
  return NextResponse.json({ enabled: true, recoveryCodes: confirmed.value.recoveryCodes });
}

/** Turn it off — requires a code that still works. */
export async function DELETE(req: Request) {
  const db = await requireDb();
  if (isResponse(db)) return db;
  const user = await requireUser(db);
  if (isResponse(user)) return user;

  let body: { code?: unknown };
  try {
    body = (await req.json()) as { code?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof body.code !== "string") {
    return NextResponse.json({ error: "code is required." }, { status: 422 });
  }

  const result = await disableMfa(db, user.id, body.code);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
  await recordAudit(db, user.id, "auth.mfa_disabled");
  return NextResponse.json({ enabled: false });
}
