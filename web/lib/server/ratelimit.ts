/**
 * Rate limiting for the AI-backed routes (L1 cost discipline): they call
 * a paid model API and were reachable by anyone, signed in or not — an
 * open invitation to burn the deployment's API budget with a script.
 *
 * Sliding-window counters per key, in process memory. On serverless this
 * is per-instance, so the cap is approximate — but a scraper hammering
 * one URL lands on warm instances and hits the wall fast, which is the
 * attack that matters. Swap for a shared store when traffic justifies it.
 */

const buckets = new Map<string, number[]>();

/** Cap total tracked keys so an IP-rotation attack can't balloon memory. */
const MAX_KEYS = 10_000;

export interface RateVerdict {
  allowed: boolean;
  /** Seconds until the oldest counted request leaves the window. */
  retryAfterSeconds: number;
}

export function rateLimit(key: string, max: number, windowMs: number, now = Date.now()): RateVerdict {
  const cutoff = now - windowMs;
  const seen = (buckets.get(key) ?? []).filter((t) => t > cutoff);
  if (seen.length >= max) {
    buckets.set(key, seen);
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((seen[0] - cutoff) / 1000)) };
  }
  seen.push(now);
  if (!buckets.has(key) && buckets.size >= MAX_KEYS) buckets.clear();
  buckets.set(key, seen);
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Best-effort client identity behind the platform proxy. */
export function clientKey(req: Request, route: string): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || req.headers.get("x-real-ip") || "unknown";
  return `${route}:${ip}`;
}

export const RATE_LIMITED_MESSAGE =
  "Too many requests from your connection — wait a minute and try again. This protects the AI features for everyone.";

/** Reset all counters (tests only). */
export function resetRateLimits(): void {
  buckets.clear();
}
