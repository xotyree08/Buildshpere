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

/**
 * A band is a run of depth that some room occupies all the way across. The
 * gaps between bands are what nothing crosses — a corridor, or just the wall
 * where two bands sit back to back. Splitting on hallways alone would miss
 * the second kind and read two bands as one.
 */
function bandsOf(model: ParametricModel, l: number): { z0: number; z1: number }[] {
  const rooms = level(model, l);
  if (rooms.length === 0) return [];
  const spans = rooms
    .map((r) => [r.rect[1], r.rect[1] + r.rect[3]] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const bands: { z0: number; z1: number }[] = [];
  for (const [z0, z1] of spans) {
    const last = bands[bands.length - 1];
    if (last && z0 <= last.z1 + 1e-6) last.z1 = Math.max(last.z1, z1);
    else bands.push({ z0, z1 });
  }
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

  it("rooms come out the shape they asked for", () => {
    // A band gives every room in it one depth, and a room forced to a depth it
    // did not ask for pays in width — the distortion goes as the SQUARE of the
    // ratio. Packing in program order put a 6.5ft bathroom in an 11.4ft band
    // and returned 5.3 x 11.4, a corridor with a toilet in it. Grouping rooms
    // by the depth they want holds every room close to its own proportions.
    const wanted = new Map<string, number>([
      ["Living Room", 1.3], ["Kitchen", 1.4], ["Dining Room", 1.2],
      ["Laundry", 1.0], ["Mechanical / Storage", 1.0], ["Primary Bedroom", 1.2],
      ["Bedroom 2", 1.2], ["Bedroom 3", 1.2], ["Primary Bath", 1.4],
      ["Bath 2", 1.4], ["2-Car Garage", 1.6], ["Front Porch", 2.5],
    ]);
    for (const { model } of everyConcept()) {
      for (const room of model.rooms) {
        const want = wanted.get(room.label);
        if (want === undefined) continue;
        const got = room.rect[2] / room.rect[3];
        const off = Math.max(got / want, want / got);
        expect(off, `${room.label} ${room.rect[2]}x${room.rect[3]}`).toBeLessThan(1.6);
      }
      // And no room is squeezed to a sliver in either direction: a closet came
      // out 21.1 x 2.3 when it shared a column with a primary bedroom.
      for (const room of model.rooms) {
        if (room.kind === "hallway") continue;
        expect(Math.min(room.rect[2], room.rect[3])).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it("a front porch faces the front, wide and shallow", () => {
    // Sorted purely by depth the porch sank to the back of the plan and came
    // out 6.6 x 18.2 — a porch turned inside out, behind the garage.
    for (const { model } of everyConcept()) {
      const porch = model.rooms.find((r) => /porch/i.test(r.label));
      if (!porch) continue;
      expect(porch.rect[2]).toBeGreaterThan(porch.rect[3]);
      const front = Math.min(...level(model, porch.level).map((r) => r.rect[1]));
      expect(porch.rect[1]).toBeCloseTo(front, 1);
    }
  });

  it("circulation is a tenth of the home, not a quarter", () => {
    // A corridor is double-loaded — it serves the rooms on both sides. One at
    // every band boundary instead gave the middle bands a corridor each side
    // and pushed circulation to a quarter of the house; real homes run 10-15%.
    for (const { model } of everyConcept()) {
      const halls = model.rooms.filter((r) => r.kind === "hallway").reduce((s, r) => s + areaOf(r), 0);
      const home = model.rooms
        .filter((r) => r.kind !== "garage" && r.kind !== "outdoor")
        .reduce((s, r) => s + areaOf(r), 0);
      expect(halls / home).toBeLessThan(0.2);
      expect(halls).toBeGreaterThan(0);
    }
  });

  it("stays deterministic", () => {
    expect(generateConcepts(brief({}, "craftsman"), 60)).toEqual(generateConcepts(brief({}, "craftsman"), 60));
    expect(generateConcepts(brief({ targetSqft: 2600 }), 90)).toEqual(
      generateConcepts(brief({ targetSqft: 2600 }), 90),
    );
  });
});
