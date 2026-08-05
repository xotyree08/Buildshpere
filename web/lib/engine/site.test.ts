import { describe, expect, it } from "vitest";

import type { DesignBrief, HomeStyle } from "../types";
import { generateConcepts } from "./generate";
import { buildSitePlan, GENERIC_SETBACKS } from "./site";

function brief(style: HomeStyle = "ranch"): DesignBrief {
  return {
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
    style,
    interiors: {},
    lifestyleNotes: "",
  };
}

describe("buildSitePlan", () => {
  it("centers the footprint between the side lot lines and front-aligns it at the setback", () => {
    const model = generateConcepts(brief(), 80)[0].model;
    const site = buildSitePlan(model, 100, 200);
    expect(site.footprint.y).toBe(GENERIC_SETBACKS.frontFt);
    const leftGap = site.footprint.x;
    const rightGap = site.lotWidthFt - (site.footprint.x + site.footprint.w);
    expect(leftGap).toBeCloseTo(rightGap, 5);
    expect(site.margins.front).toBe(GENERIC_SETBACKS.frontFt);
  });

  it("a generous lot fits with sane coverage; margins reconcile with the lot", () => {
    const model = generateConcepts(brief(), 80)[0].model;
    const site = buildSitePlan(model, 120, 220);
    expect(site.fits).toBe(true);
    expect(site.violations).toEqual([]);
    expect(site.coverage.pct).toBeGreaterThan(0);
    expect(site.coverage.pct).toBeLessThan(GENERIC_SETBACKS.maxCoveragePct);
    // margins are display-rounded to 0.1 ft, so reconcile within half a foot
    expect(site.margins.side * 2 + site.footprint.w).toBeCloseTo(site.lotWidthFt, 0);
    expect(site.margins.front + site.footprint.d + site.margins.rear).toBeCloseTo(site.lotDepthFt, 0);
  });

  it("a narrow lot names the side-setback violation", () => {
    const model = generateConcepts(brief(), 80)[0].model;
    const wide = buildSitePlan(model, 300, 300);
    // A lot just narrower than footprint + both side setbacks must violate.
    const tightLot = Math.floor(wide.footprint.w + 2 * GENERIC_SETBACKS.sideFt - 2);
    const site = buildSitePlan(model, tightLot, 300);
    expect(site.fits).toBe(false);
    expect(site.violations.some((v) => v.includes("Side yards"))).toBe(true);
  });

  it("a shallow lot names the rear-yard violation", () => {
    const model = generateConcepts(brief(), 80)[0].model;
    const site = buildSitePlan(model, 150, GENERIC_SETBACKS.frontFt + Math.ceil(site0(model)) + 5);
    expect(site.fits).toBe(false);
    expect(site.violations.some((v) => v.includes("Rear yard"))).toBe(true);
  });

  it("coverage counts every ground-floor room including garage and porch", () => {
    const model = generateConcepts(brief("farmhouse"), 80)[0].model; // farmhouse adds a porch
    const site = buildSitePlan(model, 150, 250);
    const groundArea = Math.round(
      model.rooms.filter((r) => r.level === 0).reduce((a, r) => a + r.rect[2] * r.rect[3], 0),
    );
    expect(site.coverage.footprintSqft).toBe(groundArea);
    expect(model.rooms.some((r) => r.level === 0 && r.kind === "outdoor")).toBe(true);
    expect(model.rooms.some((r) => r.level === 0 && r.kind === "garage")).toBe(true);
  });

  it("flags excessive coverage on a tiny lot", () => {
    const model = generateConcepts(brief(), 80)[0].model;
    const site = buildSitePlan(model, 60, 80);
    expect(site.coverage.pct).toBeGreaterThan(GENERIC_SETBACKS.maxCoveragePct);
    expect(site.violations.some((v) => v.includes("coverage"))).toBe(true);
  });

  it("is deterministic", () => {
    const model = generateConcepts(brief(), 80)[0].model;
    expect(buildSitePlan(model, 100, 200)).toEqual(buildSitePlan(model, 100, 200));
  });
});

/** Depth of the ground-floor footprint, for constructing shallow lots. */
function site0(model: Parameters<typeof buildSitePlan>[0]): number {
  const rooms = model.rooms.filter((r) => r.level === 0);
  return (
    Math.max(...rooms.map((r) => r.rect[1] + r.rect[3])) - Math.min(...rooms.map((r) => r.rect[1]))
  );
}
