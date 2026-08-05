/**
 * The Phase 1 design loop, composed: generate → check → price → value-engineer.
 * Used identically by the UI and the API routes so there is one behavior.
 */

import type {
  DesignBrief,
  DesignCheckResult,
  DesignConcept,
  DesignRevision,
  Estimate,
  ValueEngineeringSuggestion,
} from "../types";
import { generateConcepts } from "./generate";
import { runChecks } from "./checks";
import { estimateRevision, valueEngineering, type EstimateFinishes } from "./estimate";
import { applyRevision, parseRevisionRequest, type RevisionOp } from "./revise";
import type { FinishSelections } from "../catalog/materials";

export interface LoopOptions {
  lotWidthFt: number | null;
  budgetCents: number | null;
  regionCode?: string;
  finishes?: FinishSelections;
}

export interface RevisionPackage {
  revision: DesignRevision;
  healthScore: number;
  checkResults: DesignCheckResult[];
  estimate: Estimate;
  veSuggestions: ValueEngineeringSuggestion[];
  /** Ops the engine declined, with reasons (e.g. removing the only bath). */
  rejected: string[];
}

export interface Milestone {
  label: string;
  /** ms epoch when frozen. */
  at: number;
  /** How many revisions existed at the freeze — the immutable floor. */
  revisionCount: number;
}

export interface ConceptPackage {
  concept: DesignConcept;
  healthScore: number;
  checkResults: DesignCheckResult[];
  estimate: Estimate;
  veSuggestions: ValueEngineeringSuggestion[];
  /** Iteration history, oldest first. Absent on pre-revision stored data. */
  revisions?: RevisionPackage[];
  /** Frozen milestones (spec BS-DES-006), oldest first. */
  milestones?: Milestone[];
}

export function runDesignLoop(brief: DesignBrief, opts: LoopOptions): ConceptPackage[] {
  return generateConcepts(brief, opts.lotWidthFt).map((concept) => {
    const revisionId = `${concept.id}-r0`;
    const finishes: EstimateFinishes = { ...opts.finishes, styleKey: concept.style };
    const health = runChecks(concept.model, revisionId);
    const estimate = estimateRevision(concept.model, revisionId, opts.regionCode, finishes);
    return {
      concept,
      healthScore: health.score,
      checkResults: health.results,
      estimate,
      veSuggestions: valueEngineering(estimate, opts.budgetCents, concept.model, finishes),
    };
  });
}

/**
 * Re-price an existing package (concept and its whole revision history) under
 * new finish selections. Geometry and health are untouched — only money moves.
 */
export function repriceConceptPackage(
  pkg: ConceptPackage,
  opts: { budgetCents: number | null; regionCode?: string; finishes?: FinishSelections },
): ConceptPackage {
  const finishes: EstimateFinishes = { ...opts.finishes, styleKey: pkg.concept.style };
  const baseEstimate = estimateRevision(pkg.concept.model, `${pkg.concept.id}-r0`, opts.regionCode, finishes);
  return {
    ...pkg,
    estimate: baseEstimate,
    veSuggestions: valueEngineering(baseEstimate, opts.budgetCents, pkg.concept.model, finishes),
    revisions: (pkg.revisions ?? []).map((rev) => {
      const estimate = estimateRevision(rev.revision.model, rev.revision.id, opts.regionCode, finishes);
      return {
        ...rev,
        estimate,
        veSuggestions: valueEngineering(estimate, opts.budgetCents, rev.revision.model, finishes),
      };
    }),
  };
}

export type RollbackResult = { ok: true; pkg: ConceptPackage } | { ok: false; error: string };

/**
 * Freeze the concept's current state as an immutable milestone
 * (BS-DES-006): later revisions still append normally, but rollback can
 * never descend below the newest milestone — an approved state cannot be
 * silently unmade.
 */
export function freezeMilestone(
  pkg: ConceptPackage,
  label: string,
  at: number,
): RollbackResult {
  const trimmed = label.trim();
  if (!trimmed) return { ok: false, error: "Give the milestone a name (e.g. \"Presented to family\")." };
  const revisionCount = (pkg.revisions ?? []).length;
  const milestones = pkg.milestones ?? [];
  if (milestones.some((m) => m.revisionCount === revisionCount)) {
    return { ok: false, error: "This exact state is already frozen as a milestone." };
  }
  return {
    ok: true,
    pkg: { ...pkg, milestones: [...milestones, { label: trimmed, at, revisionCount }] },
  };
}

/** The rollback floor: revisions at or above the newest milestone are protected. */
export function frozenFloor(pkg: ConceptPackage): number {
  return (pkg.milestones ?? []).reduce((max, m) => Math.max(max, m.revisionCount), 0);
}

/**
 * Return a concept to an earlier state by discarding later revisions.
 * `keep` is how many revisions survive (0 = back to the original concept).
 * Pure truncation: every retained state was already checked and priced when
 * it was made, so nothing is recomputed and ids stay consistent for the
 * next revision (`applyOpsToConceptPackage` numbers from history length).
 */
export function rollbackConcept(pkg: ConceptPackage, keep: number): RollbackResult {
  const history = pkg.revisions ?? [];
  if (!Number.isInteger(keep) || keep < 0 || keep >= history.length) {
    return {
      ok: false,
      error: `Nothing to roll back — this concept has ${history.length} revision(s).`,
    };
  }
  const floor = frozenFloor(pkg);
  if (keep < floor) {
    const milestone = (pkg.milestones ?? []).find((m) => m.revisionCount === floor);
    return {
      ok: false,
      error: `Can't roll back past the frozen milestone "${milestone?.label ?? "milestone"}" — frozen states are immutable.`,
    };
  }
  return { ok: true, pkg: { ...pkg, revisions: history.slice(0, keep) } };
}

export interface ReviseOutcome {
  pkg: RevisionPackage | null;
  /** Clauses the parser could not turn into ops. */
  unrecognized: string[];
}

/**
 * One iteration turn: parse the request, apply what parsed, re-check and
 * re-price the result. Returns pkg=null when nothing actionable parsed OR
 * every parsed op was rejected — callers show `unrecognized`/rejections
 * instead of silently minting an unchanged revision.
 */
export function reviseConceptPackage(
  base: ConceptPackage,
  requestText: string,
  opts: { budgetCents: number | null; regionCode?: string; finishes?: FinishSelections },
): ReviseOutcome {
  const { ops, unrecognized } = parseRevisionRequest(requestText);
  if (ops.length === 0) return { pkg: null, unrecognized };
  return applyOpsToConceptPackage(base, ops, opts, unrecognized);
}

/**
 * Apply already-structured ops (from the deterministic parser or from the
 * AI interpreter after validation) — one shared path, so both routes obey
 * identical layout rules and guardrails.
 */
export function applyOpsToConceptPackage(
  base: ConceptPackage,
  ops: RevisionOp[],
  opts: { budgetCents: number | null; regionCode?: string; finishes?: FinishSelections },
  unrecognized: string[] = [],
): ReviseOutcome {
  if (ops.length === 0) return { pkg: null, unrecognized };

  const history = base.revisions ?? [];
  const currentModel = history.length > 0 ? history[history.length - 1].revision.model : base.concept.model;
  const { model, applied, rejected } = applyRevision(currentModel, ops);
  if (applied.length === 0) return { pkg: null, unrecognized: [...unrecognized, ...rejected] };

  const revisionIndex = history.length + 1;
  const revisionId = `${base.concept.id}-r${revisionIndex}`;
  const parentRevisionId = history.length > 0 ? history[history.length - 1].revision.id : `${base.concept.id}-r0`;
  const finishes: EstimateFinishes = { ...opts.finishes, styleKey: base.concept.style };
  const health = runChecks(model, revisionId);
  const estimate = estimateRevision(model, revisionId, opts.regionCode, finishes);

  return {
    pkg: {
      revision: {
        id: revisionId,
        conceptId: base.concept.id,
        parentRevisionId,
        changeSummary: applied.join("; "),
        model,
        healthScore: health.score,
      },
      healthScore: health.score,
      checkResults: health.results,
      estimate,
      veSuggestions: valueEngineering(estimate, opts.budgetCents, model, finishes),
      rejected,
    },
    unrecognized,
  };
}
