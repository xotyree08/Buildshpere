"use client";

import { useEffect } from "react";

/**
 * Root error boundary (LESSONS_LEARNED.md L3): crashes are reported to
 * /api/v1/errors so the deployment logs see them — never silent, never
 * only a blank screen. Replaces nothing when a real error tracker lands;
 * it feeds one.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void fetch("/api/v1/errors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: error.message?.slice(0, 500) ?? "unknown",
        digest: error.digest ?? null,
        url: typeof window !== "undefined" ? window.location.pathname : null,
      }),
    }).catch(() => {
      // Reporting must never cause its own crash loop.
    });
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "3rem", maxWidth: 640, margin: "0 auto" }}>
        <h1>Something broke</h1>
        <p>
          The error has been reported. Your projects are stored in this browser and are not
          affected.
        </p>
        <button
          onClick={reset}
          style={{ padding: "0.6rem 1.2rem", borderRadius: 8, border: "1px solid currentColor", cursor: "pointer" }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
