import { beforeEach, describe, expect, it } from "vitest";

import { clientKey, rateLimit, resetRateLimits } from "./ratelimit";

beforeEach(() => resetRateLimits());

describe("AI route rate limiting", () => {
  it("allows up to the cap in a window, then refuses with a retry hint", () => {
    const t0 = 1_700_000_000_000;
    for (let i = 0; i < 5; i++) {
      expect(rateLimit("k", 5, 60_000, t0 + i * 1000).allowed).toBe(true);
    }
    const refused = rateLimit("k", 5, 60_000, t0 + 5000);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
    expect(refused.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("the window slides: old requests age out and capacity returns", () => {
    const t0 = 1_700_000_000_000;
    for (let i = 0; i < 5; i++) rateLimit("k", 5, 60_000, t0 + i);
    expect(rateLimit("k", 5, 60_000, t0 + 10_000).allowed).toBe(false);
    expect(rateLimit("k", 5, 60_000, t0 + 61_000).allowed).toBe(true);
  });

  it("keys are independent — one abuser never starves another client", () => {
    const t0 = 1_700_000_000_000;
    for (let i = 0; i < 50; i++) rateLimit("abuser", 5, 60_000, t0 + i);
    expect(rateLimit("innocent", 5, 60_000, t0 + 100).allowed).toBe(true);
  });

  it("clientKey prefers the first forwarded hop and scopes by route", () => {
    const req = new Request("https://x.test", {
      headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
    });
    expect(clientKey(req, "analyze")).toBe("analyze:203.0.113.7");
    const bare = new Request("https://x.test");
    expect(clientKey(bare, "style")).toBe("style:unknown");
  });
});
