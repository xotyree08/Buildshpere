import { describe, expect, it } from "vitest";

import type { ParametricModel, Room } from "../types";
import { buildRoof, decomposeWings, MIN_WING_FT, pitchLabel, roofFacets, roofPeakFt, ROOF_OVERHANG_FT, slopeFactor } from "./roofgeom";
import { WALL_HEIGHT_FT } from "./iso";

function room(key: string, rect: [number, number, number, number], level = 0): Room {
  return { key, kind: "living", label: key, level, rect };
}

function model(rooms: Room[], levels = 1): ParametricModel {
  return { schemaVersion: 1, levels, rooms, openings: [] };
}

describe("roof geometry: one roof, computed from the plan", () => {
  it("slope factor and pitch labels follow the builder's convention", () => {
    expect(slopeFactor(0)).toBe(1);
    // A 12:12 roof is √2 longer than its shadow.
    expect(slopeFactor(1)).toBeCloseTo(Math.SQRT2, 10);
    expect(pitchLabel(0)).toBe("flat");
    expect(pitchLabel(0.5)).toBe("6:12");
  });

  it("a plain rectangle is one wing, not a comb of slivers", () => {
    const wings = decomposeWings([room("a", [0, 0, 40, 30])]);
    expect(wings).toEqual([[0, 0, 40, 30]]);
  });

  it("two rooms side by side with equal depth merge into one wing", () => {
    const wings = decomposeWings([room("a", [0, 0, 20, 30]), room("b", [20, 0, 20, 30])]);
    expect(wings).toEqual([[0, 0, 40, 30]]);
  });

  it("an L-shaped plan becomes two wings covering exactly its union", () => {
    // 40x20 across the top, plus a 20x20 leg below the left half.
    const rooms = [room("a", [0, 0, 40, 20]), room("b", [0, 20, 20, 20])];
    const wings = decomposeWings(rooms);
    expect(wings).toHaveLength(2);
    const area = wings.reduce((s, [, , w, d]) => s + w * d, 0);
    // Union is 40*20 + 20*20 = 1200 — the bounding box would be 40*40 = 1600.
    expect(area).toBe(1200);
  });

  it("plan area measures the union, so an L-shape is not over-roofed", () => {
    const l = buildRoof(model([room("a", [0, 0, 40, 20]), room("b", [0, 20, 20, 20])]), "farmhouse");
    const bboxArea = 40 * 40;
    expect(l.planAreaSqft).toBeLessThan(bboxArea);
    // 1200 union + eave skirt around both wings.
    expect(l.planAreaSqft).toBeGreaterThan(1200);
  });

  it("surface area is the plan area corrected for pitch, and flat roofs are neither", () => {
    const rooms = [room("a", [0, 0, 40, 30])];
    const pitched = buildRoof(model(rooms), "farmhouse");
    expect(pitched.surfaceAreaSqft).toBeCloseTo(pitched.planAreaSqft * slopeFactor(pitched.pitch), 1);
    expect(pitched.surfaceAreaSqft).toBeGreaterThan(pitched.planAreaSqft);

    const flat = buildRoof(model(rooms), "modern");
    expect(flat.pitch).toBe(0);
    expect(flat.surfaceAreaSqft).toBeCloseTo(flat.planAreaSqft, 5);
    expect(flat.wings.every((w) => w.ridgeFt === w.eaveFt)).toBe(true);
  });

  it("the ridge runs along the wing's longer axis and rises over the short span", () => {
    const wide = buildRoof(model([room("a", [0, 0, 40, 20])]), "farmhouse");
    expect(wide.wings[0].ridgeAxis).toBe("x");
    // Rise is pitch × half the SHORT span (20/2 = 10).
    expect(wide.wings[0].ridgeFt - wide.wings[0].eaveFt).toBeCloseTo(wide.pitch * 10, 6);

    const deep = buildRoof(model([room("a", [0, 0, 20, 40])]), "farmhouse");
    expect(deep.wings[0].ridgeAxis).toBe("z");
  });

  it("eaves sit on top of the walls, at every storey count", () => {
    const one = buildRoof(model([room("a", [0, 0, 40, 30])], 1), "farmhouse");
    expect(one.wings[0].eaveFt).toBeCloseTo(WALL_HEIGHT_FT, 6);
    const two = buildRoof(model([room("a", [0, 0, 40, 30], 1)], 2), "farmhouse");
    expect(two.wings[0].eaveFt).toBeCloseTo(2 * WALL_HEIGHT_FT, 6);
  });

  it("a hip shortens the ridge by the span; a gable runs the full length", () => {
    const rooms = [room("a", [0, 0, 40, 20])];
    const gable = buildRoof(model(rooms), "farmhouse");
    const hip = buildRoof(model(rooms), "ranch");
    expect(gable.form).toBe("gable");
    expect(hip.form).toBe("hip");
    expect(gable.ridgeLf).toBeCloseTo(40, 6);
    expect(hip.ridgeLf).toBeCloseTo(20, 6);
  });

  it("a lower storey wider than the one above is still roofed", () => {
    // Ground floor 40x30, upper floor only 20x30 — 600 sqft of the ground
    // floor is open to the sky unless the lower roof is counted.
    const stepped = model(
      [room("g", [0, 0, 40, 30], 0), room("u", [0, 0, 20, 30], 1)],
      2,
    );
    const roof = buildRoof(stepped, "farmhouse");
    const upperOnly = buildRoof(model([room("u", [0, 0, 20, 30], 1)], 2), "farmhouse");
    expect(roof.planAreaSqft).toBeGreaterThan(upperOnly.planAreaSqft + 500);
  });

  it("an override changes the roof without changing the style", () => {
    const rooms = [room("a", [0, 0, 40, 20])];
    const asStyled = buildRoof(model(rooms), "farmhouse");
    const flattened = buildRoof(model(rooms), "farmhouse", { form: "flat" });
    expect(asStyled.pitch).toBeGreaterThan(0);
    expect(flattened.pitch).toBe(0);
    expect(flattened.surfaceAreaSqft).toBeLessThan(asStyled.surfaceAreaSqft);

    const steeper = buildRoof(model(rooms), "farmhouse", { pitch: 1.2 });
    expect(steeper.surfaceAreaSqft).toBeGreaterThan(asStyled.surfaceAreaSqft);
  });

  it("overhang is counted once around the outside, not per wing edge", () => {
    const roof = buildRoof(model([room("a", [0, 0, 40, 30])]), "farmhouse");
    const bare = 40 * 30;
    expect(roof.planAreaSqft).toBeCloseTo(bare + 2 * (40 + 30) * ROOF_OVERHANG_FT, 2);
  });

  it("covered area excludes the eaves; roof area includes them", () => {
    // Conflating the two overstates the ceiling plane of a 40x30 house by ~8%,
    // which would quietly inflate any energy or ceiling-finish number.
    const roof = buildRoof(model([room("a", [0, 0, 40, 30])]), "farmhouse");
    expect(roof.coveredAreaSqft).toBeCloseTo(40 * 30, 2);
    expect(roof.planAreaSqft).toBeGreaterThan(roof.coveredAreaSqft);
    expect(roof.surfaceAreaSqft).toBeGreaterThan(roof.planAreaSqft);
  });

  it("eave length is measured at the eave, not at the wall below it", () => {
    // Area is measured to the eave line, so length must be too — otherwise
    // gutters, drip edge and fascia are all short by the corners.
    const roof = buildRoof(model([room("a", [0, 0, 40, 30])]), "farmhouse");
    const wallPerimeter = 2 * (40 + 30);
    expect(roof.eaveLf).toBeGreaterThan(wallPerimeter);
    expect(roof.eaveLf).toBeCloseTo(wallPerimeter + 8 * ROOF_OVERHANG_FT, 2);
  });

  it("wings butt rather than mitre, but never leave a hole or double-count", () => {
    // The documented limit: an L gets two prisms, not one mitred roof. What
    // must still hold is that the plan area equals the union exactly — no gap
    // over a room, and no square foot roofed twice.
    const l = model([room("a", [0, 0, 40, 20]), room("b", [0, 20, 20, 20])]);
    const roof = buildRoof(l, "farmhouse");
    const wingArea = roof.wings.reduce((sum, w) => sum + w.rect[2] * w.rect[3], 0);
    expect(roof.coveredAreaSqft).toBeCloseTo(wingArea, 2);
    expect(wingArea).toBeCloseTo(1200, 2);
  });

  it("a sliver is roofed like its neighbour, never dropped and never spiked", () => {
    // A room projecting 3.5ft past the others must end up under roof, not left
    // open because its strip was too small to be its own wing — and not given
    // its own little ridge either. The main roof plane runs across it.
    const ragged = model([room("a", [0, 0, 24, 40]), room("b", [24, 18, 3.5, 12])]);
    const roof = buildRoof(ragged, "farmhouse");
    const covered = roof.wings.reduce((sum, w) => sum + w.rect[2] * w.rect[3], 0);
    expect(covered).toBeCloseTo(roof.coveredAreaSqft, 2);
    // The projection is under roof to its full extent...
    expect(Math.max(...roof.wings.map((w) => w.rect[0] + w.rect[2]))).toBeGreaterThanOrEqual(27.5);
    // ...and nothing is roofed that no room sits under: 24x40 plus the
    // projection, squared off to the main block's depth by the notch rule.
    expect(covered).toBeLessThanOrEqual(24 * 40 + 3.5 * 40 + 1e-6);

    const main = roof.wings.find((w) => w.rect[2] >= MIN_WING_FT && w.rect[3] >= MIN_WING_FT)!;
    const sliver = roof.wings.find((w) => Math.min(w.rect[2], w.rect[3]) < MIN_WING_FT)!;
    expect(sliver.ridgeAxis).toBe(main.ridgeAxis);
    expect(sliver.ridgeFt).toBeCloseTo(main.ridgeFt, 6);
  });

  it("a courtyard stays a hole — the roof does not close over it", () => {
    // Four wings around an open middle. The void is far wider than a corridor,
    // so it must survive: filling it once inflated a concept's roof by 60% and
    // drew a roof straight across the courtyard it was named for.
    const court = model([
      room("n", [0, 0, 60, 14]),
      room("s", [0, 34, 60, 14]),
      room("w", [0, 14, 14, 20]),
      room("e", [46, 14, 14, 20]),
    ]);
    const roof = buildRoof(court, "mediterranean");
    const covered = roof.wings.reduce((sum, w) => sum + w.rect[2] * w.rect[3], 0);
    expect(covered).toBeCloseTo(60 * 14 * 2 + 14 * 20 * 2, 2);
    expect(covered).toBeLessThan(60 * 48 * 0.8);
    // No wing may sit over the open middle.
    for (const w of roof.wings) {
      const [x, z, ww, d] = w.rect;
      const overX = Math.min(x + ww, 46) - Math.max(x, 14);
      const overZ = Math.min(z + d, 34) - Math.max(z, 14);
      expect(Math.max(0, overX) * Math.max(0, overZ)).toBeCloseTo(0, 6);
    }
  });

  it("corridors between rooms are under roof, so gross area beats net", () => {
    // Two rows of rooms with a four-foot hallway between them that no room
    // object models. A roof spans that; pricing the slab, the floor and the
    // roofing from the room rectangles alone under-measured all three.
    const rows = model([
      room("a", [0, 0, 30, 14]),
      room("b", [30, 0, 30, 14]),
      room("c", [0, 18, 30, 14]),
      room("d", [30, 18, 30, 14]),
    ]);
    const roof = buildRoof(rows, "ranch");
    const netRooms = 4 * 30 * 14;
    expect(roof.coveredAreaSqft).toBeCloseTo(60 * 32, 2);
    expect(netRooms / roof.coveredAreaSqft).toBeGreaterThan(0.8);
    expect(roof.wings).toHaveLength(1);
  });

  it("is deterministic and never returns NaN", () => {
    const m = model([room("a", [0, 0, 40, 20]), room("b", [0, 20, 20, 20])]);
    expect(buildRoof(m, "victorian")).toEqual(buildRoof(m, "victorian"));
    for (const style of ["modern", "a_frame", "ranch", "georgian"] as const) {
      const r = buildRoof(m, style);
      expect(Number.isFinite(r.planAreaSqft)).toBe(true);
      expect(Number.isFinite(r.surfaceAreaSqft)).toBe(true);
      expect(r.wings.every((w) => Number.isFinite(w.ridgeFt))).toBe(true);
    }
  });

  it("an empty plan yields an empty roof rather than throwing", () => {
    const roof = buildRoof(model([]), "farmhouse");
    expect(roof.wings).toEqual([]);
    expect(roof.planAreaSqft).toBe(0);
    expect(roof.surfaceAreaSqft).toBe(0);
  });
});

describe("roof facets: the shape every renderer draws", () => {
  const rect = [{ key: "a", kind: "living" as const, label: "a", level: 0, rect: [0, 0, 40, 20] as [number, number, number, number] }];
  const wide = { schemaVersion: 1 as const, levels: 1, rooms: rect, openings: [] };

  it("flat roofs have no facets — the extrusion top is the roof", () => {
    expect(roofFacets(buildRoof(wide, "modern"))).toEqual([]);
  });

  it("a pitched wing makes four facets: two slopes and two ends", () => {
    const facets = roofFacets(buildRoof(wide, "farmhouse"));
    expect(facets).toHaveLength(4);
    expect(facets.filter((f) => f.kind === "slope")).toHaveLength(2);
    expect(facets.filter((f) => f.kind === "end")).toHaveLength(2);
  });

  it("an L-shaped plan makes a facet set per wing, not one over the bounding box", () => {
    const l = {
      schemaVersion: 1 as const,
      levels: 1,
      openings: [],
      rooms: [
        { key: "a", kind: "living" as const, label: "a", level: 0, rect: [0, 0, 40, 20] as [number, number, number, number] },
        { key: "b", kind: "living" as const, label: "b", level: 0, rect: [0, 20, 20, 20] as [number, number, number, number] },
      ],
    };
    expect(roofFacets(buildRoof(l, "farmhouse"))).toHaveLength(8);
  });

  it("gable ends are vertical; hip ends slope inward", () => {
    const gable = roofFacets(buildRoof(wide, "farmhouse")).filter((f) => f.kind === "end");
    // A gable end's two eave corners share the same x, so the triangle is vertical.
    expect(gable[0].points[0].x).toBeCloseTo(gable[0].points[2].x, 6);

    const hip = roofFacets(buildRoof(wide, "ranch")).filter((f) => f.kind === "end");
    expect(hip[0].points[0].x).not.toBeCloseTo(hip[0].points[2].x, 3);
  });

  it("every facet point is finite and no facet is degenerate", () => {
    for (const style of ["farmhouse", "ranch", "victorian", "a_frame", "georgian"] as const) {
      for (const f of roofFacets(buildRoof(wide, style))) {
        expect(f.points.length).toBeGreaterThanOrEqual(3);
        for (const pt of f.points) {
          expect(Number.isFinite(pt.x) && Number.isFinite(pt.y) && Number.isFinite(pt.z)).toBe(true);
        }
      }
    }
  });

  it("the peak is the ridge, and rises with pitch", () => {
    const shallow = buildRoof(wide, "ranch");
    const steep = buildRoof(wide, "a_frame");
    expect(roofPeakFt(steep)).toBeGreaterThan(roofPeakFt(shallow));
    expect(roofPeakFt(shallow)).toBeCloseTo(shallow.wings[0].ridgeFt, 6);
  });
});
