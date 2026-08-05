import { describe, expect, it } from "vitest";

import type { DesignBrief } from "../types";
import { generateConcepts } from "./generate";
import { buildIsoScene, project, WALL_HEIGHT_FT } from "./iso";

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

describe("project", () => {
  it("raises z straight up in screen space", () => {
    const ground = project(10, 10, 0);
    const lifted = project(10, 10, WALL_HEIGHT_FT);
    expect(lifted.x).toBe(ground.x);
    expect(lifted.y).toBe(ground.y - WALL_HEIGHT_FT);
  });

  it("moves +x right-down and +y left-down", () => {
    const origin = project(0, 0, 0);
    const px = project(10, 0, 0);
    const py = project(0, 10, 0);
    expect(px.x).toBeGreaterThan(origin.x);
    expect(px.y).toBeGreaterThan(origin.y);
    expect(py.x).toBeLessThan(origin.x);
    expect(py.y).toBeGreaterThan(origin.y);
  });
});

describe("buildIsoScene", () => {
  it("emits three sorted faces per room with a finite viewBox", () => {
    const model = generateConcepts(brief, 60)[0].model;
    const scene = buildIsoScene(model);
    expect(scene.faces).toHaveLength(model.rooms.length * 3);
    for (let i = 1; i < scene.faces.length; i++) {
      expect(scene.faces[i].depth).toBeGreaterThanOrEqual(scene.faces[i - 1].depth);
    }
    expect(scene.width).toBeGreaterThan(0);
    expect(scene.height).toBeGreaterThan(0);
    expect(Number.isFinite(scene.minX)).toBe(true);
    expect(Number.isFinite(scene.minY)).toBe(true);
  });

  it("stacks upper-level faces after all ground-level faces", () => {
    const twoStory = generateConcepts(brief, 60).find((c) => c.model.levels === 2)!;
    const scene = buildIsoScene(twoStory.model);
    const lastGround = scene.faces.map((f) => f.depth).filter((d) => d < 1000);
    const firstUpper = scene.faces.map((f) => f.depth).filter((d) => d >= 1000);
    expect(firstUpper.length).toBeGreaterThan(0);
    expect(Math.min(...firstUpper)).toBeGreaterThan(Math.max(...lastGround));
  });

  it("is deterministic", () => {
    const model = generateConcepts(brief, 60)[0].model;
    expect(buildIsoScene(model)).toEqual(buildIsoScene(model));
  });
});
