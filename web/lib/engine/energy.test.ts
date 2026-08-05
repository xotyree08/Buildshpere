import { describe, expect, it } from "vitest";

import { buildEnergyReport } from "./energy";
import { generateConcepts } from "./generate";
import type { DesignBrief } from "../types";

const brief: DesignBrief = {
  id: "b1",
  projectId: "p1",
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

const model = () => generateConcepts(brief, 90)[0].model;

describe("buildEnergyReport", () => {
  it("component shares sum to ~100% and the band brackets the point estimate", () => {
    const r = buildEnergyReport(model());
    const shares = r.components.reduce((s, c) => s + c.sharePct, 0);
    expect(shares).toBeGreaterThanOrEqual(97);
    expect(shares).toBeLessThanOrEqual(103);
    const annual = r.heatingCostCents + r.coolingCostCents;
    expect(r.annualLowCents).toBeLessThan(annual);
    expect(r.annualHighCents).toBeGreaterThan(annual);
    expect(annual).toBeGreaterThan(50_000); // > $500/yr — sanity, not fantasy
    expect(annual).toBeLessThan(1_000_000); // < $10k/yr
  });

  it("the midwest heats harder than the south; the south cools harder", () => {
    const midwest = buildEnergyReport(model(), "US_MIDWEST");
    const south = buildEnergyReport(model(), "US_SOUTH");
    expect(midwest.heatingCostCents).toBeGreaterThan(south.heatingCostCents);
    expect(south.coolingCostCents).toBeGreaterThan(midwest.coolingCostCents);
  });

  it("better windows genuinely lower the annual cost", () => {
    const cheap = buildEnergyReport(model(), "US_NATIONAL", { windows: "builder_vinyl" });
    const good = buildEnergyReport(model(), "US_NATIONAL", { windows: "fiberglass" });
    expect(good.heatingCostCents + good.coolingCostCents).toBeLessThan(
      cheap.heatingCostCents + cheap.coolingCostCents,
    );
  });

  it("window upgrade carries real price-book cost and a payback", () => {
    const r = buildEnergyReport(model(), "US_MIDWEST", { windows: "vinyl_lowe" });
    const windowUp = r.upgrades.find((u) => u.description.includes("windows"));
    expect(windowUp).toBeDefined();
    expect(windowUp!.savingsPerYearCents).toBeGreaterThan(0);
    expect(windowUp!.extraCostCents).toBeGreaterThan(0);
    expect(windowUp!.paybackYears).toBeGreaterThan(0);
  });

  it("steel windows (worse U) offer no window 'upgrade'", () => {
    const r = buildEnergyReport(model(), "US_NATIONAL", { windows: "clad_wood" });
    // clad_wood → steel is a step up in price but worse thermally: no window upgrade offered.
    expect(r.upgrades.some((u) => u.description.includes("Steel"))).toBe(false);
  });

  it("air sealing is always offered as an advisory upgrade", () => {
    const r = buildEnergyReport(model());
    const sealing = r.upgrades.find((u) => u.description.includes("air sealing"));
    expect(sealing).toBeDefined();
    expect(sealing!.extraCostCents).toBeNull();
  });

  it("is deterministic and honest about scope", () => {
    const a = buildEnergyReport(model(), "US_WEST", { windows: "fiberglass" });
    const b = buildEnergyReport(model(), "US_WEST", { windows: "fiberglass" });
    expect(a).toEqual(b);
    expect(a.notes.join(" ")).toContain("HERS");
  });
});
