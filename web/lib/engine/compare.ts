/**
 * Concept comparison (spec BS-DES-005): normalized metrics across the
 * concepts — area, program, health, site fit, and money — plus each
 * budget scenario (BS-COST-004) priced against every concept's CURRENT
 * geometry (latest revision), so the numbers always describe the design
 * as it stands.
 */

import { SCENARIOS } from "../catalog/scenarios";
import type { FinishSelections } from "../catalog/materials";
import { estimateRevision } from "./estimate";
import { buildSitePlan, type SetbackRules } from "./site";
import type { ConceptPackage } from "./loop";

export interface ConceptComparison {
  conceptId: string;
  label: string;
  sqft: number;
  beds: number;
  baths: number;
  levels: number;
  healthScore: number;
  fitsLot: boolean;
  /** Why it doesn't fit, when it doesn't — shown to the customer verbatim. */
  fitNotes: string[];
  /** The customer's actual selections — the stored estimate. */
  currentTotalCents: number;
  costPerSqftCents: number;
  scenarioTotals: Record<(typeof SCENARIOS)[number]["key"], number>;
}

export function compareConcepts(
  packages: ConceptPackage[],
  opts: {
    regionCode: string;
    lotWidthFt: number;
    lotDepthFt: number;
    setbacks?: SetbackRules;
  },
): ConceptComparison[] {
  return packages.map((pkg) => {
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
    const site = buildSitePlan(model, opts.lotWidthFt, opts.lotDepthFt, opts.setbacks);

    const scenarioTotals = Object.fromEntries(
      SCENARIOS.map((s) => {
        const finishes: FinishSelections & { styleKey?: typeof pkg.concept.style } = {
          ...s.finishes,
          styleKey: pkg.concept.style,
        };
        return [s.key, estimateRevision(model, `${pkg.concept.id}-cmp-${s.key}`, opts.regionCode, finishes).totalCents];
      }),
    ) as ConceptComparison["scenarioTotals"];

    return {
      conceptId: pkg.concept.id,
      label: pkg.concept.label,
      sqft,
      beds: pkg.concept.beds,
      baths: pkg.concept.baths,
      levels: model.levels,
      healthScore,
      fitsLot: site.fits,
      fitNotes: site.violations,
      currentTotalCents: estimate.totalCents,
      costPerSqftCents: sqft > 0 ? Math.round(estimate.totalCents / sqft) : 0,
      scenarioTotals,
    };
  });
}
