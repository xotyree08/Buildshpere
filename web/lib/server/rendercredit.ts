/**
 * One billing path for every AI render.
 *
 * Each of these renders costs real money at the provider, so each draws down
 * the project's license. The order matters and is the same everywhere:
 * authorize → debit → render → refund if the render never happened. Debiting
 * first means a crash mid-render can only ever cost the customer nothing
 * extra; refunding on failure means it costs them nothing at all.
 *
 * Deployments without a database — local development — skip metering and
 * lean on the rate limiter alone. Production always has DATABASE_URL, so the
 * paid path is the one that runs for customers.
 */

import { NextResponse } from "next/server";

import type { CreditKind } from "../catalog/licenses";
import { getDb, type Db } from "./db";
import { isResponse, requireUser } from "./http";
import { addCredits, consumeCredit, getLicense, LICENSE_REQUIRED_MESSAGE } from "./licenses";

export interface RenderCharge {
  /** null when this deployment has no accounts configured. */
  db: Db | null;
  licenseId: string | null;
  /** Balance of the charged kind after the debit; null when unmetered. */
  remaining: number | null;
  kind: CreditKind;
}

/**
 * Authorize and debit one credit. Returns a NextResponse to send back
 * unchanged when the project is unlicensed, expired, or out of that credit —
 * the message already explains what to do about it.
 */
export async function chargeRender(
  projectId: string | undefined,
  kind: CreditKind,
  note: string,
): Promise<RenderCharge | NextResponse> {
  const db = await getDb();
  if (!db) return { db: null, licenseId: null, remaining: null, kind };

  const user = await requireUser(db);
  if (isResponse(user)) {
    return NextResponse.json({ error: LICENSE_REQUIRED_MESSAGE }, { status: 402 });
  }
  const id = typeof projectId === "string" ? projectId : "";
  const license = id ? await getLicense(db, user.id, id) : null;
  if (!license) return NextResponse.json({ error: LICENSE_REQUIRED_MESSAGE }, { status: 402 });

  const spend = await consumeCredit(db, user.id, id, kind, note);
  if (!spend.ok) return NextResponse.json({ error: spend.error }, { status: 402 });

  return { db, licenseId: license.id, remaining: spend.remaining, kind };
}

/** Hand a debited credit back after a render that never produced anything. */
export async function refundRender(charge: RenderCharge, why: string): Promise<void> {
  if (!charge.db || !charge.licenseId) return;
  await addCredits(charge.db, charge.licenseId, charge.kind, 1, `refund: ${why}`);
}

/** Only report a balance when one was actually metered. */
export function remainingField(charge: RenderCharge): { remaining?: number } {
  return charge.remaining === null ? {} : { remaining: charge.remaining };
}
