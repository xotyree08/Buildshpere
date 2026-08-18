/**
 * Project licenses: the server-held record of what each PROJECT is entitled
 * to (handoff §42–43 — entitlement is per project, never a account-wide
 * unlimited flag). Same iron rule as store entitlements (L1): licenses and
 * credits are never client-writable — grants arrive only through the
 * verified Stripe webhook, consumption only through server features.
 *
 * Credits are a ledger: the tier's included allowance is written as positive
 * rows at grant time, add-on packs append more, and every use appends -1.
 * Remaining = sum(delta) — auditable by inspection, no counters to drift.
 */

import { randomUUID } from "crypto";

import { FREE_MAJOR_REVISIONS, tierInfo, WALKTHROUGH_SHOTS, type CreditKind, type LicenseTier } from "../catalog/licenses";
import type { Db } from "./db";

export interface ProjectLicense {
  id: string;
  projectId: string;
  tier: LicenseTier;
  status: string;
  purchasedAt: string;
  expiresAt: string | null;
  /** Remaining usable credits by kind (allowance + add-ons − consumed). */
  remaining: Partial<Record<CreditKind, number>>;
  /** What the tier originally included, for "5 of 7 remaining" displays. */
  allowances: Partial<Record<CreditKind, number>>;
}

export const LICENSE_REQUIRED_MESSAGE =
  "This feature needs a project license. Each home is licensed once — one price, no subscription. See onbuildsphere.com/pricing, or license the project from its page.";

export function creditExhaustedMessage(kind: CreditKind): string {
  // The reservation is plumbing, not a product — never point at an add-on
  // pack that cannot be bought.
  if (kind === "walkthrough_shot") {
    return "This walkthrough has already rendered every stop it paid for. Starting another tour uses one walkthrough credit.";
  }
  const names: Record<CreditKind, string> = {
    major_revision: "major revisions",
    premium_render: "premium renders",
    walkthrough: "walkthroughs",
    scene_360: "360° scenes",
    design_direction: "design directions",
    property_analysis: "property analyses",
    walkthrough_shot: "walkthrough stops",
  };
  return `This project has used all of its included ${names[kind]}. Add-on packs on the project page top it up — nothing is charged until you confirm on the checkout page.`;
}

/**
 * Grant (or upgrade) the one license a project can hold. Granting writes the
 * tier's included allowances into the credit ledger; upgrading a project that
 * already holds a license adds only the allowance DIFFERENCE per kind, so
 * credits already consumed stay consumed and nothing is double-granted.
 */
export async function grantLicense(
  db: Db,
  opts: { userId: string; projectId: string; tier: LicenseTier; source: string },
): Promise<{ licenseId: string }> {
  const info = tierInfo(opts.tier);
  if (!info) throw new Error(`Unknown license tier: ${opts.tier}`);
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = info.accessMonths
    ? new Date(now.getTime() + info.accessMonths * 30.44 * 24 * 3600 * 1000).toISOString()
    : null;

  const existing = await db.query(
    "select id, tier from project_licenses where project_id = $1 and user_id = $2",
    [opts.projectId, opts.userId],
  );
  if (existing.rows.length > 0) {
    const licenseId = String(existing.rows[0].id);
    const prior = tierInfo(String(existing.rows[0].tier));
    await db.query(
      "update project_licenses set tier = $1, status = 'active', source = $2, expires_at = $3 where id = $4",
      [opts.tier, opts.source, expiresAt, licenseId],
    );
    for (const [kind, amount] of Object.entries(info.allowances)) {
      const delta = amount - (prior?.allowances[kind as CreditKind] ?? 0);
      if (delta > 0) {
        await db.query(
          "insert into usage_credits (id, license_id, kind, delta, note, created_at) values ($1, $2, $3, $4, $5, $6)",
          [randomUUID(), licenseId, kind, delta, `upgrade to ${info.label}`, nowIso],
        );
      }
    }
    return { licenseId };
  }

  const licenseId = randomUUID();
  await db.query(
    `insert into project_licenses (id, user_id, project_id, tier, status, source, purchased_at, expires_at)
     values ($1, $2, $3, $4, 'active', $5, $6, $7)`,
    [licenseId, opts.userId, opts.projectId, opts.tier, opts.source, nowIso, expiresAt],
  );
  for (const [kind, amount] of Object.entries(info.allowances)) {
    await db.query(
      "insert into usage_credits (id, license_id, kind, delta, note, created_at) values ($1, $2, $3, $4, $5, $6)",
      [randomUUID(), licenseId, kind, amount, `included with ${info.label}`, nowIso],
    );
  }
  return { licenseId };
}

/** Add-on top-up — reached only from the verified webhook. */
export async function addCredits(
  db: Db,
  licenseId: string,
  kind: CreditKind,
  amount: number,
  note: string,
): Promise<void> {
  await db.query(
    "insert into usage_credits (id, license_id, kind, delta, note, created_at) values ($1, $2, $3, $4, $5, $6)",
    [randomUUID(), licenseId, kind, amount, note, new Date().toISOString()],
  );
}

async function remainingByKind(db: Db, licenseId: string): Promise<Partial<Record<CreditKind, number>>> {
  const res = await db.query(
    "select kind, sum(delta) as remaining from usage_credits where license_id = $1 group by kind",
    [licenseId],
  );
  const out: Partial<Record<CreditKind, number>> = {};
  for (const row of res.rows) out[String(row.kind) as CreditKind] = Number(row.remaining);
  return out;
}

function rowToLicense(row: Record<string, unknown>): Omit<ProjectLicense, "remaining" | "allowances"> {
  const expires = row.expires_at;
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    tier: String(row.tier) as LicenseTier,
    status: String(row.status),
    purchasedAt: new Date(String(row.purchased_at)).toISOString(),
    expiresAt: expires ? new Date(String(expires)).toISOString() : null,
  };
}

/** The license a user's project holds, with live balances; null if none. */
export async function getLicense(db: Db, userId: string, projectId: string): Promise<ProjectLicense | null> {
  const res = await db.query(
    "select * from project_licenses where project_id = $1 and user_id = $2",
    [projectId, userId],
  );
  if (res.rows.length === 0) return null;
  const base = rowToLicense(res.rows[0]);
  return {
    ...base,
    remaining: await remainingByKind(db, base.id),
    allowances: tierInfo(base.tier)?.allowances ?? {},
  };
}

/** All of a user's licenses with balances, newest purchase first. */
export async function listLicenses(db: Db, userId: string): Promise<ProjectLicense[]> {
  const res = await db.query(
    "select * from project_licenses where user_id = $1 order by purchased_at desc",
    [userId],
  );
  const out: ProjectLicense[] = [];
  for (const row of res.rows) {
    const base = rowToLicense(row);
    out.push({
      ...base,
      remaining: await remainingByKind(db, base.id),
      allowances: tierInfo(base.tier)?.allowances ?? {},
    });
  }
  return out;
}

/** Whether the project holds a usable (active, unexpired) license. */
export async function hasActiveLicense(db: Db, userId: string, projectId: string): Promise<boolean> {
  const license = await getLicense(db, userId, projectId);
  if (!license || license.status !== "active") return false;
  return !license.expiresAt || new Date(license.expiresAt).getTime() > Date.now();
}

/**
 * Spend one credit of a kind. Refuses with a specific reason when the
 * project is unlicensed, expired, or out of that credit — callers surface
 * the message verbatim (L2: no silent failure, no silent grant).
 */
export async function consumeCredit(
  db: Db,
  userId: string,
  projectId: string,
  kind: CreditKind,
  note?: string,
): Promise<{ ok: true; remaining: number } | { ok: false; error: string }> {
  const license = await getLicense(db, userId, projectId);
  if (!license || license.status !== "active") return { ok: false, error: LICENSE_REQUIRED_MESSAGE };
  if (license.expiresAt && new Date(license.expiresAt).getTime() <= Date.now()) {
    return { ok: false, error: "This project's Build+ access window has ended — contact support to extend it." };
  }
  const remaining = license.remaining[kind] ?? 0;
  if (remaining <= 0) return { ok: false, error: creditExhaustedMessage(kind) };
  await db.query(
    "insert into usage_credits (id, license_id, kind, delta, note, created_at) values ($1, $2, $3, -1, $4, $5)",
    [randomUUID(), license.id, kind, note ?? "used", new Date().toISOString()],
  );
  return { ok: true, remaining: remaining - 1 };
}

/**
 * Spend one walkthrough entitlement and reserve the stops it pays for.
 *
 * A photoreal tour is many image renders; they cannot all finish inside one
 * request, so the customer-visible credit is charged once here and each stop
 * later draws down the reservation. The refund path is deliberately whole:
 * if the tour cannot start, the walkthrough credit goes back untouched.
 */
export async function reserveWalkthrough(
  db: Db,
  userId: string,
  projectId: string,
  shots: number = WALKTHROUGH_SHOTS,
): Promise<{ ok: true; shots: number; remaining: number } | { ok: false; error: string }> {
  const spend = await consumeCredit(db, userId, projectId, "walkthrough", "photoreal walkthrough");
  if (!spend.ok) return spend;

  const license = await getLicense(db, userId, projectId);
  if (!license) {
    // Unreachable in practice — consumeCredit just proved the license exists —
    // but returning the credit beats leaving it spent on a tour that never ran.
    return { ok: false, error: LICENSE_REQUIRED_MESSAGE };
  }
  await addCredits(db, license.id, "walkthrough_shot", shots, "walkthrough reservation");
  return { ok: true, shots, remaining: spend.remaining };
}

/**
 * Major revisions included before a project is licensed.
 *
 * Without this, not paying bought MORE freedom than paying: an unlicensed
 * project could restructure a home forever while a Complete customer got
 * seven rounds. A product where licensing takes something away is a product
 * people are right not to trust, so the free tier is bounded too — at the
 * cheapest tier's allowance, never below it.
 *
 * Buying does not consume this counter or inherit from it. The license
 * ledger is separate, so a purchase always hands over its tier's full
 * allowance no matter how much free exploring came first.
 */
export async function consumeFreeRevision(
  db: Db,
  userId: string,
  projectId: string,
): Promise<{ ok: true; remaining: number } | { ok: false; error: string }> {
  const res = await db.query(
    "select used from free_usage where user_id = $1 and project_id = $2 and kind = 'major_revision'",
    [userId, projectId],
  );
  const used = Number(res.rows[0]?.used ?? 0);
  if (used >= FREE_MAJOR_REVISIONS) {
    return {
      ok: false,
      error:
        `This project has used its ${FREE_MAJOR_REVISIONS} free major revisions. ` +
        `Minor changes — finishes, fixtures, furniture, and small adjustments — stay free and unlimited. ` +
        `Licensing this project starts its included revision rounds fresh: see onbuildsphere.com/pricing.`,
    };
  }

  const now = new Date().toISOString();
  await db.query(
    `insert into free_usage (user_id, project_id, kind, used, updated_at)
     values ($1, $2, 'major_revision', 1, $3)
     on conflict (user_id, project_id, kind) do update set
       used = free_usage.used + 1, updated_at = excluded.updated_at`,
    [userId, projectId, now],
  );
  return { ok: true, remaining: FREE_MAJOR_REVISIONS - used - 1 };
}

/** How many free major revisions a project has left before licensing. */
export async function freeRevisionsRemaining(db: Db, userId: string, projectId: string): Promise<number> {
  const res = await db.query(
    "select used from free_usage where user_id = $1 and project_id = $2 and kind = 'major_revision'",
    [userId, projectId],
  );
  return Math.max(0, FREE_MAJOR_REVISIONS - Number(res.rows[0]?.used ?? 0));
}
