/**
 * Isometric massing projection: the parametric model becomes a set of SVG-ready
 * polygons — each room extruded to wall height, levels stacked, faces sorted
 * painter's-style. Pure geometry, deterministic, no rendering dependencies.
 * This is ModelSphere's "fast preview" tier; the photoreal pipeline replaces
 * the look, not this contract.
 */

import type { HomeStyle, ParametricModel, Room } from "../types";
import { roofFor } from "./roof";

export const WALL_HEIGHT_FT = 9;

const COS30 = Math.cos(Math.PI / 6);
const SIN30 = Math.sin(Math.PI / 6);

export interface Point2 {
  x: number;
  y: number;
}

/** World (x east, y south, z up) → isometric screen coordinates (y down). */
export function project(x: number, y: number, z: number): Point2 {
  return {
    x: (x - y) * COS30,
    y: (x + y) * SIN30 - z,
  };
}

export type FaceKind = "top" | "south" | "east" | "roof" | "roof_shade";

export interface IsoFace {
  roomKey: string;
  roomKind: Room["kind"];
  kind: FaceKind;
  /** Screen-space polygon, ready for an SVG <polygon> points attr. */
  points: Point2[];
  /** Painter's depth — draw ascending. */
  depth: number;
}

export interface IsoScene {
  faces: IsoFace[];
  /** Screen-space bounding box for the SVG viewBox. */
  minX: number;
  minY: number;
  width: number;
  height: number;
}

function boxFaces(room: Room, zBase: number, heightFt: number): IsoFace[] {
  const [x, y, w, d] = room.rect;
  const z0 = zBase;
  const z1 = zBase + heightFt;

  const top: Point2[] = [
    project(x, y, z1),
    project(x + w, y, z1),
    project(x + w, y + d, z1),
    project(x, y + d, z1),
  ];
  const south: Point2[] = [
    project(x, y + d, z1),
    project(x + w, y + d, z1),
    project(x + w, y + d, z0),
    project(x, y + d, z0),
  ];
  const east: Point2[] = [
    project(x + w, y, z1),
    project(x + w, y + d, z1),
    project(x + w, y + d, z0),
    project(x + w, y, z0),
  ];

  // Depth grows toward the viewer along +x and +y, and stacks by level so
  // upper-floor boxes always draw over the floor below them.
  const depth = x + w + y + d + zBase * 1000;
  return [
    { roomKey: room.key, roomKind: room.kind, kind: "top", points: top, depth },
    { roomKey: room.key, roomKind: room.kind, kind: "south", points: south, depth: depth + 0.1 },
    { roomKey: room.key, roomKind: room.kind, kind: "east", points: east, depth: depth + 0.2 },
  ];
}

/**
 * Roof geometry over the top level's habitable footprint. Gable: a ridge
 * along the long axis with two slopes and two gable ends. Hip: the ridge
 * shortened so all four faces slope. Flat styles get no roof faces —
 * the parapet look of the plain extrusion is the roof.
 */
function roofFaces(model: ParametricModel, style: HomeStyle): IsoFace[] {
  const { form, steepness } = roofFor(style);
  if (form === "flat" || steepness <= 0) return [];

  const topLevel = model.levels - 1;
  const rooms = model.rooms.filter((r) => r.level === topLevel && r.kind !== "outdoor");
  if (rooms.length === 0) return [];

  const minX = Math.min(...rooms.map((r) => r.rect[0]));
  const maxX = Math.max(...rooms.map((r) => r.rect[0] + r.rect[2]));
  const minY = Math.min(...rooms.map((r) => r.rect[1]));
  const maxY = Math.max(...rooms.map((r) => r.rect[1] + r.rect[3]));
  const w = maxX - minX;
  const d = maxY - minY;
  if (w <= 0 || d <= 0) return [];

  const z0 = model.levels * WALL_HEIGHT_FT;
  const along = w >= d ? "x" : "y";
  const halfSpan = (along === "x" ? d : w) / 2;
  const z1 = z0 + steepness * halfSpan;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  // Hip roofs pull the ridge ends in by the half-span; gables run full length.
  const inset = form === "hip" ? Math.min(halfSpan, (along === "x" ? w : d) / 2 - 0.1) : 0;

  // Draw after every wall face of the building: beyond max room depth, keyed
  // to the top level so upper-floor walls render first.
  const depth = topLevel * WALL_HEIGHT_FT * 1000 + (maxX + maxY) * 2 + 10;
  const face = (kind: FaceKind, points: Point2[], bump: number): IsoFace => ({
    roomKey: "roof",
    roomKind: "hallway",
    kind,
    points,
    depth: depth + bump,
  });

  if (along === "x") {
    const r0x = minX + inset;
    const r1x = maxX - inset;
    return [
      // north slope (mostly hidden, cheap to draw)
      face("roof_shade", [project(minX, minY, z0), project(maxX, minY, z0), project(r1x, cy, z1), project(r0x, cy, z1)], 0),
      // west end
      form === "hip"
        ? face("roof_shade", [project(minX, minY, z0), project(minX, maxY, z0), project(r0x, cy, z1)], 0.1)
        : face("roof_shade", [project(minX, minY, z0), project(minX, maxY, z0), project(minX, cy, z1)], 0.1),
      // south slope (sun side)
      face("roof", [project(minX, maxY, z0), project(maxX, maxY, z0), project(r1x, cy, z1), project(r0x, cy, z1)], 0.2),
      // east end
      form === "hip"
        ? face("roof_shade", [project(maxX, minY, z0), project(maxX, maxY, z0), project(r1x, cy, z1)], 0.3)
        : face("roof_shade", [project(maxX, minY, z0), project(maxX, maxY, z0), project(maxX, cy, z1)], 0.3),
    ];
  }

  const r0y = minY + inset;
  const r1y = maxY - inset;
  return [
    face("roof_shade", [project(minX, minY, z0), project(minX, maxY, z0), project(cx, r1y, z1), project(cx, r0y, z1)], 0),
    form === "hip"
      ? face("roof_shade", [project(minX, minY, z0), project(maxX, minY, z0), project(cx, r0y, z1)], 0.1)
      : face("roof_shade", [project(minX, minY, z0), project(maxX, minY, z0), project(cx, minY, z1)], 0.1),
    face("roof", [project(maxX, minY, z0), project(maxX, maxY, z0), project(cx, r1y, z1), project(cx, r0y, z1)], 0.2),
    form === "hip"
      ? face("roof", [project(minX, maxY, z0), project(maxX, maxY, z0), project(cx, r1y, z1)], 0.3)
      : face("roof", [project(minX, maxY, z0), project(maxX, maxY, z0), project(cx, maxY, z1)], 0.3),
  ];
}

export function buildIsoScene(model: ParametricModel, style?: HomeStyle): IsoScene {
  const faces: IsoFace[] = [];
  for (const room of model.rooms) {
    const zBase = room.level * WALL_HEIGHT_FT;
    const height = room.kind === "outdoor" ? 1 : WALL_HEIGHT_FT;
    faces.push(...boxFaces(room, zBase, height));
  }
  if (style) faces.push(...roofFaces(model, style));
  faces.sort((a, b) => a.depth - b.depth);

  const xs = faces.flatMap((f) => f.points.map((p) => p.x));
  const ys = faces.flatMap((f) => f.points.map((p) => p.y));
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    faces,
    minX,
    minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
  };
}
