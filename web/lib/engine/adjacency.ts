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

/** A stretch of one face, in the face's own coordinate from its start. */
export interface FaceRun {
  from: number;
  to: number;
  /** Key of the room behind this stretch, or null where it faces outdoors. */
  neighbour: string | null;
}

/**
 * One wall of a room, cut into the stretches that face something different.
 *
 * Every renderer and every drawing needs this and none of them had it. The
 * generator put a window on each room's north wall on the theory that north
 * was the street — true of the front row and of nothing else, so a plan came
 * back with windows buried in the middle of the house and blank walls facing
 * the garden. Measured against the rooms actually next to it, a wall knows
 * which parts of itself are outside and which room is behind each of the rest.
 *
 * Runs are in the wall's own coordinate — along x for the north and south
 * faces, along z for east and west — and they tile the whole face, in order,
 * with no gaps. `neighbour` is the key of the room on the other side, or null
 * where that side is outdoors.
 */
export function faceRuns(
  room: Room,
  others: readonly Room[],
  side: WallSide,
  toleranceFt = ADJACENCY_TOLERANCE_FT,
): FaceRun[] {
  const [x, z, w, d] = room.rect;
  const alongX = side === "n" || side === "s";
  const start = alongX ? x : z;
  const end = alongX ? x + w : z + d;
  const face = side === "n" ? z : side === "s" ? z + d : side === "w" ? x : x + w;

  // Anything on the far side of this face, close enough to be the other half
  // of the same wall, claims its overlap.
  const claims: { from: number; to: number; key: string }[] = [];
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
    if (to > from) claims.push({ from, to, key: other.key });
  }

  claims.sort((a, b) => a.from - b.from || a.key.localeCompare(b.key));
  const runs: FaceRun[] = [];
  let cursor = start;
  for (const claim of claims) {
    // The gap between two neighbours along this face is the end of the
    // partition standing between THEM — half a foot of wall, not half a foot
    // of outdoors. Reporting it as outdoors broke the wall graph into slivers
    // and gave one hallway three separate "outside" walls, each six inches
    // long, between the rooms it serves.
    const gap = claim.from - cursor;
    if (gap > toleranceFt) runs.push({ from: cursor - start, to: claim.from - start, neighbour: null });
    const from = gap > toleranceFt ? claim.from : Math.min(cursor, claim.from);
    if (claim.to > cursor) {
      runs.push({ from: from - start, to: claim.to - start, neighbour: claim.key });
      cursor = claim.to;
    }
  }
  if (end - cursor > toleranceFt) runs.push({ from: cursor - start, to: end - start, neighbour: null });
  else if (runs.length > 0 && cursor < end) runs[runs.length - 1].to = end - start;
  return runs;
}

/**
 * The stretches of one wall of a room that face outdoors.
 *
 * One definition, filtered: the outdoors is simply the part of a face with no
 * room behind it. Keeping a second traversal here is how two engines end up
 * disagreeing about where a wall is.
 */
export function exteriorRuns(
  room: Room,
  others: readonly Room[],
  side: WallSide,
  toleranceFt = ADJACENCY_TOLERANCE_FT,
): { from: number; to: number }[] {
  return faceRuns(room, others, side, toleranceFt)
    .filter((run) => run.neighbour === null && run.to - run.from >= MIN_OPENING_RUN_FT)
    .map((run) => ({ from: run.from, to: run.to }));
}
