/**
 * Exterior elevations: orthographic front/side views derived from the same
 * parametric model as everything else. Pure geometry — walls stacked per
 * level, a roof profile from the style's form and pitch, and openings
 * placed from the plan's actual doors and windows. Coordinates are in feet
 * with y already flipped for SVG (0 at the top).
 */

import type { HomeStyle, ParametricModel } from "../types";
import { WALL_HEIGHT_FT } from "./iso";
import { roofFor } from "./roof";

/** North is the window-rich facade in generated plans — the natural front. */
export type ElevationDirection = "north" | "east";

export interface ElevationRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ElevationOpening extends ElevationRect {
  kind: "door" | "window" | "garage";
}

export interface Elevation {
  /** One wall band per level, ground floor last (drawn bottom). */
  walls: ElevationRect[];
  /** Roof profile polygon (feet, y-down); null for flat/parapet styles. */
  roof: { x: number; y: number }[] | null;
  openings: ElevationOpening[];
  width: number;
  height: number;
}

const WINDOW_SILL = 3;
const WINDOW_HEAD = 7;
const DOOR_HEAD = 6.8;
const GARAGE_DOOR_HEAD = 7.5;

/** Extent of a level's habitable+garage rooms along the view axis. */
function levelExtent(model: ParametricModel, level: number, axis: 0 | 1): [number, number] | null {
  const rooms = model.rooms.filter((r) => r.level === level && r.kind !== "outdoor");
  if (rooms.length === 0) return null;
  const lo = Math.min(...rooms.map((r) => r.rect[axis]));
  const hi = Math.max(...rooms.map((r) => r.rect[axis] + r.rect[axis + 2]));
  return [lo, hi];
}

export function buildElevation(
  model: ParametricModel,
  style: HomeStyle,
  direction: ElevationDirection,
): Elevation {
  // North view spans the x axis (facing the front); east view spans y.
  const axis: 0 | 1 = direction === "north" ? 0 : 1;
  const wall: "n" | "e" = direction === "north" ? "n" : "e";
  const { form, steepness } = roofFor(style);

  const extents = Array.from({ length: model.levels }, (_, lvl) => levelExtent(model, lvl, axis));
  const ground = extents[0] ?? [0, 40];
  const origin = Math.min(...extents.filter(Boolean).map((e) => e![0]));

  // Roof profile sits on the top level; its shape depends on whether the
  // ridge runs along or across the view axis (same rule as the massing).
  const topLevel = model.levels - 1;
  const topRooms = model.rooms.filter((r) => r.level === topLevel && r.kind !== "outdoor");
  const tw =
    Math.max(...topRooms.map((r) => r.rect[0] + r.rect[2]), 0) -
    Math.min(...topRooms.map((r) => r.rect[0]), 0);
  const td =
    Math.max(...topRooms.map((r) => r.rect[1] + r.rect[3]), 0) -
    Math.min(...topRooms.map((r) => r.rect[1]), 0);
  const halfSpan = Math.min(tw, td) / 2;
  const roofH = form === "flat" ? 0 : steepness * halfSpan;
  const ridgeAlongX = tw >= td;
  const ridgeParallel = (direction === "north" && ridgeAlongX) || (direction === "east" && !ridgeAlongX);

  const wallsTop = model.levels * WALL_HEIGHT_FT;
  const height = wallsTop + roofH;
  const width = Math.max(...extents.filter(Boolean).map((e) => e![1])) - origin;

  const walls: ElevationRect[] = [];
  for (let lvl = 0; lvl < model.levels; lvl++) {
    const extent = extents[lvl] ?? ground;
    walls.push({
      x: extent[0] - origin,
      y: height - (lvl + 1) * WALL_HEIGHT_FT,
      w: extent[1] - extent[0],
      h: WALL_HEIGHT_FT,
    });
  }

  let roof: { x: number; y: number }[] | null = null;
  if (roofH > 0 && extents[topLevel]) {
    const [lo, hi] = extents[topLevel]!;
    const left = lo - origin;
    const right = hi - origin;
    const eaveY = height - wallsTop;
    if (ridgeParallel) {
      // Hip pulls the visible ridge in from both ends; gable runs full width.
      const inset = form === "hip" ? Math.min(halfSpan, (right - left) / 2 - 0.1) : 0;
      roof = [
        { x: left, y: eaveY },
        { x: right, y: eaveY },
        { x: right - inset, y: 0 },
        { x: left + inset, y: 0 },
      ];
    } else {
      // End-on: both gable and hip read as a triangle to the ridge.
      roof = [
        { x: left, y: eaveY },
        { x: right, y: eaveY },
        { x: (left + right) / 2, y: 0 },
      ];
    }
  }

  const openings: ElevationOpening[] = [];
  for (const room of model.rooms) {
    if (room.kind === "outdoor") continue;
    const base = height - room.level * WALL_HEIGHT_FT;
    for (const o of model.openings) {
      if (o.roomKey !== room.key || o.wall !== wall) continue;
      const center = room.rect[axis] + Math.min(o.offsetFt, room.rect[axis + 2]) - origin;
      const x = center - o.widthFt / 2;
      if (o.kind === "window") {
        openings.push({ kind: "window", x, y: base - WINDOW_HEAD, w: o.widthFt, h: WINDOW_HEAD - WINDOW_SILL });
      } else {
        const garage = room.kind === "garage";
        const head = garage ? GARAGE_DOOR_HEAD : DOOR_HEAD;
        openings.push({ kind: garage ? "garage" : "door", x, y: base - head, w: o.widthFt, h: head });
      }
    }
  }

  return { walls, roof, openings, width, height };
}
