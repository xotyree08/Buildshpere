/**
 * 3D scene builder for the WebGL viewer (ModelSphere's interactive-viewer
 * slice, BS-MOD-001). Pure and deterministic per ADR-007: parametric model
 * + style + finishes in, plain geometry descriptors out — the Three.js
 * component draws them and adds nothing. Coordinates: plan x → world X,
 * plan y (street at low y) → world Z, up → Y, all in feet.
 */

import type { FinishSelections } from "../catalog/materials";
import { defaultSchemeFor, furnitureForModel, schemeByKey, type FurnitureItem, type InteriorScheme } from "../engine/interiors";
import { buildRoof, roofFacets, roofPeakFt, type RoofGeometry } from "../engine/roofgeom";
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

const MATTRESS = "#f2eee6";
const PILLOW = "#faf8f2";
const COUNTER_TOP = "#eae6dc";

/**
 * Expand one staged furniture footprint into composite parts. Everything
 * stays inside the item's own footprint (the layout engine already
 * guaranteed clearances), so no part can clip a wall or a door swing.
 */
function furnitureParts(item: FurnitureItem, base: number, scheme: InteriorScheme): Box3[] {
  const { x, z, w, d, h } = item;
  const tone = scheme[item.tone];
  const wood = scheme.wood;
  const furn = (bx: number, by: number, bz: number, bw: number, bh: number, bd: number, color: string): Box3 => ({
    x: bx, y: base + by, z: bz, w: bw, h: bh, d: bd, color, kind: "furn",
  });
  const legs = (height: number, inset = 0.25, thick = 0.22): Box3[] => [
    furn(x + inset, 0, z + inset, thick, height, thick, wood),
    furn(x + w - inset - thick, 0, z + inset, thick, height, thick, wood),
    furn(x + inset, 0, z + d - inset - thick, thick, height, thick, wood),
    furn(x + w - inset - thick, 0, z + d - inset - thick, thick, height, thick, wood),
  ];
  const kind = item.key.split("-").pop() ?? "";

  switch (kind) {
    case "bed": {
      // Headboard on the window (north) wall, mattress inset on a platform.
      return [
        furn(x, 0, z, w, 1.1, d, wood), // platform
        furn(x + 0.25, 1.1, z + 0.6, w - 0.5, 0.85, d - 0.85, MATTRESS),
        furn(x - 0.1, 0, z, w + 0.2, 3.9, 0.35, tone), // headboard
        furn(x + w * 0.16, 1.95, z + 0.75, w * 0.28, 0.45, 1.1, PILLOW),
        furn(x + w * 0.56, 1.95, z + 0.75, w * 0.28, 0.45, 1.1, PILLOW),
      ];
    }
    case "sofa": // long axis along z, back against the west wall
      return [
        furn(x, 0, z, w, 1.0, d, tone),
        furn(x + 0.55, 1.0, z + 0.55, w - 0.8, 0.65, d - 1.1, shade(tone, 1.08)),
        furn(x, 0.9, z, 0.65, 1.9, d, tone), // back
        furn(x, 0.9, z, w, 1.35, 0.55, tone), // arm
        furn(x, 0.9, z + d - 0.55, w, 1.35, 0.55, tone), // arm
      ];
    case "sectional": // long axis along x, back at the south (screen-facing) edge
      return [
        furn(x, 0, z, w, 1.0, d, tone),
        furn(x + 0.55, 1.0, z + 0.3, w - 1.1, 0.65, d - 0.9, shade(tone, 1.08)),
        furn(x, 0.9, z + d - 0.65, w, 1.9, 0.65, tone),
        furn(x, 0.9, z, 0.55, 1.35, d, tone),
        furn(x + w - 0.55, 0.9, z, 0.55, 1.35, d, tone),
      ];
    case "chair":
      return [
        furn(x, 0, z, w, 1.1, d, tone),
        furn(x + 0.3, 1.1, z + 0.3, w - 0.6, 0.5, d - 0.6, shade(tone, 1.08)),
        furn(x, 0.9, z, w, 1.6, 0.5, tone),
      ];
    case "coffee":
      return [furn(x, 1.25, z, w, 0.22, d, wood), ...legs(1.25)];
    case "table":
      return [furn(x, 2.3, z, w, 0.22, d, wood), ...legs(2.3, 0.5, 0.3)];
    case "desk":
      return [furn(x, 2.3, z, w, 0.18, d, wood), ...legs(2.3, 0.2)];
    case "media":
    case "dresser":
    case "vanity":
      return [
        furn(x, 0.5, z, w, item.h - 0.6, d, tone === wood ? wood : tone),
        furn(x - 0.05, item.h - 0.12, z - 0.05, w + 0.1, 0.12, d + 0.1, shade(wood, 0.85)),
        ...legs(0.5, 0.15, 0.18),
      ];
    case "ns1":
    case "ns2":
      return [furn(x, 0.4, z, w, h - 0.4, d, wood), ...legs(0.4, 0.1, 0.15)];
    case "island":
    case "counter":
      return [
        furn(x + 0.1, 0, z + 0.1, w - 0.2, h - 0.15, d - 0.2, tone),
        furn(x, h - 0.15, z, w, 0.15, d, COUNTER_TOP),
      ];
    default:
      return [furn(x, 0, z, w, h, d, tone)];
  }
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
  // furnished home, not an empty shell. Each piece expands into
  // composite parts (frames, cushions, legs) so it reads as furniture,
  // not cargo.
  const scheme: InteriorScheme = schemeByKey(interiorScheme) ?? defaultSchemeFor(style);
  for (const item of furnitureForModel(model)) {
    const room = model.rooms.find((r) => item.key.startsWith(`${r.key}-`));
    const base = (room?.level ?? 0) * WALL_HEIGHT_FT;
    boxes.push(...furnitureParts(item, base, scheme));
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
  // One roof, from the shared engine: the same wings, pitch and overhang the
  // elevations and the massing view draw. This block used to rebuild its own
  // roof over the top level's BOUNDING BOX, which hung roof over open air on
  // any plan that wasn't a plain rectangle, and carried an overhang the
  // drawings did not.
  const geom = buildRoof(model, style);
  const baseY = model.levels * WALL_HEIGHT_FT;

  if (geom.wings.length > 0 && (geom.pitch <= 0 || roofRise(geom) < 0.2)) {
    for (const wing of geom.wings) {
      const [wx, wz, ww, wd] = wing.rect;
      boxes.push({
        x: wx - geom.overhangFt,
        y: baseY,
        z: wz - geom.overhangFt,
        w: ww + geom.overhangFt * 2,
        h: 1,
        d: wd + geom.overhangFt * 2,
        color: palette.roof,
        kind: "slab",
      });
    }
  } else {
    // Facets arrive as world-space polygons; a wing's four of them become one
    // mesh so shared ridge vertices stay welded.
    const facets = roofFacets(geom);
    for (let i = 0; i < facets.length; i += 4) {
      const wingFacets = facets.slice(i, i + 4);
      const vertices: [number, number, number][] = [];
      const faces: number[][] = [];
      for (const facet of wingFacets) {
        const idx = facet.points.map((pt) => {
          const found = vertices.findIndex(
            (v) => Math.abs(v[0] - pt.x) < 1e-6 && Math.abs(v[1] - pt.y) < 1e-6 && Math.abs(v[2] - pt.z) < 1e-6,
          );
          if (found >= 0) return found;
          vertices.push([pt.x, pt.y, pt.z]);
          return vertices.length - 1;
        });
        faces.push(idx);
      }
      roofs.push({ vertices, faces, color: palette.roof });
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

/** Rise of the tallest wing — used to treat a near-flat roof as a slab. */
function roofRise(geom: RoofGeometry): number {
  const eave = geom.wings[0]?.eaveFt ?? 0;
  return roofPeakFt(geom) - eave;
}
