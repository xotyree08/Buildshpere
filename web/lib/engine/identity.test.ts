import { describe, expect, it } from "vitest";

import type { DesignBrief } from "../types";
import { generateConcepts } from "./generate";
import { applyRevision, parseRevisionRequest } from "./revise";

const brief: DesignBrief = {
  id: "b", projectId: "p", version: 1,
  program: {
    familySize: 4, bedrooms: 3, bathrooms: 2, office: false, gym: false,
    theater: false, outdoorKitchen: false, garageBays: 2,
  },
  style: "modern", interiors: {}, lifestyleNotes: "",
};

describe("object identity", () => {
  it("names a room for what it is, not for where it landed in the packing", () => {
    const model = generateConcepts(brief, 60)[0].model;
    for (const room of model.rooms) {
      expect(room.key, room.label).toMatch(/^R-L[0-9]+-[A-Z]+-[0-9]{2}$/);
    }
    expect(new Set(model.rooms.map((r) => r.key)).size).toBe(model.rooms.length);
  });

  it("a room that survives a revision keeps its key", () => {
    // The whole point. A revision re-packs the storey, so keys minted during
    // packing moved on every change and nothing downstream could pair a room
    // with itself: not the version diff, not the change propagation, and not a
    // professional approval that has to survive a furniture move.
    const before = generateConcepts(brief, 60)[0].model;
    const parsed = parseRevisionRequest("make the kitchen bigger");
    expect(parsed.ops.length).toBeGreaterThan(0);
    const after = applyRevision(before, parsed.ops).model;

    const survivors = before.rooms.filter((r) => r.kind !== "hallway");
    const keysAfter = new Set(after.rooms.map((r) => r.key));
    for (const room of survivors) {
      expect(keysAfter.has(room.key), `${room.label} ${room.key} lost its identity`).toBe(true);
    }

    // And the change actually happened — identity preserved, geometry moved.
    const kitchenBefore = before.rooms.find((r) => r.kind === "kitchen")!;
    const kitchenAfter = after.rooms.find((r) => r.key === kitchenBefore.key)!;
    const areaOf = (r: typeof kitchenBefore) => r.rect[2] * r.rect[3];
    expect(areaOf(kitchenAfter)).toBeGreaterThan(areaOf(kitchenBefore));
  });

  it("keys are the same every time the same brief is generated", () => {
    const a = generateConcepts(brief, 60)[0].model.rooms.map((r) => r.key);
    const b = generateConcepts(brief, 60)[0].model.rooms.map((r) => r.key);
    expect(a).toEqual(b);
  });
});
