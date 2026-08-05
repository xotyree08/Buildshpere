import { describe, expect, it } from "vitest";

import type { DesignBrief, HomeStyle } from "../types";
import { generateConcepts } from "./generate";
import { buildTour, stopDescription } from "./walkthrough";

function brief(style: HomeStyle = "modern"): DesignBrief {
  return {
    id: "b",
    projectId: "p",
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
    style,
    interiors: {},
    lifestyleNotes: "",
  };
}

describe("buildTour", () => {
  it("visits every non-hallway room exactly once", () => {
    const model = generateConcepts(brief(), 60)[0].model;
    const tour = buildTour(model);
    const expected = model.rooms.filter((r) => r.kind !== "hallway");
    expect(tour).toHaveLength(expected.length);
    expect(new Set(tour.map((s) => s.room.key)).size).toBe(expected.length);
    expect(tour.every((s) => s.room.kind !== "hallway")).toBe(true);
  });

  it("starts in the living room and ends in the garage", () => {
    const model = generateConcepts(brief(), 60)[0].model;
    const tour = buildTour(model);
    expect(tour[0].room.kind).toBe("living");
    expect(tour[tour.length - 1].room.kind).toBe("garage");
  });

  it("tours floor by floor on two-story plans (garage excepted)", () => {
    const two = generateConcepts(brief(), 60).find((c) => c.model.levels === 2)!;
    const tour = buildTour(two.model);
    const nonGarage = tour.filter((s) => s.room.kind !== "garage");
    const firstUpper = nonGarage.findIndex((s) => s.room.level === 1);
    expect(firstUpper).toBeGreaterThan(0);
    // once upstairs, never back down (garage aside)
    expect(nonGarage.slice(firstUpper).every((s) => s.room.level === 1)).toBe(true);
  });

  it("carries real facts: dims, area, glazing, doors", () => {
    const model = generateConcepts(brief(), 60)[0].model;
    const tour = buildTour(model);
    for (const stop of tour) {
      expect(stop.areaSqft).toBe(Math.round(stop.widthFt * stop.depthFt));
      expect(stop.doors.length).toBeGreaterThan(0); // every room has a door (health check holds it)
    }
    const living = tour.find((s) => s.room.kind === "living")!;
    expect(living.windows.length).toBeGreaterThan(0);
  });

  it("adjacency is symmetric and only within a level", () => {
    const model = generateConcepts(brief(), 60)[0].model;
    const tour = buildTour(model);
    const byLabel = new Map(tour.map((s) => [s.room.label, s]));
    for (const stop of tour) {
      for (const neighborLabel of stop.adjacent) {
        const neighbor = byLabel.get(neighborLabel);
        if (!neighbor) continue; // hallway neighbors aren't stops
        expect(neighbor.room.level).toBe(stop.room.level);
        expect(neighbor.adjacent).toContain(stop.room.label);
      }
    }
    // packed rows: the plan is contiguous, so something is adjacent to something
    expect(tour.some((s) => s.adjacent.length > 0)).toBe(true);
  });

  it("is deterministic and describes stops from their facts", () => {
    const model = generateConcepts(brief(), 60)[0].model;
    expect(buildTour(model)).toEqual(buildTour(model));
    const desc = stopDescription(buildTour(model)[0]);
    expect(desc).toContain("sqft");
    expect(desc).toMatch(/window|glazing/);
  });
});
