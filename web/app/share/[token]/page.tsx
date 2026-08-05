"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { ElevationView } from "@/components/ElevationView";
import { FloorPlan } from "@/components/FloorPlan";
import { MassingView } from "@/components/MassingView";
import { SitePlanView } from "@/components/SitePlanView";
import { styleInfo } from "@/lib/catalog/styles";
import { CONCEPT_DISCLAIMER, ESTIMATE_RANGE_CLAIM } from "@/lib/claims";
import { sanitizeSetbacks } from "@/lib/engine/site";
import { formatUsd, type StoredProject } from "@/lib/store";

/**
 * The read-only view behind a share link: everything a family member or
 * contractor needs to see, nothing they can change. Data comes from the
 * owner's synced server copy, never this browser's storage.
 */
export default function SharedProjectPage() {
  const params = useParams<{ token: string }>();
  const [entry, setEntry] = useState<StoredProject | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/v1/shared/${params.token}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as
          | { project?: StoredProject; error?: string }
          | null;
        if (!res.ok || !body?.project) {
          setError(body?.error ?? "This share link could not be loaded.");
          return;
        }
        setEntry(body.project);
      })
      .catch(() => setError("Network error — try again."));
  }, [params.token]);

  if (error)
    return (
      <main>
        <h1>Link unavailable</h1>
        <p>{error}</p>
        <p>
          <Link className="btn" href="/">
            What is BuildSphere?
          </Link>
        </p>
      </main>
    );
  if (!entry) return null;

  const { project, packages } = entry;
  const style = styleInfo(packages[0]?.concept.style);

  return (
    <main className="report">
      <div className="topbar">
        <h1>{project.name}</h1>
        <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
          Shared read-only view · <Link href="/">Design your own with BuildSphere</Link>
        </span>
      </div>
      <p style={{ color: "var(--muted)" }}>
        {style?.label ?? "—"} style · budget{" "}
        {project.budgetCents != null ? formatUsd(project.budgetCents) : "—"} · lot{" "}
        {project.lotWidthFt}×{project.lotDepthFt} ft · {ESTIMATE_RANGE_CLAIM}
      </p>
      <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>{CONCEPT_DISCLAIMER}</p>

      {packages.map((pkg) => {
        const history = pkg.revisions ?? [];
        const latest = history.length > 0 ? history[history.length - 1] : null;
        const model = latest ? latest.revision.model : pkg.concept.model;
        const healthScore = latest ? latest.healthScore : pkg.healthScore;
        const estimate = latest ? latest.estimate : pkg.estimate;
        const sqft = Math.round(
          model.rooms
            .filter((r) => r.kind !== "garage" && r.kind !== "outdoor")
            .reduce((a, r) => a + r.rect[2] * r.rect[3], 0),
        );

        return (
          <section key={pkg.concept.id} className="report-concept">
            <h3>
              {pkg.concept.label} — Health {healthScore} — {formatUsd(estimate.totalCents)}
            </h3>
            <p style={{ color: "var(--muted)" }}>
              {sqft.toLocaleString()} sqft · {pkg.concept.beds} bed / {pkg.concept.baths} bath ·{" "}
              {model.levels === 2 ? "two-story" : "single-story"} · estimate range{" "}
              {formatUsd(estimate.lowCents)} – {formatUsd(estimate.highCents)}
            </p>

            <div className="report-visuals">
              {Array.from({ length: model.levels }, (_, lvl) => (
                <div key={lvl} style={{ flex: 1 }}>
                  {model.levels > 1 && (
                    <p style={{ fontSize: "0.8rem", margin: "0 0 0.25rem" }}>Level {lvl + 1}</p>
                  )}
                  <FloorPlan model={model} level={lvl} />
                </div>
              ))}
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: "0.8rem", margin: "0 0 0.25rem" }}>Massing</p>
                <MassingView model={model} style={pkg.concept.style} />
              </div>
            </div>
            <div className="report-visuals">
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: "0.8rem", margin: "0 0 0.25rem" }}>Front elevation</p>
                <ElevationView model={model} style={pkg.concept.style} direction="north" />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: "0.8rem", margin: "0 0 0.25rem" }}>Side elevation</p>
                <ElevationView model={model} style={pkg.concept.style} direction="east" />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: "0.8rem", margin: "0 0 0.25rem" }}>Site plan</p>
                <SitePlanView
                  model={model}
                  lotWidthFt={project.lotWidthFt ?? 60}
                  lotDepthFt={project.lotDepthFt ?? 120}
                  rules={sanitizeSetbacks(entry.setbacks)}
                />
              </div>
            </div>

            <h4>Estimate</h4>
            <table className="lineitems">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Unit</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                {estimate.lineItems.map((li) => (
                  <tr key={li.id}>
                    <td>{li.description}</td>
                    <td>{li.qty.toLocaleString()}</td>
                    <td>{li.unit}</td>
                    <td>{formatUsd(Math.round(li.qty * li.unitCostCents))}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={3}>
                    <strong>Total ({estimate.regionCode.replace(/_/g, " ")})</strong>
                  </td>
                  <td>
                    <strong>{formatUsd(estimate.totalCents)}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
        );
      })}

      <footer style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: "2rem" }}>
        Shared from BuildSphere. {CONCEPT_DISCLAIMER}
      </footer>
    </main>
  );
}
