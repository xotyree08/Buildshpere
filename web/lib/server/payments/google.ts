/**
 * Google Play Billing validation. Authenticates as the Play service account
 * (RS256-signed JWT → OAuth token) and reads the subscription purchase for
 * the client's purchase token. fetch is injectable for unit testing; the
 * JWT signing uses Node crypto only.
 */

import { createSign } from "crypto";

import type { FetchLike, ValidationResult } from "./apple";

export interface GoogleServiceAccount {
  client_email: string;
  private_key: string;
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/androidpublisher";

function b64url(data: string | Buffer): string {
  return Buffer.from(data).toString("base64url");
}

export function buildServiceJwt(account: GoogleServiceAccount, nowSeconds: number): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: account.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(account.private_key).toString("base64url");
  return `${header}.${claims}.${signature}`;
}

interface SubscriptionPurchase {
  paymentState?: number;
  expiryTimeMillis?: string;
}

export async function validateGooglePurchase(
  opts: {
    account: GoogleServiceAccount;
    packageName: string;
    productId: string;
    purchaseToken: string;
    now: number;
  },
  fetchFn: FetchLike,
): Promise<ValidationResult> {
  try {
    const tokenRes = await fetchFn(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: buildServiceJwt(opts.account, Math.floor(opts.now / 1000)),
      }).toString(),
    });
    const token = (await tokenRes.json()) as { access_token?: string };
    if (!token.access_token) {
      return { ok: false, error: "Google rejected the service-account credentials. Nothing was unlocked." };
    }

    const url =
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
      `${encodeURIComponent(opts.packageName)}/purchases/subscriptions/` +
      `${encodeURIComponent(opts.productId)}/tokens/${encodeURIComponent(opts.purchaseToken)}`;
    const res = await fetchFn(url, {
      method: "GET",
      headers: { authorization: `Bearer ${token.access_token}` },
      body: "",
    });
    const purchase = (await res.json()) as SubscriptionPurchase & { error?: { message?: string } };
    if (purchase.error) {
      return { ok: false, error: `Google rejected the purchase token (${purchase.error.message ?? "unknown"}). Nothing was unlocked.` };
    }
    if (purchase.expiryTimeMillis && Number(purchase.expiryTimeMillis) < opts.now) {
      return { ok: false, error: "This subscription has expired — renew it in Google Play." };
    }
    // paymentState 1 = received, 2 = free trial; 0 = still pending.
    if (purchase.paymentState === 0) {
      return { ok: false, error: "Google reports payment still pending — it will confirm shortly; use Restore then." };
    }
    return { ok: true, productId: opts.productId };
  } catch {
    return { ok: false, error: "Google Play's API is unreachable — try again shortly. Nothing was unlocked." };
  }
}
