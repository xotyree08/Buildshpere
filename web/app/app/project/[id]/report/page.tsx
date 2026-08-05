"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { ElevationView } from "@/components/ElevationView";
import { FloorPlan } from "@/components/FloorPlan";
import { MassingView } from "@/components/MassingView";
import { SitePlanView } from "@/components/SitePlanView";
import { EXTERIOR_CATEGORIES, FINISH_CATEGORIES, DEFAULT_FINISHES } from "@/lib/catalog/materials";
import { styleInfo } from "@/lib/catalog/styles";
import { CONCEPT_DISCLAIMER, ESTIMATE_RANGE_CLAIM } from "@/lib/claims";
import { sanitizeSetbacks } from "@/lib/engine/site";
import { accountEmail, formatUsd, loadProject, type StoredProject } from "@/lib/store";

interface ReviewRecord {
  projectId: string;
  status: string;
  note: string | null;
  updatedAt: string;
  professionalEmail: string | null;
  professional?: {
    fullName: string;
    discipline: string;
    licenseNumber: string;
    licenseState: string;
    credentialStatus: string;
  };
}

/**
 * The Design Report: a print-ready deliverable of everything the design
 * loop produced. Print → Save as PDF is the export path (no server, no
 * credits) — honest to what concepts are, per the claims constants.
 */
export default function ReportPage() {
  const params = useParams<{ id: string }>();
  const [entry, setEntry] = useState<StoredProject | null | undefined>(undefined);
  const [review, setReview] = useState<ReviewRecord | null>(null);

  useEffect(() => {
    setEntry(loadProject(params.id));
    if (accountEmail()) {
      void fetch("/api/v1/reviews")
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { reviews: ReviewRecord[] } | null) => {
          setReview(data?.reviews.find((rv) => rv.projectId === params.id) ?? null);
        })
        .catch(() => null);
    }
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

  const { project, packages, finishes } = entry;
  const style = styleInfo(packages[0]?.concept.style);
  const allSelections = [...EXTERIOR_CATEGORIES, ...FINISH_CATEGORIES];

  return (
    <main className="report">
      <div className="topbar no-print">
        <h1>Design Report</h1>
        <span style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <Link href={`/app/project/${project.id}`}>Back to project</Link>
          <button className="btn" onClick={() => window.print()}>
            Print / Save as PDF
          </button>
        </span>
      </div>

      <header>
        <h1 className="print-only" style={{ marginBottom: 0 }}>
          {project.name} — Design Report
        </h1>
        <h2 className="no-print" style={{ marginTop: 0 }}>
          {project.name}
        </h2>
        <p style={{ color: "var(--muted)" }}>
          {style?.label ?? "—"} style · budget{" "}
          {project.budgetCents != null ? formatUsd(project.budgetCents) : "—"} · lot{" "}
          {project.lotWidthFt}×{project.lotDepthFt} ft · {ESTIMATE_RANGE_CLAIM}
        </p>
        <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>{CONCEPT_DISCLAIMER}</p>
      </header>

      {review?.status === "approved" && (
        <section className="card" style={{ marginBottom: "1rem" }}>
          <h3 style={{ marginTop: 0 }}>Professional review record</h3>
          <p style={{ margin: 0 }}>
            Reviewed and approved by{" "}
            <strong>{review.professional?.fullName ?? review.professionalEmail ?? "a professional"}</strong>
            {review.professional && (
              <>
                {" "}
                ({review.professional.discipline}, License {review.professional.licenseNumber} ·{" "}
                {review.professional.licenseState},{" "}
                {review.professional.credentialStatus.replace("_", "-")} credentials)
              </>
            )}{" "}
            on {new Date(review.updatedAt).toLocaleDateString()}.
            {review.note && <> Reviewer&apos;s note: {review.note}</>}
          </p>
          <p style={{ margin: "0.35rem 0 0", fontSize: "0.8rem", color: "var(--muted)" }}>
            This records a professional review of the concept. It is not a professional seal —
            sealing and stamping happen under the professional&apos;s own authority, outside
            BuildSphere.
          </p>
        </section>
      )}

      {entry.inspiration?.analysis?.styleKey && (
        <section>
          <h3>Inspiration</h3>
          <p>
            Matched {styleInfo(entry.inspiration.analysis.styleKey)?.label} (
            {Math.round(entry.inspiration.analysis.confidence * 100)}%).{" "}
            {entry.inspiration.analysis.notes}
          </p>
        </section>
      )}

      <section>
        <h3>Materials &amp; finishes</h3>
        <table className="lineitems">
          <tbody>
            {allSelections.map(({ field, label, options }) => {
              const key = finishes?.[field] ?? DEFAULT_FINISHES[field];
              const option = options.find((o) => o.key === key);
              return (
                <tr key={field}>
                  <td>{label}</td>
                  <td>
                    {option?.label ?? key} ({option?.tier ?? "standard"})
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {packages.map((pkg) => {
        const history = pkg.revisions ?? [];
        const latest = history.length > 0 ? history[history.length - 1] : null;
        const model = latest ? latest.revision.model : pkg.concept.model;
        const healthScore = latest ? latest.healthScore : pkg.healthScore;
        const checkResults = latest ? latest.checkResults : pkg.checkResults;
        const estimate = latest ? latest.estimate : pkg.estimate;
        const sqft = Math.round(
          model.rooms
            .filter((r) => r.kind !== "garage" && r.kind !== "outdoor")
            .reduce((a, r) => a + r.rect[2] * r.rect[3], 0),
        );

        return (
          <section key={pkg.concept.id} className="report-concept">
            <h3>
              {pkg.concept.label}
              {latest && ` (revision ${history.length})`} — Health {healthScore} —{" "}
              {formatUsd(estimate.totalCents)}
            </h3>
            <p style={{ color: "var(--muted)" }}>
              {sqft.toLocaleString()} sqft · {pkg.concept.beds} bed / {pkg.concept.baths} bath ·{" "}
              {model.levels === 2 ? "two-story" : "single-story"} · estimate range{" "}
              {formatUsd(estimate.lowCents)} – {formatUsd(estimate.highCents)}
            </p>
            {latest && (
              <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                Revisions: {history.map((h, i) => `${i + 1}. ${h.revision.changeSummary}`).join(" → ")}
              </p>
            )}

            <div className="report-visuals">
              {Array.from({ length: model.levels }, (_, lvl) => (
                <div key={lvl} style={{ flex: 1 }}>
                  {model.levels > 1 && <p style={{ fontSize: "0.8rem", margin: "0 0 0.25rem" }}>Level {lvl + 1}</p>}
                  <FloorPlan model={model} level={lvl} />
                </div>
              ))}
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: "0.8rem", margin: "0 0 0.25rem" }}>Massing</p>
                <MassingView model={model} style={pkg.concept.style} finishes={entry.finishes} />
              </div>
            </div>
            <div className="report-visuals">
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: "0.8rem", margin: "0 0 0.25rem" }}>Front elevation (north)</p>
                <ElevationView model={model} style={pkg.concept.style} direction="north" finishes={entry.finishes} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: "0.8rem", margin: "0 0 0.25rem" }}>Side elevation (east)</p>
                <ElevationView model={model} style={pkg.concept.style} direction="east" finishes={entry.finishes} />
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

            <h4>Design health checks</h4>
            <table className="lineitems">
              <tbody>
                {checkResults.map((r, i) => (
                  <tr key={i}>
                    <td style={{ whiteSpace: "nowrap" }}>{r.check.replace(/_/g, " ")}</td>
                    <td className={`status-${r.status}`}>{r.status}</td>
                    <td>{r.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h4>Estimate</h4>
            <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: "0 0 0.35rem" }}>
              Priced {estimate.pricedAt ? new Date(estimate.pricedAt).toLocaleDateString() : "—"} ·{" "}
              {estimate.priceBookVersion ?? "pre-provenance estimate — regenerate to stamp"} · confidence
              is per line: measured quantities price at medium, allowances at low; high is reserved for
              vendor quotes.
            </p>
            <table className="lineitems">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Unit</th>
                  <th>Cost</th>
                  <th>Source</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {estimate.lineItems.map((li) => (
                  <tr key={li.id}>
                    <td>{li.description}</td>
                    <td>{li.qty.toLocaleString()}</td>
                    <td>{li.unit}</td>
                    <td>{formatUsd(Math.round(li.qty * li.unitCostCents))}</td>
                    <td style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{li.sourceDetail ?? li.source}</td>
                    <td className={li.confidence === "low" ? "status-warn" : ""} style={{ fontSize: "0.8rem" }}>
                      {li.confidence ?? "—"}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={3}>
                    <strong>Total ({estimate.regionCode.replace(/_/g, " ")})</strong>
                  </td>
                  <td>
                    <strong>{formatUsd(estimate.totalCents)}</strong>
                  </td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
          </section>
        );
      })}

      <footer style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: "2rem" }}>
        Generated by BuildSphere. {CONCEPT_DISCLAIMER}
      </footer>
    </main>
  );
}
