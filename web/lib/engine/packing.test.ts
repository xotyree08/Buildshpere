import { describe, expect, it } from "vitest";

import type { DesignBrief, HomeStyle, ParametricModel, Room } from "../types";
import { assembleModel, generateConcepts, type RoomSpec } from "./generate";
import { takeoff } from "./estimate";
import { GRID_FT as GRID, moveRoom } from "./edit";
import { buildRoof } from "./roofgeom";

const brief = (over: Partial<DesignBrief["program"]> = {}, style: HomeStyle = "modern"): DesignBrief => ({
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
    ...over,
  },
  style,
  interiors: {},
  lifestyleNotes: "",
});

const STYLES: HomeStyle[] = [
  "modern", "ranch", "craftsman", "farmhouse", "colonial",
  "cape_cod", "victorian", "a_frame", "mountain", "coastal",
];

const areaOf = (r: Room) => r.rect[2] * r.rect[3];
const level = (m: ParametricModel, l: number) => m.rooms.filter((r) => r.level === l);

function everyConcept(): { style: HomeStyle; model: ParametricModel; sqft: number }[] {
  const out: { style: HomeStyle; model: ParametricModel; sqft: number }[] = [];
  for (const style of STYLES) {
    for (const c of generateConcepts(brief({}, style), 60)) out.push({ style, model: c.model, sqft: c.sqft });
  }
  return out;
}

/** Bands are what the modelled hallways separate. */
function bandsOf(model: ParametricModel, l: number): { z0: number; z1: number }[] {
  const rooms = level(model, l);
  if (rooms.length === 0) return [];
  const halls = rooms
    .filter((r) => r.kind === "hallway")
    .map((r) => [r.rect[1], r.rect[1] + r.rect[3]] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const end = Math.max(...rooms.map((r) => r.rect[1] + r.rect[3]));
  const bands: { z0: number; z1: number }[] = [];
  let cursor = 0;
  for (const [hz0, hz1] of halls) {
    if (hz0 > cursor + 1e-6) bands.push({ z0: cursor, z1: hz0 });
    cursor = Math.max(cursor, hz1);
  }
  if (end > cursor + 1e-6) bands.push({ z0: cursor, z1: end });
  return bands;
}

describe("band packing: a footprint a builder would recognize", () => {
  it("packing never takes a square foot from a room, or gives it one", () => {
    // Rooms widen to share a band's depth, but the program is a promise: a
    // 240 sqft primary bedroom is 240 sqft whatever shape the band makes it.
    const specs: RoomSpec[] = [
      { kind: "living", label: "Living Room", areaSqft: 320, aspect: 1.3, public: true },
      { kind: "kitchen", label: "Kitchen", areaSqft: 200, aspect: 1.4, public: true },
      { kind: "laundry", label: "Laundry", areaSqft: 64, aspect: 1.0, public: false },
      { kind: "closet", label: "Mechanical / Storage", areaSqft: 48, aspect: 1.0, public: false },
      { kind: "bedroom", label: "Primary Bedroom", areaSqft: 240, aspect: 1.2, public: false },
    ];
    const model = assembleModel([specs], 46);
    for (const spec of specs) {
      const room = model.rooms.find((r) => r.label === spec.label)!;
      expect(room).toBeDefined();
      // Dimensions land on a tenth of a foot so the drawings read cleanly,
      // and that rounding is the only thing between the spec and the room:
      // at most half a tenth on each edge, which is 0.6 sqft on a closet.
      const [, , w, d] = room.rect;
      expect(Math.abs(areaOf(room) - spec.areaSqft)).toBeLessThanOrEqual(0.05 * (w + d) + 0.01);
    }
  });

  it("every band is solid — rooms and their partitions, and nothing else", () => {
    // This is the fix, stated exactly: a band's rooms fill a rectangle, and
    // the only thing they do not account for is the wall between them. The
    // sawtooth this replaces came from rooms keeping their own depth inside a
    // shared row, so a 12ft kitchen beside a 16ft living room left a 4ft notch
    // in the wall — and every notch became its own roof wing with its own
    // ridge. A notch that size would show up here as a band 75% full.
    for (const { model } of everyConcept()) {
      for (let l = 0; l < model.levels; l++) {
        for (const band of bandsOf(model, l)) {
          const rooms = level(model, l).filter(
            (r) => r.rect[1] >= band.z0 - 1e-6 && r.rect[1] + r.rect[3] <= band.z1 + 1e-6,
          );
          if (rooms.length === 0) continue;
          const filled = rooms.reduce((sum, r) => sum + areaOf(r), 0);
          const width = Math.max(...rooms.map((r) => r.rect[0] + r.rect[2]));
          const fill = filled / (width * (band.z1 - band.z0));
          expect(fill).toBeGreaterThan(0.85);
          expect(fill).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("every room can still be moved — a plan packed solid is a plan nobody can edit", () => {
    // Interior partitions are what leave the editor somewhere to put a room.
    // Without them a freshly generated storey is wedged: rooms butt on every
    // side and the layout editor refuses every drag it is offered.
    for (const { model } of everyConcept()) {
      const envelope = { widthFt: 80, depthFt: 140 };
      for (const room of model.rooms) {
        const ways = [
          [0, -GRID], [0, GRID], [-GRID, 0], [GRID, 0],
        ].filter(([dx, dy]) => moveRoom(model, room.key, dx, dy, envelope).ok);
        expect(ways.length).toBeGreaterThan(0);
      }
    }
  });

  it("the roof over a generated plan is a handful of wings, not a comb", () => {
    for (const { style, model } of everyConcept()) {
      expect(buildRoof(model, style).wings.length).toBeLessThanOrEqual(4);
    }
  });

  it("circulation is modelled, so the home's area and its footprint agree", () => {
    for (const { model, style } of everyConcept()) {
      const q = takeoff(model, style);
      const net = model.rooms.filter((r) => r.kind !== "outdoor").reduce((s, r) => s + areaOf(r), 0);
      // Gross still holds every room...
      expect(q.grossFloorSqft).toBeGreaterThanOrEqual(Math.round(net) - 1);
      // ...and the only thing left between them is wall thickness, which is
      // exactly why real residential plans run 85-92% net to gross. They used
      // to sit 20% apart with nothing in the plan to explain the difference.
      const ratio = net / q.grossFloorSqft;
      expect(ratio).toBeGreaterThan(0.85);
      expect(ratio).toBeLessThan(0.97);
    }
  });

  it("every storey with more than one band has the hallways that connect it", () => {
    for (const { model } of everyConcept()) {
      for (let l = 0; l < model.levels; l++) {
        const rooms = level(model, l);
        const bands = new Set(rooms.filter((r) => r.kind !== "hallway").map((r) => Math.round(r.rect[1] * 10)));
        const halls = rooms.filter((r) => r.kind === "hallway");
        if (bands.size > 1) expect(halls.length).toBeGreaterThan(0);
        // A hall reaches both bands it serves, never floating narrower than one.
        for (const hall of halls) expect(hall.rect[2]).toBeGreaterThan(0);
      }
    }
  });

  it("no room is packed too narrow to be a room, and none overlaps another", () => {
    for (const { model } of everyConcept()) {
      for (const r of model.rooms) {
        expect(r.rect[2]).toBeGreaterThanOrEqual(4);
        expect(r.rect[3]).toBeGreaterThan(0);
      }
      for (let l = 0; l < model.levels; l++) {
        const rooms = level(model, l);
        for (let i = 0; i < rooms.length; i++) {
          for (let j = i + 1; j < rooms.length; j++) {
            const [ax, az, aw, ad] = rooms[i].rect;
            const [bx, bz, bw, bd] = rooms[j].rect;
            const ox = Math.min(ax + aw, bx + bw) - Math.max(ax, bx);
            const oz = Math.min(az + ad, bz + bd) - Math.max(az, bz);
            expect(Math.max(0, ox) * Math.max(0, oz)).toBeLessThan(1);
          }
        }
      }
    }
  });

  it("a square-footage target lands on the finished home, hallways included", () => {
    // The number the customer types is a promise about the house they walk
    // into. Scaling only the rooms used to overshoot it by a fifth.
    for (const target of [1800, 2600, 3200]) {
      for (const c of generateConcepts(brief({ targetSqft: target }), 90)) {
        expect(Math.abs(c.sqft - target) / target).toBeLessThan(0.08);
      }
    }
  });

  it("stays deterministic", () => {
    expect(generateConcepts(brief({}, "craftsman"), 60)).toEqual(generateConcepts(brief({}, "craftsman"), 60));
    expect(generateConcepts(brief({ targetSqft: 2600 }), 90)).toEqual(
      generateConcepts(brief({ targetSqft: 2600 }), 90),
    );
  });
});
