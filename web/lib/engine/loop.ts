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

export interface ConceptPackage {
  concept: DesignConcept;
  healthScore: number;
  checkResults: DesignCheckResult[];
  estimate: Estimate;
  veSuggestions: ValueEngineeringSuggestion[];
  /** Iteration history, oldest first. Absent on pre-revision stored data. */
  revisions?: RevisionPackage[];
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
      veSuggestions: valueEngineering(estimate, opts.budgetCents, concept.model),
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
    veSuggestions: valueEngineering(baseEstimate, opts.budgetCents, pkg.concept.model),
    revisions: (pkg.revisions ?? []).map((rev) => {
      const estimate = estimateRevision(rev.revision.model, rev.revision.id, opts.regionCode, finishes);
      return {
        ...rev,
        estimate,
        veSuggestions: valueEngineering(estimate, opts.budgetCents, rev.revision.model),
      };
    }),
  };
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
      veSuggestions: valueEngineering(estimate, opts.budgetCents, model),
      rejected,
    },
    unrecognized,
  };
}
