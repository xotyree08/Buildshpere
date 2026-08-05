"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { CONCEPT_DISCLAIMER } from "@/lib/claims";
import { buildBidPackages } from "@/lib/engine/bids";
import { formatUsd, loadProject, type StoredProject } from "@/lib/store";

/**
 * The contractor bid package: one printable scope-of-work sheet per trade.
 * The printed sheets carry quantities but no prices — internal budgets
 * (ours) are screen-only, so a handed-out sheet never anchors a bid.
 */
export default function BidsPage() {
  const params = useParams<{ id: string }>();
  const [entry, setEntry] = useState<StoredProject | null | undefined>(undefined);
  const [conceptIdx, setConceptIdx] = useState(0);

  useEffect(() => {
    setEntry(loadProject(params.id));
  }, [params.id]);

  if (entry === undefined) return null;
  if (entry === null)
    return (
      <main>
        <h1>Project not found</h1>
        <p>
          <Link className="btn" href="/app">
            Back to projects
          </Link>
        </p>
      </main>
    );

  const { project, packages } = entry;
  const pkg = packages[Math.min(conceptIdx, packages.length - 1)];
  const history = pkg.revisions ?? [];
  const latest = history.length > 0 ? history[history.length - 1] : null;
  const model = latest ? latest.revision.model : pkg.concept.model;
  const estimate = latest ? latest.estimate : pkg.estimate;
  const set = buildBidPackages(model, estimate);

  return (
    <main className="report">
      <div className="topbar no-print">
        <h1>Bid Package</h1>
        <span style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", gap: "0.4rem", alignItems: "center", fontSize: "0.9rem" }}>
            Concept
            <select value={conceptIdx} onChange={(e) => setConceptIdx(Number(e.target.value))}>
              {packages.map((p, i) => (
                <option key={p.concept.id} value={i}>
                  {p.concept.label}
                </option>
              ))}
            </select>
          </label>
          <Link href={`/app/project/${project.id}`}>Back to project</Link>
          <button
            className="btn"
            onClick={() => {
              void import("@/lib/pdf/documents").then(({ generateBidPackagePdf }) =>
                generateBidPackagePdf(project.name, set).save(
                  `${project.name.replace(/[^\w-]+/g, "-")}-bid-package.pdf`,
                ),
              );
            }}
          >
            Download PDF
          </button>
          <button className="btn secondary" onClick={() => window.print()}>
            Print
          </button>
        </span>
      </div>

      <header>
        <h2 style={{ marginTop: 0 }}>
          {project.name} — Invitation to Bid ({pkg.concept.label})
        </h2>
        <p style={{ color: "var(--muted)" }}>
          {set.facts.livableSqft.toLocaleString()} livable sqft ·{" "}
          {set.facts.levels === 2 ? "two-story" : "single-story"} · {set.facts.baths} bath ·{" "}
          {set.facts.windows} windows · attach the Design Report drawings to each sheet.
        </p>
        <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>{CONCEPT_DISCLAIMER}</p>
      </header>

      <section className="card no-print" style={{ marginBottom: "1rem" }}>
        <h3 style={{ marginTop: 0 }}>Owner budget summary (screen-only — not printed)</h3>
        <table className="lineitems">
          <tbody>
            {set.trades.map((t) => (
              <tr key={t.trade}>
                <td>{t.trade}</td>
                <td>{formatUsd(t.internalBudgetCents)}</td>
              </tr>
            ))}
            {set.ownerCosts.map((c) => (
              <tr key={c.description}>
                <td>{c.description} (owner-carried)</td>
                <td>{formatUsd(c.amountCents)}</td>
              </tr>
            ))}
            <tr>
              <td>
                <strong>Trade work subtotal</strong>
              </td>
              <td>
                <strong>{formatUsd(set.totalTradeBudgetCents)}</strong>
              </td>
            </tr>
          </tbody>
        </table>
        <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: "0.5rem 0 0" }}>
          Compare returned bids against these numbers. A bid far below budget deserves as many
          questions as one far above it.
        </p>
      </section>

      {set.trades.map((t) => (
        <section key={t.trade} className="bid-sheet">
          <h3>
            {t.trade} — {project.name}
          </h3>
          <h4>Scope of work</h4>
          <ul>
            {t.scope.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
          <h4>Bid lines</h4>
          <table className="lineitems">
            <thead>
              <tr>
                <th>Item</th>
                <th>Est. qty</th>
                <th>Unit</th>
                <th style={{ width: "7rem" }}>Unit price</th>
                <th style={{ width: "7rem" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {t.bidLines.map((l, i) => (
                <tr key={i}>
                  <td>{l.description}</td>
                  <td>{l.qty.toLocaleString()}</td>
                  <td>{l.unit}</td>
                  <td className="bid-blank" />
                  <td className="bid-blank" />
                </tr>
              ))}
              <tr>
                <td colSpan={4}>
                  <strong>Trade total (labor + materials + tax)</strong>
                </td>
                <td className="bid-blank" />
              </tr>
            </tbody>
          </table>
          <h4>Instructions to bidders</h4>
          <ol style={{ fontSize: "0.85rem" }}>
            {set.instructions.map((ins, i) => (
              <li key={i}>{ins}</li>
            ))}
          </ol>
          <p style={{ fontSize: "0.85rem" }}>
            Bidder company: ______________________ License #: ____________ Date: __________
          </p>
        </section>
      ))}
    </main>
  );
}
