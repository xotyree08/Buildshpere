/**
 * Stable, meaningful identifiers for the things a building is made of.
 *
 * Objects used to be numbered in packing order — r0, r1, r2 — and a revision
 * re-packs the whole storey, so every key moved. Nothing downstream could say
 * "this is the same kitchen as before": not the version diff, not the change
 * propagation, and not the professional approval that has to survive a
 * furniture move and fall over a bearing wall. An identifier that changes
 * whenever the geometry is recomputed is not an identifier.
 *
 * These are derived from what the object IS — its storey, its kind and which
 * one it is — so the same room in the same programme keeps its key across a
 * repack, and a reader can tell what a key refers to without a lookup.
 *
 *   R-L1-KITCHEN-01          the first kitchen on the first floor
 *   W-L1-R-L1-KITCHEN-01-N   that kitchen's north outside wall
 *   W-L1-R-L1-BED-01|R-L1-BATH-02   the wall between a bedroom and a bath
 *   O-W-L1-…-N-WINDOW-02     the second window in that wall
 */

import type { RoomKind } from "../types";
import type { WallSide } from "./adjacency";

/** Kind as it appears in a key: short, uppercase, stable. */
const KIND_TAG: Record<string, string> = {
  bedroom: "BED",
  bathroom: "BATH",
  kitchen: "KITCHEN",
  living: "LIVING",
  dining: "DINING",
  office: "OFFICE",
  gym: "GYM",
  theater: "THEATER",
  garage: "GARAGE",
  laundry: "LAUNDRY",
  mudroom: "MUD",
  closet: "CLOSET",
  hallway: "HALL",
  outdoor: "OUTDOOR",
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Level tag: one-based, the way a floor is named rather than indexed. */
export function levelTag(level: number): string {
  return `L${level + 1}`;
}

/**
 * A room's key. `ordinal` distinguishes the second bedroom from the first and
 * is one-based within its level and kind.
 */
export function roomKey(level: number, kind: RoomKind, ordinal: number): string {
  return `R-${levelTag(level)}-${KIND_TAG[kind] ?? kind.toUpperCase()}-${pad(ordinal)}`;
}

/**
 * A wall's key, from the rooms it separates.
 *
 * Deriving it from geometry would move it every time the geometry moved,
 * which is the fault this exists to fix. A wall is identified by what it is
 * between: two rooms, or one room and the outdoors on a named side.
 */
export function wallKey(level: number, a: string, b: string | WallSide): string {
  const between = a < b ? `${a}|${b}` : `${b}|${a}`;
  return `W-${levelTag(level)}-${b.length === 1 ? `${a}-${b.toUpperCase()}` : between}`;
}

/** An opening's key, within the wall that hosts it. */
export function openingKey(wall: string, kind: string, ordinal: number): string {
  return `O-${wall}-${kind.toUpperCase()}-${pad(ordinal)}`;
}

/**
 * Hand out one-based ordinals per bucket, in the order asked for.
 *
 * Ordinals have to come from a stable traversal or they are just packing order
 * again under a longer name. Callers walk the programme, not the packed
 * geometry.
 */
export function ordinals(): (bucket: string) => number {
  const seen = new Map<string, number>();
  return (bucket) => {
    const next = (seen.get(bucket) ?? 0) + 1;
    seen.set(bucket, next);
    return next;
  };
}
