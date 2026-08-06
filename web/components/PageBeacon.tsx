"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Cookieless page counter. Sends only the pathname; the server collapses
 * it to a known bucket and stores (day, path, count). Browsers asking
 * not to be tracked aren't — even though nothing here could identify
 * them anyway.
 */
export function PageBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    if (typeof navigator !== "undefined" && navigator.doNotTrack === "1") return;
    const payload = JSON.stringify({ path: pathname });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/v1/metrics", new Blob([payload], { type: "application/json" }));
      } else {
        void fetch("/api/v1/metrics", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: payload,
          keepalive: true,
        }).catch(() => undefined);
      }
    } catch {
      // Counting must never break a page.
    }
  }, [pathname]);

  return null;
}
