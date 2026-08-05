"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { ElevationView } from "@/components/ElevationView";
import { FloorPlan } from "@/components/FloorPlan";
import { MassingView } from "@/components/MassingView";
import { ReviewSection, type Review } from "@/components/ReviewSection";
import { SitePlanView } from "@/components/SitePlanView";
import { Viewer3D } from "@/components/Viewer3D";
import { Walkthrough } from "@/components/Walkthrough";
import { DEFAULT_FINISHES, EXTERIOR_CATEGORIES, FINISH_CATEGORIES, type FinishSelections } from "@/lib/catalog/materials";
import { styleInfo } from "@/lib/catalog/styles";
import { CONCEPT_DISCLAIMER, ESTIMATE_RANGE_CLAIM } from "@/lib/claims";
import type { Interpretation } from "@/lib/engine/interpret";
import {
  applyOpsToConceptPackage,
  freezeMilestone,
  frozenFloor,
  repriceConceptPackage,
  reviseConceptPackage,
  rollbackConcept,
  type ConceptPackage,
} from "@/lib/engine/loop";
import { ConstraintRegister } from "@/components/ConstraintRegister";
import { SetbacksEditor } from "@/components/SetbacksEditor";
import { SCENARIOS } from "@/lib/catalog/scenarios";
import { compareConcepts } from "@/lib/engine/compare";
import { buildPermitReadiness } from "@/lib/engine/permit";
import { buildSitePlan, sanitizeSetbacks, type SetbackRules } from "@/lib/engine/site";
import { exportFilename, exportProject } from "@/lib/portability";
import { deriveDesignStatus } from "@/lib/status";
import { accountEmail, formatUsd, loadProject, saveProject, type StoredProject } from "@/lib/store";
import { pushProject } from "@/lib/sync";
import type { DesignCheckResult, ParametricModel, SiteConstraint, ValueEngineeringSuggestion } from "@/lib/types";

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
  setbacks,
  constraints,
  sqft,
  review,
}: {
  model: ParametricModel;
  checkResults: DesignCheckResult[];
  lotWidthFt: number;
  lotDepthFt: number;
  setbacks: SetbackRules;
  constraints?: SiteConstraint[];
  sqft: number;
  review: Review | null;
}) {
  const readiness = buildPermitReadiness({
    levels: model.levels,
    sqft,
    checkResults,
    site: buildSitePlan(model, lotWidthFt, lotDepthFt, setbacks),
    reviewStatus: review?.status ?? null,
    reviewNote: review?.note ?? null,
    constraints,
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
  setbacks,
  constraints,
  finishes,
  onRevise,
  onApplyVe,
  onRollback,
  onFreeze,
  onSetbacksChange,
  review,
}: {
  pkg: ConceptPackage;
  budgetCents: number | null;
  lotWidthFt: number;
  lotDepthFt: number;
  setbacks: SetbackRules;
  constraints?: SiteConstraint[];
  finishes?: FinishSelections;
  expanded: boolean;
  onToggle: () => void;
  onRevise: (text: string) => Promise<string | null>;
  onApplyVe: (suggestion: ValueEngineeringSuggestion) => Promise<string | null>;
  onRollback: (keep: number) => Promise<string | null>;
  onFreeze: (label: string) => Promise<string | null>;
  onSetbacksChange: (rules: SetbackRules | null) => Promise<string | null>;
  review: Review | null;
}) {
  const [request, setRequest] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [revising, setRevising] = useState(false);
  const [view, setView] = useState<"plan" | "massing" | "viewer3d" | "elevations" | "site" | "walkthrough">("plan");

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

      <p className="viewtabs">
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
          className={view === "viewer3d" ? "btn" : "btn secondary"}
          onClick={() => setView("viewer3d")}
          type="button"
        >
          3D viewer
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
          <MassingView model={model} style={concept.style} finishes={finishes} />
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem", color: "var(--muted)" }}>
            Massing preview — photorealistic rendering arrives with the ModelSphere pipeline.
          </p>
        </div>
      ) : view === "viewer3d" ? (
        <div style={{ margin: "0.75rem 0" }}>
          <Viewer3D model={model} style={concept.style} finishes={finishes} />
        </div>
      ) : view === "elevations" ? (
        <div style={{ margin: "0.75rem 0", display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 260px" }}>
            <p style={{ margin: "0 0 0.25rem", fontSize: "0.8rem" }}>Front elevation (north)</p>
            <ElevationView model={model} style={concept.style} direction="north" finishes={finishes} />
          </div>
          <div style={{ flex: "1 1 260px" }}>
            <p style={{ margin: "0 0 0.25rem", fontSize: "0.8rem" }}>Side elevation (east)</p>
            <ElevationView model={model} style={concept.style} direction="east" finishes={finishes} />
          </div>
        </div>
      ) : view === "site" ? (
        <div style={{ margin: "0.75rem 0", maxWidth: 420 }}>
          <SitePlanView model={model} lotWidthFt={lotWidthFt} lotDepthFt={lotDepthFt} rules={setbacks} />
          <SetbacksEditor rules={setbacks} onSave={onSetbacksChange} />
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
        <div style={{ margin: "0.75rem 0", fontSize: "0.85rem" }}>
          <p style={{ margin: "0 0 0.25rem", color: "var(--muted)" }}>History</p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {[
              {
                key: "original",
                label: "Original concept",
                health: pkg.healthScore,
                totalCents: pkg.estimate.totalCents,
                keep: 0,
              },
              ...history.map((h, i) => ({
                key: h.revision.id,
                label: `${i + 1}. ${h.revision.changeSummary}`,
                health: h.healthScore,
                totalCents: h.estimate.totalCents,
                keep: i + 1,
              })),
            ].map((step, i, steps) => {
              const isCurrent = i === steps.length - 1;
              const costDelta = i > 0 ? step.totalCents - steps[i - 1].totalCents : 0;
              return (
                <li
                  key={step.key}
                  style={{
                    display: "flex",
                    gap: "0.75rem",
                    alignItems: "baseline",
                    padding: "0.2rem 0",
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ flex: "1 1 14rem" }}>
                    {step.label}
                    {isCurrent && <strong> (current)</strong>}
                  </span>
                  <span style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>
                    Health {step.health} · {formatUsd(step.totalCents)}
                    {i > 0 && (
                      <span className={costDelta > 0 ? "status-warn" : "status-pass"}>
                        {" "}
                        ({costDelta >= 0 ? "+" : "−"}
                        {formatUsd(Math.abs(costDelta))})
                      </span>
                    )}
                  </span>
                  {(pkg.milestones ?? []).some((m) => m.revisionCount === step.keep) && (
                    <span
                      className="status-pass"
                      title="Frozen milestone — rollback can't go below this point"
                      style={{ fontSize: "0.8rem" }}
                    >
                      ❄ {(pkg.milestones ?? []).find((m) => m.revisionCount === step.keep)!.label}
                    </span>
                  )}
                  {!isCurrent && step.keep >= frozenFloor(pkg) && (
                    <button
                      className="btn secondary"
                      style={{ padding: "0.1rem 0.6rem", fontSize: "0.8rem" }}
                      type="button"
                      disabled={revising}
                      onClick={async () => {
                        if (
                          !window.confirm(
                            `Roll back to "${step.label}"? The ${steps.length - 1 - i} later revision(s) will be discarded.`,
                          )
                        )
                          return;
                        setRevising(true);
                        try {
                          setFeedback(await onRollback(step.keep));
                        } finally {
                          setRevising(false);
                        }
                      }}
                    >
                      Roll back
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p style={{ display: "flex", gap: "0.5rem", margin: "0.5rem 0 0" }}>
        <button className="btn secondary" onClick={onToggle}>
          {expanded ? "Hide details" : "Checks, costs & savings"}
        </button>
        <button
          className="btn secondary"
          type="button"
          disabled={revising}
          title="Freeze the current state as an immutable milestone — later changes still append, but rollback can never go below it."
          onClick={async () => {
            const label = window.prompt("Name this milestone (e.g. \"Presented to family\"):");
            if (label === null) return;
            setRevising(true);
            try {
              setFeedback(await onFreeze(label));
            } finally {
              setRevising(false);
            }
          }}
        >
          Freeze milestone
        </button>
      </p>

      {expanded && (
        <div style={{ marginTop: "1rem" }}>
          <ReadinessBlock
            model={model}
            checkResults={checkResults}
            lotWidthFt={lotWidthFt}
            lotDepthFt={lotDepthFt}
            setbacks={setbacks}
            constraints={constraints}
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
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
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

  async function handleRollback(conceptId: string, keep: number): Promise<string | null> {
    const current = loadProject(params.id);
    if (!current) return "Project disappeared from local storage.";
    const idx = current.packages.findIndex((p) => p.concept.id === conceptId);
    if (idx < 0) return "Concept not found.";
    const rolled = rollbackConcept(current.packages[idx], keep);
    if (!rolled.ok) return rolled.error;
    current.packages[idx] = rolled.pkg;
    const saved = saveProject(current);
    if (!saved.ok) return saved.error;
    setStorageNotice(saved.warning ?? null);
    setEntry(loadProject(params.id));
    if (accountEmail()) void pushProject(current).then((r) => !r.ok && setStorageNotice(r.error));
    return null;
  }

  async function handleSetbacksChange(rules: SetbackRules | null): Promise<string | null> {
    const current = loadProject(params.id);
    if (!current) return "Project disappeared from local storage.";
    if (rules) current.setbacks = sanitizeSetbacks(rules);
    else delete current.setbacks;
    const saved = saveProject(current);
    if (!saved.ok) return saved.error;
    setStorageNotice(saved.warning ?? null);
    setEntry(loadProject(params.id));
    if (accountEmail()) void pushProject(current).then((r) => !r.ok && setStorageNotice(r.error));
    return null;
  }

  async function handleFreeze(conceptId: string, label: string): Promise<string | null> {
    const current = loadProject(params.id);
    if (!current) return "Project disappeared from local storage.";
    const idx = current.packages.findIndex((p) => p.concept.id === conceptId);
    if (idx < 0) return "Concept not found.";
    const frozen = freezeMilestone(current.packages[idx], label, Date.now());
    if (!frozen.ok) return frozen.error;
    current.packages[idx] = frozen.pkg;
    const saved = saveProject(current);
    if (!saved.ok) return saved.error;
    setStorageNotice(saved.warning ?? null);
    setEntry(loadProject(params.id));
    if (accountEmail()) void pushProject(current).then((r) => !r.ok && setStorageNotice(r.error));
    return null;
  }

  async function handleConstraintsChange(next: SiteConstraint[]): Promise<string | null> {
    const current = loadProject(params.id);
    if (!current) return "Project disappeared from local storage.";
    current.constraints = next;
    const saved = saveProject(current);
    if (!saved.ok) return saved.error;
    setStorageNotice(saved.warning ?? null);
    setEntry(loadProject(params.id));
    if (accountEmail()) void pushProject(current).then((r) => !r.ok && setStorageNotice(r.error));
    return null;
  }

  async function handleShare() {
    if (!signedIn) {
      setStorageNotice("Sign in (Account) to create a share link — the link serves your synced copy.");
      return;
    }
    setShareBusy(true);
    try {
      // The link serves the server copy, so make sure it's current first.
      const current = loadProject(params.id);
      if (current) {
        const pushed = await pushProject(current);
        if (!pushed.ok) {
          setStorageNotice(pushed.error);
          return;
        }
      }
      const res = await fetch("/api/v1/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: params.id }),
      }).catch(() => null);
      const body = (await res?.json().catch(() => null)) as { token?: string; error?: string } | null;
      if (!res?.ok || !body?.token) {
        setStorageNotice(body?.error ?? "Creating the share link failed — try again.");
        return;
      }
      setShareUrl(`${window.location.origin}/share/${body.token}`);
      setStorageNotice(null);
    } finally {
      setShareBusy(false);
    }
  }

  async function handleRevokeShare() {
    setShareBusy(true);
    try {
      const res = await fetch(`/api/v1/share?projectId=${encodeURIComponent(params.id)}`, {
        method: "DELETE",
      }).catch(() => null);
      if (!res?.ok) {
        const body = (await res?.json().catch(() => null)) as { error?: string } | null;
        setStorageNotice(body?.error ?? "Revoking the link failed — try again.");
        return;
      }
      setShareUrl(null);
      setStorageNotice("Share link revoked — the old URL no longer works.");
    } finally {
      setShareBusy(false);
    }
  }

  const designStatus = deriveDesignStatus({
    reviewStatus: review?.status ?? null,
    revisedSinceReview: review ? (entry.savedAt ?? 0) > Date.parse(review.updatedAt) : false,
  });

  return (
    <main>
      <div className="topbar">
        <h1>
          {project.name}{" "}
          <span
            className={designStatus.tone === "muted" ? "" : `status-${designStatus.tone}`}
            style={{ fontSize: "0.9rem", fontWeight: 500, color: designStatus.tone === "muted" ? "var(--muted)" : undefined }}
            title={designStatus.meaning}
          >
            · {designStatus.label}
          </span>
        </h1>
        <span style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <button
            className="btn secondary"
            style={{ padding: "0.3rem 0.8rem" }}
            type="button"
            onClick={() => {
              const blob = new Blob([JSON.stringify(exportProject(entry), null, 2)], {
                type: "application/json",
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = exportFilename(entry);
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export
          </button>
          <button
            className="btn secondary"
            style={{ padding: "0.3rem 0.8rem" }}
            type="button"
            disabled={shareBusy}
            onClick={() => void handleShare()}
          >
            {shareBusy ? "Sharing…" : "Share"}
          </button>
          <Link href={`/app/project/${project.id}/report`}>Design report</Link>
          <Link href={`/app/project/${project.id}/bids`}>Bid package</Link>
          <Link href={`/app/project/${project.id}/schedule`}>Schedule</Link>
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
      {shareUrl && (
        <div className="card" style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ marginTop: 0 }}>Share link</h2>
          <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
            Anyone with this link can view the design and estimate — read-only, no account needed.
            Creating a new link replaces this one.
          </p>
          <p style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
            <input
              readOnly
              value={shareUrl}
              style={{ flex: 1, minWidth: "16rem" }}
              onFocus={(e) => e.target.select()}
            />
            <button
              className="btn secondary"
              type="button"
              onClick={() => void navigator.clipboard?.writeText(shareUrl)}
            >
              Copy
            </button>
            <button
              className="btn secondary"
              type="button"
              disabled={shareBusy}
              onClick={() => void handleRevokeShare()}
            >
              Revoke
            </button>
          </p>
        </div>
      )}

      {packages.length > 1 && (
        <div className="card" style={{ marginBottom: "1.5rem", overflowX: "auto" }}>
          <h2 style={{ marginTop: 0 }}>Compare concepts</h2>
          <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: "0 0 0.5rem" }}>
            Normalized metrics on each concept&apos;s current state, plus every budget scenario
            priced against it. &quot;Current&quot; is your actual selections — scenarios never
            overwrite them.
          </p>
          {(() => {
            const rows = compareConcepts(packages, {
              regionCode: entry.regionCode,
              lotWidthFt: project.lotWidthFt ?? 60,
              lotDepthFt: project.lotDepthFt ?? 120,
              setbacks: sanitizeSetbacks(entry.setbacks),
            });
            return (
              <table className="lineitems">
                <thead>
                  <tr>
                    <th>Concept</th>
                    <th>Sqft</th>
                    <th>Beds/Baths</th>
                    <th>Stories</th>
                    <th>Health</th>
                    <th>Site fit</th>
                    <th>$/sqft</th>
                    <th>Current</th>
                    {SCENARIOS.map((s) => (
                      <th key={s.key} title={s.blurb}>
                        {s.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.conceptId}>
                      <td>{r.label}</td>
                      <td>{r.sqft.toLocaleString()}</td>
                      <td>
                        {r.beds}/{r.baths}
                      </td>
                      <td>{r.levels}</td>
                      <td>{r.healthScore}</td>
                      <td className={r.fitsLot ? "status-pass" : "status-fail"}>{r.fitsLot ? "fits" : "check"}</td>
                      <td>{formatUsd(r.costPerSqftCents)}</td>
                      <td>
                        <strong>{formatUsd(r.currentTotalCents)}</strong>
                      </td>
                      {SCENARIOS.map((s) => (
                        <td key={s.key}>{formatUsd(r.scenarioTotals[s.key])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}
        </div>
      )}

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

      <ConstraintRegister constraints={entry.constraints ?? []} onChange={handleConstraintsChange} />

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
          setbacks={sanitizeSetbacks(entry.setbacks)}
          constraints={entry.constraints}
          finishes={entry.finishes}
          expanded={expanded === pkg.concept.id}
          onToggle={() => setExpanded(expanded === pkg.concept.id ? null : pkg.concept.id)}
          onRevise={(text) => handleRevise(pkg.concept.id, text)}
          onApplyVe={(suggestion) => handleApplyVe(pkg.concept.id, suggestion)}
          onRollback={(keep) => handleRollback(pkg.concept.id, keep)}
          onFreeze={(label) => handleFreeze(pkg.concept.id, label)}
          onSetbacksChange={handleSetbacksChange}
          review={review}
        />
      ))}
    </main>
  );
}
