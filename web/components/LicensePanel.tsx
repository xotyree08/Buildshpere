"use client";

import { useEffect, useState } from "react";

import { ADDONS, formatCents, TIERS, type CreditKind } from "@/lib/catalog/licenses";

/**
 * The project's license, on the project page: one home = one license.
 * Unlicensed projects see the four one-time tiers; licensed projects see
 * their remaining allowances and add-on top-ups. Purchases only open
 * Stripe Checkout — the grant itself arrives via the verified webhook.
 */

interface LicenseJson {
  projectId: string;
  tier: string;
  status: string;
  expiresAt: string | null;
  remaining: Partial<Record<CreditKind, number>>;
  allowances: Partial<Record<CreditKind, number>>;
}

const KIND_LABELS: Partial<Record<CreditKind, string>> = {
  major_revision: "Major revisions",
  premium_render: "Premium renders",
  walkthrough: "Walkthroughs",
  scene_360: "360° scenes",
  design_direction: "Design directions",
  property_analysis: "Property analyses",
};

const PANEL_ADDONS = ["renders10", "renders25", "walkthrough", "redesign"];

export function LicensePanel({ projectId, signedIn }: { projectId: string; signedIn: boolean }) {
  const [license, setLicense] = useState<LicenseJson | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn) {
      setLicense(null);
      return;
    }
    void fetch("/api/v1/licenses")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { licenses: LicenseJson[] } | null) => {
        setLicense(data?.licenses.find((l) => l.projectId === projectId) ?? null);
      })
      .catch(() => setLicense(null));
  }, [projectId, signedIn]);

  async function buy(body: { tier?: string; addon?: string }) {
    if (!signedIn) {
      setMessage("Sign in on the account page first — the license attaches to your account and this project.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/v1/purchases/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, ...body }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setMessage(data.error ?? "Checkout could not be started.");
        return;
      }
      window.location.href = data.url;
    } catch {
      setMessage("Could not reach the server — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const tierOf = license && TIERS.find((t) => t.key === license.tier);

  return (
    <div className="card" style={{ margin: "1rem 0" }}>
      <h2 style={{ marginTop: 0 }}>Project license</h2>
      {license && tierOf ? (
        <>
          <p style={{ margin: "0 0 0.5rem" }}>
            <strong>{tierOf.label}</strong> is active on this project
            {license.expiresAt
              ? ` — construction access through ${new Date(license.expiresAt).toLocaleDateString()}`
              : ""}
            . One price, one home — no subscription.
          </p>
          <ul style={{ margin: "0 0 0.75rem", paddingLeft: "1.2rem", fontSize: "0.9rem" }}>
            {(Object.keys(KIND_LABELS) as CreditKind[])
              .filter((kind) => (license.allowances[kind] ?? 0) > 0 || (license.remaining[kind] ?? 0) > 0)
              .map((kind) => (
                <li key={kind}>
                  {KIND_LABELS[kind]}: <strong>{license.remaining[kind] ?? 0}</strong>
                  {license.allowances[kind] ? ` of ${license.allowances[kind]} included` : " (add-on)"} remaining
                </li>
              ))}
          </ul>
          <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: "0 0 0.5rem" }}>
            Top up anytime — the exact price is shown on the secure checkout page before you confirm.
          </p>
          <p style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", margin: 0 }}>
            {ADDONS.filter((a) => PANEL_ADDONS.includes(a.key)).map((a) => (
              <button
                key={a.key}
                className="btn secondary"
                style={{ padding: "0.3rem 0.8rem", fontSize: "0.8rem" }}
                disabled={busy}
                onClick={() => void buy({ addon: a.key })}
              >
                {a.label} · {formatCents(a.priceCents)}
              </button>
            ))}
          </p>
        </>
      ) : (
        <>
          <p style={{ margin: "0 0 0.75rem", fontSize: "0.9rem", color: "var(--muted)" }}>
            Designing and revising here stays free. A one-time license unlocks this project&apos;s
            premium deliverables — photoreal renders, revision rounds, and the design package. One
            price, one home, no monthly subscription required.
          </p>
          <div style={{ display: "grid", gap: "0.6rem", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            {TIERS.map((t) => (
              <div
                key={t.key}
                style={{
                  border: t.mostPopular ? "1px solid var(--brass, #9a7b3f)" : "1px solid var(--line)",
                  borderRadius: 8,
                  padding: "0.75rem",
                }}
              >
                <p style={{ margin: 0, fontWeight: 600 }}>
                  {t.label.replace("BuildSphere ", "")}
                  {t.mostPopular && (
                    <span style={{ fontSize: "0.7rem", color: "var(--brass, #9a7b3f)", marginLeft: "0.4rem" }}>
                      MOST POPULAR
                    </span>
                  )}
                </p>
                <p style={{ margin: "0.15rem 0 0.5rem", fontSize: "1.05rem" }}>
                  {formatCents(t.priceCents)} <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>one-time</span>
                </p>
                <button
                  className={t.mostPopular ? "btn" : "btn secondary"}
                  style={{ padding: "0.3rem 0.8rem", fontSize: "0.8rem" }}
                  disabled={busy}
                  onClick={() => void buy({ tier: t.key })}
                >
                  License this project
                </button>
              </div>
            ))}
          </div>
          <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: "0.6rem 0 0" }}>
            Full tier details at <a href="/pricing">onbuildsphere.com/pricing</a>. Licensed
            professional services are always quoted separately.
          </p>
        </>
      )}
      {message && <p className="status-warn">{message}</p>}
    </div>
  );
}
