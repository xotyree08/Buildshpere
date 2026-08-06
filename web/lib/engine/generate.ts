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
import { massingBias, PORCH_STYLES } from "./roof";

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

/** Pack rooms into rows of a fixed row depth along a hallway spine. */
function packLevel(specs: RoomSpec[], level: number, maxRowWidthFt: number, startKey: number): Room[] {
  const rooms: Room[] = [];
  let key = startKey;
  let y = 0;
  let rowX = 0;
  let rowDepth = 0;
  let rowStartY = 0;

  const place = (spec: RoomSpec) => {
    const depth = Math.sqrt(spec.areaSqft / spec.aspect);
    const width = spec.areaSqft / depth;
    if (rowX + width > maxRowWidthFt && rowX > 0) {
      // close the row, insert hallway strip, start next row
      y = rowStartY + rowDepth + HALL_WIDTH_FT;
      rowX = 0;
      rowDepth = 0;
      rowStartY = y;
    }
    rooms.push({
      key: `r${key++}`,
      kind: spec.kind,
      label: spec.label,
      level,
      rect: [round1(rowX), round1(rowStartY), round1(width), round1(depth)],
    });
    rowX += width;
    rowDepth = Math.max(rowDepth, depth);
  };

  specs.forEach(place);

  // one hallway spine per level, spanning the used width
  const usedWidth = Math.max(...rooms.map((r) => r.rect[0] + r.rect[2]), 0);
  const usedDepth = Math.max(...rooms.map((r) => r.rect[1] + r.rect[3]), 0);
  if (rooms.length > 1) {
    rooms.push({
      key: `r${key++}`,
      kind: "hallway",
      label: level === 0 ? "Hall" : `Hall L${level + 1}`,
      level,
      rect: [0, round1(usedDepth), round1(usedWidth), HALL_WIDTH_FT],
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
  /** Fraction of lot width the plan may use per row. */
  rowWidthFactor: number;
  twoStory: boolean;
  /** Depth-fit room proportions, tried in order; distinct per variant so
   * narrow-lot concepts stay visually different instead of converging. */
  deepenScales: number[];
}

export const VARIANTS: ConceptVariant[] = [
  { label: "The Courtyard", rowWidthFactor: 0.8, twoStory: false, deepenScales: [0.82, 0.68, 0.6] },
  { label: "The Compact Two-Story", rowWidthFactor: 0.55, twoStory: true, deepenScales: [0.85, 0.72, 0.62] },
  { label: "The Wide Ranch", rowWidthFactor: 0.95, twoStory: false, deepenScales: [0.92, 0.8, 0.7] },
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
    const specs = programRooms(brief.program, brief.style);
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
    let model = assembleModel(levelSpecs.map((l) => [...l]), maxRow);
    if (depthBudget) {
      let guard = 0;
      while (guard++ < 8 && maxRow < lot && planDepthFt(model) > depthBudget) {
        maxRow = Math.min(lot, maxRow * 1.2);
        model = assembleModel(levelSpecs.map((l) => [...l]), maxRow);
      }
      // Width exhausted and still too deep: deepen the living rooms
      // (lower aspect → narrower rooms → fuller rows), the way narrow-lot
      // homes are actually proportioned. Garages and outdoor spaces keep
      // their natural shape — a square garage helps nobody.
      for (const scale of variant.deepenScales) {
        if (planDepthFt(model) <= depthBudget) break;
        const deepened = levelSpecs.map((l) =>
          l.map((spec) =>
            spec.kind === "garage" || spec.kind === "outdoor"
              ? { ...spec }
              : { ...spec, aspect: Math.max(0.6, spec.aspect * scale) },
          ),
        );
        model = assembleModel(deepened, maxRow);
      }
    }
    const rooms = model.rooms;

    const sqft = Math.round(
      rooms.filter((r) => r.kind !== "garage" && r.kind !== "outdoor").reduce((a, r) => a + r.rect[2] * r.rect[3], 0),
    );

    return {
      id: `concept-${vi}`,
      briefId: brief.id,
      label: variant.label,
      style: brief.style,
      sqft,
      beds: brief.program.bedrooms,
      baths: brief.program.bathrooms,
      model,
    };
  });
}
