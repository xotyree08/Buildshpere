"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { ElevationView } from "@/components/ElevationView";
import { FloorPlan } from "@/components/FloorPlan";
import { MassingView } from "@/components/MassingView";
import { ReviewSection, type Review } from "@/components/ReviewSection";
import { SitePlanView } from "@/components/SitePlanView";
import { Walkthrough } from "@/components/Walkthrough";
import { DEFAULT_FINISHES, EXTERIOR_CATEGORIES, FINISH_CATEGORIES } from "@/lib/catalog/materials";
import { styleInfo } from "@/lib/catalog/styles";
import { CONCEPT_DISCLAIMER, ESTIMATE_RANGE_CLAIM } from "@/lib/claims";
import type { Interpretation } from "@/lib/engine/interpret";
import {
  applyOpsToConceptPackage,
  repriceConceptPackage,
  reviseConceptPackage,
  type ConceptPackage,
} from "@/lib/engine/loop";
import { buildPermitReadiness } from "@/lib/engine/permit";
import { buildSitePlan } from "@/lib/engine/site";
import { accountEmail, formatUsd, loadProject, saveProject, type StoredProject } from "@/lib/store";
import { pushProject } from "@/lib/sync";
import type { DesignCheckResult, ParametricModel, ValueEngineeringSuggestion } from "@/lib/types";

const READINESS_CLASS: Record<string, string> = {
  ready: "status-pass",
  action_needed: "status-fail",
  pending_professional: "status-warn",
  future: "",
};

function ReadinessBlock({
  model,
  checkResults,
  lotWidthFt,
  lotDepthFt,
  sqft,
  review,
}: {
  model: ParametricModel;
  checkResults: DesignCheckResult[];
  lotWidthFt: number;
  lotDepthFt: number;
  sqft: number;
  review: Review | null;
}) {
  const readiness = buildPermitReadiness({
    levels: model.levels,
    sqft,
    checkResults,
    site: buildSitePlan(model, lotWidthFt, lotDepthFt),
    reviewStatus: review?.status ?? null,
    reviewNote: review?.note ?? null,
  });

  return (
    <div style={{ marginBottom: "1rem" }}>
      <h3>Permit readiness</h3>
      <p style={{ margin: "0 0 0.5rem" }} className={readiness.submittable ? "status-pass" : "status-warn"}>
        {readiness.submittable
          ? "Everything the platform covers today is ready — remaining items arrive with Phase 3."
          : `${readiness.actionNeeded} item${readiness.actionNeeded === 1 ? "" : "s"} need action, ${readiness.pendingProfessional} waiting on a professional.`}
      </p>
      <ul style={{ paddingLeft: "1.2rem" }}>
        {readiness.items.map((item) => (
          <li key={item.key} style={{ marginBottom: "0.25rem" }}>
            <strong className={READINESS_CLASS[item.status]}>{item.label}</strong>
            {item.status === "future" && <span style={{ color: "var(--muted)" }}> (future)</span>}: {" "}
            <span style={{ color: item.status === "future" ? "var(--muted)" : undefined }}>{item.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function scoreColor(score: number): string {
  if (score >= 80) return "var(--accent)";
  if (score >= 60) return "#b58a1e";
  return "#c04f42";
}

/** Ask the server-side AI to interpret a request; "unavailable" on any failure. */
async function interpretRequest(
  text: string,
  model: unknown,
): Promise<Interpretation | "unavailable"> {
  try {
    const res = await fetch("/api/v1/revisions/interpret", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ request: text, model }),
    });
    if (!res.ok) return "unavailable";
    const { interpretation } = (await res.json()) as { interpretation: Interpretation };
    return interpretation;
  } catch {
    return "unavailable";
  }
}

function ConceptCard({
  pkg,
  budgetCents,
  lotWidthFt,
  lotDepthFt,
  expanded,
  onToggle,
  onRevise,
  onApplyVe,
  review,
}: {
  pkg: ConceptPackage;
  budgetCents: number | null;
  lotWidthFt: number;
  lotDepthFt: number;
  expanded: boolean;
  onToggle: () => void;
  onRevise: (text: string) => Promise<string | null>;
  onApplyVe: (suggestion: ValueEngineeringSuggestion) => Promise<string | null>;
  review: Review | null;
}) {
  const [request, setRequest] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [revising, setRevising] = useState(false);
  const [view, setView] = useState<"plan" | "massing" | "elevations" | "site" | "walkthrough">("plan");

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

  async function submitRevision(e: React.FormEvent) {
    e.preventDefault();
    if (!request.trim() || revising) return;
    setRevising(true);
    try {
      const problem = await onRevise(request.trim());
      setFeedback(problem);
      if (!problem) setRequest("");
    } finally {
      setRevising(false);
    }
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
        <button
          className={view === "elevations" ? "btn" : "btn secondary"}
          onClick={() => setView("elevations")}
          type="button"
        >
          Elevations
        </button>
        <button
          className={view === "site" ? "btn" : "btn secondary"}
          onClick={() => setView("site")}
          type="button"
        >
          Site
        </button>
        <button
          className={view === "walkthrough" ? "btn" : "btn secondary"}
          onClick={() => setView("walkthrough")}
          type="button"
        >
          Walkthrough
        </button>
      </p>

      {view === "plan" ? (
        Array.from({ length: model.levels }, (_, lvl) => (
          <div key={lvl} style={{ margin: "0.75rem 0" }}>
            {model.levels > 1 && <p style={{ margin: "0 0 0.25rem", fontSize: "0.8rem" }}>Level {lvl + 1}</p>}
            <FloorPlan model={model} level={lvl} />
          </div>
        ))
      ) : view === "massing" ? (
        <div style={{ margin: "0.75rem 0" }}>
          <MassingView model={model} style={concept.style} />
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem", color: "var(--muted)" }}>
            Massing preview — photorealistic rendering arrives with the ModelSphere pipeline.
          </p>
        </div>
      ) : view === "elevations" ? (
        <div style={{ margin: "0.75rem 0", display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 260px" }}>
            <p style={{ margin: "0 0 0.25rem", fontSize: "0.8rem" }}>Front elevation (north)</p>
            <ElevationView model={model} style={concept.style} direction="north" />
          </div>
          <div style={{ flex: "1 1 260px" }}>
            <p style={{ margin: "0 0 0.25rem", fontSize: "0.8rem" }}>Side elevation (east)</p>
            <ElevationView model={model} style={concept.style} direction="east" />
          </div>
        </div>
      ) : view === "site" ? (
        <div style={{ margin: "0.75rem 0", maxWidth: 420 }}>
          <SitePlanView model={model} lotWidthFt={lotWidthFt} lotDepthFt={lotDepthFt} />
        </div>
      ) : (
        <div style={{ margin: "0.75rem 0" }}>
          <Walkthrough model={model} />
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
        <button className="btn" type="submit" disabled={revising}>
          {revising ? "Revising…" : "Revise"}
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
          <ReadinessBlock
            model={model}
            checkResults={checkResults}
            lotWidthFt={lotWidthFt}
            lotDepthFt={lotDepthFt}
            sqft={sqft}
            review={review}
          />

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
                  <li key={s.id} style={{ marginBottom: "0.4rem" }}>
                    {s.description} — saves <strong>{formatUsd(s.savingsCents)}</strong>{" "}
                    <span style={{ color: "var(--muted)" }}>({s.designImpact} design impact)</span>{" "}
                    {s.action ? (
                      <button
                        className="btn secondary"
                        style={{ padding: "0.15rem 0.7rem", fontSize: "0.85rem" }}
                        disabled={revising}
                        onClick={async () => {
                          setRevising(true);
                          try {
                            setFeedback(await onApplyVe(s));
                          } finally {
                            setRevising(false);
                          }
                        }}
                      >
                        Apply
                      </button>
                    ) : (
                      <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>(advisory)</span>
                    )}
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
  const [review, setReview] = useState<Review | null>(null);
  const signedIn = typeof window !== "undefined" && Boolean(accountEmail());

  useEffect(() => {
    setEntry(loadProject(params.id));
  }, [params.id]);

  useEffect(() => {
    if (!signedIn) return;
    void fetch("/api/v1/reviews")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { reviews: Review[] } | null) => {
        setReview(data?.reviews.find((rv) => rv.projectId === params.id) ?? null);
      })
      .catch(() => null);
  }, [params.id, signedIn]);

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
    if (saved.ok) {
      setEntry(loadProject(params.id));
      if (accountEmail()) void pushProject(current).then((r) => !r.ok && setStorageNotice(r.error));
    }
  }

  async function handleApplyVe(
    conceptId: string,
    suggestion: ValueEngineeringSuggestion,
  ): Promise<string | null> {
    if (!suggestion.action) return "This suggestion is advisory — apply it by regenerating.";
    if (suggestion.action.kind === "set_finish") {
      handleFinishChange(suggestion.action.field, suggestion.action.option);
      return null;
    }
    // remove_room: flows through the same guarded revision path as any edit.
    const current = loadProject(params.id);
    if (!current) return "Project disappeared from local storage.";
    const idx = current.packages.findIndex((p) => p.concept.id === conceptId);
    if (idx < 0) return "Concept not found.";
    const base = current.packages[idx];
    const outcome = applyOpsToConceptPackage(
      base,
      [{ kind: "remove", target: suggestion.action.target }],
      {
        budgetCents: current.project.budgetCents,
        regionCode: current.regionCode,
        finishes: current.finishes,
      },
    );
    if (!outcome.pkg) {
      return outcome.unrecognized.length > 0 ? outcome.unrecognized.join(" ") : "Nothing to change.";
    }
    current.packages[idx] = { ...base, revisions: [...(base.revisions ?? []), outcome.pkg] };
    const saved = saveProject(current);
    if (!saved.ok) return saved.error;
    setStorageNotice(saved.warning ?? null);
    setEntry(loadProject(params.id));
    if (accountEmail()) void pushProject(current).then((r) => !r.ok && setStorageNotice(r.error));
    return null;
  }

  async function handleRevise(conceptId: string, text: string): Promise<string | null> {
    const current = loadProject(params.id);
    if (!current) return "Project disappeared from local storage.";
    const idx = current.packages.findIndex((p) => p.concept.id === conceptId);
    if (idx < 0) return "Concept not found.";
    const base = current.packages[idx];
    const opts = {
      budgetCents: current.project.budgetCents,
      regionCode: current.regionCode,
      finishes: current.finishes,
    };

    // Deterministic parser first — fast, free, and sufficient for most requests.
    let outcome = reviseConceptPackage(base, text, opts);

    // Parser couldn't act → let the AI interpret intent into the same op shapes.
    if (!outcome.pkg) {
      const currentModel =
        (base.revisions ?? []).length > 0
          ? base.revisions![base.revisions!.length - 1].revision.model
          : base.concept.model;
      const interpreted = await interpretRequest(text, currentModel);
      if (interpreted === "unavailable") {
        return outcome.unrecognized.length > 0
          ? `Couldn't apply: ${outcome.unrecognized.join("; ")}. Try phrases like "bigger kitchen", "add an office", "remove the theater".`
          : "Nothing to change.";
      }
      if (interpreted.ops.length === 0) {
        return interpreted.note || "Nothing in that request maps to a plan change.";
      }
      outcome = applyOpsToConceptPackage(base, interpreted.ops, opts);
      if (!outcome.pkg) {
        return outcome.unrecognized.length > 0 ? `Couldn't apply: ${outcome.unrecognized.join("; ")}` : "Nothing to change.";
      }
    }

    current.packages[idx] = { ...base, revisions: [...(base.revisions ?? []), outcome.pkg] };
    const saved = saveProject(current);
    if (!saved.ok) return saved.error;
    setStorageNotice(saved.warning ?? null);
    setEntry(loadProject(params.id));
    if (accountEmail()) void pushProject(current).then((r) => !r.ok && setStorageNotice(r.error));
    return null;
  }

  return (
    <main>
      <div className="topbar">
        <h1>{project.name}</h1>
        <span style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <Link href={`/app/project/${project.id}/report`}>Design report</Link>
          <Link href="/app">All projects</Link>
        </span>
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
        <h2>Materials &amp; finishes</h2>
        <p>Change a selection and every concept re-prices instantly.</p>
        <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Exterior</span>
        <div className="field-row">
          {EXTERIOR_CATEGORIES.map(({ field, label, options }) => (
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
        <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Interior</span>
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

      <ReviewSection
        projectId={project.id}
        projectName={project.name}
        signedIn={signedIn}
        review={review}
        onReviewChange={setReview}
      />

      {packages.map((pkg) => (
        <ConceptCard
          key={pkg.concept.id}
          pkg={pkg}
          budgetCents={project.budgetCents}
          lotWidthFt={project.lotWidthFt ?? 60}
          lotDepthFt={project.lotDepthFt ?? 120}
          expanded={expanded === pkg.concept.id}
          onToggle={() => setExpanded(expanded === pkg.concept.id ? null : pkg.concept.id)}
          onRevise={(text) => handleRevise(pkg.concept.id, text)}
          onApplyVe={(suggestion) => handleApplyVe(pkg.concept.id, suggestion)}
          review={review}
        />
      ))}
    </main>
  );
}
