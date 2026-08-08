import { describe, expect, it } from "vitest";

import type { ParametricModel } from "../types";
import { layoutProblems, minDims, moveOpening, moveRoom, resizeRoom, snap } from "./edit";

const ENVELOPE = { widthFt: 60, depthFt: 100 };

/** Two rooms side by side sharing a wall at x=20, plus a window and a door. */
function model(): ParametricModel {
  return {
    schemaVersion: 1,
    levels: 1,
    rooms: [
      { key: "living", kind: "living", label: "Living Room", level: 0, rect: [0, 0, 20, 18] },
      { key: "kitchen", kind: "kitchen", label: "Kitchen", level: 0, rect: [20, 0, 16, 14] },
      { key: "bed", kind: "bedroom", label: "Bedroom 2", level: 0, rect: [0, 20, 12, 12] },
    ],
    openings: [
      { key: "w1", kind: "window", roomKey: "living", wall: "n", offsetFt: 10, widthFt: 6 },
      { key: "d1", kind: "door", roomKey: "kitchen", wall: "w", offsetFt: 7, widthFt: 3 },
    ],
  };
}

describe("layout editing: hard rules only, honest refusals", () => {
  it("snaps to a six-inch grid", () => {
    expect(snap(10.2)).toBe(10);
    expect(snap(10.3)).toBe(10.5);
    expect(snap(-0.1)).toBe(0);
  });

  it("moves a room and reports where it landed", () => {
    const res = moveRoom(model(), "bed", 3.2, 0, ENVELOPE);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const bed = res.model.rooms.find((r) => r.key === "bed")!;
    expect(bed.rect).toEqual([3, 20, 12, 12]);
    expect(res.summary).toContain("Moved Bedroom 2");
  });

  it("refuses a move that would overlap another room, naming it", () => {
    // Living Room is 20 wide at x=0; sliding the Kitchen left collides.
    const res = moveRoom(model(), "kitchen", -5, 0, ENVELOPE);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("Living Room");
    expect(res.error).toContain("overlap");
  });

  it("refuses a move outside the buildable envelope, naming the limit", () => {
    const res = moveRoom(model(), "kitchen", 30, 0, ENVELOPE);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("buildable width");
  });

  it("a sub-grid drag changes nothing and says so instead of silently passing", () => {
    const res = moveRoom(model(), "bed", 0.1, 0.1, ENVELOPE);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("six inches");
  });

  it("dragging a wall grows the room in that direction, whichever edge it is", () => {
    const east = resizeRoom(model(), "bed", "e", 4, ENVELOPE);
    expect(east.ok).toBe(true);
    if (east.ok) expect(east.model.rooms.find((r) => r.key === "bed")!.rect).toEqual([0, 20, 16, 12]);

    // Growing north moves the origin up and deepens by the same amount.
    // The Living Room ends at y=18 and this room starts at y=20, so 2ft is
    // the real clearance — it lands flush against that wall.
    const north = resizeRoom(model(), "bed", "n", 2, ENVELOPE);
    expect(north.ok).toBe(true);
    if (north.ok) expect(north.model.rooms.find((r) => r.key === "bed")!.rect).toEqual([0, 18, 12, 14]);

    // One more foot north and it would eat into the Living Room.
    const tooFar = resizeRoom(model(), "bed", "n", 3, ENVELOPE);
    expect(tooFar.ok).toBe(false);
    if (!tooFar.ok) expect(tooFar.error).toContain("Living Room");
  });

  it("refuses to shrink a room below what its function needs", () => {
    const min = minDims("bedroom");
    const res = resizeRoom(model(), "bed", "e", -(12 - min.w) - 1, ENVELOPE);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain(`${min.w}′ × ${min.d}′`);
  });

  it("keeps openings on their wall when the room shrinks, and reports any it cannot keep", () => {
    // Living Room's north wall is 20ft with a 6ft window centered at 10.
    // Shrink to 12ft: the window must slide back to stay fully on the wall.
    const res = resizeRoom(model(), "living", "e", -8, ENVELOPE);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const win = res.model.openings.find((o) => o.key === "w1")!;
    expect(win.offsetFt).toBeLessThanOrEqual(12 - 3);
    expect(win.offsetFt).toBeGreaterThanOrEqual(3);

    // Now shrink past the window's own width — it cannot survive, and the
    // summary has to say so rather than dropping it quietly.
    const narrow = resizeRoom(res.model, "living", "e", -(12 - 10), ENVELOPE);
    expect(narrow.ok).toBe(true);
    if (!narrow.ok) return;
    const gone = resizeRoom(narrow.model, "living", "e", -(10 - 5), ENVELOPE);
    if (gone.ok) {
      expect(gone.model.openings.some((o) => o.key === "w1")).toBe(false);
      expect(gone.summary).toContain("removed");
    }
  });

  it("slides an opening along its wall and refuses positions with no wall beside it", () => {
    const ok = moveOpening(model(), "w1", 6);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.model.openings.find((o) => o.key === "w1")!.offsetFt).toBe(6);

    // A 6ft window centered at 2 would hang off the corner.
    const off = moveOpening(model(), "w1", 2);
    expect(off.ok).toBe(false);
    if (!off.ok) expect(off.error).toContain("wall on both sides");
  });

  it("edits never touch rooms on another level", () => {
    const two: ParametricModel = {
      ...model(),
      levels: 2,
      rooms: [
        ...model().rooms,
        { key: "up", kind: "bedroom", label: "Primary Suite", level: 1, rect: [0, 0, 18, 16] },
      ],
    };
    // The upstairs suite sits directly over the Living Room; moving the
    // Living Room is a same-level question only.
    const res = moveRoom(two, "living", 0, 40, ENVELOPE);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.model.rooms.find((r) => r.key === "up")!.rect).toEqual([0, 0, 18, 16]);
  });

  it("layoutProblems reports pre-existing conflicts without blaming the current edit", () => {
    const clean = layoutProblems(model(), ENVELOPE);
    expect(clean).toEqual([]);

    const broken: ParametricModel = {
      ...model(),
      rooms: [
        { key: "a", kind: "living", label: "Living Room", level: 0, rect: [0, 0, 20, 18] },
        { key: "b", kind: "kitchen", label: "Kitchen", level: 0, rect: [10, 0, 16, 14] },
      ],
    };
    const problems = layoutProblems(broken, ENVELOPE);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("overlaps");
  });

  it("a missing room or opening refuses instead of throwing", () => {
    expect(moveRoom(model(), "ghost", 1, 1, ENVELOPE).ok).toBe(false);
    expect(resizeRoom(model(), "ghost", "e", 1, ENVELOPE).ok).toBe(false);
    expect(moveOpening(model(), "ghost", 5).ok).toBe(false);
  });
});
