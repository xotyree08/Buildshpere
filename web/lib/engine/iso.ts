/**
 * Isometric massing projection: the parametric model becomes a set of SVG-ready
 * polygons — each room extruded to wall height, levels stacked, faces sorted
 * painter's-style. Pure geometry, deterministic, no rendering dependencies.
 * This is ModelSphere's "fast preview" tier; the photoreal pipeline replaces
 * the look, not this contract.
 */

import type { HomeStyle, ParametricModel, Room } from "../types";
import { buildRoof, roofFacets } from "./roofgeom";
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
  // Geometry comes from the shared roof engine so this view, the elevations
  // and the 3D viewer draw the same roof instead of three lookalikes.
  const geom = buildRoof(model, style);
  const facets = roofFacets(geom, 0);
  if (facets.length === 0) return [];

  const rooms = model.rooms.filter((r) => r.level === model.levels - 1 && r.kind !== "outdoor");
  const maxX = Math.max(...rooms.map((r) => r.rect[0] + r.rect[2]), 0);
  const maxY = Math.max(...rooms.map((r) => r.rect[1] + r.rect[3]), 0);
  // Draw after every wall face of the building.
  const depth = (model.levels - 1) * WALL_HEIGHT_FT * 1000 + (maxX + maxY) * 2 + 10;

  return facets.map((facet, i) => {
    // The far slope of each wing is shaded; the near slope catches the sun.
    const sunlit =
      facet.kind === "slope" &&
      facet.points.some((pt) => pt.z >= centroidZ(facets, i));
    return {
      roomKey: "roof",
      roomKind: "hallway" as const,
      kind: (sunlit ? "roof" : "roof_shade") as FaceKind,
      points: facet.points.map((pt) => project(pt.x, pt.z, pt.y)),
      depth: depth + i * 0.1,
    };
  });
}

/** Mid-depth of the wing a facet belongs to, used to pick the sunlit slope. */
function centroidZ(facets: { points: { z: number }[] }[], index: number): number {
  const wing = Math.floor(index / 4);
  const group = facets.slice(wing * 4, wing * 4 + 4);
  const zs = group.flatMap((f) => f.points.map((pt) => pt.z));
  return (Math.min(...zs) + Math.max(...zs)) / 2;
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
