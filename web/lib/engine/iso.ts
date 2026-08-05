/**
 * Isometric massing projection: the parametric model becomes a set of SVG-ready
 * polygons — each room extruded to wall height, levels stacked, faces sorted
 * painter's-style. Pure geometry, deterministic, no rendering dependencies.
 * This is ModelSphere's "fast preview" tier; the photoreal pipeline replaces
 * the look, not this contract.
 */

import type { ParametricModel, Room } from "../types";

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

export type FaceKind = "top" | "south" | "east";

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

export function buildIsoScene(model: ParametricModel): IsoScene {
  const faces: IsoFace[] = [];
  for (const room of model.rooms) {
    const zBase = room.level * WALL_HEIGHT_FT;
    const height = room.kind === "outdoor" ? 1 : WALL_HEIGHT_FT;
    faces.push(...boxFaces(room, zBase, height));
  }
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
