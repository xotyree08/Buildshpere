import { describe, expect, it } from "vitest";

import { generateConcepts } from "./generate";
import {
  defaultSchemeFor,
  designBoard,
  furnishRoom,
  furnitureForModel,
  INTERIOR_SCHEMES,
  matchScheme,
  schemeByKey,
} from "./interiors";
import type { DesignBrief, Room } from "../types";

const brief: DesignBrief = {
  id: "b1",
  projectId: "p1",
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
  style: "craftsman",
  interiors: {},
  lifestyleNotes: "",
};

describe("interior schemes", () => {
  it("every architectural style resolves to a scheme, craftsman to Warm Craftsman", () => {
    expect(defaultSchemeFor("craftsman").key).toBe("warm_craftsman");
    expect(defaultSchemeFor("colonial").key).toBe("traditional");
    expect(defaultSchemeFor(undefined).key).toBe("transitional");
    // Unmapped styles still land somewhere sensible.
    expect(defaultSchemeFor("victorian")).toBeDefined();
  });

  it("scheme keys are unique and swatches are valid hex", () => {
    const keys = INTERIOR_SCHEMES.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const s of INTERIOR_SCHEMES) {
      for (const c of [s.wall, s.accent, s.textile, s.wood, s.metal]) {
        expect(c).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it("matchScheme maps feel-words to schemes; gibberish maps to nothing", () => {
    expect(matchScheme("calm and quiet, japanese influence")?.scheme.key).toBe("japandi");
    expect(matchScheme("beachy and breezy like vacation")?.scheme.key).toBe("coastal");
    expect(matchScheme("xyzzy plugh")).toBeNull();
  });
});

describe("furniture layout", () => {
  const bedroom: Room = { key: "r1", kind: "bedroom", label: "Primary Bedroom", level: 0, rect: [10, 10, 14, 13] };

  it("furnishes a bedroom with a bed and keeps everything inside the walls", () => {
    const items = furnishRoom(bedroom);
    expect(items.some((i) => i.label.includes("bed"))).toBe(true);
    for (const i of items) {
      expect(i.x).toBeGreaterThanOrEqual(10);
      expect(i.z).toBeGreaterThanOrEqual(10);
      expect(i.x + i.w).toBeLessThanOrEqual(24);
      expect(i.z + i.d).toBeLessThanOrEqual(23);
    }
  });

  it("wide bedrooms get a king, narrow ones a queen", () => {
    expect(furnishRoom(bedroom).find((i) => i.key.endsWith("bed"))!.label).toBe("King bed");
    const narrow: Room = { ...bedroom, rect: [10, 10, 11, 12] };
    expect(furnishRoom(narrow).find((i) => i.key.endsWith("bed"))!.label).toBe("Queen bed");
  });

  it("nothing lands in the door zone at the hallway wall", () => {
    const items = furnishRoom(bedroom);
    const door = { x: 10 + 7, z: 23 }; // south wall center
    for (const i of items) {
      const cx = Math.max(i.x, Math.min(door.x, i.x + i.w));
      const cz = Math.max(i.z, Math.min(door.z, i.z + i.d));
      expect((cx - door.x) ** 2 + (cz - door.z) ** 2).toBeGreaterThanOrEqual(3.2 ** 2);
    }
  });

  it("a room too small for a piece omits it instead of clipping through walls", () => {
    const tiny: Room = { key: "r2", kind: "bedroom", label: "Tiny", level: 0, rect: [0, 0, 6, 6] };
    for (const i of furnishRoom(tiny)) {
      expect(i.x + i.w).toBeLessThanOrEqual(6);
      expect(i.z + i.d).toBeLessThanOrEqual(6);
    }
  });

  it("hallways, garages, and closets stay unfurnished", () => {
    const hall: Room = { key: "h", kind: "hallway", label: "Hall", level: 0, rect: [0, 0, 30, 4] };
    expect(furnishRoom(hall)).toHaveLength(0);
  });

  it("furnishes a full generated model deterministically", () => {
    const model = generateConcepts(brief, 90)[0].model;
    const a = furnitureForModel(model);
    const b = furnitureForModel(model);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(8);
    const beds = a.filter((i) => i.label.includes("bed"));
    expect(beds.length).toBeGreaterThanOrEqual(3); // one per bedroom
  });
});

describe("design board", () => {
  it("gives accent paint to accent rooms and field paint elsewhere", () => {
    const model = generateConcepts(brief, 90)[0].model;
    const scheme = schemeByKey("warm_craftsman")!;
    const board = designBoard(model, scheme);
    const office = board.find((b) => b.room.kind === "office")!;
    const bedroom = board.find((b) => b.room.kind === "bedroom")!;
    expect(office.paint).toBe(scheme.accent);
    expect(bedroom.paint).toBe(scheme.wall);
    expect(board.every((b) => b.notes.join(" ").includes(scheme.metalLabel))).toBe(true);
    expect(board.some((b) => b.room.kind === "hallway")).toBe(false);
  });
});
