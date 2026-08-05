"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { buildEnergyReport } from "@/lib/engine/energy";
import { formatUsd, loadProject, type StoredProject } from "@/lib/store";

/**
 * The energy report: where the heat goes, what it costs each year, and
 * which upgrades actually pay back — priced from the same book as the
 * estimate, banded honestly.
 */
export default function EnergyPage() {
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

  const { project, packages, finishes, regionCode } = entry;
  const pkg = packages[Math.min(conceptIdx, packages.length - 1)];
  const history = pkg.revisions ?? [];
  const latest = history.length > 0 ? history[history.length - 1] : null;
  const model = latest ? latest.revision.model : pkg.concept.model;
  const report = buildEnergyReport(model, regionCode, { ...finishes, styleKey: pkg.concept.style });
  const annual = report.heatingCostCents + report.coolingCostCents;

  return (
    <main className="report">
      <div className="topbar no-print">
        <h1>Energy Report</h1>
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
          <button className="btn secondary" onClick={() => window.print()}>
            Print
          </button>
        </span>
      </div>

      <header>
        <h2 style={{ marginTop: 0 }}>
          {project.name} — {pkg.concept.label}
        </h2>
        <p style={{ fontSize: "1.1rem" }}>
          Estimated <strong>{formatUsd(report.annualLowCents)}–{formatUsd(report.annualHighCents)}</strong>{" "}
          per year to heat and cool ({report.regionCode.replace(/_/g, " ")}, {report.windowLabel} windows).
        </p>
        <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
          Heating {formatUsd(report.heatingCostCents)} · cooling {formatUsd(report.coolingCostCents)} at the
          model&apos;s point estimate ({formatUsd(annual)}).
        </p>
      </header>

      <section>
        <h3>Where the heat goes</h3>
        <table className="lineitems">
          <thead>
            <tr>
              <th>Envelope component</th>
              <th>Share of loss</th>
              <th style={{ width: "40%" }}></th>
            </tr>
          </thead>
          <tbody>
            {report.components.map((c) => (
              <tr key={c.name}>
                <td>{c.name}</td>
                <td>{c.sharePct}%</td>
                <td>
                  <div style={{ background: "var(--line)", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${c.sharePct}%`, height: 10, background: "var(--brass, #9a7b3f)" }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3>Upgrades that pay for themselves</h3>
        {report.upgrades.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>This envelope is already at the top of the catalog.</p>
        ) : (
          <table className="lineitems">
            <thead>
              <tr>
                <th>Upgrade</th>
                <th>Saves / year</th>
                <th>Upfront cost</th>
                <th>Payback</th>
              </tr>
            </thead>
            <tbody>
              {report.upgrades.map((u) => (
                <tr key={u.description}>
                  <td>{u.description}</td>
                  <td>{formatUsd(u.savingsPerYearCents)}</td>
                  <td>{u.extraCostCents != null ? formatUsd(u.extraCostCents) : "labor practice — priced by your builder"}</td>
                  <td>{u.paybackYears != null ? `${u.paybackYears} years` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h3>Read this first</h3>
        <ul style={{ fontSize: "0.9rem" }}>
          {report.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
