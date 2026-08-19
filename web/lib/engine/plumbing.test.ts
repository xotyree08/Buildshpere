import { describe, expect, it } from "vitest";

import { generateConcepts } from "./generate";
import { buildPlumbingPlan } from "./plumbing";
import type { DesignBrief } from "../types";

const brief: DesignBrief = {
  id: "b1",
  projectId: "p1",
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

const plan = () => buildPlumbingPlan(generateConcepts(brief, 90)[0].model);

describe("buildPlumbingPlan", () => {
  it("every bathroom gets lavatory, water closet, and shower; the kitchen gets its sink", () => {
    const p = plan();
    const baths = p.rooms.filter((r) => r.room.kind === "bathroom");
    expect(baths.length).toBe(2);
    for (const b of baths) {
      const types = b.fixtures.map((f) => f.type);
      expect(types).toContain("lavatory");
      expect(types).toContain("toilet");
      expect(types).toContain("shower_tub");
    }
    const kitchen = p.rooms.find((r) => r.room.kind === "kitchen")!;
    expect(kitchen.fixtures.map((f) => f.type)).toContain("kitchen_sink");
  });

  it("exactly one water heater, in the mechanical closet when one exists", () => {
    const p = plan();
    const heaters = p.rooms.flatMap((r) => r.fixtures).filter((f) => f.type === "water_heater");
    expect(heaters).toHaveLength(1);
    const host = p.rooms.find((r) => r.fixtures.some((f) => f.type === "water_heater"))!;
    expect(host.room.kind).toBe("closet");
  });

  it("front and rear hose bibs; WSFU total drives the service size", () => {
    const p = plan();
    expect(p.hoseBibs).toHaveLength(2);
    const summed =
      Math.round(
        ([...p.rooms.flatMap((r) => r.fixtures), ...p.hoseBibs].reduce((s, f) => s + f.wsfu, 0)) * 10,
      ) / 10;
    expect(p.totalWsfu).toBe(summed);
    expect(['3/4"', '1"', '1-1/4"']).toContain(p.serviceSize);
    // A 2-bath + kitchen + laundry home lands beyond a bare 3/4" service.
    expect(p.totalWsfu).toBeGreaterThan(15);
  });

  it("fixtures sit inside their rooms", () => {
    const p = plan();
    for (const { room, fixtures } of p.rooms) {
      const [x, z, w, d] = room.rect;
      for (const f of fixtures) {
        expect(f.x).toBeGreaterThanOrEqual(x);
        expect(f.x).toBeLessThanOrEqual(x + w);
        expect(f.z).toBeGreaterThanOrEqual(z);
        expect(f.z).toBeLessThanOrEqual(z + d);
      }
    }
  });

  it("adjacent plumbing rooms produce a wet wall worth stacking", () => {
    const p = plan();
    // The plan gathers the laundry, the powder room and the hall bath into
    // one service core, so several walls carry two fixture groups apiece.
    expect(p.wetWalls.length).toBeGreaterThanOrEqual(1);
    // Four is two plumbed rooms genuinely sharing a stack. It used to be six,
    // on the strength of the two full baths sitting side by side — but that
    // only happened while the ensuite was stranded across the house from the
    // bedroom it serves. An ensuite belongs to its bedroom, and the plumbing
    // economy that costs is the right trade.
    expect(Math.max(...p.wetWalls.map((w) => w.fixtures))).toBeGreaterThanOrEqual(4);
  });

  it("is deterministic and honest about scope", () => {
    const a = plan();
    const b = plan();
    expect(a).toEqual(b);
    expect(a.notes.join(" ")).toContain("licensed plumber");
  });
});
