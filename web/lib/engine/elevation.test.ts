import { describe, expect, it } from "vitest";

import type { DesignBrief, HomeStyle } from "../types";
import { exteriorRuns } from "./adjacency";
import { buildElevation } from "./elevation";
import { generateConcepts } from "./generate";
import { WALL_HEIGHT_FT } from "./iso";
import { roofFor } from "./roof";

function brief(style: HomeStyle): DesignBrief {
  return {
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
    style,
    interiors: {},
    lifestyleNotes: "",
  };
}

describe("buildElevation", () => {
  it("stacks one wall band per level at wall height, grounded at the bottom", () => {
    const two = generateConcepts(brief("colonial"), 60).find((c) => c.model.levels === 2)!;
    const elev = buildElevation(two.model, "colonial", "north");
    expect(elev.walls).toHaveLength(2);
    for (const wall of elev.walls) expect(wall.h).toBe(WALL_HEIGHT_FT);
    const ground = elev.walls[0];
    expect(ground.y + ground.h).toBeCloseTo(elev.height, 5);
  });

  it("flat styles have no roof profile; pitched styles do, and steeper is taller", () => {
    const modern = generateConcepts(brief("modern"), 60)[0];
    expect(buildElevation(modern.model, "modern", "north").roof).toBeNull();

    const ranchConcept = generateConcepts(brief("ranch"), 60)[0];
    const ranch = buildElevation(ranchConcept.model, "ranch", "north");
    const victorian = buildElevation(ranchConcept.model, "victorian", "north");
    expect(ranch.roof).not.toBeNull();
    // identical model, different style: roof height = total height - wall top
    const wallTop = (m: typeof ranch) => m.height - m.walls.length * WALL_HEIGHT_FT;
    expect(wallTop(victorian)).toBeGreaterThan(wallTop(ranch));
    expect(roofFor("victorian").steepness).toBeGreaterThan(roofFor("ranch").steepness);
  });

  it("ridge orientation shapes the profile: quad when parallel, triangle end-on", () => {
    const concept = generateConcepts(brief("farmhouse"), 60)[0];
    const rooms = concept.model.rooms.filter((r) => r.level === 0 && r.kind !== "outdoor");
    const w = Math.max(...rooms.map((r) => r.rect[0] + r.rect[2])) - Math.min(...rooms.map((r) => r.rect[0]));
    const d = Math.max(...rooms.map((r) => r.rect[1] + r.rect[3])) - Math.min(...rooms.map((r) => r.rect[1]));
    const ridgeAlongX = w >= d; // ridge follows the long axis

    const front = buildElevation(concept.model, "farmhouse", "north");
    const side = buildElevation(concept.model, "farmhouse", "east");
    // Parallel to the ridge → 4-point profile; end-on → 3-point triangle.
    expect(front.roof).toHaveLength(ridgeAlongX ? 4 : 3);
    expect(side.roof).toHaveLength(ridgeAlongX ? 3 : 4);
  });

  it("every elevation draws exactly the openings the plan puts on that face", () => {
    // This used to assert the front carried more than three windows, on the
    // assumption that a plan's windows were all on its north wall — they were,
    // because the generator put them there whether or not north was outside.
    // A house has windows on every side that faces out, and each elevation
    // draws its own.
    const concept = generateConcepts(brief("craftsman"), 60)[0];
    const rooms = concept.model.rooms.filter((r) => r.level === 0);
    for (const [face, wall] of [["north", "n"], ["east", "e"]] as const) {
      const drawn = buildElevation(concept.model, "craftsman", face);
      const planned = concept.model.openings.filter((o) => {
        if (o.wall !== wall) return false;
        const room = concept.model.rooms.find((r) => r.key === o.roomKey)!;
        if (room.kind === "outdoor") return false;
        return exteriorRuns(room, rooms, wall).some(
          (run) => o.offsetFt >= run.from - 0.6 && o.offsetFt + o.widthFt <= run.to + 0.6,
        );
      });
      expect(drawn.openings, face).toHaveLength(planned.length);
      expect(planned.length, face).toBeGreaterThan(0);
    }
    // And the plan glazes more than one face, which is the point: windows go
    // where a wall faces out, not all on the wall the generator called north.
    const walls = new Set(concept.model.openings.filter((o) => o.kind === "window").map((o) => o.wall));
    expect(walls.size).toBeGreaterThanOrEqual(3);
  });

  it("openings sit within the elevation bounds and above grade", () => {
    const concept = generateConcepts(brief("cottage"), 60)[0];
    const elev = buildElevation(concept.model, "cottage", "north");
    for (const o of elev.openings) {
      expect(o.y).toBeGreaterThanOrEqual(0);
      expect(o.y + o.h).toBeLessThanOrEqual(elev.height + 0.001);
      expect(o.x + o.w).toBeGreaterThan(0);
      expect(o.x).toBeLessThan(elev.width);
    }
  });

  it("is deterministic", () => {
    const concept = generateConcepts(brief("tudor"), 60)[0];
    expect(buildElevation(concept.model, "tudor", "north")).toEqual(
      buildElevation(concept.model, "tudor", "north"),
    );
  });
});
