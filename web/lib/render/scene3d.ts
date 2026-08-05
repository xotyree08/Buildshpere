/**
 * 3D scene builder for the WebGL viewer (ModelSphere's interactive-viewer
 * slice, BS-MOD-001). Pure and deterministic per ADR-007: parametric model
 * + style + finishes in, plain geometry descriptors out — the Three.js
 * component draws them and adds nothing. Coordinates: plan x → world X,
 * plan y (street at low y) → world Z, up → Y, all in feet.
 */

import type { FinishSelections } from "../catalog/materials";
import { roofFor } from "../engine/roof";
import { WALL_HEIGHT_FT } from "../engine/iso";
import type { HomeStyle, ParametricModel, Room } from "../types";
import { exteriorPalette, shade } from "./palette";

const WALL_T = 0.4;
const FLOOR_T = 0.4;
const WINDOW_SILL = 3;
const WINDOW_HEAD = 7;
const DOOR_HEAD = 6.8;
const RAIL_H = 3;
const ROOF_OVERHANG = 1.2;

export interface Box3 {
  x: number; // min corner, world X
  y: number; // min corner, world Y (up)
  z: number; // min corner, world Z
  w: number;
  h: number;
  d: number;
  color: string;
  kind: "floor" | "wall" | "window" | "door" | "slab";
}

export interface Prism {
  vertices: [number, number, number][];
  /** Faces as vertex-index loops (triangulated by the viewer as fans). */
  faces: number[][];
  color: string;
}

export interface Scene3D {
  boxes: Box3[];
  roofs: Prism[];
  bounds: { cx: number; cz: number; w: number; d: number; h: number };
}

function wallBoxes(room: Room, base: number, height: number, color: string): Box3[] {
  const [x, z, w, d] = room.rect;
  return [
    { x, y: base, z, w, h: height, d: WALL_T, color, kind: "wall" }, // north (street side)
    { x, y: base, z: z + d - WALL_T, w, h: height, d: WALL_T, color, kind: "wall" }, // south
    { x, y: base, z, w: WALL_T, h: height, d, color, kind: "wall" }, // west
    { x: x + w - WALL_T, y: base, z, w: WALL_T, h: height, d, color, kind: "wall" }, // east
  ];
}

export function buildScene3D(
  model: ParametricModel,
  style?: HomeStyle,
  finishes?: FinishSelections,
): Scene3D {
  const palette = exteriorPalette(finishes);
  const boxes: Box3[] = [];
  const roofs: Prism[] = [];

  for (const room of model.rooms) {
    const [x, z, w, d] = room.rect;
    const base = room.level * WALL_HEIGHT_FT;

    boxes.push({
      x,
      y: base - FLOOR_T,
      z,
      w,
      h: FLOOR_T,
      d,
      color: room.kind === "garage" ? "#9aa0a6" : room.kind === "outdoor" ? "#b08a5a" : "#e8e2d6",
      kind: "floor",
    });

    if (room.kind === "outdoor") {
      // Porch/deck: railing-height perimeter instead of full walls.
      boxes.push(...wallBoxes(room, base, RAIL_H, palette.trim));
      continue;
    }
    boxes.push(...wallBoxes(room, base, WALL_HEIGHT_FT, palette.wall));

    for (const o of model.openings) {
      if (o.roomKey !== room.key || o.kind === "opening") continue;
      const isWindow = o.kind === "window";
      const sill = isWindow ? WINDOW_SILL : 0;
      const head = isWindow ? WINDOW_HEAD : DOOR_HEAD;
      const color = isWindow ? palette.glass : palette.door;
      const t = WALL_T + 0.2; // slightly proud of the wall so it reads from both sides
      const kind = isWindow ? ("window" as const) : ("door" as const);
      const y = base + sill;
      const h = head - sill;
      if (o.wall === "n") boxes.push({ x: x + o.offsetFt, y, z: z - 0.1, w: o.widthFt, h, d: t, color, kind });
      else if (o.wall === "s") boxes.push({ x: x + o.offsetFt, y, z: z + d - WALL_T - 0.1, w: o.widthFt, h, d: t, color, kind });
      else if (o.wall === "w") boxes.push({ x: x - 0.1, y, z: z + o.offsetFt, w: t, h, d: o.widthFt, color, kind });
      else boxes.push({ x: x + w - WALL_T - 0.1, y, z: z + o.offsetFt, w: t, h, d: o.widthFt, color, kind });
    }
  }

  // Roof over each level's footprint that has no level above it; the top
  // level always gets the style's roof form, lower exposed areas get slabs.
  const topLevel = model.levels - 1;
  const top = model.rooms.filter((r) => r.level === topLevel && r.kind !== "outdoor");
  if (top.length > 0) {
    const minX = Math.min(...top.map((r) => r.rect[0])) - ROOF_OVERHANG;
    const maxX = Math.max(...top.map((r) => r.rect[0] + r.rect[2])) + ROOF_OVERHANG;
    const minZ = Math.min(...top.map((r) => r.rect[1])) - ROOF_OVERHANG;
    const maxZ = Math.max(...top.map((r) => r.rect[1] + r.rect[3])) + ROOF_OVERHANG;
    const baseY = model.levels * WALL_HEIGHT_FT;
    const spec = roofFor(style);
    const spanX = maxX - minX;
    const spanZ = maxZ - minZ;
    const ridgeAlongX = spanX >= spanZ;
    const halfSpan = (ridgeAlongX ? spanZ : spanX) / 2;
    const rise = Math.max(spec.steepness, 0) * halfSpan;

    if (spec.form === "flat" || rise < 0.2) {
      boxes.push({ x: minX, y: baseY, z: minZ, w: spanX, h: 1, d: spanZ, color: palette.roof, kind: "slab" });
    } else if (spec.form === "gable") {
      const y0 = baseY;
      const y1 = baseY + rise;
      const v: [number, number, number][] = ridgeAlongX
        ? [
            [minX, y0, minZ], [maxX, y0, minZ], [maxX, y0, maxZ], [minX, y0, maxZ],
            [minX, y1, (minZ + maxZ) / 2], [maxX, y1, (minZ + maxZ) / 2],
          ]
        : [
            [minX, y0, minZ], [maxX, y0, minZ], [maxX, y0, maxZ], [minX, y0, maxZ],
            [(minX + maxX) / 2, y1, minZ], [(minX + maxX) / 2, y1, maxZ],
          ];
      const faces = ridgeAlongX
        ? [[0, 1, 5, 4], [3, 2, 5, 4], [0, 3, 4], [1, 2, 5]]
        : [[0, 1, 4], [3, 2, 5], [0, 3, 5, 4], [1, 2, 5, 4]];
      roofs.push({ vertices: v, faces, color: palette.roof });
    } else {
      // Hip: ridge inset from both ends along the long axis.
      const y0 = baseY;
      const y1 = baseY + rise;
      const inset = Math.min(halfSpan, (ridgeAlongX ? spanX : spanZ) / 2 - 0.5);
      const v: [number, number, number][] = ridgeAlongX
        ? [
            [minX, y0, minZ], [maxX, y0, minZ], [maxX, y0, maxZ], [minX, y0, maxZ],
            [minX + inset, y1, (minZ + maxZ) / 2], [maxX - inset, y1, (minZ + maxZ) / 2],
          ]
        : [
            [minX, y0, minZ], [maxX, y0, minZ], [maxX, y0, maxZ], [minX, y0, maxZ],
            [(minX + maxX) / 2, y1, minZ + inset], [(minX + maxX) / 2, y1, maxZ - inset],
          ];
      roofs.push({ vertices: v, faces: [[0, 1, 5, 4], [3, 2, 5, 4], [0, 3, 4], [1, 2, 5]], color: palette.roof });
    }
  }

  // Lower-level slab roofs where a two-story home's ground floor sticks out.
  if (model.levels > 1) {
    const upper = model.rooms.filter((r) => r.level === 1);
    for (const room of model.rooms.filter((r) => r.level === 0 && r.kind !== "outdoor")) {
      const [x, z, w, d] = room.rect;
      const covered = upper.some(
        (u) => u.rect[0] < x + w && u.rect[0] + u.rect[2] > x && u.rect[1] < z + d && u.rect[1] + u.rect[3] > z,
      );
      if (!covered) {
        boxes.push({ x: x - 0.5, y: WALL_HEIGHT_FT, z: z - 0.5, w: w + 1, h: 0.8, d: d + 1, color: shade(palette.roof, 0.9), kind: "slab" });
      }
    }
  }

  const xs = boxes.flatMap((b) => [b.x, b.x + b.w]);
  const zs = boxes.flatMap((b) => [b.z, b.z + b.d]);
  const ys = boxes.flatMap((b) => [b.y + b.h]).concat(roofs.flatMap((r) => r.vertices.map((v) => v[1])));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  return {
    boxes,
    roofs,
    bounds: {
      cx: (minX + maxX) / 2,
      cz: (minZ + maxZ) / 2,
      w: maxX - minX,
      d: maxZ - minZ,
      h: Math.max(...ys),
    },
  };
}
