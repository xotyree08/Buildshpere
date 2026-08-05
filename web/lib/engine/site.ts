/**
 * Site placement (LandSphere's first slice): the home's ground-floor
 * footprint placed on the lot — front-aligned to the front setback, centered
 * between the sides — with yard margins, fit violations, and lot coverage.
 *
 * Setback rules are GENERIC residential defaults until jurisdiction data
 * arrives with LandSphere in Phase 3; the UI says so, and the rules are a
 * parameter so county data slots in without touching this engine.
 */

import type { ParametricModel, Room } from "../types";

export interface SetbackRules {
  frontFt: number;
  rearFt: number;
  sideFt: number;
  /** Max roofed footprint as a share of the lot. */
  maxCoveragePct: number;
}

export const GENERIC_SETBACKS: SetbackRules = {
  frontFt: 25,
  rearFt: 20,
  sideFt: 7.5,
  maxCoveragePct: 40,
};

/**
 * Clamp user-entered jurisdiction rules to physically sane ranges, falling
 * back to the generic default per field. Never throws — bad input (NaN,
 * strings, absent fields) degrades to defaults, out-of-range values clamp.
 */
export function sanitizeSetbacks(input?: Partial<SetbackRules> | null): SetbackRules {
  const clamp = (v: unknown, fallback: number, min: number, max: number) => {
    const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
    return Math.min(max, Math.max(min, Math.round(n * 10) / 10));
  };
  return {
    frontFt: clamp(input?.frontFt, GENERIC_SETBACKS.frontFt, 0, 100),
    rearFt: clamp(input?.rearFt, GENERIC_SETBACKS.rearFt, 0, 100),
    sideFt: clamp(input?.sideFt, GENERIC_SETBACKS.sideFt, 0, 50),
    maxCoveragePct: clamp(input?.maxCoveragePct, GENERIC_SETBACKS.maxCoveragePct, 5, 100),
  };
}

/** Whether these rules are the untouched generic defaults (drives disclaimer wording). */
export function isGenericSetbacks(rules: SetbackRules): boolean {
  return (
    rules.frontFt === GENERIC_SETBACKS.frontFt &&
    rules.rearFt === GENERIC_SETBACKS.rearFt &&
    rules.sideFt === GENERIC_SETBACKS.sideFt &&
    rules.maxCoveragePct === GENERIC_SETBACKS.maxCoveragePct
  );
}

export interface PlacedRoom {
  room: Room;
  /** Lot coordinates: x from the left lot line, y from the street. */
  x: number;
  y: number;
  w: number;
  d: number;
}

export interface SitePlan {
  lotWidthFt: number;
  lotDepthFt: number;
  rules: SetbackRules;
  /** The buildable envelope after setbacks, in lot coordinates. */
  buildable: { x: number; y: number; w: number; d: number };
  /** Ground-floor rooms placed on the lot (garage and porch included). */
  placedRooms: PlacedRoom[];
  /** Footprint bounding box in lot coordinates. */
  footprint: { x: number; y: number; w: number; d: number };
  /** Remaining yards outside the footprint. */
  margins: { front: number; rear: number; side: number };
  coverage: { footprintSqft: number; lotSqft: number; pct: number };
  fits: boolean;
  violations: string[];
}

export function buildSitePlan(
  model: ParametricModel,
  lotWidthFt: number,
  lotDepthFt: number,
  rules: SetbackRules = GENERIC_SETBACKS,
): SitePlan {
  const rooms = model.rooms.filter((r) => r.level === 0);
  const minX = Math.min(...rooms.map((r) => r.rect[0]));
  const maxX = Math.max(...rooms.map((r) => r.rect[0] + r.rect[2]));
  const minY = Math.min(...rooms.map((r) => r.rect[1]));
  const maxY = Math.max(...rooms.map((r) => r.rect[1] + r.rect[3]));
  const bboxW = maxX - minX;
  const bboxD = maxY - minY;

  // Front-aligned at the front setback (the plan's north/window facade faces
  // the street), centered between the side lot lines.
  const offsetX = (lotWidthFt - bboxW) / 2 - minX;
  const offsetY = rules.frontFt - minY;

  const placedRooms: PlacedRoom[] = rooms.map((room) => ({
    room,
    x: room.rect[0] + offsetX,
    y: room.rect[1] + offsetY,
    w: room.rect[2],
    d: room.rect[3],
  }));

  const footprint = { x: minX + offsetX, y: rules.frontFt, w: bboxW, d: bboxD };
  const buildable = {
    x: rules.sideFt,
    y: rules.frontFt,
    w: lotWidthFt - 2 * rules.sideFt,
    d: lotDepthFt - rules.frontFt - rules.rearFt,
  };

  const sideMargin = (lotWidthFt - bboxW) / 2;
  const rearMargin = lotDepthFt - rules.frontFt - bboxD;
  const margins = {
    front: rules.frontFt,
    rear: Math.round(rearMargin * 10) / 10,
    side: Math.round(sideMargin * 10) / 10,
  };

  const footprintSqft = Math.round(rooms.reduce((a, r) => a + r.rect[2] * r.rect[3], 0));
  const lotSqft = Math.round(lotWidthFt * lotDepthFt);
  const pct = lotSqft > 0 ? Math.round((footprintSqft / lotSqft) * 1000) / 10 : 0;

  const violations: string[] = [];
  if (sideMargin < rules.sideFt) {
    violations.push(
      `Side yards are ${margins.side} ft — under the ${rules.sideFt} ft setback. The plan is ${Math.round(bboxW)} ft wide on a ${lotWidthFt} ft lot.`,
    );
  }
  if (rearMargin < rules.rearFt) {
    violations.push(
      `Rear yard is ${margins.rear} ft — under the ${rules.rearFt} ft setback. The plan is ${Math.round(bboxD)} ft deep on a ${lotDepthFt} ft lot.`,
    );
  }
  if (pct > rules.maxCoveragePct) {
    violations.push(`Lot coverage is ${pct}% — over the ${rules.maxCoveragePct}% limit.`);
  }

  return {
    lotWidthFt,
    lotDepthFt,
    rules,
    buildable,
    placedRooms,
    footprint,
    margins,
    coverage: { footprintSqft, lotSqft, pct },
    fits: violations.length === 0,
    violations,
  };
}
