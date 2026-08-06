"use client";

import { useEffect, useState } from "react";

/**
 * BuildSphere Plus on the web: shows what the account owns and starts a
 * Stripe Checkout. The server grants entitlements only from the verified
 * webhook — this card just opens the door and reports honestly when the
 * deployment has no payment configuration yet.
 */

interface Entitlement {
  productId: string;
  platform: string;
  status: string;
}

export function PlusCard() {
  const [owned, setOwned] = useState<Entitlement[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/v1/entitlements")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { entitlements: Entitlement[] } | null) => setOwned(data?.entitlements ?? []))
      .catch(() => setOwned([]));
  }, []);

  const active = (owned ?? []).find((e) => e.productId.startsWith("buildsphere_plus") && e.status === "active");

  async function portal() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/v1/purchases/stripe/portal", { method: "POST" });
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        setMessage(body.error ?? "The billing portal could not be opened.");
        return;
      }
      window.location.href = body.url;
    } catch {
      setMessage("Could not reach the server — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function checkout(plan: "monthly" | "yearly") {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/v1/purchases/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        setMessage(body.error ?? "Checkout could not be started.");
        return;
      }
      window.location.href = body.url;
    } catch {
      setMessage("Could not reach the server — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 520 }}>
      <h2 style={{ fontSize: "1rem", marginBottom: "0.25rem" }}>BuildSphere Plus</h2>
      {active ? (
        <>
          <p>
            Plus is <strong>active</strong> on this account ({active.platform}). Thank you for
            building with us.
          </p>
          {active.platform === "stripe" ? (
            <button className="btn secondary" disabled={busy} onClick={() => void portal()}>
              {busy ? "Working…" : "Manage or cancel"}
            </button>
          ) : (
            <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
              Manage or cancel through your {active.platform === "apple" ? "Apple" : "Google Play"}{" "}
              subscription settings.
            </p>
          )}
        </>
      ) : (
        <>
          <p style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
            Core design stays free, and this browser keeps unlimited local projects either way.
            Plus adds:
          </p>
          <ul style={{ fontSize: "0.9rem", color: "var(--muted)", margin: "0 0 0.75rem", paddingLeft: "1.2rem" }}>
            <li>Unlimited cloud-synced projects across your devices (free tier syncs 3)</li>
            <li>Every premium feature as it arrives, on web and in the mobile apps</li>
            <li>One subscription covers all platforms</li>
          </ul>
          <p style={{ display: "flex", gap: "0.75rem" }}>
            <button className="btn" disabled={busy || owned === null} onClick={() => void checkout("monthly")}>
              {busy ? "Working…" : "Plus monthly"}
            </button>
            <button className="btn secondary" disabled={busy || owned === null} onClick={() => void checkout("yearly")}>
              Plus yearly
            </button>
          </p>
          <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
            The exact price is shown on the secure checkout page before you confirm — nothing is
            charged on this page. Cancel anytime; paid time stays active.
          </p>
        </>
      )}
      {message && <p className="status-warn">{message}</p>}
    </div>
  );
}
