import { describe, expect, it } from "vitest";

import type { DesignBrief, HomeStyle, ParametricModel } from "../types";
import { WALL_FT } from "./adjacency";
import { generateConcepts } from "./generate";
import { WALL_HEIGHT_FT } from "./iso";
import { hostWallKey, openingAreaByWall } from "./openings";
import { takeoff } from "./estimate";
import { allWalls, buildWalls, wallQuantities } from "./walls";

const brief = (style: HomeStyle = "modern"): DesignBrief => ({
  id: "b", projectId: "p", version: 1,
  program: {
    familySize: 4, bedrooms: 3, bathrooms: 2, office: false, gym: false,
    theater: false, outdoorKitchen: false, garageBays: 2,
  },
  style, interiors: {}, lifestyleNotes: "",
});

const STYLES: HomeStyle[] = ["modern", "craftsman", "colonial", "farmhouse", "ranch"];

function everyModel(): ParametricModel[] {
  return STYLES.flatMap((s) => generateConcepts(brief(s), 60).map((c) => c.model));
}

describe("the wall graph", () => {
  it("two rooms back to back share one wall, not one each", () => {
    // The estimate used to take half of every room's perimeter and call the
    // halving a shared-wall discount. It is not a discount, it is a fact about
    // which walls exist, and it was wrong for every wall that faces outdoors.
    for (const model of everyModel()) {
      const walls = allWalls(model);
      expect(new Set(walls.map((w) => w.key)).size).toBe(walls.length);
      for (const wall of walls) {
        expect(wall.bounds.length, wall.key).toBeLessThanOrEqual(2);
        if (wall.wallClass === "interior") expect(wall.bounds).toHaveLength(2);
        else expect(wall.bounds).toHaveLength(1);
      }
    }
  });

  it("a wall lies between the rooms it separates", () => {
    for (const model of everyModel()) {
      const rooms = new Map(model.rooms.map((r) => [r.key, r]));
      for (const wall of allWalls(model).filter((w) => w.wallClass === "interior")) {
        const [a, b] = wall.bounds.map((k) => rooms.get(k)!);
        // The centreline sits between the two facing surfaces, within the
        // thickness of the partition it stands in for.
        const near = (room: typeof a) => {
          const [x, z, w, d] = room.rect;
          return wall.axis === "x"
            ? Math.min(Math.abs(z - wall.at), Math.abs(z + d - wall.at))
            : Math.min(Math.abs(x - wall.at), Math.abs(x + w - wall.at));
        };
        expect(near(a), wall.key).toBeLessThanOrEqual(WALL_FT / 2 + 0.26);
        expect(near(b), wall.key).toBeLessThanOrEqual(WALL_FT / 2 + 0.26);
      }
    }
  });

  it("walls are named for what they separate, so they survive a repack", () => {
    for (const model of everyModel()) {
      for (const wall of allWalls(model)) {
        expect(wall.key).toMatch(/^W-L[0-9]+-/);
        for (const bound of wall.bounds) expect(wall.key).toContain(bound);
      }
    }
  });

  it("every opening is in a wall, and no wall is more opening than wall", () => {
    for (const model of everyModel()) {
      for (const opening of model.openings) {
        expect(hostWallKey(model, opening), `${opening.kind} in ${opening.roomKey}`).not.toBeNull();
      }
      const areas = openingAreaByWall(model);
      const quantities = wallQuantities(model, (key) => areas.get(key) ?? 0);
      for (const q of quantities) {
        expect(q.netSqft, q.key).toBeGreaterThanOrEqual(0);
        expect(q.openingSqft, q.key).toBeLessThanOrEqual(q.grossSqft + 0.01);
      }
      // Every opening's area is accounted for against some wall.
      const hosted = [...areas.keys()];
      const known = new Set(quantities.map((q) => q.key));
      for (const key of hosted) expect(known.has(key), key).toBe(true);
    }
  });

  it("wall area is measured, and it is in the range a house of this size has", () => {
    for (const model of everyModel()) {
      const areas = openingAreaByWall(model);
      const quantities = wallQuantities(model, (key) => areas.get(key) ?? 0);
      const gross = quantities.reduce((sum, q) => sum + q.grossSqft, 0);
      const floor = model.rooms
        .filter((r) => r.kind !== "outdoor")
        .reduce((sum, r) => sum + r.rect[2] * r.rect[3], 0);
      // Residential wall area runs a little over the floor area it encloses;
      // wildly outside that range means the graph is double-counting shared
      // walls or dropping them.
      expect(gross / floor, `${gross.toFixed(0)}sqft of wall over ${floor.toFixed(0)}sqft`).toBeGreaterThan(0.6);
      expect(gross / floor).toBeLessThan(2.2);
      for (const q of quantities) expect(q.heightFt).toBeLessThanOrEqual(WALL_HEIGHT_FT);
    }
  });

  it("a storey's walls enclose it — every room is bounded on all four sides", () => {
    for (const model of everyModel()) {
      for (let level = 0; level < model.levels; level++) {
        const walls = buildWalls(model, level);
        for (const room of model.rooms.filter((r) => r.level === level)) {
          const touching = walls.filter((w) => w.bounds.includes(room.key));
          const sides = new Set(
            touching.map((w) => {
              const [x, z, rw, rd] = room.rect;
              if (w.axis === "x") return w.at < z + rd / 2 ? "n" : "s";
              return w.at < x + rw / 2 ? "w" : "e";
            }),
          );
          expect(sides.size, `${room.label} bounded on ${[...sides].join(",")}`).toBe(4);
        }
      }
    }
  });
});

describe("what the wall graph is for", () => {
  it("siding is priced on the outside walls only", () => {
    // The estimate used to price siding as `wallLf * 9` over half of every
    // room's perimeter — which clad the interior partitions too. On this
    // brief that was 3,161 sqft of siding on a house with 1,509 sqft of
    // outside wall: more than twice the cladding a builder would order.
    const model = generateConcepts(brief("modern"), 60)[0].model;
    const q = takeoff(model, "modern");
    const areas = openingAreaByWall(model);
    const outside = wallQuantities(model, (key) => areas.get(key) ?? 0).filter((quantity) => {
      const wall = allWalls(model).find((w) => w.key === quantity.key)!;
      return wall.wallClass === "exterior";
    });
    const net = outside.reduce((sum, quantity) => sum + quantity.netSqft, 0);
    expect(q.exteriorWallNetSqft).toBeCloseTo(net, 0);
    // And it is net of the openings cut into it, which the old figure was not.
    expect(q.exteriorWallNetSqft).toBeLessThan(q.exteriorWallGrossSqft);
  });

  it("a shared wall is framed once, an outside wall is framed once too", () => {
    // "Half of every room's perimeter" got shared walls right by accident and
    // outside walls wrong by the same halving — it undercounted framing by
    // about a third.
    const model = generateConcepts(brief("modern"), 60)[0].model;
    const q = takeoff(model, "modern");
    const halfPerimeter = model.rooms.reduce((sum, r) => sum + r.rect[2] + r.rect[3], 0);
    expect(q.wallLf).toBeGreaterThan(halfPerimeter * 1.15);
  });
});
