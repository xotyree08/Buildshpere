"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { FloorPlan } from "@/components/FloorPlan";
import type { ConceptPackage } from "@/lib/engine/loop";
import { formatUsd, loadProject, type StoredProject } from "@/lib/store";

function scoreColor(score: number): string {
  if (score >= 80) return "var(--accent)";
  if (score >= 60) return "#b58a1e";
  return "#c04f42";
}

function ConceptCard({
  pkg,
  budgetCents,
  expanded,
  onToggle,
}: {
  pkg: ConceptPackage;
  budgetCents: number | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { concept, healthScore, checkResults, estimate, veSuggestions } = pkg;
  const over = budgetCents != null && estimate.totalCents > budgetCents;
  const delta = budgetCents != null ? estimate.totalCents - budgetCents : null;

  const byCategory = new Map<string, number>();
  for (const li of estimate.lineItems) {
    byCategory.set(li.category, (byCategory.get(li.category) ?? 0) + li.qty * li.unitCostCents);
  }

  return (
    <div className="card" style={{ marginBottom: "1.5rem" }}>
      <div className="topbar" style={{ marginBottom: "0.5rem" }}>
        <h2 style={{ margin: 0 }}>{concept.label}</h2>
        <span className="scorepill" style={{ color: scoreColor(healthScore) }}>
          Health {healthScore}
        </span>
      </div>
      <p>
        {concept.sqft.toLocaleString()} sqft · {concept.beds} bed / {concept.baths} bath ·{" "}
        {concept.model.levels === 2 ? "two-story" : "single-story"}
      </p>

      {Array.from({ length: concept.model.levels }, (_, lvl) => (
        <div key={lvl} style={{ margin: "0.75rem 0" }}>
          {concept.model.levels > 1 && (
            <p style={{ margin: "0 0 0.25rem", fontSize: "0.8rem" }}>Level {lvl + 1}</p>
          )}
          <FloorPlan model={concept.model} level={lvl} />
        </div>
      ))}

      <p style={{ fontSize: "1.05rem" }}>
        <strong>{formatUsd(estimate.totalCents)}</strong>{" "}
        <span style={{ color: "var(--muted)" }}>
          ({formatUsd(estimate.lowCents)} – {formatUsd(estimate.highCents)})
        </span>
        {delta != null && (
          <span className={over ? "status-fail" : "status-pass"} style={{ marginLeft: "0.75rem" }}>
            {over ? `${formatUsd(delta)} over budget` : `${formatUsd(-delta)} under budget`}
          </span>
        )}
      </p>

      <button className="btn secondary" onClick={onToggle}>
        {expanded ? "Hide details" : "Checks, costs & savings"}
      </button>

      {expanded && (
        <div style={{ marginTop: "1rem" }}>
          <h3>Design health checks</h3>
          <ul style={{ paddingLeft: "1.2rem" }}>
            {checkResults.map((r, i) => (
              <li key={i} className={`status-${r.status}`} style={{ marginBottom: "0.25rem" }}>
                <strong>{r.check.replace(/_/g, " ")}</strong>: {r.detail}
              </li>
            ))}
          </ul>

          <h3>Cost by category</h3>
          <table className="lineitems">
            <thead>
              <tr>
                <th>Category</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(byCategory.entries()).map(([cat, cents]) => (
                <tr key={cat}>
                  <td>{cat}</td>
                  <td>{formatUsd(cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {veSuggestions.length > 0 && (
            <>
              <h3>Get back on budget</h3>
              <ul style={{ paddingLeft: "1.2rem" }}>
                {veSuggestions.map((s) => (
                  <li key={s.id} style={{ marginBottom: "0.25rem" }}>
                    {s.description} — saves about <strong>{formatUsd(s.savingsCents)}</strong>{" "}
                    <span style={{ color: "var(--muted)" }}>({s.designImpact} design impact)</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const [entry, setEntry] = useState<StoredProject | null | undefined>(undefined);
  const [expanded, setExpanded] = useState<string | null>(null);

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
  return (
    <main>
      <div className="topbar">
        <h1>{project.name}</h1>
        <Link href="/app">All projects</Link>
      </div>
      <p style={{ color: "var(--muted)" }}>
        Budget {project.budgetCents != null ? formatUsd(project.budgetCents) : "—"} · lot{" "}
        {project.lotWidthFt}×{project.lotDepthFt} ft · concept-stage estimates ±15%. Concepts are
        AI-assisted screening designs — not construction documents; professional review comes in
        Phase 2.
      </p>
      {packages.map((pkg) => (
        <ConceptCard
          key={pkg.concept.id}
          pkg={pkg}
          budgetCents={project.budgetCents}
          expanded={expanded === pkg.concept.id}
          onToggle={() => setExpanded(expanded === pkg.concept.id ? null : pkg.concept.id)}
        />
      ))}
    </main>
  );
}
