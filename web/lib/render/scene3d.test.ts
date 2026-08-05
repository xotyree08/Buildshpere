import { describe, expect, it } from "vitest";

import { generateConcepts } from "../engine/generate";
import { WALL_HEIGHT_FT } from "../engine/iso";
import type { DesignBrief } from "../types";
import { exteriorPalette } from "./palette";
import { buildScene3D } from "./scene3d";

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

describe("buildScene3D", () => {
  it("is deterministic and produces walls, floors, openings, and a roof", () => {
    const model = generateConcepts(brief, 60)[0].model;
    const a = buildScene3D(model, "craftsman");
    const b = buildScene3D(model, "craftsman");
    expect(a).toEqual(b);

    const kinds = new Set(a.boxes.map((x) => x.kind));
    expect(kinds.has("floor")).toBe(true);
    expect(kinds.has("wall")).toBe(true);
    expect(kinds.has("window")).toBe(true);
    expect(kinds.has("door")).toBe(true);
    // Craftsman is a gable — a real roof prism, not a flat slab.
    expect(a.roofs.length).toBeGreaterThan(0);
    expect(a.bounds.h).toBeGreaterThan(WALL_HEIGHT_FT);
  });

  it("flat-roof styles slab instead of prism; two-story homes rise two wall heights", () => {
    const flat = buildScene3D(generateConcepts({ ...brief, style: "modern" }, 60)[0].model, "modern");
    expect(flat.roofs).toHaveLength(0);
    expect(flat.boxes.some((b) => b.kind === "slab")).toBe(true);

    const twoStory = generateConcepts(brief, 60).find((c) => c.model.levels === 2)!;
    const scene = buildScene3D(twoStory.model, "craftsman");
    expect(scene.bounds.h).toBeGreaterThan(2 * WALL_HEIGHT_FT);
    // Roof prisms sit on top of the SECOND storey's walls.
    const roofBase = Math.min(...scene.roofs.flatMap((r) => r.vertices.map((v) => v[1])));
    expect(roofBase).toBe(2 * WALL_HEIGHT_FT);
  });

  it("draws the selected materials — brick walls and slate roof carry their palette colors", () => {
    const model = generateConcepts(brief, 60)[0].model;
    const finishes = { siding: "brick_veneer", roofing: "slate" };
    const scene = buildScene3D(model, "craftsman", finishes);
    const palette = exteriorPalette(finishes);
    expect(scene.boxes.some((b) => b.kind === "wall" && b.color === palette.wall)).toBe(true);
    expect(scene.roofs.every((r) => r.color === palette.roof)).toBe(true);
  });

  it("openings sit inside their room's wall span at real heights", () => {
    const model = generateConcepts(brief, 60)[0].model;
    const scene = buildScene3D(model, "craftsman");
    for (const win of scene.boxes.filter((b) => b.kind === "window")) {
      expect(win.h).toBeCloseTo(4, 5); // sill 3 → head 7
      expect(win.y % WALL_HEIGHT_FT).toBeCloseTo(3, 5);
    }
    for (const door of scene.boxes.filter((b) => b.kind === "door")) {
      expect(door.h).toBeCloseTo(6.8, 5);
    }
  });
});
