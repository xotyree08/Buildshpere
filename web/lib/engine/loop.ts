/**
 * The Phase 1 design loop, composed: generate → check → price → value-engineer.
 * Used identically by the UI and the API routes so there is one behavior.
 */

import type { DesignBrief, DesignCheckResult, DesignConcept, Estimate, ValueEngineeringSuggestion } from "../types";
import { generateConcepts } from "./generate";
import { runChecks } from "./checks";
import { estimateRevision, valueEngineering } from "./estimate";

export interface ConceptPackage {
  concept: DesignConcept;
  healthScore: number;
  checkResults: DesignCheckResult[];
  estimate: Estimate;
  veSuggestions: ValueEngineeringSuggestion[];
}

export function runDesignLoop(
  brief: DesignBrief,
  opts: { lotWidthFt: number | null; budgetCents: number | null; regionCode?: string },
): ConceptPackage[] {
  return generateConcepts(brief, opts.lotWidthFt).map((concept) => {
    const revisionId = `${concept.id}-r0`;
    const health = runChecks(concept.model, revisionId);
    const estimate = estimateRevision(concept.model, revisionId, opts.regionCode);
    return {
      concept,
      healthScore: health.score,
      checkResults: health.results,
      estimate,
      veSuggestions: valueEngineering(estimate, opts.budgetCents, concept.model),
    };
  });
}
