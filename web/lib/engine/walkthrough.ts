/**
 * Walkthrough mode: a deterministic room-by-room tour of the plan.
 * Ordering follows how a visit actually flows — public rooms first
 * (living, kitchen, dining), then work/flex space, then the private
 * rooms floor by floor, with the garage last. Every stop carries the
 * room's real facts: dimensions, area, glazing, and which rooms it
 * touches (shared-edge adjacency on the same level).
 */

import type { Opening, ParametricModel, Room, RoomKind } from "../types";

/** Visit order by kind; lower first. Hallways are circulation, not stops. */
const TOUR_ORDER: Record<RoomKind, number> = {
  living: 0,
  kitchen: 1,
  dining: 2,
  office: 3,
  gym: 4,
  theater: 5,
  outdoor: 6,
  bedroom: 7,
  bathroom: 8,
  laundry: 9,
  closet: 10,
  mudroom: 11,
  hallway: 98,
  garage: 99,
};

export interface TourStop {
  room: Room;
  widthFt: number;
  depthFt: number;
  areaSqft: number;
  windows: Opening[];
  doors: Opening[];
  /** Labels of same-level rooms sharing an edge with this one. */
  adjacent: string[];
}

function touches(a: Room, b: Room): boolean {
  const [ax, ay, aw, ad] = a.rect;
  const [bx, by, bw, bd] = b.rect;
  const eps = 0.2;
  const xOverlap = Math.min(ax + aw, bx + bw) - Math.max(ax, bx) > eps;
  const yOverlap = Math.min(ay + ad, by + bd) - Math.max(ay, by) > eps;
  const shareVerticalEdge =
    (Math.abs(ax + aw - bx) < eps || Math.abs(bx + bw - ax) < eps) && yOverlap;
  const shareHorizontalEdge =
    (Math.abs(ay + ad - by) < eps || Math.abs(by + bd - ay) < eps) && xOverlap;
  return shareVerticalEdge || shareHorizontalEdge;
}

export function buildTour(model: ParametricModel): TourStop[] {
  const stops = model.rooms.filter((r) => r.kind !== "hallway");

  const ordered = [...stops].sort((a, b) => {
    const aGarage = a.kind === "garage" ? 1 : 0;
    const bGarage = b.kind === "garage" ? 1 : 0;
    if (aGarage !== bGarage) return aGarage - bGarage; // garage last, even upstairs
    if (a.level !== b.level) return a.level - b.level; // floor by floor
    const order = TOUR_ORDER[a.kind] - TOUR_ORDER[b.kind];
    if (order !== 0) return order;
    // stable within a kind: left-to-right, front-to-back
    return a.rect[1] - b.rect[1] || a.rect[0] - b.rect[0];
  });

  return ordered.map((room) => ({
    room,
    widthFt: room.rect[2],
    depthFt: room.rect[3],
    areaSqft: Math.round(room.rect[2] * room.rect[3]),
    windows: model.openings.filter((o) => o.roomKey === room.key && o.kind === "window"),
    doors: model.openings.filter((o) => o.roomKey === room.key && o.kind !== "window"),
    adjacent: model.rooms
      .filter((other) => other.key !== room.key && other.level === room.level && touches(room, other))
      .map((other) => other.label),
  }));
}

/** One-sentence character line for a stop, from its real facts. */
export function stopDescription(stop: TourStop): string {
  const dims = `${Math.round(stop.widthFt)}×${Math.round(stop.depthFt)} ft (${stop.areaSqft.toLocaleString()} sqft)`;
  const light =
    stop.windows.length === 0
      ? "no exterior glazing"
      : stop.windows.length === 1
        ? "one window"
        : `${stop.windows.length} windows`;
  const connections =
    stop.adjacent.length > 0 ? `opens toward ${stop.adjacent.slice(0, 3).join(", ")}` : "tucked away";
  return `${dims} · ${light} · ${connections}.`;
}
