import { describe, expect, it } from "vitest";

import type { DesignBrief } from "../types";
import { generateConcepts, VARIANTS } from "./generate";
import { runChecks } from "./checks";
import { estimateRevision, takeoff, valueEngineering } from "./estimate";
import { freezeMilestone, frozenFloor, reviseConceptPackage, rollbackConcept, runDesignLoop } from "./loop";

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

  it("the slab, the floors and the roof all measure the same building", () => {
    // The estimate used to carry a roof sized from a footprint proxy over a
    // slab sized from the sum of the room rectangles, which are not the same
    // building: the corridors between rooms are poured, framed and roofed like
    // everything else, and nothing modelled them.
    const [concept] = generateConcepts(brief, 60);
    const q = takeoff(concept.model, "farmhouse");
    const modelledRooms = concept.model.rooms
      .filter((r) => r.kind !== "outdoor")
      .reduce((sum, r) => sum + r.rect[2] * r.rect[3], 0);

    // Gross area holds every modelled room and then some, at the 75-95%
    // net-to-gross ratio residential plans actually run at.
    expect(q.grossFloorSqft).toBeGreaterThanOrEqual(modelledRooms);
    expect(modelledRooms / q.grossFloorSqft).toBeGreaterThan(0.75);
    expect(modelledRooms / q.grossFloorSqft).toBeLessThanOrEqual(1);

    // One storey: the slab, the floor framing and the ceiling under the roof
    // are all the same plane, so they must agree to the foot.
    expect(concept.model.levels).toBe(1);
    expect(q.grossFootprintSqft).toBe(q.grossFloorSqft);
    expect(q.roofCoveredSqft).toBe(q.grossFootprintSqft);
    // The roofing quantity is that plane corrected for pitch and eaves, so it
    // is larger — never smaller, which would leave the building open to rain.
    expect(q.roofSurfaceSqft).toBeGreaterThan(q.roofCoveredSqft);
  });

  it("pitch drives the roofing quantity; a flat roof is its own footprint", () => {
    const [concept] = generateConcepts(brief, 60);
    const flat = takeoff(concept.model, "modern");
    const steep = takeoff(concept.model, "a_frame");
    // Flat means flat: the only thing between the ceiling plane and the
    // roofing quantity is the eave skirt, never a slope correction.
    expect(flat.roofSurfaceSqft).toBeGreaterThan(flat.roofCoveredSqft);
    expect(flat.roofSurfaceSqft / flat.roofCoveredSqft).toBeLessThan(1.25);
    // 18:12 is nearly twice the material of a flat roof over the same house.
    expect(steep.roofSurfaceSqft).toBeGreaterThan(flat.roofSurfaceSqft * 1.5);
    // ...and it changes nothing else about the building.
    expect(steep.grossFloorSqft).toBe(flat.grossFloorSqft);
    expect(steep.livableSqft).toBe(flat.livableSqft);
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

describe("rollbackConcept", () => {
  function packageWithTwoRevisions() {
    const [base] = runDesignLoop(brief, { lotWidthFt: 60, budgetCents: null });
    const opts = { budgetCents: null };
    const r1 = reviseConceptPackage(base, "add an office", opts).pkg;
    if (!r1) throw new Error("first revision failed");
    const withOne = { ...base, revisions: [r1] };
    const r2 = reviseConceptPackage(withOne, "remove the office", opts).pkg;
    if (!r2) throw new Error("second revision failed");
    return { ...base, revisions: [r1, r2] };
  }

  it("truncates to any earlier state without recomputing it", () => {
    const pkg = packageWithTwoRevisions();

    const toFirst = rollbackConcept(pkg, 1);
    expect(toFirst.ok).toBe(true);
    if (toFirst.ok) expect(toFirst.pkg.revisions).toEqual([pkg.revisions![0]]);

    const toOriginal = rollbackConcept(pkg, 0);
    expect(toOriginal.ok).toBe(true);
    if (toOriginal.ok) {
      expect(toOriginal.pkg.revisions).toEqual([]);
      expect(toOriginal.pkg.concept).toEqual(pkg.concept);
    }
    // the input package is untouched
    expect(pkg.revisions).toHaveLength(2);
  });

  it("revision numbering stays consistent after a rollback", () => {
    const pkg = packageWithTwoRevisions();
    const rolled = rollbackConcept(pkg, 1);
    if (!rolled.ok) throw new Error("rollback failed");

    const next = reviseConceptPackage(rolled.pkg, "add a gym", { budgetCents: null }).pkg;
    expect(next).not.toBeNull();
    // history had 1 entry → the replacement revision is r2 again
    expect(next!.revision.id).toBe(`${pkg.concept.id}-r2`);
    expect(next!.revision.parentRevisionId).toBe(pkg.revisions![0].revision.id);
  });

  it("rejects out-of-range targets — including 'roll back to where I already am'", () => {
    const pkg = packageWithTwoRevisions();
    expect(rollbackConcept(pkg, 2).ok).toBe(false);
    expect(rollbackConcept(pkg, -1).ok).toBe(false);
    expect(rollbackConcept(pkg, 1.5).ok).toBe(false);
    expect(rollbackConcept({ ...pkg, revisions: undefined }, 0).ok).toBe(false);
  });
});

describe("freezeMilestone — immutable snapshots (BS-DES-006)", () => {
  it("freezing protects the state: rollback below the floor is refused by name", () => {
    const pkg = (() => {
      const [base] = runDesignLoop(brief, { lotWidthFt: 60, budgetCents: null });
      const r1 = reviseConceptPackage(base, "add an office", { budgetCents: null }).pkg!;
      const withOne = { ...base, revisions: [r1] };
      const r2 = reviseConceptPackage(withOne, "add a gym", { budgetCents: null }).pkg!;
      return { ...base, revisions: [r1, r2] };
    })();

    const frozen = freezeMilestone(pkg, "Presented to family", 1000);
    expect(frozen.ok).toBe(true);
    if (!frozen.ok) return;
    expect(frozenFloor(frozen.pkg)).toBe(2);

    // Rolling back below the milestone names it and refuses.
    const blocked = rollbackConcept(frozen.pkg, 1);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error).toContain("Presented to family");

    // Later revisions still append, and rollback down TO the floor is fine.
    const r3 = reviseConceptPackage(frozen.pkg, "add a theater", { budgetCents: null }).pkg!;
    const grown = { ...frozen.pkg, revisions: [...frozen.pkg.revisions!, r3] };
    const backToFloor = rollbackConcept(grown, 2);
    expect(backToFloor.ok).toBe(true);
  });

  it("rejects empty labels and duplicate freezes of the same state", () => {
    const [base] = runDesignLoop(brief, { lotWidthFt: 60, budgetCents: null });
    expect(freezeMilestone(base, "   ", 1).ok).toBe(false);
    const first = freezeMilestone(base, "Original", 1);
    expect(first.ok).toBe(true);
    if (first.ok) expect(freezeMilestone(first.pkg, "Again", 2).ok).toBe(false);
  });
});

describe("estimate provenance — the §22.3 launch gate", () => {
  it("every line carries source, sourceDetail, and a never-overstated confidence", () => {
    const [pkg] = runDesignLoop(brief, {
      lotWidthFt: 60,
      budgetCents: null,
      regionCode: "US_WEST",
      finishes: { flooring: "hardwood" },
    });
    expect(pkg.estimate.priceBookVersion).toBeTruthy();
    expect(Number.isNaN(Date.parse(pkg.estimate.pricedAt))).toBe(false);
    for (const li of pkg.estimate.lineItems) {
      expect(li.unit).toBeTruthy();
      expect(li.qty).toBeGreaterThan(0);
      expect(li.sourceDetail).toContain(pkg.estimate.priceBookVersion);
      // "high" is reserved for vendor quotes, which don't exist yet.
      expect(["medium", "low"]).toContain(li.confidence);
      expect(li.confidence).toBe(li.source === "takeoff" ? "medium" : "low");
    }
  });

  it("provenance names the regional factor, and the style factor only where it applies", () => {
    const [pkg] = runDesignLoop(
      { ...brief, style: "victorian" },
      { lotWidthFt: 60, budgetCents: null, regionCode: "US_WEST" },
    );
    const framing = pkg.estimate.lineItems.find((li) => li.category === "Framing");
    const plumbing = pkg.estimate.lineItems.find((li) => li.category === "Plumbing");
    expect(framing!.sourceDetail).toContain("US WEST ×1.22");
    expect(framing!.sourceDetail).toContain("style ×");
    expect(plumbing!.sourceDetail).not.toContain("style ×");
  });
});
