"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { formatCents, TIERS, type CreditKind } from "@/lib/catalog/licenses";

/**
 * Account-page summary of the project licenses this account owns. There is
 * no subscription to manage — each home is licensed once from its project
 * page, and this card is the receipt-level overview.
 */

interface LicenseJson {
  projectId: string;
  tier: string;
  status: string;
  purchasedAt: string;
  expiresAt: string | null;
  remaining: Partial<Record<CreditKind, number>>;
}

export function LicensesCard() {
  const [licenses, setLicenses] = useState<LicenseJson[] | null>(null);

  useEffect(() => {
    void fetch("/api/v1/licenses")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { licenses: LicenseJson[] } | null) => setLicenses(data?.licenses ?? []))
      .catch(() => setLicenses([]));
  }, []);

  return (
    <div className="card" style={{ maxWidth: 520 }}>
      <h2 style={{ fontSize: "1rem", marginBottom: "0.25rem" }}>Project licenses</h2>
      <p style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
        One price, one home — no monthly subscription. Each project is licensed once, from its own
        page, and keeps its included renders and revision rounds.
      </p>
      {licenses === null ? null : licenses.length === 0 ? (
        <p style={{ fontSize: "0.9rem" }}>
          No licensed projects yet. Tiers start at {formatCents(TIERS[0].priceCents)} —{" "}
          <Link href="/pricing">see pricing</Link>, then license a project from its page.
        </p>
      ) : (
        <ul style={{ margin: "0 0 0.5rem", paddingLeft: "1.2rem", fontSize: "0.9rem" }}>
          {licenses.map((l) => {
            const tier = TIERS.find((t) => t.key === l.tier);
            return (
              <li key={l.projectId} style={{ marginBottom: "0.25rem" }}>
                <Link href={`/app/project/${encodeURIComponent(l.projectId)}`}>
                  {tier?.label ?? l.tier}
                </Link>{" "}
                — purchased {new Date(l.purchasedAt).toLocaleDateString()}
                {l.expiresAt ? `, access through ${new Date(l.expiresAt).toLocaleDateString()}` : ""} ·{" "}
                {l.remaining.premium_render ?? 0} renders, {l.remaining.major_revision ?? 0} major
                revisions remaining
              </li>
            );
          })}
        </ul>
      )}
      <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: 0 }}>
        Add-on packs (extra renders, walkthroughs, redesigns) are on each licensed project&apos;s
        page. <Link href="/pricing">Full pricing</Link>.
      </p>
    </div>
  );
}
