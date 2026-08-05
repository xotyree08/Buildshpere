/**
 * Entitlements: the server-held record of what a user owns. The iron rule
 * from WHOLE's audit (LESSONS_LEARNED.md L1): entitlements are NEVER
 * client-writable — the only write path runs through store receipt
 * validation with Apple/Google. Unconfigured deployments refuse loudly with
 * the exact fix (L4) instead of granting or failing silently (L2).
 */

import { randomUUID } from "crypto";

import type { Db } from "../db";
import { validateAppleReceipt, type FetchLike, type ValidationResult } from "./apple";
import { validateGooglePurchase, type GoogleServiceAccount } from "./google";

export interface Entitlement {
  productId: string;
  platform: string;
  status: string;
}

export async function listEntitlements(db: Db, userId: string): Promise<Entitlement[]> {
  const res = await db.query(
    "select product_id, platform, status from entitlements where user_id = $1 order by product_id",
    [userId],
  );
  return res.rows.map((r) => ({
    productId: String(r.product_id),
    platform: String(r.platform),
    status: String(r.status),
  }));
}

/** Internal-only write path — reached exclusively via validated receipts. */
export async function recordEntitlement(
  db: Db,
  userId: string,
  productId: string,
  platform: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db.query(
    `insert into entitlements (id, user_id, product_id, platform, status, created_at, updated_at)
     values ($1, $2, $3, $4, 'active', $5, $5)
     on conflict (user_id, product_id) do update set
       status = 'active', platform = excluded.platform, updated_at = excluded.updated_at`,
    [randomUUID(), userId, productId, platform, now],
  );
}

export interface PaymentsEnv {
  APPLE_SHARED_SECRET?: string;
  GOOGLE_SERVICE_ACCOUNT_JSON?: string;
  ANDROID_PACKAGE_NAME?: string;
}

export const APPLE_UNCONFIGURED =
  "Apple purchases are not configured on this deployment — set APPLE_SHARED_SECRET (App Store Connect → App Information → Shared Secret) and redeploy. Nothing was unlocked; the purchase is safe with the store.";
export const GOOGLE_UNCONFIGURED =
  "Google Play purchases are not configured on this deployment — set GOOGLE_SERVICE_ACCOUNT_JSON and ANDROID_PACKAGE_NAME and redeploy. Nothing was unlocked; the purchase is safe with the store.";

export interface ValidateRequest {
  platform: "apple" | "google";
  productId: string;
  verificationData: string;
}

/**
 * The one road to an entitlement: validate with the store, then record.
 * Returns granted=false with a specific reason on every other path.
 */
export async function validateAndGrant(
  db: Db,
  userId: string,
  req: ValidateRequest,
  env: PaymentsEnv,
  fetchFn: FetchLike,
  now: number,
): Promise<{ granted: boolean; error?: string }> {
  let result: ValidationResult;

  if (req.platform === "apple") {
    if (!env.APPLE_SHARED_SECRET) return { granted: false, error: APPLE_UNCONFIGURED };
    result = await validateAppleReceipt(req.verificationData, env.APPLE_SHARED_SECRET, now, fetchFn);
  } else if (req.platform === "google") {
    if (!env.GOOGLE_SERVICE_ACCOUNT_JSON || !env.ANDROID_PACKAGE_NAME) {
      return { granted: false, error: GOOGLE_UNCONFIGURED };
    }
    let account: GoogleServiceAccount;
    try {
      account = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON) as GoogleServiceAccount;
    } catch {
      return { granted: false, error: "GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON — fix the deployment env." };
    }
    result = await validateGooglePurchase(
      {
        account,
        packageName: env.ANDROID_PACKAGE_NAME,
        productId: req.productId,
        purchaseToken: req.verificationData,
        now,
      },
      fetchFn,
    );
  } else {
    return { granted: false, error: "Unknown platform — expected 'apple' or 'google'." };
  }

  if (!result.ok) return { granted: false, error: result.error };

  // Apple names the product from the receipt; require it to match the claim
  // so a cheap product's receipt can't unlock an expensive one.
  if (req.platform === "apple" && result.productId !== req.productId) {
    return {
      granted: false,
      error: `The receipt is for ${result.productId}, not ${req.productId}. Nothing was unlocked.`,
    };
  }

  await recordEntitlement(db, userId, result.productId, req.platform);
  return { granted: true };
}
