import { describe, expect, it } from "vitest";

import { runDesignLoop } from "./loop";
import { buildableWidthFt, buildSitePlan, GENERIC_SETBACKS } from "./site";
import type { DesignBrief } from "../types";

/**
 * The credibility invariant: the platform must never draw a home that its
 * own site plan then flags. Concepts pack within the buildable width (lot
 * minus side yards), so a fresh project has zero setback violations.
 */

function brief(overrides: Partial<DesignBrief["program"]> = {}): DesignBrief {
  return {
    id: "b",
    projectId: "p",
    version: 1,
    program: {
      familySize: 4,
      bedrooms: 4,
      bathrooms: 3.5,
      office: true,
      gym: false,
      theater: false,
      outdoorKitchen: true,
      garageBays: 2,
      ...overrides,
    },
    style: "craftsman",
    interiors: {},
    lifestyleNotes: "",
  };
}

describe("generated concepts fit their own lot (no self-inflicted violations)", () => {
  it("buildable width subtracts both side yards and floors at a sane minimum", () => {
    expect(buildableWidthFt(70)).toBe(70 - 2 * GENERIC_SETBACKS.sideFt);
    expect(buildableWidthFt(30)).toBe(24); // floor, not negative
    expect(buildableWidthFt(null)).toBeNull();
  });

  // Program sized to the lot, the way real briefs are: the interview
  // defaults on a starter lot; a mid program on a suburban lot; the big
  // sample program on an estate lot. On roomy lots every concept must
  // clear the setbacks; even on the tightest lot the two-story does, so
  // no customer ever sees a project where NOTHING fits.
  it.each([
    [70, 130, { bedrooms: 3, bathrooms: 2.5, office: true, outdoorKitchen: false }],
    [90, 150, {}],
  ] as const)(
    "every concept on a %sft x %sft lot clears side and rear setbacks",
    (lotW, lotD, program) => {
      const packages = runDesignLoop(brief(program), {
        lotWidthFt: lotW,
        lotDepthFt: lotD,
        budgetCents: 700_000_00,
        regionCode: "US_NATIONAL",
        finishes: {},
      });
      expect(packages.length).toBeGreaterThanOrEqual(3);
      for (const p of packages) {
        const plan = buildSitePlan(p.concept.model, lotW, lotD);
        expect(plan.violations, `${p.concept.label} on ${lotW}ft lot: ${plan.violations.join("; ")}`).toEqual([]);
      }
    },
  );

  it("even the tightest starter lot always offers at least one clean-fitting concept", () => {
    const packages = runDesignLoop(
      brief({ bedrooms: 3, bathrooms: 2, office: false, outdoorKitchen: false }),
      { lotWidthFt: 60, lotDepthFt: 120, budgetCents: 450_000_00, regionCode: "US_NATIONAL", finishes: {} },
    );
    const fitting = packages.filter((p) => buildSitePlan(p.concept.model, 60, 120).violations.length === 0);
    expect(fitting.length).toBeGreaterThanOrEqual(1);
    // The two-story is the narrow-lot answer and must always be clean.
    expect(fitting.some((p) => p.concept.model.levels === 2)).toBe(true);
  });

  it("the sample project's brief fits its lot AND its budget — the showcase sells, not warns", () => {
    const packages = runDesignLoop(brief(), {
      lotWidthFt: 90,
      lotDepthFt: 150,
      budgetCents: 685_000_00,
      regionCode: "US_NATIONAL",
      finishes: {
        siding: "fiber_cement",
        roofing: "cedar_shake",
        windows: "clad_wood",
        flooring: "hardwood",
        countertops: "quartz",
        cabinets: "semi_custom",
      },
    });
    for (const p of packages) {
      expect(p.estimate.totalCents).toBeLessThanOrEqual(685_000_00);
      expect(buildSitePlan(p.concept.model, 90, 150).violations).toEqual([]);
      expect(p.healthScore).toBeGreaterThanOrEqual(90);
    }
  });
});
