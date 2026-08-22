/**
 * The driveway was worked out inside the 3-D scene and nowhere else, so the
 * site plan — the one drawing whose whole job is what sits where on the lot —
 * showed no pavement at all. These pin the shared rule.
 */

import { describe, expect, it } from "vitest";

import { DRIVE_LANE_FT, drivewayRects, garageDoorWall } from "./site";
import type { ParametricModel, Room } from "../types";

const garage = { key: "g", label: "2-Car Garage", kind: "garage", rect: [10, 30, 24, 22], level: 0 } as unknown as Room;
const RECT = { x: 10, y: 30, w: 24, d: 22 };

function model(openings: { kind: string; wall: string; widthFt: number }[]): ParametricModel {
  return {
    levels: 1,
    rooms: [garage],
    openings: openings.map((o, i) => ({ key: `o${i}`, roomKey: "g", offsetFt: 2, ...o })),
  } as unknown as ParametricModel;
}

describe("which wall the vehicle door is in", () => {
  it("is the widest door, not the first one found", () => {
    // The 3ft door into the house comes first in the list; taking it laid the
    // driveway out of the back wall into the garden.
    const m = model([
      { kind: "door", wall: "s", widthFt: 3 },
      { kind: "door", wall: "n", widthFt: 16 },
    ]);
    expect(garageDoorWall(m, garage)).toBe("n");
  });

  it("ignores windows", () => {
    const m = model([
      { kind: "window", wall: "e", widthFt: 20 },
      { kind: "door", wall: "w", widthFt: 16 },
    ]);
    expect(garageDoorWall(m, garage)).toBe("w");
  });

  it("falls back to the street face when the garage has no door at all", () => {
    expect(garageDoorWall(model([]), garage)).toBe("n");
  });
});

describe("the driveway runs from the vehicle door", () => {
  it("a front-loaded garage gives one run to the street", () => {
    const [run, ...rest] = drivewayRects(RECT, "n", 30);
    expect(rest).toEqual([]);
    // Reaches the street edge, and is inset from both jambs.
    expect(run.y).toBe(0);
    expect(run.y + run.d).toBe(30);
    expect(run.x).toBeGreaterThan(RECT.x);
    expect(run.x + run.w).toBeLessThan(RECT.x + RECT.w);
  });

  it("an alley-loaded garage runs out the back, not the front", () => {
    const [run] = drivewayRects(RECT, "s", 15);
    expect(run.y).toBe(RECT.y + RECT.d);
    expect(run.d).toBe(15);
  });

  it("a side-loaded garage gets an apron and a lane that turns to the street", () => {
    const rects = drivewayRects(RECT, "w", 20, 0);
    expect(rects).toHaveLength(2);
    const [apron, lane] = rects;
    // The apron leaves the door sideways.
    expect(apron.x + apron.w).toBe(RECT.x);
    // The lane reaches the street and is a lane's width.
    expect(lane.y).toBe(0);
    expect(lane.w).toBe(DRIVE_LANE_FT);
    expect(lane.y + lane.d).toBe(apron.y);
  });

  it("without a street to reach, a side-loaded garage is just the apron", () => {
    // What the 3-D scene wants: it draws no lot, so there is nothing to turn to.
    expect(drivewayRects(RECT, "e", 22)).toHaveLength(1);
  });

  it("no pavement when there is no room for any", () => {
    expect(drivewayRects(RECT, "n", 0)).toEqual([]);
  });
});
