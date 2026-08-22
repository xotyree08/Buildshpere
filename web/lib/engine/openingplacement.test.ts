/**
 * Where the drawings put an opening has to agree with where the model says it
 * is. `offsetFt` is a left edge; five drawings read it as a centre, which put
 * every door and window half its own width too far along its wall and hung a
 * sixteen-foot garage door eight feet off the corner of the building.
 *
 * These tests pin the convention at the source and then check the invariant
 * that falls out of it: an opening lies inside the wall it is in.
 */

import { describe, expect, it } from "vitest";

import plans from "./__fixtures__/plans.json";
import { buildElevation } from "./elevation";
import { openingMid, openingSpan } from "./openings";
import type { Opening, ParametricModel } from "../types";

const FIXTURES = Object.entries(plans as unknown as Record<string, ParametricModel>);

describe("an opening's position along its wall", () => {
  it("offsetFt is the left edge, not the centre", () => {
    const o = { key: "o1", kind: "door", roomKey: "r", wall: "n", offsetFt: 10, widthFt: 16 } as Opening;
    expect(openingSpan(o)).toEqual({ from: 10, to: 26 });
    expect(openingMid(o)).toBe(18);
  });

  it("a zero-offset opening starts at the room's corner", () => {
    const o = { key: "o1", kind: "window", roomKey: "r", wall: "w", offsetFt: 0, widthFt: 4 } as Opening;
    expect(openingSpan(o).from).toBe(0);
  });
});

describe("every opening lies within the wall it is in", () => {
  it.each(FIXTURES)("%s", (_name, model) => {
    const rooms = new Map(model.rooms.map((r) => [r.key, r]));
    for (const opening of model.openings) {
      const room = rooms.get(opening.roomKey);
      expect(room, `opening ${opening.key} has no room`).toBeTruthy();
      const [, , w, d] = room!.rect;
      const wallLength = opening.wall === "n" || opening.wall === "s" ? w : d;
      const { from, to } = openingSpan(opening);
      // A hair of tolerance: offsets are rounded to a tenth of a foot.
      expect(from, `${opening.key} in ${room!.label} starts before the wall`).toBeGreaterThanOrEqual(-0.11);
      expect(to, `${opening.key} in ${room!.label} runs past the wall`).toBeLessThanOrEqual(wallLength + 0.11);
    }
  });
});

describe("the drawings agree with the model about where an opening is", () => {
  it.each(FIXTURES)("%s: no elevation opening hangs off the building", (_name, model) => {
    for (const direction of ["north", "east"] as const) {
      const elevation = buildElevation(model, "ranch", direction);
      for (const o of elevation.openings) {
        expect(o.x, `${direction}: an opening starts left of the building`).toBeGreaterThanOrEqual(-0.11);
        expect(o.x + o.w, `${direction}: an opening runs past the building`).toBeLessThanOrEqual(
          elevation.width + 0.11,
        );
      }
    }
  });

  it("an elevation draws a garage door where the model puts it", () => {
    // A 24ft garage across the front, with a 16ft door starting 4ft in. Drawn
    // from a centre it would land at x=-4 and hang off the corner.
    const model = {
      levels: 1,
      rooms: [{ key: "g", label: "2-Car Garage", kind: "garage", rect: [0, 0, 24, 22], level: 0 }],
      openings: [{ key: "o1", kind: "door", roomKey: "g", wall: "n", offsetFt: 4, widthFt: 16 }],
    } as unknown as ParametricModel;
    const elevation = buildElevation(model, "ranch", "north");
    const door = elevation.openings.find((o) => o.kind === "garage");
    expect(door, "the garage door should be drawn").toBeTruthy();
    expect(door!.x).toBeCloseTo(4, 2);
    expect(door!.w).toBeCloseTo(16, 2);
  });
});
