/**
 * How tall an opening is, and which wall it is in.
 *
 * The heights were written out three times — in the elevations, in the 3-D
 * scene, and nowhere at all in the estimate, which is why a wall of glass used
 * to cost the same as a wall of drywall. One definition now, and the wall an
 * opening belongs to is resolved rather than assumed: a door between a bedroom
 * and a hall is in the wall between them, not in "the bedroom".
 */

import type { Opening, ParametricModel, Room } from "../types";
import { faceRuns, type WallSide } from "./adjacency";
import { wallKey } from "./ids";

export const WINDOW_SILL_FT = 3;
export const WINDOW_HEAD_FT = 7;
export const DOOR_HEAD_FT = 6.8;
export const GARAGE_DOOR_HEAD_FT = 7.5;

/** Sill and head of an opening, above its own storey's floor. */
export function openingHeights(opening: Opening, room: Room): { sillFt: number; headFt: number } {
  if (opening.kind === "window") return { sillFt: WINDOW_SILL_FT, headFt: WINDOW_HEAD_FT };
  const garage = room.kind === "garage" && opening.widthFt >= 8;
  return { sillFt: 0, headFt: garage ? GARAGE_DOOR_HEAD_FT : DOOR_HEAD_FT };
}

/** Elevational area of an opening, in square feet. */
export function openingSqft(opening: Opening, room: Room): number {
  const { sillFt, headFt } = openingHeights(opening, room);
  return opening.widthFt * (headFt - sillFt);
}

/**
 * The wall an opening is in.
 *
 * The opening records the room and the face; the wall is whichever stretch of
 * that face the opening's span falls inside, which may be the outdoors or may
 * be a particular neighbour. Returns null when the opening does not lie in any
 * stretch of that face — which should not happen, and is worth seeing rather
 * than silently attributing to the wrong wall.
 */
export function hostWallKey(model: ParametricModel, opening: Opening): string | null {
  const room = model.rooms.find((r) => r.key === opening.roomKey);
  if (!room) return null;
  const rooms = model.rooms.filter((r) => r.level === room.level);
  const mid = opening.offsetFt + opening.widthFt / 2;
  for (const run of faceRuns(room, rooms, opening.wall as WallSide)) {
    if (mid < run.from - 0.01 || mid > run.to + 0.01) continue;
    return wallKey(room.level, room.key, run.neighbour ?? (opening.wall as WallSide));
  }
  return null;
}

/** Opening area per wall, for netting off wall quantities. */
export function openingAreaByWall(model: ParametricModel): Map<string, number> {
  const rooms = new Map(model.rooms.map((r) => [r.key, r]));
  const byWall = new Map<string, number>();
  for (const opening of model.openings) {
    const room = rooms.get(opening.roomKey);
    if (!room) continue;
    const key = hostWallKey(model, opening);
    if (!key) continue;
    byWall.set(key, (byWall.get(key) ?? 0) + openingSqft(opening, room));
  }
  return byWall;
}
