import { describe, expect, it } from "vitest";

import { SCENARIOS } from "../catalog/scenarios";
import {
  APPLIANCES,
  CABINETS,
  COUNTERTOPS,
  FLOORING,
  LIGHTING,
  PAINT,
  ROOFING,
  SIDING,
  WINDOWS,
} from "../catalog/materials";
import type { DesignBrief } from "../types";
import { compareConcepts } from "./compare";
import { reviseConceptPackage, runDesignLoop } from "./loop";

const brief: DesignBrief = {
  id: "b",
  projectId: "p",
  version: 1,
  program: {
    familySize: 4,
    bedrooms: 3,
    bathrooms: 2,
    office: false,
    gym: false,
    theater: false,
    outdoorKitchen: false,
    garageBays: 2,
  },
  style: "craftsman",
  interiors: {},
  lifestyleNotes: "",
};

describe("budget scenarios", () => {
  it("every scenario key exists in the catalogs — no dead references", () => {
    const catalogs = { flooring: FLOORING, countertops: COUNTERTOPS, cabinets: CABINETS, appliances: APPLIANCES, lighting: LIGHTING, paint: PAINT, siding: SIDING, roofing: ROOFING, windows: WINDOWS };
    for (const scenario of SCENARIOS) {
      for (const [field, key] of Object.entries(scenario.finishes)) {
        const options = catalogs[field as keyof typeof catalogs];
        expect(options.some((o) => o.key === key), `${scenario.key}.${field}=${key}`).toBe(true);
      }
    }
  });

  it("target ≤ base ≤ premium on every concept", () => {
    const packages = runDesignLoop(brief, { lotWidthFt: 60, budgetCents: null, regionCode: "US_SOUTH" });
    const rows = compareConcepts(packages, { regionCode: "US_SOUTH", lotWidthFt: 60, lotDepthFt: 120 });
    for (const r of rows) {
      expect(r.scenarioTotals.target).toBeLessThanOrEqual(r.scenarioTotals.base);
      expect(r.scenarioTotals.base).toBeLessThanOrEqual(r.scenarioTotals.premium);
    }
  });
});

describe("compareConcepts", () => {
  it("normalizes metrics and prices scenarios against the LATEST revision", () => {
    const packages = runDesignLoop(brief, { lotWidthFt: 60, budgetCents: null });
    const before = compareConcepts(packages, { regionCode: "US_NATIONAL", lotWidthFt: 60, lotDepthFt: 120 });

    const revised = reviseConceptPackage(packages[0], "add a gym", { budgetCents: null }).pkg!;
    packages[0] = { ...packages[0], revisions: [revised] };
    const after = compareConcepts(packages, { regionCode: "US_NATIONAL", lotWidthFt: 60, lotDepthFt: 120 });

    // The revised concept grew — its sqft and scenario totals move; others don't.
    expect(after[0].sqft).toBeGreaterThan(before[0].sqft);
    expect(after[0].scenarioTotals.base).toBeGreaterThan(before[0].scenarioTotals.base);
    expect(after[1].scenarioTotals.base).toBe(before[1].scenarioTotals.base);

    for (const r of after) {
      expect(r.costPerSqftCents).toBe(Math.round(r.currentTotalCents / r.sqft));
      expect(typeof r.fitsLot).toBe("boolean");
      expect(r.healthScore).toBeGreaterThan(0);
    }
  });
});
