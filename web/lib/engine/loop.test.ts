import { describe, expect, it } from "vitest";

import type { DesignBrief } from "../types";
import { generateConcepts, VARIANTS } from "./generate";
import { runChecks } from "./checks";
import { estimateRevision, takeoff, valueEngineering } from "./estimate";
import { runDesignLoop } from "./loop";

const brief: DesignBrief = {
  id: "brief-1",
  projectId: "proj-1",
  version: 1,
  program: {
    familySize: 4,
    bedrooms: 3,
    bathrooms: 2,
    office: true,
    gym: false,
    theater: false,
    outdoorKitchen: false,
    garageBays: 2,
  },
  style: "modern",
  interiors: {},
  lifestyleNotes: "",
};

describe("generateConcepts", () => {
  it("produces one concept per variant with the requested program", () => {
    const concepts = generateConcepts(brief, 60);
    expect(concepts).toHaveLength(VARIANTS.length);
    for (const c of concepts) {
      const bedrooms = c.model.rooms.filter((r) => r.kind === "bedroom");
      const baths = c.model.rooms.filter((r) => r.kind === "bathroom");
      expect(bedrooms).toHaveLength(3);
      expect(baths).toHaveLength(2);
      expect(c.model.rooms.some((r) => r.kind === "office")).toBe(true);
      expect(c.model.rooms.some((r) => r.kind === "garage")).toBe(true);
      expect(c.sqft).toBeGreaterThan(800);
    }
  });

  it("is deterministic: same brief, same plans", () => {
    const a = generateConcepts(brief, 60);
    const b = generateConcepts(brief, 60);
    expect(a).toEqual(b);
  });

  it("two-story variant keeps a bathroom on the ground floor", () => {
    const twoStory = generateConcepts(brief, 60).find((c) => c.model.levels === 2);
    expect(twoStory).toBeDefined();
    expect(twoStory!.model.rooms.some((r) => r.kind === "bathroom" && r.level === 0)).toBe(true);
  });

  it("respects narrow lots by narrowing rows", () => {
    const narrow = generateConcepts(brief, 30);
    for (const c of narrow) {
      const maxX = Math.max(...c.model.rooms.map((r) => r.rect[0] + r.rect[2]));
      expect(maxX).toBeLessThanOrEqual(31); // rowWidthFactor caps at lot width
    }
  });
});

describe("runChecks", () => {
  it("scores generated concepts and anchors findings", () => {
    const [concept] = generateConcepts(brief, 60);
    const report = runChecks(concept.model, "rev-1");
    expect(report.score).toBeGreaterThan(0);
    expect(report.score).toBeLessThanOrEqual(100);
    expect(report.results.length).toBeGreaterThanOrEqual(10);
    expect(report.results.every((r) => r.revisionId === "rev-1")).toBe(true);
  });

  it("fails accessibility when no ground-floor bath exists", () => {
    const [concept] = generateConcepts(brief, 60);
    const model = {
      ...concept.model,
      rooms: concept.model.rooms.map((r) => (r.kind === "bathroom" ? { ...r, level: 1 } : r)),
    };
    const report = runChecks(model, "rev-1");
    const access = report.results.filter((r) => r.check === "accessibility");
    expect(access.some((r) => r.status === "fail")).toBe(true);
  });

  it("flags rooms with no door", () => {
    const [concept] = generateConcepts(brief, 60);
    const model = { ...concept.model, openings: concept.model.openings.filter((o) => o.kind !== "door") };
    const report = runChecks(model, "rev-1");
    expect(report.results.some((r) => r.check === "door_swings" && r.status === "fail")).toBe(true);
  });
});

describe("estimate", () => {
  it("prices a concept with a sane range and line items", () => {
    const [concept] = generateConcepts(brief, 60);
    const est = estimateRevision(concept.model, "rev-1", "US_NATIONAL");
    expect(est.totalCents).toBeGreaterThan(100_000_00);
    expect(est.lowCents).toBeLessThan(est.totalCents);
    expect(est.highCents).toBeGreaterThan(est.totalCents);
    expect(est.lineItems.length).toBeGreaterThan(8);
    const total = est.lineItems.reduce((s, li) => s + li.qty * li.unitCostCents, 0);
    expect(Math.abs(total - est.totalCents)).toBeLessThan(100);
  });

  it("applies regional factors", () => {
    const [concept] = generateConcepts(brief, 60);
    const south = estimateRevision(concept.model, "rev-1", "US_SOUTH");
    const west = estimateRevision(concept.model, "rev-1", "US_WEST");
    expect(west.totalCents).toBeGreaterThan(south.totalCents);
  });

  it("cost grows with program size", () => {
    const small = generateConcepts({ ...brief, program: { ...brief.program, bedrooms: 2, bathrooms: 1, office: false, garageBays: 0 } }, 60)[0];
    const large = generateConcepts({ ...brief, program: { ...brief.program, bedrooms: 5, bathrooms: 4 } }, 60)[0];
    expect(estimateRevision(large.model, "r").totalCents).toBeGreaterThan(estimateRevision(small.model, "r").totalCents);
  });

  it("takeoff counts openings and areas", () => {
    const [concept] = generateConcepts(brief, 60);
    const q = takeoff(concept.model);
    expect(q.livableSqft).toBeGreaterThan(0);
    expect(q.doors).toBeGreaterThan(0);
    expect(q.windows).toBeGreaterThan(0);
    expect(q.baths).toBe(2);
    expect(q.kitchens).toBe(1);
  });
});

describe("valueEngineering", () => {
  it("returns nothing when under budget", () => {
    const [concept] = generateConcepts(brief, 60);
    const est = estimateRevision(concept.model, "rev-1");
    expect(valueEngineering(est, est.totalCents + 1, concept.model)).toHaveLength(0);
    expect(valueEngineering(est, null, concept.model)).toHaveLength(0);
  });

  it("proposes ranked savings when over budget", () => {
    const [concept] = generateConcepts(brief, 60);
    const est = estimateRevision(concept.model, "rev-1");
    const suggestions = valueEngineering(est, Math.round(est.totalCents * 0.8), concept.model);
    expect(suggestions.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < suggestions.length; i++) {
      expect(suggestions[i - 1].savingsCents).toBeGreaterThanOrEqual(suggestions[i].savingsCents);
    }
  });
});

describe("runDesignLoop", () => {
  it("returns complete packages: concept, score, checks, estimate, VE", () => {
    const packages = runDesignLoop(brief, {
      lotWidthFt: 60,
      budgetCents: 300_000_00,
      regionCode: "US_SOUTH",
    });
    expect(packages).toHaveLength(3);
    for (const p of packages) {
      expect(p.healthScore).toBeGreaterThan(0);
      expect(p.checkResults.length).toBeGreaterThan(0);
      expect(p.estimate.lineItems.length).toBeGreaterThan(0);
      // tight budget → VE suggestions should appear
      expect(p.veSuggestions.length).toBeGreaterThan(0);
    }
  });
});
