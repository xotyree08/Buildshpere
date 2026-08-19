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
import { ADJACENCY_TOLERANCE_FT } from "./adjacency";
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
 * Largest unroofed gap that still reads as circulation rather than a void.
 *
 * A plan's rooms never tile their own footprint. Corridors, stair halls and
 * wall thickness sit between them and no generator emits a room for every
 * one, so the union of the room rectangles is riddled with slots a real roof
 * plainly spans. It does not span everything, though: a courtyard, a light
 * well, or the open ground beside a wing must stay open, and roofing those
 * over inflated one concept's roof by 60% while drawing a roof straight
 * across its own courtyard.
 *
 * Six feet separates the two. It is wider than any corridor a house needs and
 * narrower than any void worth designing, so gaps up to it close and wider
 * ones stay holes.
 */
export const CIRCULATION_GAP_FT = 6;

/**
 * A room rectangle is an interior dimension, so two rooms either side of a
 * six-inch partition do not touch. The roof covers the partition — it covers
 * the whole structure — and treating that gap as open ground shattered a plain
 * house into twenty-one wings, one splinter per wall line. The tolerance is
 * the same one every other engine uses to decide two rooms are neighbours.
 */
const STRUCTURE_GAP_FT = ADJACENCY_TOLERANCE_FT;

/** Merge spans that overlap or sit within `bridgeFt` of one another. */
function mergeSpans(spans: [number, number][], bridgeFt: number): [number, number][] {
  const sorted = [...spans].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: [number, number][] = [];
  for (const [z0, z1] of sorted) {
    const last = out[out.length - 1];
    if (last && z0 - last[1] <= bridgeFt + 1e-9) last[1] = Math.max(last[1], z1);
    else out.push([z0, z1]);
  }
  return out;
}

/**
 * Square off notches in the footprint.
 *
 * Rooms in a row are not all the same depth, so the union of their rectangles
 * has a sawtooth edge of one- and three-foot steps. No builder frames that
 * and no roof follows it — left alone it shatters a plain house into a dozen
 * wings, each carrying its own ridge at its own height. A step shallower than
 * a corridor is a notch: the roof runs past it.
 *
 * Only edge-sharing neighbours pull on each other, every extension is
 * measured against the ORIGINAL rectangles, and they are all applied at once.
 * A staircase of small steps therefore cannot chain into one large one, and
 * the result does not depend on which end the sweep starts from.
 */
function squareNotches(rooms: Room[]): [number, number, number, number][] {
  return rooms.map((room) => {
    const [x, z, w, d] = room.rect;
    let x0 = x;
    let x1 = x + w;
    let z0 = z;
    let z1 = z + d;
    for (const other of rooms) {
      if (other === room) continue;
      const [ox, oz, ow, od] = other.rect;
      const overlapX = Math.min(x + w, ox + ow) - Math.max(x, ox);
      const overlapZ = Math.min(z + d, oz + od) - Math.max(z, oz);
      const wall = (gap: number) => gap > 1e-9 && gap <= STRUCTURE_GAP_FT + 1e-9;

      // Close the wall. Room rectangles are interior dimensions, so two rooms
      // either side of a partition stand a few inches apart; the roof covers
      // the partition. Left open, that strip is a hole running the height of
      // the plan, and the decomposition splinters along every wall line.
      if (overlapZ > 1e-9) {
        if (wall(ox - (x + w))) x1 = Math.max(x1, ox);
        if (wall(x - (ox + ow))) x0 = Math.min(x0, ox + ow);
      }
      if (overlapX > 1e-9) {
        if (wall(oz - (z + d))) z1 = Math.max(z1, oz);
        if (wall(z - (oz + od))) z0 = Math.min(z0, oz + od);
      }

      // Square the notch. Neighbours count as adjacent across a wall.
      const touchX = Math.abs(ox + ow - x) <= STRUCTURE_GAP_FT + 1e-9 || Math.abs(x + w - ox) <= STRUCTURE_GAP_FT + 1e-9;
      const touchZ = Math.abs(oz + od - z) <= STRUCTURE_GAP_FT + 1e-9 || Math.abs(z + d - oz) <= STRUCTURE_GAP_FT + 1e-9;
      if (touchX && overlapZ > 1e-9) {
        if (z - oz > 1e-9 && z - oz <= CIRCULATION_GAP_FT) z0 = Math.min(z0, oz);
        if (oz + od - (z + d) > 1e-9 && oz + od - (z + d) <= CIRCULATION_GAP_FT) z1 = Math.max(z1, oz + od);
      }
      if (touchZ && overlapX > 1e-9) {
        if (x - ox > 1e-9 && x - ox <= CIRCULATION_GAP_FT) x0 = Math.min(x0, ox);
        if (ox + ow - (x + w) > 1e-9 && ox + ow - (x + w) <= CIRCULATION_GAP_FT) x1 = Math.max(x1, ox + ow);
      }
    }
    return [x0, z0, x1 - x0, z1 - z0] as [number, number, number, number];
  });
}

/**
 * Decompose a set of axis-aligned rectangles into the rectangles a roof
 * actually covers: their union, with circulation-width gaps closed, sliced
 * into vertical strips and grown back together where neighbouring strips
 * share a depth span.
 *
 * An L-shaped plan becomes two wings, not one bounding box. A plain rectangle
 * stays one. A plan with a courtyard keeps its hole. Deterministic: edges are
 * sorted numerically and strips are emitted left to right, front to back.
 */
export function decomposeWings(rooms: Room[]): [number, number, number, number][] {
  if (rooms.length === 0) return [];
  const rects = squareNotches(rooms);
  const xs = Array.from(
    new Set(rects.flatMap((r) => [r[0], r[0] + r[2]])),
  ).sort((a, b) => a - b);

  const columns: { x0: number; x1: number; spans: [number, number][] }[] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[i];
    const x1 = xs[i + 1];
    if (x1 - x0 <= 1e-9) continue;
    const mid = (x0 + x1) / 2;
    // Every room spanning this slice contributes its depth range. Taking the
    // min and max of those ranges — which is what this used to do — roofs the
    // entire gap between the frontmost and backmost room in the slice, so a
    // bathroom at the front and a hall at the back conjured 27 feet of roof
    // over open ground between them.
    const spanning = rects.filter((r) => r[0] <= mid && r[0] + r[2] >= mid);
    if (spanning.length === 0) continue;
    columns.push({
      x0,
      x1,
      spans: mergeSpans(
        spanning.map((r) => [r[1], r[1] + r[3]] as [number, number]),
        CIRCULATION_GAP_FT,
      ),
    });
  }

  // The same notch rule again, now between whole columns rather than between
  // rooms. Squaring the rooms cannot see a step that only appears once
  // several of them are stacked into one strip, and leaving those unsquared
  // costs an extra wing on a typical plan. Same guarantees: measured against
  // the ORIGINAL spans, applied to every column at once, no chaining.
  const squared = columns.map((col, i) => ({
    x0: col.x0,
    x1: col.x1,
    spans: mergeSpans(
      col.spans.map(([z0, z1]) => {
        let lo = z0;
        let hi = z1;
        for (const nb of [columns[i - 1], columns[i + 1]]) {
          if (!nb) continue;
          const adjacent =
            Math.abs(nb.x1 - col.x0) < 1e-9 || Math.abs(col.x1 - nb.x0) < 1e-9;
          if (!adjacent) continue;
          for (const [nz0, nz1] of nb.spans) {
            if (Math.min(z1, nz1) - Math.max(z0, nz0) <= 1e-9) continue;
            if (z0 - nz0 > 1e-9 && z0 - nz0 <= CIRCULATION_GAP_FT) lo = Math.min(lo, nz0);
            if (nz1 - z1 > 1e-9 && nz1 - z1 <= CIRCULATION_GAP_FT) hi = Math.max(hi, nz1);
          }
        }
        return [lo, hi] as [number, number];
      }),
      0,
    ),
  }));

  // Grow each rectangle rightwards through columns carrying the same span, so
  // a rectangular house is one wing rather than a comb of slivers. Only the
  // immediately preceding column can extend one, and only when it is
  // genuinely adjacent — a skipped empty column ends the run.
  const wings: [number, number, number, number][] = [];
  let open = new Map<string, [number, number, number, number]>();
  for (const col of squared) {
    const next = new Map<string, [number, number, number, number]>();
    for (const [z0, z1] of col.spans) {
      const key = `${z0.toFixed(4)}:${z1.toFixed(4)}`;
      const prior = open.get(key);
      // A wall's worth of empty slice between two columns is the wall, not a
      // break in the building, so the wing runs straight through it.
      const gap = prior ? col.x0 - (prior[0] + prior[2]) : Infinity;
      if (prior && gap >= -1e-9 && gap <= STRUCTURE_GAP_FT + 1e-9) {
        prior[2] = col.x1 - prior[0];
        next.set(key, prior);
      } else {
        const rect: [number, number, number, number] = [col.x0, z0, col.x1 - col.x0, z1 - z0];
        wings.push(rect);
        next.set(key, rect);
      }
    }
    open = next;
  }
  return absorbSlivers(mergeRectangles(wings));
}

/**
 * Fuse neighbouring rectangles whose union is itself a rectangle, until none
 * are left. Exact by construction — nothing is added or dropped — it only
 * stops a plain shape arriving as a stack of pieces, each of which would
 * otherwise carry its own ridge.
 */
/**
 * Widest ribbon that is a rounding artefact rather than a wing.
 *
 * Room rectangles are rounded to a tenth of a foot, so two rooms meant to sit
 * flush can end up a few inches out of line and the decomposition hands back a
 * ribbon four inches wide running the whole depth of the house. It then roofs
 * as a wing of its own, with its own ridge: the craftsman single-storey came
 * out with five wings, one of them 0.4ft across.
 */
const SLIVER_FT = 1;

/** Fold ribbons too narrow to be structure into the wing they run against. */
function absorbSlivers(
  rects: [number, number, number, number][],
): [number, number, number, number][] {
  const out = rects.map((r) => [...r] as [number, number, number, number]);
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 0; i < out.length && !changed; i++) {
      if (Math.min(out[i][2], out[i][3]) >= SLIVER_FT) continue;
      let best = -1;
      let bestEdge = 0;
      for (let j = 0; j < out.length; j++) {
        if (j === i) continue;
        const edge = sharedEdgeFt(out[i], out[j]);
        if (edge > bestEdge) {
          bestEdge = edge;
          best = j;
        }
      }
      if (best < 0) continue;
      const [sx, sz, sw, sd] = out[i];
      const [bx, bz, bw, bd] = out[best];
      const x = Math.min(sx, bx);
      const z = Math.min(sz, bz);
      out[best] = [x, z, Math.max(sx + sw, bx + bw) - x, Math.max(sz + sd, bz + bd) - z];
      out.splice(i, 1);
      changed = true;
    }
  }
  return out;
}

function mergeRectangles(
  rects: [number, number, number, number][],
): [number, number, number, number][] {
  const out = rects.map((r) => [...r] as [number, number, number, number]);
  for (let changed = true; changed; ) {
    changed = false;
    outer: for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i];
        const b = out[j];
        const sameX = Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[2] - b[2]) < 1e-9;
        const sameZ = Math.abs(a[1] - b[1]) < 1e-9 && Math.abs(a[3] - b[3]) < 1e-9;
        const touchZ = Math.abs(a[1] + a[3] - b[1]) < 1e-9 || Math.abs(b[1] + b[3] - a[1]) < 1e-9;
        const touchX = Math.abs(a[0] + a[2] - b[0]) < 1e-9 || Math.abs(b[0] + b[2] - a[0]) < 1e-9;
        if (sameX && touchZ) {
          a[1] = Math.min(a[1], b[1]);
          a[3] += b[3];
        } else if (sameZ && touchX) {
          a[0] = Math.min(a[0], b[0]);
          a[2] += b[2];
        } else {
          continue;
        }
        out.splice(j, 1);
        changed = true;
        break outer;
      }
    }
  }
  return out;
}

/**
 * Narrowest strip that gets to choose its own ridge direction.
 *
 * Real plans are ragged: one bedroom projecting three feet past its
 * neighbours is a notch, not a wing. Left to itself it would turn its ridge
 * across the main one and grow a little cross-gable no builder would frame.
 *
 * Note what this does NOT do: it does not merge the notch into its
 * neighbour's bounding box. That would fill any genuine void — a courtyard
 * is a hole in the roof, and roofing it over inflated one concept's roof by
 * 60% while drawing a roof across its own courtyard.
 */
export const MIN_WING_FT = 10;

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

/**
 * Roofed footprint of one storey, in square feet.
 *
 * This is GROSS floor area — the area the slab is poured over and the floor is
 * framed across, corridors, wall thickness and all. It is not the sum of the
 * room rectangles: the plans do not model every hallway, and a house is not
 * built only where a room is labelled. Expect 80-90% of this to be modelled
 * rooms, which is the net-to-gross ratio residential plans actually run at.
 */
export function footprintSqft(model: ParametricModel, level: number): number {
  return decomposeWings(roofedRooms(model, level)).reduce((sum, [, , w, d]) => sum + w * d, 0);
}

/** Gross floor area across every storey. */
export function grossFloorSqft(model: ParametricModel): number {
  let total = 0;
  for (let lvl = 0; lvl < model.levels; lvl++) total += footprintSqft(model, lvl);
  return total;
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

  // The largest rectangle sets the roofline; notches fall in behind it.
  const dominant = wingRects.reduce<[number, number, number, number] | null>(
    (best, r) => (!best || r[2] * r[3] > best[2] * best[3] ? r : best),
    null,
  );
  const dominantAxis: "x" | "z" = dominant && dominant[2] >= dominant[3] ? "x" : "z";

  const wings: RoofWing[] = wingRects.map((rect) => {
    const [, , w, d] = rect;
    const isSliver = Math.min(w, d) < MIN_WING_FT;
    // A notch runs its ridge with the main roof rather than across it.
    const ridgeAxis: "x" | "z" = isSliver ? dominantAxis : w >= d ? "x" : "z";
    const span = ridgeAxis === "x" ? d : w;
    let ridgeFt = eaveFt + (pitch * span) / 2;
    if (isSliver) {
      // ...and it carries the neighbouring roof's ridge height too. A two-foot
      // jog in a wall does not get its own little roof two feet tall: the
      // builder runs the main plane straight across it, which is steeper over
      // that stretch than the nominal pitch and reads as one surface. Giving
      // the notch its own low ridge instead turned a plain elevation into a
      // comb of spikes.
      const host = wingRects
        .filter((other) => other !== rect && Math.min(other[2], other[3]) >= MIN_WING_FT)
        .map((other) => ({ other, edge: sharedEdgeFt(rect, other) }))
        .filter((c) => c.edge > 1e-9)
        .sort((a, b) => b.edge - a.edge || a.other[0] - b.other[0] || a.other[1] - b.other[1])[0];
      if (host) {
        const [, , hw, hd] = host.other;
        const hostAxis: "x" | "z" = hw >= hd ? "x" : "z";
        ridgeFt = eaveFt + (pitch * (hostAxis === "x" ? hd : hw)) / 2;
      }
    }
    return { rect, ridgeAxis, eaveFt, ridgeFt };
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
  // Only the OUTER edge carries an eave: where two wings butt, the roof runs
  // straight through and there is no eave, no gutter and no fascia. Counting
  // both sides of every shared edge would hang a skirt inside the building.
  let sharedFt = 0;
  for (let i = 0; i < wingRects.length; i++) {
    for (let j = i + 1; j < wingRects.length; j++) sharedFt += sharedEdgeFt(wingRects[i], wingRects[j]);
  }
  const wallPerimeterFt = Math.max(
    0,
    wingRects.reduce((sum, [, , w, d]) => sum + 2 * (w + d), 0) - 2 * sharedFt,
  );
  planAreaSqft += wallPerimeterFt * ROOF_OVERHANG_FT;
  // The eave line sits at the edge of the overhang, so it is longer than the
  // wall below it. Measuring area to the eave but length to the wall would
  // understate every eave-based quantity (gutters, drip edge, fascia). Four
  // outside corners per wing, each adding two overhangs' worth of run.
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
