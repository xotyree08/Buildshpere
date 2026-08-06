"use client";

import { useEffect } from "react";

/**
 * Window-level error capture (LESSONS_LEARNED.md L3): the global error
 * boundary only sees render crashes — event handlers, async code, and
 * rejected promises die silently without these listeners. Reports are
 * deduped and capped per page load so a render loop can't flood the API.
 */
const MAX_REPORTS_PER_LOAD = 5;

function reporter(): (kind: "window" | "promise", message: string, stack?: string) => void {
  const seen = new Set<string>();
  let sent = 0;
  return (kind, message, stack) => {
    const key = `${kind}:${message}`;
    if (seen.has(key) || sent >= MAX_REPORTS_PER_LOAD) return;
    seen.add(key);
    sent += 1;
    void fetch("/api/v1/errors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, message, stack: stack ?? null, url: window.location.pathname }),
    }).catch(() => {
      // Reporting must never cause its own crash loop.
    });
  };
}

export function ErrorReporter() {
  useEffect(() => {
    const report = reporter();
    const onError = (e: ErrorEvent) => {
      report("window", e.message || "unknown error", e.error instanceof Error ? e.error.stack : undefined);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      const message = reason instanceof Error ? reason.message : String(reason ?? "unhandled rejection");
      report("promise", message, reason instanceof Error ? reason.stack : undefined);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
