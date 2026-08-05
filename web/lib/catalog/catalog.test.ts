import { describe, expect, it } from "vitest";

import type { DesignBrief } from "../types";
import { generateConcepts } from "../engine/generate";
import { estimateRevision } from "../engine/estimate";
import { repriceConceptPackage, runDesignLoop } from "../engine/loop";
import { DEFAULT_FINISHES, EXTERIOR_CATEGORIES, FINISH_CATEGORIES } from "./materials";
import { STYLE_CATEGORIES, STYLES, styleInfo, stylesByCategory } from "./styles";

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
  style: "modern",
  interiors: {},
  lifestyleNotes: "",
};

describe("style catalog", () => {
  it("offers 25+ styles across all five categories, keys unique", () => {
    expect(STYLES.length).toBeGreaterThanOrEqual(25);
    expect(new Set(STYLES.map((s) => s.key)).size).toBe(STYLES.length);
    for (const [category, styles] of stylesByCategory()) {
      expect(STYLE_CATEGORIES).toContain(category);
      expect(styles.length).toBeGreaterThanOrEqual(3);
    }
    for (const s of STYLES) {
      expect(s.costFactor).toBeGreaterThan(0.8);
      expect(s.costFactor).toBeLessThan(1.5);
      expect(s.description.length).toBeGreaterThan(10);
    }
  });

  it("style cost factor moves the estimate: Victorian > Ranch", () => {
    const model = generateConcepts(brief, 60)[0].model;
    const victorian = estimateRevision(model, "r", "US_NATIONAL", { styleKey: "victorian" });
    const ranch = estimateRevision(model, "r", "US_NATIONAL", { styleKey: "ranch" });
    expect(victorian.totalCents).toBeGreaterThan(ranch.totalCents);
    expect(styleInfo("victorian")!.costFactor).toBeGreaterThan(styleInfo("ranch")!.costFactor);
  });

  it("unknown style falls back to baseline instead of crashing", () => {
    const model = generateConcepts(brief, 60)[0].model;
    const unknown = estimateRevision(model, "r", "US_NATIONAL", { styleKey: "not_a_style" as never });
    const plain = estimateRevision(model, "r", "US_NATIONAL");
    expect(unknown.totalCents).toBe(plain.totalCents);
  });
});

describe("finish selections", () => {
  it("every finish category offers at least 3 options with unique keys", () => {
    expect(FINISH_CATEGORIES).toHaveLength(6);
    for (const { options } of FINISH_CATEGORIES) {
      expect(options.length).toBeGreaterThanOrEqual(3);
      expect(new Set(options.map((o) => o.key)).size).toBe(options.length);
    }
  });

  it("default selections match the no-selection baseline exactly", () => {
    const model = generateConcepts(brief, 60)[0].model;
    const bare = estimateRevision(model, "r");
    const dflt = estimateRevision(model, "r", "US_NATIONAL", { ...DEFAULT_FINISHES });
    expect(dflt.totalCents).toBe(bare.totalCents);
  });

  it("luxury everything costs meaningfully more than builder everything", () => {
    const model = generateConcepts(brief, 60)[0].model;
    const builder = estimateRevision(model, "r", "US_NATIONAL", {
      flooring: "carpet",
      countertops: "laminate",
      cabinets: "stock",
      appliances: "builder",
      lighting: "builder",
      paint: "standard",
    });
    const luxury = estimateRevision(model, "r", "US_NATIONAL", {
      flooring: "wide_plank_oak",
      countertops: "marble",
      cabinets: "custom",
      appliances: "luxury",
      lighting: "smart",
      paint: "designer",
    });
    expect(luxury.totalCents).toBeGreaterThan(builder.totalCents * 1.15);
    const appliancesLine = luxury.lineItems.find((li) => li.description.includes("Appliances"));
    expect(appliancesLine?.description).toContain("Luxury");
  });

  it("exterior categories offer at least 5 options each with unique keys", () => {
    expect(EXTERIOR_CATEGORIES).toHaveLength(3);
    for (const { field, options } of EXTERIOR_CATEGORIES) {
      expect(options.length).toBeGreaterThanOrEqual(5);
      expect(new Set(options.map((o) => o.key)).size).toBe(options.length);
      expect(DEFAULT_FINISHES[field]).toBeDefined();
      expect(options.some((o) => o.key === DEFAULT_FINISHES[field])).toBe(true);
    }
  });

  it("exterior choices move the estimate and are named in the line items", () => {
    const model = generateConcepts(brief, 60)[0].model;
    const slate = estimateRevision(model, "r", "US_NATIONAL", {
      siding: "brick_veneer",
      roofing: "slate",
      windows: "steel",
    });
    const builderExt = estimateRevision(model, "r", "US_NATIONAL", {
      siding: "vinyl",
      roofing: "asphalt_3tab",
      windows: "builder_vinyl",
    });
    expect(slate.totalCents).toBeGreaterThan(builderExt.totalCents * 1.1);
    expect(slate.lineItems.some((li) => li.description === "Roofing — Natural Slate")).toBe(true);
    expect(slate.lineItems.some((li) => li.description === "Siding — Brick Veneer")).toBe(true);
    expect(slate.lineItems.some((li) => li.description === "Windows — Steel Frame")).toBe(true);
  });

  it("style cost factor still scales the chosen exterior materials", () => {
    const model = generateConcepts(brief, 60)[0].model;
    const victorianSlate = estimateRevision(model, "r", "US_NATIONAL", { styleKey: "victorian", roofing: "slate" });
    const ranchSlate = estimateRevision(model, "r", "US_NATIONAL", { styleKey: "ranch", roofing: "slate" });
    const vRoof = victorianSlate.lineItems.find((li) => li.description.startsWith("Roofing"))!;
    const rRoof = ranchSlate.lineItems.find((li) => li.description.startsWith("Roofing"))!;
    expect(vRoof.unitCostCents).toBeGreaterThan(rRoof.unitCostCents);
  });

  it("repriceConceptPackage moves money but not geometry or health", () => {
    const pkg = runDesignLoop(brief, { lotWidthFt: 60, budgetCents: null })[0];
    const repriced = repriceConceptPackage(pkg, {
      budgetCents: null,
      finishes: { countertops: "marble", appliances: "luxury" },
    });
    expect(repriced.estimate.totalCents).toBeGreaterThan(pkg.estimate.totalCents);
    expect(repriced.concept.model).toEqual(pkg.concept.model);
    expect(repriced.healthScore).toBe(pkg.healthScore);
  });
});
