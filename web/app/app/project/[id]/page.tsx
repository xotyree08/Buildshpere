"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { FloorPlan } from "@/components/FloorPlan";
import { MassingView } from "@/components/MassingView";
import { DEFAULT_FINISHES, FINISH_CATEGORIES } from "@/lib/catalog/materials";
import { styleInfo } from "@/lib/catalog/styles";
import { CONCEPT_DISCLAIMER, ESTIMATE_RANGE_CLAIM } from "@/lib/claims";
import {
  repriceConceptPackage,
  reviseConceptPackage,
  type ConceptPackage,
} from "@/lib/engine/loop";
import { formatUsd, loadProject, saveProject, type StoredProject } from "@/lib/store";

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
  onRevise,
}: {
  pkg: ConceptPackage;
  budgetCents: number | null;
  expanded: boolean;
  onToggle: () => void;
  onRevise: (text: string) => string | null;
}) {
  const [request, setRequest] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [view, setView] = useState<"plan" | "massing">("plan");

  const { concept } = pkg;
  const history = pkg.revisions ?? [];
  const latest = history.length > 0 ? history[history.length - 1] : null;
  const model = latest ? latest.revision.model : concept.model;
  const healthScore = latest ? latest.healthScore : pkg.healthScore;
  const checkResults = latest ? latest.checkResults : pkg.checkResults;
  const estimate = latest ? latest.estimate : pkg.estimate;
  const veSuggestions = latest ? latest.veSuggestions : pkg.veSuggestions;

  const over = budgetCents != null && estimate.totalCents > budgetCents;
  const delta = budgetCents != null ? estimate.totalCents - budgetCents : null;

  const sqft = Math.round(
    model.rooms
      .filter((r) => r.kind !== "garage" && r.kind !== "outdoor")
      .reduce((a, r) => a + r.rect[2] * r.rect[3], 0),
  );

  const byCategory = new Map<string, number>();
  for (const li of estimate.lineItems) {
    byCategory.set(li.category, (byCategory.get(li.category) ?? 0) + li.qty * li.unitCostCents);
  }

  function submitRevision(e: React.FormEvent) {
    e.preventDefault();
    if (!request.trim()) return;
    const problem = onRevise(request.trim());
    setFeedback(problem);
    if (!problem) setRequest("");
  }

  return (
    <div className="card" style={{ marginBottom: "1.5rem" }}>
      <div className="topbar" style={{ marginBottom: "0.5rem" }}>
        <h2 style={{ margin: 0 }}>
          {concept.label}
          {latest && <span style={{ color: "var(--muted)", fontWeight: 400 }}> · rev {history.length}</span>}
        </h2>
        <span className="scorepill" style={{ color: scoreColor(healthScore) }}>
          Health {healthScore}
        </span>
      </div>
      <p>
        {sqft.toLocaleString()} sqft · {concept.beds} bed / {concept.baths} bath ·{" "}
        {model.levels === 2 ? "two-story" : "single-story"}
      </p>

      <p style={{ display: "flex", gap: "0.5rem", margin: "0.5rem 0" }}>
        <button
          className={view === "plan" ? "btn" : "btn secondary"}
          onClick={() => setView("plan")}
          type="button"
        >
          2D plan
        </button>
        <button
          className={view === "massing" ? "btn" : "btn secondary"}
          onClick={() => setView("massing")}
          type="button"
        >
          3D massing
        </button>
      </p>

      {view === "plan" ? (
        Array.from({ length: model.levels }, (_, lvl) => (
          <div key={lvl} style={{ margin: "0.75rem 0" }}>
            {model.levels > 1 && <p style={{ margin: "0 0 0.25rem", fontSize: "0.8rem" }}>Level {lvl + 1}</p>}
            <FloorPlan model={model} level={lvl} />
          </div>
        ))
      ) : (
        <div style={{ margin: "0.75rem 0" }}>
          <MassingView model={model} style={concept.style} />
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem", color: "var(--muted)" }}>
            Massing preview — photorealistic rendering arrives with the ModelSphere pipeline.
          </p>
        </div>
      )}

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

      <form onSubmit={submitRevision} style={{ display: "flex", gap: "0.5rem", margin: "0.75rem 0" }}>
        <input
          style={{ flex: 1, padding: "0.55rem 0.7rem", border: "1px solid var(--line)", borderRadius: 8, background: "var(--card)", color: "var(--fg)", font: "inherit" }}
          placeholder='Request a change — e.g. "bigger kitchen, add a mudroom"'
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          aria-label="Revision request"
        />
        <button className="btn" type="submit">
          Revise
        </button>
      </form>
      {feedback && <p className="status-warn">{feedback}</p>}
      {latest && latest.rejected.length > 0 && <p className="status-warn">{latest.rejected.join(" ")}</p>}

      {history.length > 0 && (
        <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
          {history.map((h, i) => (
            <span key={h.revision.id}>
              {i + 1}. {h.revision.changeSummary}
              {i < history.length - 1 ? " → " : ""}
            </span>
          ))}
        </p>
      )}

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
  const [storageNotice, setStorageNotice] = useState<string | null>(null);

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

  function handleFinishChange(field: string, value: string) {
    const current = loadProject(params.id);
    if (!current) return;
    current.finishes = { ...DEFAULT_FINISHES, ...current.finishes, [field]: value };
    current.packages = current.packages.map((pkg) =>
      repriceConceptPackage(pkg, {
        budgetCents: current.project.budgetCents,
        regionCode: current.regionCode,
        finishes: current.finishes,
      }),
    );
    const saved = saveProject(current);
    setStorageNotice(saved.ok ? (saved.warning ?? null) : saved.error);
    if (saved.ok) setEntry(loadProject(params.id));
  }

  function handleRevise(conceptId: string, text: string): string | null {
    const current = loadProject(params.id);
    if (!current) return "Project disappeared from local storage.";
    const idx = current.packages.findIndex((p) => p.concept.id === conceptId);
    if (idx < 0) return "Concept not found.";
    const outcome = reviseConceptPackage(current.packages[idx], text, {
      budgetCents: current.project.budgetCents,
      regionCode: current.regionCode,
      finishes: current.finishes,
    });
    if (!outcome.pkg) {
      return outcome.unrecognized.length > 0
        ? `Couldn't apply: ${outcome.unrecognized.join("; ")}. Try phrases like "bigger kitchen", "add an office", "remove the theater".`
        : "Nothing to change.";
    }
    current.packages[idx] = {
      ...current.packages[idx],
      revisions: [...(current.packages[idx].revisions ?? []), outcome.pkg],
    };
    const saved = saveProject(current);
    if (!saved.ok) return saved.error;
    setStorageNotice(saved.warning ?? null);
    setEntry(loadProject(params.id));
    return null;
  }

  return (
    <main>
      <div className="topbar">
        <h1>{project.name}</h1>
        <Link href="/app">All projects</Link>
      </div>
      <p style={{ color: "var(--muted)" }}>
        Budget {project.budgetCents != null ? formatUsd(project.budgetCents) : "—"} · lot{" "}
        {project.lotWidthFt}×{project.lotDepthFt} ft ·{" "}
        {styleInfo(packages[0]?.concept.style)?.label ?? "—"} style · {ESTIMATE_RANGE_CLAIM}.{" "}
        {CONCEPT_DISCLAIMER}
      </p>
      {storageNotice && <p className="status-warn">{storageNotice}</p>}

      {entry.inspiration && (
        <div className="card" style={{ marginBottom: "1.5rem", display: "flex", gap: "1rem" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={entry.inspiration.photoDataUrl}
            alt="Inspiration home"
            style={{ width: 140, borderRadius: 8, border: "1px solid var(--line)", alignSelf: "flex-start" }}
          />
          <div>
            <h2 style={{ marginTop: 0 }}>Inspiration</h2>
            {entry.inspiration.analysis?.styleKey ? (
              <p style={{ margin: 0 }}>
                Matched <strong>{styleInfo(entry.inspiration.analysis.styleKey)?.label}</strong> (
                {Math.round(entry.inspiration.analysis.confidence * 100)}%) ·{" "}
                {entry.inspiration.analysis.levels === 2 ? "two-story" : "single-story"}
                {entry.inspiration.analysis.notes && (
                  <>
                    <br />
                    <span style={{ color: "var(--muted)" }}>{entry.inspiration.analysis.notes}</span>
                  </>
                )}
              </p>
            ) : (
              <p style={{ margin: 0, color: "var(--muted)" }}>Kept as reference for the design.</p>
            )}
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h2>Interior finishes</h2>
        <p>Change a finish and every concept re-prices instantly.</p>
        <div className="field-row">
          {FINISH_CATEGORIES.map(({ field, label, options }) => (
            <label className="field" key={field}>
              <span>{label}</span>
              <select
                value={entry?.finishes?.[field] ?? DEFAULT_FINISHES[field]}
                onChange={(e) => handleFinishChange(field, e.target.value)}
              >
                {options.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label} ({o.tier})
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </div>

      {packages.map((pkg) => (
        <ConceptCard
          key={pkg.concept.id}
          pkg={pkg}
          budgetCents={project.budgetCents}
          expanded={expanded === pkg.concept.id}
          onToggle={() => setExpanded(expanded === pkg.concept.id ? null : pkg.concept.id)}
          onRevise={(text) => handleRevise(pkg.concept.id, text)}
        />
      ))}
    </main>
  );
}
