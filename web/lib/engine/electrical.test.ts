import { describe, expect, it } from "vitest";

import { buildElectricalPlan } from "./electrical";
import { generateConcepts } from "./generate";
import type { DesignBrief } from "../types";

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

function plan() {
  return buildElectricalPlan(generateConcepts(brief, 90)[0].model);
}

describe("buildElectricalPlan", () => {
  it("no wall point in a habitable room is more than ~6 ft from a receptacle", () => {
    const p = plan();
    const bedroom = p.rooms.find((r) => r.room.kind === "bedroom")!;
    const [x, z, w] = bedroom.room.rect;
    const northOutlets = bedroom.devices
      .filter((dev) => (dev.type === "receptacle" || dev.type === "gfci") && Math.abs(dev.z - (z + 0.7)) < 0.1)
      .map((dev) => dev.x)
      .sort((a, b) => a - b);
    expect(northOutlets.length).toBeGreaterThan(0);
    // Worst gap between outlets (and to each corner) stays within the rhythm.
    let worst = Math.max(northOutlets[0] - x, x + w - northOutlets[northOutlets.length - 1]);
    for (let i = 1; i < northOutlets.length; i++) worst = Math.max(worst, (northOutlets[i] - northOutlets[i - 1]) / 2);
    expect(worst).toBeLessThanOrEqual(7);
  });

  it("wet rooms get GFCI, dry rooms get standard receptacles", () => {
    const p = plan();
    const kitchen = p.rooms.find((r) => r.room.kind === "kitchen")!;
    expect(kitchen.devices.some((d) => d.type === "gfci")).toBe(true);
    expect(kitchen.devices.filter((d) => d.type === "receptacle")).toHaveLength(0);
    const bath = p.rooms.find((r) => r.room.kind === "bathroom")!;
    expect(bath.devices.some((d) => d.type === "gfci")).toBe(true);
    const bedroom = p.rooms.find((r) => r.room.kind === "bedroom")!;
    expect(bedroom.devices.some((d) => d.type === "receptacle")).toBe(true);
    expect(bedroom.devices.some((d) => d.type === "gfci")).toBe(false);
  });

  it("every room door has a switch inside the room", () => {
    const p = plan();
    for (const re of p.rooms.filter((r) => r.room.kind !== "hallway" && r.room.kind !== "closet")) {
      expect(re.devices.some((d) => d.type === "switch")).toBe(true);
      // Switches sit inside the room bounds.
      for (const s of re.devices.filter((d) => d.type === "switch")) {
        const [x, z, w, d] = re.room.rect;
        expect(s.x).toBeGreaterThanOrEqual(x);
        expect(s.x).toBeLessThanOrEqual(x + w);
        expect(s.z).toBeGreaterThanOrEqual(z);
        expect(s.z).toBeLessThanOrEqual(z + d);
      }
    }
  });

  it("big living rooms get a recessed grid, small rooms one fixture", () => {
    const p = plan();
    const living = p.rooms.find((r) => r.room.kind === "living")!;
    expect(living.devices.filter((d) => d.type === "recessed").length).toBeGreaterThanOrEqual(4);
    const bath = p.rooms.find((r) => r.room.kind === "bathroom")!;
    expect(bath.devices.filter((d) => d.type === "fixture")).toHaveLength(1);
  });

  it("smoke in every bedroom and a combined smoke/CO on the hall", () => {
    const p = plan();
    const bedrooms = p.rooms.filter((r) => r.room.kind === "bedroom");
    expect(bedrooms.length).toBeGreaterThanOrEqual(3);
    for (const b of bedrooms) expect(b.devices.some((d) => d.type === "smoke")).toBe(true);
    const hall = p.rooms.find((r) => r.room.kind === "hallway")!;
    expect(hall.devices.some((d) => d.type === "smoke_co")).toBe(true);
  });

  it("totals reconcile with the per-room devices and the plan is deterministic", () => {
    const a = plan();
    const b = plan();
    expect(a).toEqual(b);
    const counted = a.rooms.reduce((s, r) => s + r.devices.length, 0);
    const totaled = Object.values(a.totals).reduce((s, n) => s + n, 0);
    expect(counted).toBe(totaled);
    expect(a.notes.join(" ")).toContain("licensed electrician");
  });
});
