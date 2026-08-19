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
import { itemArea, tile, type TileItem } from "./tile";

export interface RoomSpec {
  kind: RoomKind;
  label: string;
  areaSqft: number;
  /** Preferred width:depth aspect. */
  aspect: number;
  public: boolean;
  /**
   * Rooms that belong to one another — a primary suite, where the bath and
   * the walk-in open off the bedroom rather than sitting somewhere else in
   * the house. A suite is one cell to the tiler and tiles its own interior,
   * so nothing can be placed between its rooms.
   */
  suite?: string;
}

const HALL_WIDTH_FT = 4;

/** Below this a room stops being a room. */
const MIN_ROOM_FT = 4;

function programRooms(p: ProgramRequirements, style?: HomeStyle): RoomSpec[] {
  const specs: RoomSpec[] = [
    { kind: "living", label: "Living Room", areaSqft: 320, aspect: 1.3, public: true },
    { kind: "kitchen", label: "Kitchen", areaSqft: 200, aspect: 1.4, public: true },
    { kind: "dining", label: "Dining Room", areaSqft: 168, aspect: 1.2, public: true },
    // The service rooms are one cell. A powder room is thirty square feet —
    // too little to be placed on its own without coming out a slot — and a
    // laundry, a mechanical closet and a powder room share their plumbing
    // wall anyway, so grouping them is both the fix and the right plan.
    { kind: "laundry", label: "Laundry", areaSqft: 64, aspect: 1.0, public: false, suite: "service" },
    { kind: "closet", label: "Mechanical / Storage", areaSqft: 48, aspect: 1.0, public: false, suite: "service" },
  ];
  for (let i = 1; i <= p.bedrooms; i++) {
    const primary = i === 1;
    specs.push({
      kind: "bedroom",
      label: primary ? "Primary Bedroom" : `Bedroom ${i}`,
      areaSqft: primary ? 240 : 156,
      aspect: 1.2,
      public: false,
      suite: primary ? "primary" : undefined,
    });
  }
  // Every primary suite has a walk-in. Leaving it out of the programme is part
  // of why the primary bath had nothing to pair with and ended up loose in the
  // plan, on the far side of the house from the bedroom it serves.
  specs.push({
    kind: "closet",
    label: "Walk-in Closet",
    areaSqft: 60,
    aspect: 1.2,
    public: false,
    suite: "primary",
  });
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
      suite: i === 1 ? "primary" : undefined,
    });
  }
  if (hasHalfBath) {
    specs.push({
      kind: "bathroom",
      label: "Powder Room",
      areaSqft: 30,
      // Powder rooms are narrow and deep — a lavatory and a water closet in
      // line. Asking for 1.5 asked for a shape nobody builds.
      aspect: 0.5,
      public: false,
      suite: "service",
    });
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
 * Interior partitions come from ./adjacency, which is also where every engine
 * asking "do these rooms share a wall?" gets its answer. Modelling the wall is
 * what keeps gross floor area honestly above the sum of the rooms, and it is
 * what leaves the layout editor somewhere to put a room: pack a storey with no
 * wall thickness at all and every interior room is wedged solid, unable to
 * move a single grid step in any direction.
 */

/** Circulation as a share of the storey — real homes run 10-15%. */
const HALL_FRACTION = 0.11;

/**
 * Where a room sits in the sequence you walk through a house.
 *
 * The day side of a house faces the street and the night side does not, and a
 * plan that ignores that is a list of rectangles rather than a home. Two
 * zones, a corridor between them: everything you arrive into and entertain in
 * at the front, everything you sleep and wash and launder in behind.
 */
const ZONE_FRONT = 0;
const ZONE_BACK = 1;

function zoneOf(spec: RoomSpec): number {
  if (spec.kind === "garage") return ZONE_FRONT;
  if (spec.kind === "living" || spec.kind === "kitchen" || spec.kind === "dining") return ZONE_FRONT;
  if (spec.kind === "office" || spec.kind === "theater" || spec.kind === "gym") return ZONE_FRONT;
  return ZONE_BACK;
}

/**
 * Build the tiling items for a storey, grouping rooms that must end up
 * touching. A group is one cell to the tiler and tiles its own interior, so
 * an ensuite cannot be separated from its bedroom by anything at all.
 */
function tileItems(specs: RoomSpec[]): TileItem[] {
  const items: TileItem[] = [];
  const suites = new Map<string, TileItem>();
  for (const spec of specs) {
    // Tile the room PLUS its share of the walls. The rectangle drawn is the
    // interior, half a partition inside each face, so a cell sized to the
    // programme area hands back a room several percent short of it — and the
    // shortfall lands on the customer's square footage and their estimate.
    const depth = Math.sqrt(spec.areaSqft / spec.aspect);
    const width = spec.areaSqft / depth;
    const leaf: TileItem = {
      key: spec.label,
      areaSqft: spec.areaSqft + WALL_FT * (width + depth),
      aspect: spec.aspect,
    };
    if (!spec.suite) {
      items.push(leaf);
      continue;
    }
    let group = suites.get(spec.suite);
    if (!group) {
      group = { key: `suite:${spec.suite}`, areaSqft: 0, aspect: 1.15, children: [] };
      suites.set(spec.suite, group);
      items.push(group);
    }
    group.children!.push(leaf);
  }
  return items;
}

/**
 * Lay out one storey by tiling the buildable rectangle.
 *
 * Depth is computed from the programme rather than discovered afterwards, so
 * a plan is as deep as its rooms need and no deeper. The old packer worked the
 * other way round — stack bands, then find out you had built a hundred-foot
 * house on an eighty-five-foot lot — and every attempt to claw that back cost
 * a room its proportions.
 */
function packLevel(specs: RoomSpec[], level: number, maxRowWidthFt: number, startKey: number): Room[] {
  const rooms: Room[] = [];
  let key = startKey;
  if (specs.length === 0) return rooms;

  // Outdoor rooms are not tiled with the interior. A porch belongs across the
  // front of the house and a covered terrace across the back; tiled in with
  // everything else the porch came out 4.7ft x 27.3ft, standing on its end
  // beside the living room.
  const isPorch = (spec: RoomSpec) => spec.kind === "outdoor" && /porch/i.test(spec.label);
  const porches = specs.filter(isPorch);
  const terraces = specs.filter((spec) => spec.kind === "outdoor" && !isPorch(spec));
  const indoor = specs.filter((spec) => spec.kind !== "outdoor");

  const width = Math.max(MIN_ROOM_FT * 2, maxRowWidthFt);
  const emit = (spec: RoomSpec, rect: [number, number, number, number]) => {
    rooms.push({
      key: `r${key++}`,
      kind: spec.kind,
      label: spec.label,
      level,
      // Half a partition inside each face: the rectangle is the room, not the
      // room plus its share of the walls.
      rect: [
        round1(rect[0] + WALL_FT / 2),
        round1(rect[1] + WALL_FT / 2),
        Math.max(round1(rect[2] - WALL_FT), 1),
        Math.max(round1(rect[3] - WALL_FT), 1),
      ],
    });
  };

  /** An outdoor room as a strip across a face, at the proportions it asked for. */
  const strip = (group: RoomSpec[], z: number): number => {
    if (group.length === 0) return 0;
    const area = group.reduce((sum, spec) => sum + spec.areaSqft, 0);
    const aspect = group[0].aspect;
    // The strip takes the shape it asked for, and only spreads thinner if
    // that shape will not fit across the face. Clamping it the other way
    // round is what laid a covered terrace out 34ft x 3.5ft.
    const depth = Math.max(Math.sqrt(area / aspect), area / width);
    let x = 0;
    for (const spec of group) {
      const w = spec.areaSqft / depth;
      emit(spec, [x, z, w, depth]);
      x = round1(x + w);
    }
    return round1(depth);
  };

  let z = 0;
  z = round1(z + strip(porches, z));

  // Every area below is the room PLUS its share of the walls, because that is
  // what the tiler places; measuring the rectangle from bare room areas and
  // then filling it with walled ones overflows it and distorts everything.
  const walled = (group: RoomSpec[]) =>
    tileItems(group).reduce((sum, item) => sum + itemArea(item), 0);
  const roomArea = walled(indoor);
  const split = [ZONE_FRONT, ZONE_BACK]
    .map((zone) => indoor.filter((spec) => zoneOf(spec) === zone))
    .filter((group) => group.length > 0);
  // A day side and a night side is a ground-floor idea. Upstairs everything is
  // private, so one of the two zones ends up holding a single small room and
  // gets a band of the storey's depth in proportion to it: an office alone in
  // the front zone of an upper floor came out 40.8ft x 2.8ft. A zone that
  // small is not a zone — the storey is simply one.
  const smallest = Math.min(...split.map(walled));
  const zones = split.length > 1 && smallest / roomArea < 0.2 ? [indoor] : split;
  const hallDepth = zones.length > 1 ? Math.max(HALL_WIDTH_FT, (roomArea * HALL_FRACTION) / width) : 0;
  const bodyDepth = roomArea / width;

  for (const [index, zone] of zones.entries()) {
    const depth = (bodyDepth * walled(zone)) / roomArea;
    for (const placed of tile(tileItems(zone), [0, z, width, depth])) {
      const spec = zone.find((candidate) => candidate.label === placed.key);
      if (spec) emit(spec, placed.rect);
    }
    z = round1(z + depth);
    if (index + 1 < zones.length) {
      rooms.push({
        key: `r${key++}`,
        kind: "hallway",
        label: level === 0 ? "Hall" : `Hall L${level + 1}`,
        level,
        rect: [
          round1(WALL_FT / 2),
          round1(z + WALL_FT / 2),
          round1(width - WALL_FT),
          round1(hallDepth - WALL_FT),
        ],
      });
      z = round1(z + hallDepth);
    }
  }

  strip(terraces, z);
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
export function assembleModel(levelSpecs: RoomSpec[][], maxRowWidthFt: number): ParametricModel {
  const rooms: Room[] = [];
  let startKey = 0;
  levelSpecs.forEach((specs, level) => {
    const packed = packLevel(specs, level, maxRowWidthFt, startKey);
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
        // Keep one bath downstairs for accessibility — but never the ensuite.
        // Taking the first bathroom it found took the primary bath, which left
        // the walk-in closet upstairs with only a bedroom to pair with and
        // turned it into a 24ft x 1.9ft strip. A suite is not a pool of
        // bathrooms to draw from.
        const downBathIdx = privateSpecs.findIndex((s) => s.kind === "bathroom" && !s.suite);
        if (downBathIdx >= 0) publicSpecs.push(...privateSpecs.splice(downBathIdx, 1));
        levelSpecs = [publicSpecs, privateSpecs];
      } else {
        levelSpecs = [specs];
      }

      // A narrow variant on a big program can pack deeper than the lot
      // allows; widen the rows (never past the buildable width) until the
      // plan fits the depth budget too. Deterministic: fixed growth, bounded.
      let built = assembleModel(levelSpecs.map((l) => [...l]), maxRow);
      if (depthBudget) {
        let guard = 0;
        while (guard++ < 8 && maxRow < lot && planDepthFt(built) > depthBudget) {
          maxRow = Math.min(lot, maxRow * 1.2);
          built = assembleModel(levelSpecs.map((l) => [...l]), maxRow);
        }
        // Width exhausted and still too deep: deepen the living rooms
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
          built = assembleModel(deepened, maxRow);
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
