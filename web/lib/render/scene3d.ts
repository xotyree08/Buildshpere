/**
 * 3D scene builder for the WebGL viewer (ModelSphere's interactive-viewer
 * slice, BS-MOD-001). Pure and deterministic per ADR-007: parametric model
 * + style + finishes in, plain geometry descriptors out — the Three.js
 * component draws them and adds nothing. Coordinates: plan x → world X,
 * plan y (street at low y) → world Z, up → Y, all in feet.
 */

import type { FinishSelections } from "../catalog/materials";
import { defaultSchemeFor, furnitureForModel, schemeByKey, type InteriorScheme } from "../engine/interiors";
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
  kind: "floor" | "wall" | "window" | "door" | "slab" | "trim" | "plinth" | "drive" | "path" | "stoop" | "furn";
}

export interface Prism {
  vertices: [number, number, number][];
  /** Faces as vertex-index loops (triangulated by the viewer as fans). */
  faces: number[][];
  color: string;
}

export interface Tree {
  x: number;
  z: number;
  trunkH: number;
  canopyR: number;
}

export interface Bush {
  x: number;
  z: number;
  r: number;
}

export interface Scene3D {
  boxes: Box3[];
  roofs: Prism[];
  trees: Tree[];
  bushes: Bush[];
  bounds: { cx: number; cz: number; w: number; d: number; h: number };
}

/** Deterministic PRNG so landscaping never shimmers between renders. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A void to cut through a wall: world-space span along the wall's axis. */
interface WallCut {
  axis: "x" | "z";
  /** Centerline of the wall the opening lives in. */
  plane: number;
  from: number;
  to: number;
  y0: number;
  y1: number;
}

/**
 * Every opening becomes a real void so the interior is walkable: doors
 * and passages cut floor-to-head, windows leave a sill wall below. The
 * plane tolerance lets a room's doorway also pierce the hallway's facing
 * wall right behind it — otherwise you'd step through a door into the
 * back of another wall.
 */
function collectCuts(model: ParametricModel): WallCut[] {
  const cuts: WallCut[] = [];
  for (const o of model.openings) {
    const room = model.rooms.find((r) => r.key === o.roomKey);
    if (!room) continue;
    const [x, z, w, d] = room.rect;
    const base = room.level * WALL_HEIGHT_FT;
    const isWindow = o.kind === "window";
    const y0 = base + (isWindow ? WINDOW_SILL : 0);
    const y1 = base + (isWindow ? WINDOW_HEAD : DOOR_HEAD);
    if (o.wall === "n" || o.wall === "s") {
      cuts.push({
        axis: "x",
        plane: o.wall === "n" ? z + WALL_T / 2 : z + d - WALL_T / 2,
        from: x + o.offsetFt,
        to: x + o.offsetFt + o.widthFt,
        y0,
        y1,
      });
    } else {
      cuts.push({
        axis: "z",
        plane: o.wall === "w" ? x + WALL_T / 2 : x + w - WALL_T / 2,
        from: z + o.offsetFt,
        to: z + o.offsetFt + o.widthFt,
        y0,
        y1,
      });
    }
  }
  return cuts;
}

/** Walls closer than this (centerline to centerline) share an opening. */
const CUT_PLANE_TOL = 1.0;

/** Split one solid wall box around the voids that pierce it. */
function cutWallBox(box: Box3, alongX: boolean, cuts: WallCut[]): Box3[] {
  const lo = alongX ? box.x : box.z;
  const hi = alongX ? box.x + box.w : box.z + box.d;
  const relevant = cuts
    .map((c) => ({ ...c, from: Math.max(c.from, lo), to: Math.min(c.to, hi) }))
    .filter((c) => c.to - c.from > 0.05 && c.y0 < box.y + box.h && c.y1 > box.y)
    .sort((a, b) => a.from - b.from);
  if (relevant.length === 0) return [box];

  // Merge overlapping voids conservatively (largest combined hole).
  const merged: { from: number; to: number; y0: number; y1: number }[] = [];
  for (const c of relevant) {
    const last = merged[merged.length - 1];
    if (last && c.from < last.to) {
      last.to = Math.max(last.to, c.to);
      last.y0 = Math.min(last.y0, c.y0);
      last.y1 = Math.max(last.y1, c.y1);
    } else {
      merged.push({ from: c.from, to: c.to, y0: c.y0, y1: c.y1 });
    }
  }

  const out: Box3[] = [];
  const seg = (from: number, to: number, y: number, h: number) => {
    if (to - from > 0.05 && h > 0.05) {
      out.push(
        alongX
          ? { ...box, x: from, w: to - from, y, h }
          : { ...box, z: from, d: to - from, y, h },
      );
    }
  };
  let cursor = lo;
  for (const m of merged) {
    seg(cursor, m.from, box.y, box.h); // solid run before the void
    seg(m.from, m.to, box.y, m.y0 - box.y); // sill below (windows)
    seg(m.from, m.to, m.y1, box.y + box.h - m.y1); // header above
    cursor = m.to;
  }
  seg(cursor, hi, box.y, box.h);
  return out;
}

function wallBoxes(room: Room, base: number, height: number, color: string, cuts: WallCut[]): Box3[] {
  const [x, z, w, d] = room.rect;
  const walls: { box: Box3; alongX: boolean }[] = [
    { box: { x, y: base, z, w, h: height, d: WALL_T, color, kind: "wall" }, alongX: true }, // north (street side)
    { box: { x, y: base, z: z + d - WALL_T, w, h: height, d: WALL_T, color, kind: "wall" }, alongX: true }, // south
    { box: { x, y: base, z, w: WALL_T, h: height, d, color, kind: "wall" }, alongX: false }, // west
    { box: { x: x + w - WALL_T, y: base, z, w: WALL_T, h: height, d, color, kind: "wall" }, alongX: false }, // east
  ];
  return walls.flatMap(({ box, alongX }) => {
    const plane = alongX ? box.z + box.d / 2 : box.x + box.w / 2;
    const near = cuts.filter((c) => (c.axis === "x") === alongX && Math.abs(c.plane - plane) < CUT_PLANE_TOL);
    return cutWallBox(box, alongX, near);
  });
}

export function buildScene3D(
  model: ParametricModel,
  style?: HomeStyle,
  finishes?: FinishSelections,
  interiorScheme?: string,
): Scene3D {
  const palette = exteriorPalette(finishes);
  const boxes: Box3[] = [];
  const roofs: Prism[] = [];
  const cuts = collectCuts(model);

  // Staged furniture in the scheme's tones — the walk mode walks a
  // furnished home, not an empty shell.
  const scheme: InteriorScheme = schemeByKey(interiorScheme) ?? defaultSchemeFor(style);
  for (const item of furnitureForModel(model)) {
    const room = model.rooms.find((r) => item.key.startsWith(`${r.key}-`));
    const base = (room?.level ?? 0) * WALL_HEIGHT_FT;
    boxes.push({
      x: item.x,
      y: base,
      z: item.z,
      w: item.w,
      h: item.h,
      d: item.d,
      color: scheme[item.tone],
      kind: "furn",
    });
  }

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

    if (room.level === 0 && room.kind !== "outdoor") {
      boxes.push({ x: x - 0.15, y: -1.2, z: z - 0.15, w: w + 0.3, h: 1.6, d: d + 0.3, color: "#8d8880", kind: "plinth" });
    }
    if (room.kind === "outdoor") {
      // Porch/deck: railing-height perimeter instead of full walls.
      boxes.push(...wallBoxes(room, base, RAIL_H, palette.trim, cuts));
      continue;
    }
    boxes.push(...wallBoxes(room, base, WALL_HEIGHT_FT, palette.wall, cuts));

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
      const TRIM = 0.35;
      const tt = WALL_T + 0.3; // trim sits proud of the glass
      // Interior doors render swung open against the room-side wall, so
      // the doorway itself reads (and walks) open; wide garage doors and
      // windows stay in the wall plane.
      const swing = kind === "door" && o.wall === "s" && o.widthFt < 6;
      const pushWithTrim = (bx: number, bz: number, bw: number, bd: number, alongX: boolean) => {
        if (swing && alongX) {
          boxes.push({ x: bx + 0.05, y, z: bz - bw, w: 0.15, h, d: bw, color, kind });
        } else {
          boxes.push({ x: bx, y, z: bz, w: bw, h, d: bd, color, kind });
        }
        if (alongX) {
          boxes.push({ x: bx - TRIM, y: y - TRIM, z: bz - 0.05, w: bw + 2 * TRIM, h: TRIM, d: tt, color: palette.trim, kind: "trim" });
          boxes.push({ x: bx - TRIM, y: y + h, z: bz - 0.05, w: bw + 2 * TRIM, h: TRIM, d: tt, color: palette.trim, kind: "trim" });
          boxes.push({ x: bx - TRIM, y, z: bz - 0.05, w: TRIM, h, d: tt, color: palette.trim, kind: "trim" });
          boxes.push({ x: bx + bw, y, z: bz - 0.05, w: TRIM, h, d: tt, color: palette.trim, kind: "trim" });
          if (isWindow) boxes.push({ x: bx + bw / 2 - 0.06, y, z: bz - 0.02, w: 0.12, h, d: tt, color: palette.trim, kind: "trim" });
        } else {
          boxes.push({ x: bx - 0.05, y: y - TRIM, z: bz - TRIM, w: tt, h: TRIM, d: bd + 2 * TRIM, color: palette.trim, kind: "trim" });
          boxes.push({ x: bx - 0.05, y: y + h, z: bz - TRIM, w: tt, h: TRIM, d: bd + 2 * TRIM, color: palette.trim, kind: "trim" });
          boxes.push({ x: bx - 0.05, y, z: bz - TRIM, w: tt, h, d: TRIM, color: palette.trim, kind: "trim" });
          boxes.push({ x: bx - 0.05, y, z: bz + bd, w: tt, h, d: TRIM, color: palette.trim, kind: "trim" });
          if (isWindow) boxes.push({ x: bx - 0.02, y, z: bz + bd / 2 - 0.06, w: tt, h, d: 0.12, color: palette.trim, kind: "trim" });
        }
        if (!isWindow) {
          // A stoop under every exterior door.
          if (alongX) boxes.push({ x: bx - 0.8, y: base - FLOOR_T, z: bz - 2.6, w: bw + 1.6, h: FLOOR_T + 0.15, d: 3, color: "#b9b4a8", kind: "stoop" });
          else boxes.push({ x: bx - 2.6, y: base - FLOOR_T, z: bz - 0.8, w: 3, h: FLOOR_T + 0.15, d: bd + 1.6, color: "#b9b4a8", kind: "stoop" });
        }
      };
      if (o.wall === "n") pushWithTrim(x + o.offsetFt, z - 0.1, o.widthFt, t, true);
      else if (o.wall === "s") pushWithTrim(x + o.offsetFt, z + d - WALL_T - 0.1, o.widthFt, t, true);
      else if (o.wall === "w") pushWithTrim(x - 0.1, z + o.offsetFt, t, o.widthFt, false);
      else pushWithTrim(x + w - WALL_T - 0.1, z + o.offsetFt, t, o.widthFt, false);
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

  // Fascia boards along pitched-roof eaves, in trim color.
  for (const roof of roofs) {
    const eaveY = Math.min(...roof.vertices.map((v) => v[1]));
    const eaves = roof.vertices.filter((v) => v[1] === eaveY);
    const minEx = Math.min(...eaves.map((v) => v[0]));
    const maxEx = Math.max(...eaves.map((v) => v[0]));
    const minEz = Math.min(...eaves.map((v) => v[2]));
    const maxEz = Math.max(...eaves.map((v) => v[2]));
    boxes.push(
      { x: minEx, y: eaveY - 0.6, z: minEz - 0.05, w: maxEx - minEx, h: 0.6, d: 0.3, color: palette.trim, kind: "trim" },
      { x: minEx, y: eaveY - 0.6, z: maxEz - 0.25, w: maxEx - minEx, h: 0.6, d: 0.3, color: palette.trim, kind: "trim" },
      { x: minEx - 0.05, y: eaveY - 0.6, z: minEz, w: 0.3, h: 0.6, d: maxEz - minEz, color: palette.trim, kind: "trim" },
      { x: maxEx - 0.25, y: eaveY - 0.6, z: minEz, w: 0.3, h: 0.6, d: maxEz - minEz, color: palette.trim, kind: "trim" },
    );
  }

  // Landscaping: driveway to the garage, walkway to the front door, and
  // seeded trees/bushes that never move between renders.
  const ground = model.rooms.filter((r) => r.level === 0);
  const frontZ = Math.min(...ground.map((r) => r.rect[1]));
  const garage = ground.find((r) => r.kind === "garage");
  if (garage) {
    // The driveway extends outward from whichever wall holds the garage
    // door — front-loaded, side-loaded, and alley-loaded garages all work.
    const [gx, gz, gw, gd] = garage.rect;
    const doorWall = model.openings.find((o) => o.roomKey === garage.key && o.kind === "door")?.wall ?? "n";
    if (doorWall === "n") boxes.push({ x: gx + 0.8, y: -0.34, z: gz - 22, w: gw - 1.6, h: 0.3, d: 22.2, color: "#a8a49c", kind: "drive" });
    else if (doorWall === "s") boxes.push({ x: gx + 0.8, y: -0.34, z: gz + gd - 0.2, w: gw - 1.6, h: 0.3, d: 22.2, color: "#a8a49c", kind: "drive" });
    else if (doorWall === "w") boxes.push({ x: gx - 22, y: -0.34, z: gz + 0.8, w: 22.2, h: 0.3, d: gd - 1.6, color: "#a8a49c", kind: "drive" });
    else boxes.push({ x: gx + gw - 0.2, y: -0.34, z: gz + 0.8, w: 22.2, h: 0.3, d: gd - 1.6, color: "#a8a49c", kind: "drive" });
  }
  // Walkway to the entry: aim at a street-facing door if one exists,
  // otherwise at the centre of the front porch or front-most living room.
  const frontDoor = model.openings.find((o) => {
    if (o.kind !== "door" || o.wall !== "n") return false;
    const room = ground.find((r) => r.key === o.roomKey && r.kind !== "garage");
    return room ? Math.abs(room.rect[1] - frontZ) < 0.5 : false;
  });
  const frontRooms = ground.filter((r) => Math.abs(r.rect[1] - frontZ) < 0.5 && r.kind !== "garage");
  const entryRoom = frontDoor
    ? ground.find((r) => r.key === frontDoor.roomKey)!
    : (frontRooms.find((r) => r.kind === "outdoor") ?? frontRooms.find((r) => r.kind === "living") ?? frontRooms[0]);
  if (entryRoom) {
    const px = frontDoor
      ? entryRoom.rect[0] + frontDoor.offsetFt + frontDoor.widthFt / 2 - 2
      : entryRoom.rect[0] + entryRoom.rect[2] / 2 - 2;
    boxes.push({ x: px, y: -0.36, z: frontZ - 22, w: 4, h: 0.3, d: 22.2, color: "#b6b1a6", kind: "path" });
  }

  const trees: Tree[] = [];
  const bushes: Bush[] = [];
  const seed = model.rooms.reduce((s, r) => s + r.rect[0] * 7 + r.rect[1] * 13 + r.rect[2] * 3 + r.rect[3], model.rooms.length * 97);
  const rand = mulberry32(Math.floor(seed));
  const minGx = Math.min(...ground.map((r) => r.rect[0]));
  const maxGx = Math.max(...ground.map((r) => r.rect[0] + r.rect[2]));
  const maxGz = Math.max(...ground.map((r) => r.rect[1] + r.rect[3]));
  for (let i = 0; i < 7; i++) {
    const side = rand();
    const tx = side < 0.4 ? minGx - 8 - rand() * 16 : side < 0.8 ? maxGx + 8 + rand() * 16 : minGx + rand() * (maxGx - minGx);
    const tz = side < 0.8 ? frontZ - 6 + rand() * (maxGz - frontZ + 14) : maxGz + 8 + rand() * 12;
    trees.push({ x: tx, z: tz, trunkH: 6 + rand() * 4, canopyR: 4.5 + rand() * 3 });
  }
  // Bushes along the front facade between openings.
  for (const room of ground.filter((r) => Math.abs(r.rect[1] - frontZ) < 0.5 && r.kind !== "garage" && r.kind !== "outdoor")) {
    const [rx, rz, rw] = room.rect;
    const n = Math.max(1, Math.floor(rw / 9));
    for (let i = 0; i < n; i++) {
      bushes.push({ x: rx + ((i + 0.5) * rw) / n, z: rz - 2.2, r: 1.4 + rand() * 0.8 });
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
    trees,
    bushes,
    bounds: {
      cx: (minX + maxX) / 2,
      cz: (minZ + maxZ) / 2,
      w: maxX - minX,
      d: maxZ - minZ,
      h: Math.max(...ys),
    },
  };
}
