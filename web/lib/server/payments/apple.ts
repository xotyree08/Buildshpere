/**
 * App Store receipt validation (StoreKit). Talks to Apple's verifyReceipt
 * service with the app's shared secret; retries against the sandbox when
 * Apple answers 21007 (a sandbox receipt sent to production — exactly what
 * happens during App Review). fetch is injectable so the whole flow is
 * unit-tested against recorded response shapes.
 */

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ json(): Promise<unknown> }>;

export type ValidationResult =
  | { ok: true; productId: string }
  | { ok: false; error: string };

const PROD_URL = "https://buy.itunes.apple.com/verifyReceipt";
const SANDBOX_URL = "https://sandbox.itunes.apple.com/verifyReceipt";

interface AppleResponse {
  status: number;
  latest_receipt_info?: { product_id?: string; expires_date_ms?: string }[];
  receipt?: { in_app?: { product_id?: string; expires_date_ms?: string }[] };
}

function newestEntry(res: AppleResponse): { product_id?: string; expires_date_ms?: string } | null {
  const entries = res.latest_receipt_info ?? res.receipt?.in_app ?? [];
  if (entries.length === 0) return null;
  return entries.reduce((a, b) =>
    Number(b.expires_date_ms ?? 0) > Number(a.expires_date_ms ?? 0) ? b : a,
  );
}

export async function validateAppleReceipt(
  receiptData: string,
  sharedSecret: string,
  now: number,
  fetchFn: FetchLike,
): Promise<ValidationResult> {
  async function call(url: string): Promise<AppleResponse> {
    const res = await fetchFn(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ "receipt-data": receiptData, password: sharedSecret, "exclude-old-transactions": true }),
    });
    return (await res.json()) as AppleResponse;
  }

  let body: AppleResponse;
  try {
    body = await call(PROD_URL);
    if (body.status === 21007) body = await call(SANDBOX_URL);
  } catch {
    return { ok: false, error: "Apple's receipt service is unreachable — try again shortly. Nothing was unlocked." };
  }

  if (body.status !== 0) {
    return { ok: false, error: `Apple rejected the receipt (status ${body.status}). Nothing was unlocked.` };
  }
  const entry = newestEntry(body);
  if (!entry?.product_id) {
    return { ok: false, error: "The receipt contains no purchases. Nothing was unlocked." };
  }
  if (entry.expires_date_ms && Number(entry.expires_date_ms) < now) {
    return { ok: false, error: "This subscription has expired — renew it in the App Store." };
  }
  return { ok: true, productId: entry.product_id };
}
