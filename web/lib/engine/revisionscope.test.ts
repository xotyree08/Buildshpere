import { describe, expect, it } from "vitest";

import type { ParametricModel, Room } from "../types";
import { classifyRevision, conditionedSqft, MAJOR } from "./revisionscope";

function room(key: string, kind: Room["kind"], rect: [number, number, number, number]): Room {
  return { key, kind, label: key, level: 0, rect };
}

/** ~1,150 sq ft of conditioned space plus a garage. */
function base(): ParametricModel {
  return {
    schemaVersion: 1,
    levels: 1,
    rooms: [
      room("living", "living", [0, 0, 22, 20]),
      room("kitchen", "kitchen", [22, 0, 16, 16]),
      room("bed1", "bedroom", [0, 22, 16, 14]),
      room("bed2", "bedroom", [18, 22, 14, 12]),
      room("bath", "bathroom", [34, 22, 8, 10]),
      room("garage", "garage", [0, 40, 22, 22]),
    ],
    openings: [
      { key: "w1", kind: "window", roomKey: "living", wall: "n", offsetFt: 11, widthFt: 6 },
      { key: "d1", kind: "door", roomKey: "kitchen", wall: "w", offsetFt: 8, widthFt: 3 },
    ],
  };
}

function withRooms(rooms: Room[], levels = 1): ParametricModel {
  return { ...base(), levels, rooms };
}

describe("minor vs major revisions (judged from the model, not the wording)", () => {
  it("an unchanged model is not a revision at all", () => {
    expect(classifyRevision(base(), base())).toEqual({ major: false, reasons: [] });
  });

  it("moving a window or door is minor", () => {
    const after: ParametricModel = {
      ...base(),
      openings: base().openings.map((o) => (o.key === "w1" ? { ...o, offsetFt: 6 } : o)),
    };
    expect(classifyRevision(base(), after).major).toBe(false);
  });

  it("nudging a wall a few inches is minor", () => {
    const rooms = base().rooms.map((r) => (r.key === "bed2" ? room("bed2", "bedroom", [18, 22, 14.5, 12]) : r));
    expect(classifyRevision(base(), withRooms(rooms)).major).toBe(false);
  });

  it("adding a bedroom is major and says which room", () => {
    const rooms = [...base().rooms, room("bed3", "bedroom", [0, 64, 13, 12])];
    const scope = classifyRevision(base(), withRooms(rooms));
    expect(scope.major).toBe(true);
    expect(scope.reasons.join(" ")).toContain("Added bed3");
  });

  it("removing a room is major", () => {
    const rooms = base().rooms.filter((r) => r.key !== "bed2");
    const scope = classifyRevision(base(), withRooms(rooms));
    expect(scope.major).toBe(true);
    expect(scope.reasons.join(" ")).toContain("Removed bed2");
  });

  it("adding a floor is major", () => {
    const scope = classifyRevision(base(), withRooms(base().rooms, 2));
    expect(scope.major).toBe(true);
    expect(scope.reasons.join(" ")).toContain("Added a floor");
  });

  it("a big living-area change is major; a small one is not", () => {
    const before = base();
    const sqft = conditionedSqft(before);

    // Grow the living room enough to clear both the fraction and the floor.
    const big = before.rooms.map((r) => (r.key === "living" ? room("living", "living", [0, 0, 22, 20 + 14]) : r));
    const bigScope = classifyRevision(before, withRooms(big));
    expect(bigScope.major).toBe(true);
    expect(bigScope.reasons.join(" ")).toContain("Living area changed");

    // A change under the absolute floor stays minor even in a small home.
    const small = before.rooms.map((r) => (r.key === "bath" ? room("bath", "bathroom", [34, 22, 8, 11]) : r));
    expect(classifyRevision(before, withRooms(small)).major).toBe(false);
    expect(sqft).toBeGreaterThan(0);
  });

  it("relocating a room across the plan is major even at identical size", () => {
    const rooms = base().rooms.map((r) =>
      r.key === "kitchen" ? room("kitchen", "kitchen", [22, 0 + MAJOR.relocationFt + 4, 16, 16]) : r,
    );
    const scope = classifyRevision(base(), withRooms(rooms));
    expect(scope.major).toBe(true);
    expect(scope.reasons.join(" ")).toContain("Relocated kitchen");

    // …but a shuffle inside the tolerance is an adjustment, not a relocation.
    const nudged = base().rooms.map((r) => (r.key === "kitchen" ? room("kitchen", "kitchen", [22, 2, 16, 16]) : r));
    expect(classifyRevision(base(), withRooms(nudged)).major).toBe(false);
  });

  it("growing the footprint past the tolerance is major", () => {
    const rooms = base().rooms.map((r) =>
      r.key === "bath" ? room("bath", "bathroom", [34, 22, 8 + MAJOR.footprintFt + 2, 10]) : r,
    );
    const scope = classifyRevision(base(), withRooms(rooms));
    expect(scope.major).toBe(true);
    expect(scope.reasons.join(" ")).toContain("Footprint changed");
  });

  it("garage and outdoor space are not living area", () => {
    const before = base();
    const withBigGarage = before.rooms.map((r) => (r.key === "garage" ? room("garage", "garage", [0, 40, 22, 30]) : r));
    // The garage grew 176 sq ft — over the living-area floor — but living
    // area itself is untouched, so only the footprint rule may fire.
    expect(conditionedSqft(withRooms(withBigGarage))).toBe(conditionedSqft(before));
  });
});
