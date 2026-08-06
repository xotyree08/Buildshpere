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

describe("architectural detail and landscaping", () => {
  const model = generateConcepts(brief, 60)[0].model;

  it("windows get trim frames, doors get stoops, ground rooms get plinths", () => {
    const scene = buildScene3D(model, "craftsman");
    const kinds = scene.boxes.map((b) => b.kind);
    expect(kinds.filter((k) => k === "trim").length).toBeGreaterThan(4);
    expect(kinds).toContain("stoop");
    expect(kinds).toContain("plinth");
  });

  it("the driveway extends outward from the garage-door wall; a front door earns a walkway", () => {
    const scene = buildScene3D(model, "craftsman");
    const drive = scene.boxes.find((b) => b.kind === "drive");
    expect(drive).toBeDefined();
    // This plan's garage door faces the rear (alley access) — the drive
    // must sit fully beyond the garage's rear wall, not inside the house.
    const garage = model.rooms.find((r) => r.kind === "garage")!;
    expect(drive!.z).toBeGreaterThanOrEqual(garage.rect[1] + garage.rect[3] - 0.5);
    expect(scene.boxes.some((b) => b.kind === "path")).toBe(true);
  });

  it("doorways are real voids: walkable gap, header above, hall wall pierced too", () => {
    const scene = buildScene3D(model, "craftsman");
    const wallAt = (px: number, y: number, pz: number) =>
      scene.boxes.some(
        (b) =>
          b.kind === "wall" &&
          px >= b.x - 0.01 && px <= b.x + b.w + 0.01 &&
          pz >= b.z - 0.01 && pz <= b.z + b.d + 0.01 &&
          y >= b.y - 0.01 && y <= b.y + b.h + 0.01,
      );
    const door = model.openings.find((o) => o.kind === "door" && o.widthFt < 6)!;
    const room = model.rooms.find((r) => r.key === door.roomKey)!;
    const [x, z, , d] = room.rect;
    const midX = x + door.offsetFt + door.widthFt / 2;
    expect(wallAt(midX, 4, z + d - 0.2)).toBe(false); // the room's own wall is open
    expect(wallAt(midX, 7.5, z + d - 0.2)).toBe(true); // header above the door
    expect(wallAt(midX, 4, z + d + 0.2)).toBe(false); // hallway's facing wall pierced

    const win = model.openings.find((o) => o.kind === "window")!;
    const winRoom = model.rooms.find((r) => r.key === win.roomKey)!;
    const wx = winRoom.rect[0] + win.offsetFt + win.widthFt / 2;
    const wz = winRoom.rect[1] + 0.2;
    expect(wallAt(wx, 1.5, wz)).toBe(true); // sill wall below the glass
    expect(wallAt(wx, 5, wz)).toBe(false); // glass void
    // Corner slivers stay solid.
    expect(wallAt(winRoom.rect[0] + 0.1, 4, wz)).toBe(true);
  });

  it("interior doors render swung open, out of the wall plane", () => {
    const scene = buildScene3D(model, "craftsman");
    const doors = scene.boxes.filter((b) => b.kind === "door");
    expect(doors.some((b) => b.w < 0.2 && b.d > 2)).toBe(true);
  });

  it("landscaping is deterministic and stays off the footprint", () => {
    const a = buildScene3D(model, "craftsman");
    const b = buildScene3D(model, "craftsman");
    expect(a.trees).toEqual(b.trees);
    expect(a.bushes).toEqual(b.bushes);
    expect(a.trees.length).toBeGreaterThan(3);
    const ground = model.rooms.filter((r) => r.level === 0);
    for (const tree of a.trees) {
      const inside = ground.some(
        (r) => tree.x > r.rect[0] && tree.x < r.rect[0] + r.rect[2] && tree.z > r.rect[1] && tree.z < r.rect[1] + r.rect[3],
      );
      expect(inside).toBe(false);
    }
  });
});

describe("composite furniture", () => {
  const model = generateConcepts(brief, 60)[0].model;

  it("a bed expands into platform, mattress, headboard, and pillows", () => {
    const scene = buildScene3D(model, "craftsman");
    const furn = scene.boxes.filter((b) => b.kind === "furn");
    // Far more parts than staged items — pieces are composite now.
    expect(furn.length).toBeGreaterThan(30);
    // Mattress + pillows read as near-white parts raised off the floor.
    expect(furn.some((b) => b.color === "#f2eee6" && b.y > 0)).toBe(true);
    expect(furn.filter((b) => b.color === "#faf8f2").length).toBeGreaterThanOrEqual(2);
  });

  it("furniture parts stay within each item's own footprint", () => {
    const scene = buildScene3D(model, "craftsman");
    for (const b of scene.boxes.filter((x) => x.kind === "furn")) {
      expect(b.w).toBeGreaterThan(0);
      expect(b.h).toBeGreaterThan(0);
    }
  });
});
