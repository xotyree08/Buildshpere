/**
 * Explicit roof geometry.
 *
 * Roof used to be a style trait — `roofFor(style) -> {form, steepness}` — and
 * three renderers each rebuilt a roof from it independently (elevation.ts,
 * iso.ts, scene3d.ts). They agreed by coincidence, not by construction: the
 * 3D roof carried a 1.2ft overhang the drawings did not, and all three took
 * the BOUNDING BOX of the top level, so an L-shaped home was drawn with roof
 * hanging over open air.
 *
 * This module computes the roof once, from the model, so every view draws the
 * same one. It also makes roof area real: the union of the footprint rather
 * than its bounding box, corrected for pitch.
 *
 * Deliberately not a BIM kernel (ADR-007: geometry is deterministic and comes
 * from the engines). Footprints here are axis-aligned rectangles, so the roof
 * is a set of prisms over a rectilinear decomposition of them — enough to be
 * honest at preliminary-design stage, and stable input for a real architect.
 *
 * KNOWN LIMIT, stated rather than hidden: where two wings meet, their prisms
 * BUTT — each carries its own ridge at its own height. A framed roof would
 * mitre them into a sloped valley, and the wings would share a ridge height.
 * The areas and the drawing stay self-consistent and no roof is left with a
 * hole in it, but a genuine cross-gable reads as two roofs rather than one.
 * Mitred valleys need plane-plane intersection, which needs a real half-edge
 * representation; that is the next step, not a patch on this one. Sliver
 * absorption keeps most plans single-wing, so this is rarer than it sounds.
 */

import { roofFor, type RoofForm } from "./roof";
import { WALL_HEIGHT_FT } from "./iso";
import type { HomeStyle, ParametricModel, Room } from "../types";

/** Eave projection past the wall line. Matches the 3D viewer's long-standing value. */
export const ROOF_OVERHANG_FT = 1.2;

export interface RoofWing {
  /** Eave rectangle in plan: [x, z, width, depth], overhang NOT applied. */
  rect: [number, number, number, number];
  /** The ridge runs along the wing's longer axis. */
  ridgeAxis: "x" | "z";
  /** Height of the eave line above grade. */
  eaveFt: number;
  /** Height of the ridge above grade; equals eaveFt when flat. */
  ridgeFt: number;
}

export interface RoofGeometry {
  form: RoofForm;
  /** Rise over run. 0 for flat. */
  pitch: number;
  overhangFt: number;
  wings: RoofWing[];
  /**
   * Footprint under roof, excluding the eave overhang, in sqft. This is the
   * ceiling plane — use it for anything measuring enclosed space. Using the
   * roofing figure below would overstate a 40×60 house by ~8%.
   */
  coveredAreaSqft: number;
  /** Horizontal projection of the roof itself, eaves included, in sqft. */
  planAreaSqft: number;
  /** Actual sloped surface area — plan area corrected for pitch. */
  surfaceAreaSqft: number;
  ridgeLf: number;
  eaveLf: number;
}

/** sqrt(1 + pitch²): how much longer a sloped plane is than its shadow. */
export function slopeFactor(pitch: number): number {
  return Math.sqrt(1 + pitch * pitch);
}

/** Pitch as builders write it, e.g. 0.5 -> "6:12". */
export function pitchLabel(pitch: number): string {
  if (pitch <= 0) return "flat";
  return `${Math.round(pitch * 12)}:12`;
}

/** Rooms that sit under roof. Uncovered outdoor space does not. */
function roofedRooms(model: ParametricModel, level: number): Room[] {
  return model.rooms.filter((r) => r.level === level && r.kind !== "outdoor");
}

/**
 * Decompose a set of axis-aligned rectangles into non-overlapping vertical
 * strips covering exactly their union, then merge neighbours that share a
 * depth span. An L-shaped plan becomes two wings, not one bounding box; a
 * plain rectangle stays one. Deterministic: edges are sorted numerically.
 */
export function decomposeWings(rooms: Room[]): [number, number, number, number][] {
  if (rooms.length === 0) return [];
  const xs = Array.from(
    new Set(rooms.flatMap((r) => [r.rect[0], r.rect[0] + r.rect[2]])),
  ).sort((a, b) => a - b);

  const strips: [number, number, number, number][] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[i];
    const x1 = xs[i + 1];
    if (x1 - x0 <= 1e-9) continue;
    const mid = (x0 + x1) / 2;
    // Every room spanning this slice contributes its depth range.
    const spanning = rooms.filter((r) => r.rect[0] <= mid && r.rect[0] + r.rect[2] >= mid);
    if (spanning.length === 0) continue;
    const z0 = Math.min(...spanning.map((r) => r.rect[1]));
    const z1 = Math.max(...spanning.map((r) => r.rect[1] + r.rect[3]));
    strips.push([x0, z0, x1 - x0, z1 - z0]);
  }

  // Merge left-to-right while the depth span is unchanged, so a rectangular
  // house is one wing rather than a comb of slivers.
  const merged: [number, number, number, number][] = [];
  for (const s of strips) {
    const last = merged[merged.length - 1];
    if (
      last &&
      Math.abs(last[1] - s[1]) < 1e-9 &&
      Math.abs(last[3] - s[3]) < 1e-9 &&
      Math.abs(last[0] + last[2] - s[0]) < 1e-9
    ) {
      last[2] += s[2];
    } else {
      merged.push([...s] as [number, number, number, number]);
    }
  }
  return absorbSlivers(merged);
}

/**
 * Narrowest strip that can carry its own ridge.
 *
 * Real plans are ragged: one bedroom projecting three feet past its
 * neighbours is a notch, not a wing. Left alone it would grow its own little
 * roof with its own ridge, which no builder would frame and no drawing should
 * show — the main roof simply spans it. Absorbing these also keeps the drawn
 * roof and the priced roof identical, which they were not before.
 */
export const MIN_WING_FT = 10;

function absorbSlivers(
  wings: [number, number, number, number][],
): [number, number, number, number][] {
  const out = wings.map((w) => [...w] as [number, number, number, number]);
  let changed = true;
  while (changed && out.length > 1) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const [, , w, d] = out[i];
      if (Math.min(w, d) >= MIN_WING_FT) continue;
      // Absorb into the neighbour that shares the longest edge with it.
      let best = -1;
      let bestOverlap = -1;
      for (let j = 0; j < out.length; j++) {
        if (i === j) continue;
        const overlap = sharedEdgeFt(out[i], out[j]);
        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          best = j;
        }
      }
      if (best < 0) continue;
      out[best] = boundingBox(out[best], out[i]);
      out.splice(i, 1);
      changed = true;
      break;
    }
  }
  return out;
}

/** Length of the contact between two rectangles; 0 when they don't touch. */
function sharedEdgeFt(
  a: [number, number, number, number],
  b: [number, number, number, number],
): number {
  const xOverlap = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
  const zOverlap = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
  if (xOverlap > 1e-9 && zOverlap > -1e-9) return xOverlap;
  if (zOverlap > 1e-9 && xOverlap > -1e-9) return zOverlap;
  return 0;
}

function boundingBox(
  a: [number, number, number, number],
  b: [number, number, number, number],
): [number, number, number, number] {
  const x0 = Math.min(a[0], b[0]);
  const z0 = Math.min(a[1], b[1]);
  const x1 = Math.max(a[0] + a[2], b[0] + b[2]);
  const z1 = Math.max(a[1] + a[3], b[1] + b[3]);
  return [x0, z0, x1 - x0, z1 - z0];
}

/**
 * Build the roof for a model. `style` supplies form and pitch until a project
 * carries its own roof choice; passing an explicit override lets a revision
 * change the roof without changing the architectural style.
 */
export function buildRoof(
  model: ParametricModel,
  style: HomeStyle | undefined,
  override?: { form?: RoofForm; pitch?: number },
): RoofGeometry {
  const spec = roofFor(style);
  const form = override?.form ?? spec.form;
  const pitch = form === "flat" ? 0 : (override?.pitch ?? spec.steepness);

  const topLevel = Math.max(0, model.levels - 1);
  const wingRects = decomposeWings(roofedRooms(model, topLevel));
  const eaveFt = model.levels * WALL_HEIGHT_FT;

  const wings: RoofWing[] = wingRects.map((rect) => {
    const [, , w, d] = rect;
    const ridgeAxis: "x" | "z" = w >= d ? "x" : "z";
    const halfSpan = Math.min(w, d) / 2;
    return {
      rect,
      ridgeAxis,
      eaveFt,
      ridgeFt: eaveFt + pitch * halfSpan,
    };
  });

  // Plan area counts every level's roofed footprint, not just the top: on a
  // two-storey home the ground floor that sticks out past the upper floor is
  // roofed too, and the old footprint proxy missed it entirely.
  let planAreaSqft = 0;
  for (let lvl = 0; lvl < model.levels; lvl++) {
    const covered = decomposeWings(roofedRooms(model, lvl));
    const upper = lvl + 1 < model.levels ? decomposeWings(roofedRooms(model, lvl + 1)) : [];
    for (const [x, z, w, d] of covered) {
      // Subtract the part already roofed by the storey above it. Wings are
      // the merged shapes, so this is the area actually under roof — the
      // same figure the drawings show.
      let area = w * d;
      for (const [ux, uz, uw, ud] of upper) {
        const ox = Math.max(0, Math.min(x + w, ux + uw) - Math.max(x, ux));
        const oz = Math.max(0, Math.min(z + d, uz + ud) - Math.max(z, uz));
        area -= ox * oz;
      }
      planAreaSqft += Math.max(0, area);
    }
  }

  const coveredAreaSqft = planAreaSqft;

  // Overhang adds a skirt around the outer edge. Approximated from the top
  // level's perimeter rather than inflating every wing, which would
  // double-count where wings meet.
  const wallPerimeterFt = wingRects.reduce((sum, [, , w, d]) => sum + 2 * (w + d), 0);
  planAreaSqft += wallPerimeterFt * ROOF_OVERHANG_FT;
  // FIX 2: the eave line sits at the edge of the overhang, so it is longer
  // than the wall below it. Measuring area to the eave but length to the wall
  // would understate every eave-based quantity (gutters, drip edge, fascia).
  const eaveLf = wallPerimeterFt + wingRects.length * 8 * ROOF_OVERHANG_FT;

  const ridgeLf = wings.reduce((sum, wing) => {
    const [, , w, d] = wing.rect;
    const long = Math.max(w, d);
    const short = Math.min(w, d);
    // A hip pulls each ridge end in by the half-span; a gable runs full length.
    return sum + (form === "hip" ? Math.max(0, long - short) : long);
  }, 0);

  return {
    form,
    pitch,
    overhangFt: ROOF_OVERHANG_FT,
    wings,
    coveredAreaSqft: round2(coveredAreaSqft),
    planAreaSqft: round2(planAreaSqft),
    surfaceAreaSqft: round2(planAreaSqft * slopeFactor(pitch)),
    ridgeLf: round2(ridgeLf),
    eaveLf: round2(eaveLf),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** One roof surface, as a closed polygon in world space (y is height). */
export interface RoofFacet {
  points: Point3[];
  /** Main slopes face the long sides; ends cap the ridge. */
  kind: "slope" | "end";
}

/**
 * The roof as drawable polygons. Every renderer takes these instead of
 * rebuilding the shape, which is the whole point: the elevation, the
 * isometric massing and the 3D viewer cannot disagree about a roof they did
 * not each invent.
 *
 * Four facets per wing — two slopes and two ends — matching the shape a
 * gable or hip actually makes. Flat roofs have no facets; the extrusion's
 * top face is the roof.
 */
export function roofFacets(geom: RoofGeometry, overhangFt = geom.overhangFt): RoofFacet[] {
  if (geom.pitch <= 0) return [];
  const facets: RoofFacet[] = [];

  for (const wing of geom.wings) {
    const [rx, rz, rw, rd] = wing.rect;
    // Eaves project past the wall line on all sides.
    const x0 = rx - overhangFt;
    const x1 = rx + rw + overhangFt;
    const z0 = rz - overhangFt;
    const z1 = rz + rd + overhangFt;
    const eave = wing.eaveFt;
    const ridge = wing.ridgeFt;
    const alongX = wing.ridgeAxis === "x";
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    // A hip pulls the ridge ends in by the half-span so all four faces slope;
    // a gable runs the ridge the full length and caps it with vertical ends.
    const halfSpan = Math.min(x1 - x0, z1 - z0) / 2;
    const inset =
      geom.form === "hip"
        ? Math.min(halfSpan, (alongX ? x1 - x0 : z1 - z0) / 2 - 0.01)
        : 0;

    if (alongX) {
      const ra = x0 + inset;
      const rb = x1 - inset;
      facets.push(
        { kind: "slope", points: [p(x0, eave, z0), p(x1, eave, z0), p(rb, ridge, cz), p(ra, ridge, cz)] },
        { kind: "slope", points: [p(x0, eave, z1), p(x1, eave, z1), p(rb, ridge, cz), p(ra, ridge, cz)] },
        { kind: "end", points: [p(x0, eave, z0), p(x0, eave, z1), p(ra, ridge, cz)] },
        { kind: "end", points: [p(x1, eave, z0), p(x1, eave, z1), p(rb, ridge, cz)] },
      );
    } else {
      const ra = z0 + inset;
      const rb = z1 - inset;
      facets.push(
        { kind: "slope", points: [p(x0, eave, z0), p(x0, eave, z1), p(cx, ridge, rb), p(cx, ridge, ra)] },
        { kind: "slope", points: [p(x1, eave, z0), p(x1, eave, z1), p(cx, ridge, rb), p(cx, ridge, ra)] },
        { kind: "end", points: [p(x0, eave, z0), p(x1, eave, z0), p(cx, ridge, ra)] },
        { kind: "end", points: [p(x0, eave, z1), p(x1, eave, z1), p(cx, ridge, rb)] },
      );
    }
  }
  return facets;
}

function p(x: number, y: number, z: number): Point3 {
  return { x, y, z };
}

/** Highest point of the roof above grade — the building's true height. */
export function roofPeakFt(geom: RoofGeometry): number {
  return geom.wings.reduce((max, w) => Math.max(max, w.ridgeFt), 0);
}
