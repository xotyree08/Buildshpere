/**
 * The wall graph: walls as things, not as an inference each drawing makes.
 *
 * Until now a wall existed only in whichever renderer needed one. The 3-D
 * scene grew boxes around each room; the estimate priced "half of every room's
 * perimeter" and called it the shared-wall discount; the elevations drew
 * bands. Nothing could name a wall, nothing could say which two rooms it
 * separated, and an opening was hosted by a ROOM — so a door between a bedroom
 * and a hall belonged to the bedroom and the hall had a door-shaped hole in it
 * by coincidence of geometry.
 *
 * A wall here is one object between two things. Two rooms back to back share
 * one wall, not one each. It has a key that survives a repack because it is
 * named for what it separates, an assembly that says what it is made of, and a
 * measured area net of its openings that quantities can be taken from.
 */

import type { ParametricModel, Room } from "../types";
import { faceRuns, WALL_FT, WALL_SIDES, type WallSide } from "./adjacency";
import { wallKey } from "./ids";
import { WALL_HEIGHT_FT } from "./iso";

/** Railing height on a porch — the one "wall" you can see over. */
export const RAIL_HEIGHT_FT = 3;

export type WallClass = "exterior" | "interior" | "railing";

export interface Wall {
  key: string;
  level: number;
  wallClass: WallClass;
  /** "x" runs left to right across the plan; "z" runs front to back. */
  axis: "x" | "z";
  /** The centreline's coordinate on the axis it does not run along. */
  at: number;
  from: number;
  to: number;
  heightFt: number;
  thicknessFt: number;
  assemblyId: string;
  /** Rooms this wall separates: one key if it faces outdoors, two if not. */
  bounds: string[];
}

const OUTWARD: Record<WallSide, 1 | -1> = { n: -1, s: 1, w: -1, e: 1 };

function assemblyFor(wallClass: WallClass): string {
  if (wallClass === "railing") return "PORCH_RAIL";
  return wallClass === "exterior" ? "EXT_WALL_2X6" : "INT_WALL_2X4";
}

/**
 * Every wall on one storey, each emitted once.
 *
 * A shared wall is found twice — once from each side — so it is emitted only
 * from the room whose key sorts first. Emitting it from both would double the
 * drywall in the estimate, which is exactly the kind of error the old
 * perimeter halving was compensating for by guesswork.
 */
export function buildWalls(model: ParametricModel, level: number): Wall[] {
  const rooms = model.rooms.filter((r) => r.level === level);
  const byKey = new Map(rooms.map((r) => [r.key, r]));
  const walls: Wall[] = [];

  for (const room of rooms) {
    const [x, z, w, d] = room.rect;
    const railing = room.kind === "outdoor";
    for (const side of WALL_SIDES) {
      const alongX = side === "n" || side === "s";
      const origin = alongX ? x : z;
      const face = side === "n" ? z : side === "s" ? z + d : side === "w" ? x : x + w;

      for (const run of faceRuns(room, rooms, side)) {
        const neighbour = run.neighbour ? byKey.get(run.neighbour) : undefined;
        if (neighbour && neighbour.key < room.key) continue; // the other side emits it
        if (run.to - run.from < 0.05) continue;

        // Outside walls sit half a partition beyond the room's face. A shared
        // wall sits midway between the two faces it separates, which is the
        // same thing when the gap is the partition it is supposed to be.
        const otherFace = neighbour
          ? side === "n" ? neighbour.rect[1] + neighbour.rect[3]
            : side === "s" ? neighbour.rect[1]
            : side === "w" ? neighbour.rect[0] + neighbour.rect[2]
            : neighbour.rect[0]
          : face + OUTWARD[side] * WALL_FT;
        const at = (face + otherFace) / 2;

        const wallClass: WallClass = railing && !neighbour ? "railing" : neighbour ? "interior" : "exterior";
        walls.push({
          key: wallKey(level, room.key, neighbour ? neighbour.key : side),
          level,
          wallClass,
          axis: alongX ? "x" : "z",
          at: round2(at),
          from: round2(origin + run.from),
          to: round2(origin + run.to),
          heightFt: railing ? RAIL_HEIGHT_FT : WALL_HEIGHT_FT,
          thicknessFt: WALL_FT,
          assemblyId: assemblyFor(wallClass),
          bounds: neighbour ? [room.key, neighbour.key].sort() : [room.key],
        });
      }
    }
  }
  return walls.sort((a, b) => a.key.localeCompare(b.key));
}

/** Every wall in the building. */
export function allWalls(model: ParametricModel): Wall[] {
  const out: Wall[] = [];
  for (let level = 0; level < model.levels; level++) out.push(...buildWalls(model, level));
  return out;
}

export interface WallQuantity {
  key: string;
  assemblyId: string;
  lengthFt: number;
  heightFt: number;
  grossSqft: number;
  openingSqft: number;
  netSqft: number;
}

/**
 * The area of each wall, net of what is cut out of it.
 *
 * The estimate used to take half of every room's perimeter and multiply by a
 * rate. That counted a wall once whether it was shared or not, ignored its
 * height, and priced a wall of glass the same as a wall of drywall. Here the
 * openings are subtracted from the wall they are actually in.
 */
export function wallQuantities(model: ParametricModel, openingArea: (wallKey: string) => number): WallQuantity[] {
  return allWalls(model).map((wall) => {
    const lengthFt = Math.abs(wall.to - wall.from);
    const grossSqft = lengthFt * wall.heightFt;
    const openingSqft = Math.min(openingArea(wall.key), grossSqft);
    return {
      key: wall.key,
      assemblyId: wall.assemblyId,
      lengthFt: round2(lengthFt),
      heightFt: wall.heightFt,
      grossSqft: round2(grossSqft),
      openingSqft: round2(openingSqft),
      netSqft: round2(grossSqft - openingSqft),
    };
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
