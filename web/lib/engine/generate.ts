/**
 * Deterministic concept generator: DesignBrief → parametric floor-plan concepts.
 *
 * ADR-007: this engine is deterministic code. The conversational AI collects the
 * brief and narrates results; it never invents geometry. Same brief → same plans.
 *
 * Layout strategy (MVP, rectilinear): rooms are packed into rows ("shelves")
 * against a central hallway spine, level by level. Three variants differ in
 * footprint shape and how public space is grouped.
 */

import type {
  DesignBrief,
  DesignConcept,
  HomeStyle,
  Opening,
  ParametricModel,
  ProgramRequirements,
  Room,
  RoomKind,
} from "../types";
import { conceptName, styleInfo, type MassingKey } from "../catalog/styles";
import { massingBias, PORCH_STYLES } from "./roof";
import { WALL_FT } from "./adjacency";

export interface RoomSpec {
  kind: RoomKind;
  label: string;
  areaSqft: number;
  /** Preferred width:depth aspect (width across the row). */
  aspect: number;
  public: boolean;
}

const HALL_WIDTH_FT = 4;

function programRooms(p: ProgramRequirements, style?: HomeStyle): RoomSpec[] {
  const specs: RoomSpec[] = [
    { kind: "living", label: "Living Room", areaSqft: 320, aspect: 1.3, public: true },
    { kind: "kitchen", label: "Kitchen", areaSqft: 200, aspect: 1.4, public: true },
    { kind: "dining", label: "Dining Room", areaSqft: 168, aspect: 1.2, public: true },
    { kind: "laundry", label: "Laundry", areaSqft: 64, aspect: 1.0, public: false },
    { kind: "closet", label: "Mechanical / Storage", areaSqft: 48, aspect: 1.0, public: false },
  ];
  for (let i = 1; i <= p.bedrooms; i++) {
    const primary = i === 1;
    specs.push({
      kind: "bedroom",
      label: primary ? "Primary Bedroom" : `Bedroom ${i}`,
      areaSqft: primary ? 240 : 156,
      aspect: 1.2,
      public: false,
    });
  }
  // "2.5 baths" is a real program: full baths plus a powder room. The
  // half bath is its own smaller room — engines downstream recognize it
  // by the "Powder Room" label (lavatory + water closet, no shower).
  const fullBaths = Math.max(1, Math.floor(p.bathrooms));
  const hasHalfBath = p.bathrooms - fullBaths >= 0.25;
  for (let i = 1; i <= fullBaths; i++) {
    specs.push({
      kind: "bathroom",
      label: i === 1 ? "Primary Bath" : `Bath ${i}`,
      areaSqft: i === 1 ? 90 : 60,
      aspect: 1.4,
      public: false,
    });
  }
  if (hasHalfBath) {
    specs.push({ kind: "bathroom", label: "Powder Room", areaSqft: 30, aspect: 1.5, public: false });
  }
  if (p.office) specs.push({ kind: "office", label: "Office", areaSqft: 132, aspect: 1.1, public: false });
  if (p.gym) specs.push({ kind: "gym", label: "Gym", areaSqft: 180, aspect: 1.3, public: false });
  if (p.theater) specs.push({ kind: "theater", label: "Theater", areaSqft: 220, aspect: 1.4, public: false });
  if (p.outdoorKitchen)
    specs.push({ kind: "outdoor", label: "Outdoor Kitchen", areaSqft: 140, aspect: 1.5, public: true });
  if (p.garageBays > 0)
    specs.push({
      kind: "garage",
      label: `${p.garageBays}-Car Garage`,
      areaSqft: 264 * p.garageBays,
      aspect: p.garageBays >= 2 ? 1.6 : 0.8,
      public: false,
    });
  // Porch styles carry their identity in the plan, not just the price.
  if (style && PORCH_STYLES.has(style))
    specs.push({ kind: "outdoor", label: "Front Porch", areaSqft: 120, aspect: 2.5, public: true });

  // A target square footage scales every livable room proportionally —
  // clamped so rooms never shrink below usable or balloon past sense.
  if (p.targetSqft && p.targetSqft > 0) {
    const livable = specs.filter((s) => s.kind !== "garage" && s.kind !== "outdoor");
    const base = livable.reduce((sum, s) => sum + s.areaSqft, 0);
    const scale = Math.min(1.8, Math.max(0.65, p.targetSqft / base));
    for (const s of livable) s.areaSqft = Math.round(s.areaSqft * scale);
  }
  return specs;
}

/**
 * Narrowest a room may be once its band's depth is fixed.
 *
 * Below this a room stops being a room and becomes a slot, so instead of
 * squeezing it the packer stands it in a column behind its neighbour — a
 * laundry over a mechanical closet, the way a real plan stacks small service
 * spaces. Four feet is a galley: tight, but a width people actually build.
 */
const MIN_CELL_FT = 4;

/*
 * Interior partitions come from ./adjacency, which is also where every engine
 * asking "do these rooms share a wall?" gets its answer. Modelling the wall is
 * what keeps gross floor area honestly above the sum of the rooms, and it is
 * what leaves the layout editor somewhere to put a room: pack a storey with no
 * wall thickness at all and every interior room is wedged solid, unable to
 * move a single grid step in any direction.
 */

/** Depth a room wants on its own, from its area and preferred aspect. */
function nominalDepth(spec: RoomSpec): number {
  return Math.sqrt(spec.areaSqft / spec.aspect);
}

/**
 * How far apart two rooms' natural depths may be and still share a band.
 *
 * Everything in a band ends up the same depth, and a room forced to a depth it
 * did not ask for pays for it in width: the distortion goes as the SQUARE of
 * the ratio. A bathroom wanting 6.5ft of depth in a band 11.4ft deep came out
 * 5.3 x 11.4 — a corridor with a toilet in it, three times the proportion it
 * asked for. Holding the ratio to a quarter holds the worst distortion to
 * about 1.5x, and the sort below means rooms rarely test the limit.
 */
const BAND_DEPTH_TOLERANCE = 1.25;

/**
 * Order a storey's rooms for packing.
 *
 * Rooms are grouped by the depth they naturally want, deepest first, because
 * a band gives every room in it one depth and the way to keep proportions is
 * to put like with like: bedrooms with bedrooms, the baths and the utility
 * rooms together. Packing in program order instead put a 6.5ft bathroom in a
 * band with an 11.4ft bedroom and stretched the bathroom to fit.
 *
 * Two rooms are pinned rather than sorted. A front porch is the face of the
 * house and belongs at the front, where it can also be the wide shallow thing
 * it asked to be — sorted by depth it sank to the back of the plan and came
 * out 6.6 x 18.2, a porch turned inside out. The garage is the opposite: a
 * service mass that reads best as its own block at the back, and being deeper
 * than anything else it would otherwise lead the whole plan.
 */
function orderForPacking(specs: RoomSpec[]): RoomSpec[] {
  const rank = (spec: RoomSpec) => {
    if (spec.kind === "outdoor" && /porch/i.test(spec.label)) return 0;
    if (spec.kind === "garage") return 2;
    return 1;
  };
  return specs
    .map((spec, index) => ({ spec, index }))
    .sort(
      (a, b) =>
        rank(a.spec) - rank(b.spec) ||
        nominalDepth(b.spec) - nominalDepth(a.spec) ||
        a.index - b.index,
    )
    .map((entry) => entry.spec);
}

/**
 * Group specs into bands, closing a band when the next room would overrun the
 * buildable width or wants a depth too far from the band's. The width rule is
 * what gives each variant its footprint, so it still measures rooms at their
 * natural width rather than their packed one.
 */
function assignBands(
  specs: RoomSpec[],
  maxRowWidthFt: number,
  depthTolerance: number,
): RoomSpec[][] {
  // Rooms that want a similar depth belong together; the sort has already put
  // them next to each other, so a group is just a run.
  const groups: RoomSpec[][] = [];
  for (const spec of orderForPacking(specs)) {
    const depth = nominalDepth(spec);
    const group = groups[groups.length - 1];
    const deepest = group ? Math.max(...group.map(nominalDepth)) : 0;
    const shallowest = group ? Math.min(...group.map(nominalDepth)) : 0;
    const stretched =
      group !== undefined &&
      Math.max(deepest, depth) / Math.min(shallowest, depth) > depthTolerance;
    if (!group || stretched) groups.push([spec]);
    else group.push(spec);
  }

  // A group too wide for the lot becomes several bands of roughly equal width
  // rather than one full band and a remainder. Splitting greedily left a
  // bedroom standing alone in a band of its own because its group ran six
  // inches over the buildable width, and that lone band put a step in the
  // footprint and a corridor across the plan to reach it.
  const bands: RoomSpec[][] = [];
  for (const group of groups) {
    const widthOf = (spec: RoomSpec) => spec.areaSqft / nominalDepth(spec);
    let remainingWidth = group.reduce((sum, spec) => sum + widthOf(spec), 0);
    let remainingBands = Math.max(1, Math.ceil(remainingWidth / maxRowWidthFt));
    let current: RoomSpec[] = [];
    let used = 0;
    for (const spec of group) {
      const width = widthOf(spec);
      const target = remainingWidth / remainingBands;
      // A little slack, so a room that overruns the target by inches stays put
      // instead of starting a band for itself.
      const balanced = used + width > target * 1.15 && remainingBands > 1;
      // The buildable width is not a target, it is a wall. Letting the last
      // band of a group ignore it put a 40ft row on a 30ft lot.
      const overruns = used + width > maxRowWidthFt;
      if (current.length > 0 && (balanced || overruns)) {
        bands.push(current);
        remainingBands -= 1;
        remainingWidth -= used;
        current = [];
        used = 0;
      }
      current.push(spec);
      used += width;
    }
    if (current.length > 0) bands.push(current);
  }
  return bands;
}

/**
 * Put rooms of the same kind together within a band.
 *
 * Grouping by depth gets the proportions right but scatters kinds: the two
 * bathrooms came out with a laundry and a mechanical closet between them, and
 * the plumbing engine found no wall carrying both fixture groups — the single
 * cheapest plumbing decision in the house, gone. Clustering costs nothing
 * (a band's depth and widths do not depend on the order within it) and reads
 * better besides: a bath core, a bedroom wing.
 *
 * Kinds keep the order they first appear in, so nothing is imposed beyond
 * "like with like" and the result stays deterministic.
 */
function clusterKinds(band: RoomSpec[]): RoomSpec[] {
  const firstSeen = new Map<string, number>();
  band.forEach((spec, index) => {
    if (!firstSeen.has(spec.kind)) firstSeen.set(spec.kind, index);
  });
  return band
    .map((spec, index) => ({ spec, index }))
    .sort((a, b) => firstSeen.get(a.spec.kind)! - firstSeen.get(b.spec.kind)! || a.index - b.index)
    .map((entry) => entry.spec);
}

/**
 * Whether a corridor runs behind band `i`.
 *
 * A corridor is double-loaded: it serves the rooms on both sides of it, which
 * is how a plan with a hall spine is actually laid out. Putting a corridor at
 * every band boundary instead gave the middle bands one each side and pushed
 * circulation to a quarter of the whole house — real homes run 10-15%.
 */
function hallwayAfter(index: number, bandCount: number): boolean {
  return index % 2 === 0 && index + 1 < bandCount;
}

/**
 * Divide one band into columns that tile it exactly.
 *
 * Every room in a band shares one depth — the deepest room's, so that room
 * keeps the proportions it asked for and the others widen to match. A room
 * too narrow to stand alone at that depth joins the column to its left, and
 * the column's width is then set by the areas it carries, so the band is
 * filled edge to edge and floor to back with no room losing or gaining a
 * square foot.
 *
 * This is what stops the footprint coming out as a sawtooth. Rooms used to
 * keep their own depth inside a shared row, so a twelve-foot kitchen beside a
 * sixteen-foot living room left a four-foot notch in the outside wall, and
 * every such notch became its own roof wing with its own ridge.
 */
function bandColumns(band: RoomSpec[]): { depthFt: number; columns: RoomSpec[][] } {
  // Band depth is measured wall face to wall face: the deepest room's own
  // depth plus the partition behind it.
  const depthFt = Math.max(...band.map(nominalDepth)) + WALL_FT;
  const columns: RoomSpec[][] = [];
  for (const spec of band) {
    const alone = spec.areaSqft / (depthFt - WALL_FT);
    const previous = columns[columns.length - 1];
    // Stacking costs a partition per room, so a column may only take another
    // room while there is depth left to give it.
    const room = previous ? depthFt - (previous.length + 1) * WALL_FT : 0;
    if (alone >= MIN_CELL_FT || !previous || room <= 1) columns.push([spec]);
    else previous.push(spec);
  }
  // A band that opens with a small room has nothing to its left to join, so
  // it joins the column to its right instead.
  while (columns.length > 1 && area(columns[0]) / (depthFt - WALL_FT) < MIN_CELL_FT) {
    const [first] = columns.splice(0, 1);
    columns[0].unshift(...first);
  }
  return { depthFt, columns };
}

/** Interior width shared by a column's rooms, once its partitions are paid for. */
function columnWidth(column: RoomSpec[], depthFt: number): number {
  return area(column) / Math.max(1, depthFt - column.length * WALL_FT);
}

function area(specs: RoomSpec[]): number {
  return specs.reduce((sum, s) => sum + s.areaSqft, 0);
}

/**
 * Pack rooms into bands of uniform depth, separated by real hallways.
 *
 * The circulation between bands used to be a bare gap that no room object
 * described: the plan claimed 1,693 sqft while standing on a 2,750 sqft
 * footprint, and every downstream measure had to guess which of the two it
 * meant. Each gap is now the hallway it always was — drawn, priced, floored
 * and heated like the rest of the house.
 */
function packLevel(
  specs: RoomSpec[],
  level: number,
  maxRowWidthFt: number,
  startKey: number,
  depthTolerance: number,
): Room[] {
  const rooms: Room[] = [];
  let key = startKey;
  const bands = assignBands(specs, maxRowWidthFt, depthTolerance).map(clusterKinds);
  const laid: { topFt: number; depthFt: number; widthFt: number; roofedFt: number }[] = [];
  let z = 0;

  for (const band of bands) {
    const { depthFt, columns } = bandColumns(band);
    const bandDepth = round1(depthFt);
    let x = 0;
    let roofed = 0;
    for (const column of columns) {
      const width = round1(columnWidth(column, depthFt));
      let cz = z;
      column.forEach((spec, i) => {
        // The last room in a column takes whatever depth is left, so rounding
        // can never open a seam between a column and the band behind it.
        const last = i === column.length - 1;
        const depth = last
          ? round1(z + bandDepth - cz - WALL_FT)
          : round1(spec.areaSqft / width);
        rooms.push({
          key: `r${key++}`,
          kind: spec.kind,
          label: spec.label,
          level,
          // Half a partition inside each face of the module: the rectangle is
          // the room, not the room plus its share of the walls.
          rect: [round1(x + WALL_FT / 2), round1(cz + WALL_FT / 2), width, Math.max(round1(depth), 1)],
        });
        cz = round1(cz + depth + WALL_FT);
      });
      x = round1(x + width + WALL_FT);
      // A porch is not part of the house's interior, so the hallway behind it
      // must not run out over it — that drew circulation across open decking
      // and left the roof two stray wings chasing it.
      if (column.some((spec) => spec.kind !== "outdoor")) roofed = x;
    }
    laid.push({ topFt: z, depthFt: bandDepth, widthFt: x, roofedFt: roofed });
    // Bands not separated by a corridor sit back to back, a wall apart.
    z = round1(z + bandDepth + (hallwayAfter(laid.length - 1, bands.length) ? HALL_WIDTH_FT : WALL_FT));
  }

  // One hallway per gap, as wide as the wider of the two bands it serves, so
  // the storey reads as one connected floor rather than a stack of islands.
  for (let i = 0; i + 1 < laid.length; i++) {
    if (!hallwayAfter(i, laid.length)) continue;
    const width = Math.max(laid[i].roofedFt, laid[i + 1].roofedFt);
    if (width <= 0) continue;
    rooms.push({
      key: `r${key++}`,
      kind: "hallway",
      label: level === 0 ? (i === 0 ? "Hall" : `Hall ${i / 2 + 1}`) : `Hall L${level + 1}${i === 0 ? "" : ` ${i / 2 + 1}`}`,
      level,
      rect: [
        round1(WALL_FT / 2),
        round1(laid[i].topFt + laid[i].depthFt + WALL_FT / 2),
        round1(width - WALL_FT),
        round1(HALL_WIDTH_FT - WALL_FT),
      ],
    });
  }
  return rooms;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function addOpenings(model: ParametricModel): void {
  const halls = model.rooms.filter((r) => r.kind === "hallway");
  let key = 0;
  for (const room of model.rooms) {
    if (room.kind === "hallway") continue;
    // interior door toward the hallway side (south wall by construction)
    model.openings.push({
      key: `o${key++}`,
      kind: room.kind === "outdoor" ? "opening" : "door",
      roomKey: room.key,
      wall: "s",
      offsetFt: round1(room.rect[2] / 2),
      widthFt: room.kind === "garage" ? 9 : 3,
    });
    // windows on the exterior (north) wall for habitable rooms
    const habitable: RoomKind[] = ["bedroom", "living", "dining", "kitchen", "office", "gym", "theater"];
    if (habitable.includes(room.kind)) {
      const count = Math.max(1, Math.floor(room.rect[2] / 8));
      for (let i = 0; i < count; i++) {
        model.openings.push({
          key: `o${key++}`,
          kind: "window",
          roomKey: room.key,
          wall: "n",
          offsetFt: round1(((i + 0.5) * room.rect[2]) / count),
          widthFt: 4,
        });
      }
    }
    void halls;
  }
}

/**
 * Pack per-level room specs into a complete model with openings.
 * Shared by initial generation and by the revision engine, so a revised
 * program flows through exactly the same layout rules.
 */
export function assembleModel(
  levelSpecs: RoomSpec[][],
  maxRowWidthFt: number,
  depthTolerance: number = BAND_DEPTH_TOLERANCE,
): ParametricModel {
  const rooms: Room[] = [];
  let startKey = 0;
  levelSpecs.forEach((specs, level) => {
    const packed = packLevel(specs, level, maxRowWidthFt, startKey, depthTolerance);
    startKey += packed.length;
    rooms.push(...packed);
  });
  const model: ParametricModel = {
    schemaVersion: 1,
    levels: levelSpecs.length,
    rooms,
    openings: [],
  };
  addOpenings(model);
  return model;
}

export interface ConceptVariant {
  label: string;
  /** Massing archetype key — drives the style-flavored display name. */
  massing: MassingKey;
  /** Fraction of lot width the plan may use per row. */
  rowWidthFactor: number;
  twoStory: boolean;
  /** Depth-fit room proportions, tried in order; distinct per variant so
   * narrow-lot concepts stay visually different instead of converging. */
  deepenScales: number[];
}

export const VARIANTS: ConceptVariant[] = [
  { label: "The Courtyard", massing: "courtyard", rowWidthFactor: 0.8, twoStory: false, deepenScales: [0.82, 0.68, 0.6] },
  { label: "The Compact Two-Story", massing: "two_story", rowWidthFactor: 0.55, twoStory: true, deepenScales: [0.85, 0.72, 0.62] },
  { label: "The Wide Ranch", massing: "wide", rowWidthFactor: 0.95, twoStory: false, deepenScales: [0.92, 0.8, 0.7] },
];

/** Variant order led by the style's natural massing (roof.ts massingBias). */
function orderedVariants(style: HomeStyle): ConceptVariant[] {
  const bias = massingBias(style);
  if (bias === null) return VARIANTS;
  return [...VARIANTS].sort((a, b) => {
    const pref = (v: ConceptVariant) => (bias === "two" ? (v.twoStory ? 0 : 1) : v.twoStory ? 1 : 0);
    return pref(a) - pref(b);
  });
}

/**
 * The home's own square footage: everything but the garage and the outdoor
 * rooms. Hallways count — people walk through them, the floor is finished and
 * the heat reaches them, and a plan that excludes them understates the house.
 */
function livableSqft(model: ParametricModel): number {
  return model.rooms
    .filter((r) => r.kind !== "garage" && r.kind !== "outdoor")
    .reduce((sum, r) => sum + r.rect[2] * r.rect[3], 0);
}

/** Ground-floor depth of a model, in feet. */
function planDepthFt(model: ParametricModel): number {
  const ground = model.rooms.filter((r) => r.level === 0);
  if (ground.length === 0) return 0;
  return Math.max(...ground.map((r) => r.rect[1] + r.rect[3])) - Math.min(...ground.map((r) => r.rect[1]));
}

export function generateConcepts(
  brief: DesignBrief,
  lotWidthFt: number | null,
  depthBudgetFt?: number | null,
): DesignConcept[] {
  const lot = lotWidthFt && lotWidthFt > 24 ? lotWidthFt : 60;
  const depthBudget = depthBudgetFt && depthBudgetFt > 24 ? depthBudgetFt : null;
  return orderedVariants(brief.style).map((variant, vi) => {
    const buildFor = (targetSqft: number | undefined): ParametricModel => {
      const specs = programRooms({ ...brief.program, targetSqft }, brief.style);
      let maxRow = Math.max(24, lot * variant.rowWidthFactor);

      let levelSpecs: RoomSpec[][];
      if (variant.twoStory) {
        const publicSpecs = specs.filter((s) => s.public || s.kind === "garage" || s.kind === "laundry");
        const privateSpecs = specs.filter((s) => !publicSpecs.includes(s));
        // keep one bath downstairs for accessibility
        const downBathIdx = privateSpecs.findIndex((s) => s.kind === "bathroom");
        if (downBathIdx >= 0) publicSpecs.push(...privateSpecs.splice(downBathIdx, 1));
        levelSpecs = [publicSpecs, privateSpecs];
      } else {
        levelSpecs = [specs];
      }

      // A narrow variant on a big program can pack deeper than the lot
      // allows; widen the rows (never past the buildable width) until the
      // plan fits the depth budget too. Deterministic: fixed growth, bounded.
      let tolerance = BAND_DEPTH_TOLERANCE;
      let built = assembleModel(levelSpecs.map((l) => [...l]), maxRow, tolerance);
      if (depthBudget) {
        let guard = 0;
        while (guard++ < 8 && maxRow < lot && planDepthFt(built) > depthBudget) {
          maxRow = Math.min(lot, maxRow * 1.2);
          built = assembleModel(levelSpecs.map((l) => [...l]), maxRow, tolerance);
        }
        // Width exhausted and still too deep: let rooms of unlike depth share
        // a band after all. Grouping by depth is what keeps proportions, and
        // it costs plan depth — every band it refuses to merge is another
        // band. On a lot that cannot take the depth, a squarer bathroom beats
        // a rear setback violation, so the guarantee yields here rather than
        // the site plan. Ordinary lots never reach this.
        for (const relaxed of [1.6, 2.2, Infinity]) {
          if (planDepthFt(built) <= depthBudget) break;
          tolerance = relaxed;
          built = assembleModel(levelSpecs.map((l) => [...l]), maxRow, tolerance);
        }
        // Still too deep: deepen the living rooms
        // (lower aspect → narrower rooms → fuller rows), the way narrow-lot
        // homes are actually proportioned. Garages and outdoor spaces keep
        // their natural shape — a square garage helps nobody.
        for (const scale of variant.deepenScales) {
          if (planDepthFt(built) <= depthBudget) break;
          const deepened = levelSpecs.map((l) =>
            l.map((spec) =>
              spec.kind === "garage" || spec.kind === "outdoor"
                ? { ...spec }
                : { ...spec, aspect: Math.max(0.6, spec.aspect * scale) },
            ),
          );
          built = assembleModel(deepened, maxRow, tolerance);
        }
      }
      return built;
    };

    const target = brief.program.targetSqft;
    let model = buildFor(target);

    // A square-footage target is a promise about the HOME, and a home includes
    // its hallways. programRooms only scales rooms, so asking for 2,600 sqft
    // used to deliver 2,600 sqft of rooms standing in a 3,160 sqft house.
    // Solve for the room scale that lands the finished plan on the number the
    // customer actually asked for: measure, correct, rebuild. Bounded passes,
    // so it stays deterministic and cannot spin.
    if (target && target > 0) {
      let effective = target;
      for (let pass = 0; pass < 4; pass++) {
        const actual = livableSqft(model);
        if (actual <= 0 || Math.abs(actual - target) / target <= 0.02) break;
        effective = (effective * target) / actual;
        model = buildFor(effective);
      }
    }

    return {
      id: `concept-${vi}`,
      briefId: brief.id,
      label: conceptName(styleInfo(brief.style)?.category, variant.massing) ?? variant.label,
      style: brief.style,
      sqft: Math.round(livableSqft(model)),
      beds: brief.program.bedrooms,
      baths: brief.program.bathrooms,
      model,
    };
  });
}
