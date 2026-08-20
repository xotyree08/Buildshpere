/**
 * One definition of what it means for two rooms to share a wall.
 *
 * A room rectangle is an INTERIOR dimension — the space you stand in — so two
 * rooms on either side of a partition do not touch. Every engine that asks
 * "are these next to each other?" therefore has to know how thick that
 * partition is, and each one used to carry its own guess: the plumbing engine
 * looked for shared edges within 0.3ft, the walkthrough within 0.2ft. Both
 * silently found nothing the moment walls were modelled at half a foot, so
 * the plans lost their wet walls and the tour lost its adjacencies.
 *
 * They ask here now.
 */

import type { Room } from "../types";

/** Thickness of a framed-and-boarded interior partition. */
export const WALL_FT = 0.5;

/**
 * Widest gap that still counts as a wall between two rooms rather than open
 * space. Twice a partition, so a slightly thicker wall or a rounded dimension
 * still reads as adjacency, while a corridor between two rooms does not.
 */
export const ADJACENCY_TOLERANCE_FT = 1;

export interface SharedWall {
  /** "x" when the wall runs front-to-back — a vertical line on the plan. */
  axis: "x" | "z";
  /** The wall's centreline on the axis perpendicular to its run. */
  at: number;
  /** Where the shared run starts and ends along the wall. */
  from: number;
  to: number;
}

type Rect = readonly [number, number, number, number];

/**
 * The wall two rooms share, or null if they do not share one. Rooms that
 * merely overlap in one axis while sitting a corridor apart in the other are
 * not adjacent, and never return a wall.
 */
export function sharedWall(a: Rect, b: Rect, toleranceFt = ADJACENCY_TOLERANCE_FT): SharedWall | null {
  const [ax, az, aw, ad] = a;
  const [bx, bz, bw, bd] = b;
  const isWall = (gap: number) => gap >= -toleranceFt && gap <= toleranceFt;

  const zFrom = Math.max(az, bz);
  const zTo = Math.min(az + ad, bz + bd);
  if (zTo - zFrom > 0) {
    if (isWall(bx - (ax + aw))) return { axis: "x", at: (ax + aw + bx) / 2, from: zFrom, to: zTo };
    if (isWall(ax - (bx + bw))) return { axis: "x", at: (bx + bw + ax) / 2, from: zFrom, to: zTo };
  }

  const xFrom = Math.max(ax, bx);
  const xTo = Math.min(ax + aw, bx + bw);
  if (xTo - xFrom > 0) {
    if (isWall(bz - (az + ad))) return { axis: "z", at: (az + ad + bz) / 2, from: xFrom, to: xTo };
    if (isWall(az - (bz + bd))) return { axis: "z", at: (bz + bd + az) / 2, from: xFrom, to: xTo };
  }
  return null;
}

/** Whether two rooms on the same level share a wall of at least `minRunFt`. */
export function roomsAdjacent(a: Room, b: Room, minRunFt = 0.2): boolean {
  if (a.level !== b.level) return false;
  const wall = sharedWall(a.rect, b.rect);
  return wall !== null && wall.to - wall.from > minRunFt;
}

/** Which face of a room a wall is: "n" faces the street, "s" the back. */
export type WallSide = "n" | "s" | "e" | "w";

export const WALL_SIDES: WallSide[] = ["n", "s", "e", "w"];

/** How long a run of wall has to be before anything is worth putting in it. */
export const MIN_OPENING_RUN_FT = 4;

/**
 * The stretches of one wall of a room that face outdoors.
 *
 * Every renderer and every drawing needs this and none of them had it. The
 * generator put a window on each room's north wall on the theory that north
 * was the street — true of the front row and of nothing else, so a plan came
 * back with windows buried in the middle of the house and blank walls facing
 * the garden. Measured against the rooms actually next to it, a wall knows
 * which parts of itself are outside.
 *
 * Returned runs are in the wall's own coordinate: along x for the north and
 * south faces, along z for east and west.
 */
export function exteriorRuns(
  room: Room,
  others: readonly Room[],
  side: WallSide,
  toleranceFt = ADJACENCY_TOLERANCE_FT,
): { from: number; to: number }[] {
  const [x, z, w, d] = room.rect;
  const alongX = side === "n" || side === "s";
  const start = alongX ? x : z;
  const end = alongX ? x + w : z + d;
  const face = side === "n" ? z : side === "s" ? z + d : side === "w" ? x : x + w;

  // Anything on the far side of this face, close enough to be the other half
  // of the same wall, takes its overlap out of the run.
  const blocked: [number, number][] = [];
  for (const other of others) {
    if (other.key === room.key || other.level !== room.level) continue;
    const [ox, oz, ow, od] = other.rect;
    const against =
      side === "n" ? Math.abs(oz + od - face) <= toleranceFt
      : side === "s" ? Math.abs(oz - face) <= toleranceFt
      : side === "w" ? Math.abs(ox + ow - face) <= toleranceFt
      : Math.abs(ox - face) <= toleranceFt;
    if (!against) continue;
    const from = alongX ? Math.max(start, ox) : Math.max(start, oz);
    const to = alongX ? Math.min(end, ox + ow) : Math.min(end, oz + od);
    if (to > from) blocked.push([from, to]);
  }

  blocked.sort((a, b) => a[0] - b[0]);
  const runs: { from: number; to: number }[] = [];
  let cursor = start;
  for (const [from, to] of blocked) {
    if (from > cursor) runs.push({ from: cursor, to: from });
    cursor = Math.max(cursor, to);
  }
  if (cursor < end) runs.push({ from: cursor, to: end });
  // In the room's own coordinate, which is what an opening's offset is in.
  return runs
    .filter((run) => run.to - run.from >= MIN_OPENING_RUN_FT)
    .map((run) => ({ from: run.from - start, to: run.to - start }));
}
