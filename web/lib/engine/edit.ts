/**
 * Direct layout editing: move a room, drag a wall, slide a door or window.
 *
 * Every edit is a pure function over the model that either returns a new
 * model or refuses with a reason a homeowner can act on (L2 — no silent
 * clamping to something they didn't ask for, no silent no-op). The rules
 * enforced here are the ones a plan must satisfy to stay buildable at all:
 * rooms don't overlap, rooms stay inside the buildable envelope, and no
 * room shrinks below a dimension its function can't survive.
 *
 * Softer judgments — traffic flow, clearances, plumbing runs — deliberately
 * stay in runChecks() so an edit is never blocked by advice; the health
 * score reports them after the edit lands.
 */

import type { ParametricModel, Room, RoomKind } from "../types";

/** Six inches: the finest dimension worth drawing at this stage. */
export const GRID_FT = 0.5;

export function snap(value: number): number {
  // The + 0 normalizes -0, which Math.round produces for small negatives and
  // which would otherwise reach the stored model as a literal "-0".
  return Math.round(value / GRID_FT) * GRID_FT + 0;
}

/**
 * Smallest footprint each room kind can occupy and still be that room.
 * Drawn from residential code minimums and door/fixture geometry rather
 * than taste: a 4-foot bedroom is not a small bedroom, it is a closet.
 */
const MIN_DIMS: Record<RoomKind, { w: number; d: number }> = {
  bedroom: { w: 8, d: 8 },
  bathroom: { w: 5, d: 6 },
  kitchen: { w: 8, d: 8 },
  living: { w: 10, d: 10 },
  dining: { w: 8, d: 8 },
  office: { w: 7, d: 7 },
  gym: { w: 8, d: 8 },
  theater: { w: 10, d: 10 },
  garage: { w: 10, d: 18 },
  mudroom: { w: 5, d: 5 },
  laundry: { w: 5, d: 5 },
  hallway: { w: 3, d: 3 },
  closet: { w: 2, d: 2 },
  outdoor: { w: 6, d: 6 },
};

export function minDims(kind: RoomKind): { w: number; d: number } {
  return MIN_DIMS[kind] ?? { w: 5, d: 5 };
}

export interface Envelope {
  widthFt: number;
  depthFt: number;
}

export type EditResult =
  | { ok: true; model: ParametricModel; summary: string }
  | { ok: false; error: string };

function rectsOverlap(a: Room, b: Room): boolean {
  const [ax, ay, aw, ad] = a.rect;
  const [bx, by, bw, bd] = b.rect;
  // Touching edges are fine — shared walls are how houses work. Only real
  // area intersection is a conflict, with a hair of tolerance for floats.
  const eps = 1e-6;
  return ax < bx + bw - eps && bx < ax + aw - eps && ay < by + bd - eps && by < ay + ad - eps;
}

/** Every room the moved/resized room would now collide with, by label. */
function collisions(model: ParametricModel, candidate: Room): string[] {
  return model.rooms
    .filter((r) => r.key !== candidate.key && r.level === candidate.level && rectsOverlap(r, candidate))
    .map((r) => r.label);
}

function outsideEnvelope(room: Room, envelope: Envelope): string | null {
  const [x, y, w, d] = room.rect;
  if (x < -1e-6 || y < -1e-6) return "past the front or side setback";
  if (x + w > envelope.widthFt + 1e-6) return `past the buildable width (${envelope.widthFt} ft)`;
  if (y + d > envelope.depthFt + 1e-6) return `past the buildable depth (${envelope.depthFt} ft)`;
  return null;
}

function listLabels(labels: string[]): string {
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

/**
 * Re-seat a room's openings after its walls moved. An opening's offset is
 * measured along its wall, so a shortened wall can strand one past the end;
 * we slide it back to the nearest legal spot rather than dropping it. An
 * opening wider than the wall it lives on is removed and reported — a
 * 6-foot slider cannot survive on a 4-foot wall.
 */
function reseatOpenings(
  model: ParametricModel,
  room: Room,
): { openings: ParametricModel["openings"]; dropped: number } {
  const [, , w, d] = room.rect;
  let dropped = 0;
  const openings = model.openings.flatMap((o) => {
    if (o.roomKey !== room.key) return [o];
    const wallLength = o.wall === "n" || o.wall === "s" ? w : d;
    if (o.widthFt > wallLength) {
      dropped += 1;
      return [];
    }
    // offsetFt is a left edge, so the last legal position is one width in
    // from the far corner — clamping to half-widths let an opening's far half
    // slide past the end of its wall.
    const clamped = Math.min(Math.max(o.offsetFt, 0), wallLength - o.widthFt);
    return [{ ...o, offsetFt: snap(clamped) }];
  });
  return { openings, dropped };
}

function withRoom(model: ParametricModel, next: Room): { model: ParametricModel; note: string } {
  const { openings, dropped } = reseatOpenings(model, next);
  return {
    model: {
      ...model,
      rooms: model.rooms.map((r) => (r.key === next.key ? next : r)),
      openings,
    },
    // Never let a wall swallow a window quietly — the summary says so, and
    // it lands in the revision history where the change is reviewable.
    note: dropped > 0 ? ` (${dropped} opening${dropped === 1 ? "" : "s"} removed — no wall left to hold ${dropped === 1 ? "it" : "them"})` : "",
  };
}

/** Move a room by a delta in feet, snapped to the grid. */
export function moveRoom(
  model: ParametricModel,
  roomKey: string,
  dxFt: number,
  dyFt: number,
  envelope: Envelope,
): EditResult {
  const room = model.rooms.find((r) => r.key === roomKey);
  if (!room) return { ok: false, error: "That room is no longer part of this plan." };

  const [x, y, w, d] = room.rect;
  const next: Room = { ...room, rect: [snap(x + dxFt), snap(y + dyFt), w, d] };
  if (next.rect[0] === x && next.rect[1] === y) {
    return { ok: false, error: "Nothing moved — drag further than six inches to make a change." };
  }

  const out = outsideEnvelope(next, envelope);
  if (out) return { ok: false, error: `${room.label} would sit ${out}. Move it back inside the buildable area.` };

  const hits = collisions(model, next);
  if (hits.length > 0) {
    return { ok: false, error: `${room.label} would overlap ${listLabels(hits)}. Move that room first, or leave a gap.` };
  }

  const applied = withRoom(model, next);
  return {
    ok: true,
    model: applied.model,
    summary: `Moved ${room.label} to ${next.rect[0]}′ × ${next.rect[1]}′${applied.note}`,
  };
}

export type Edge = "n" | "s" | "e" | "w";

/**
 * Drag one wall of a room. Positive `deltaFt` always grows the room, in
 * whichever direction that edge faces — the direct-manipulation contract a
 * hand on a wall expects.
 */
export function resizeRoom(
  model: ParametricModel,
  roomKey: string,
  edge: Edge,
  deltaFt: number,
  envelope: Envelope,
): EditResult {
  const room = model.rooms.find((r) => r.key === roomKey);
  if (!room) return { ok: false, error: "That room is no longer part of this plan." };

  const [x, y, w, d] = room.rect;
  const delta = snap(deltaFt);
  if (delta === 0) {
    return { ok: false, error: "Nothing changed — drag further than six inches to move a wall." };
  }

  let rect: [number, number, number, number];
  if (edge === "n") rect = [x, snap(y - delta), w, snap(d + delta)];
  else if (edge === "s") rect = [x, y, w, snap(d + delta)];
  else if (edge === "w") rect = [snap(x - delta), y, snap(w + delta), d];
  else rect = [x, y, snap(w + delta), d];

  const min = minDims(room.kind);
  if (rect[2] < min.w || rect[3] < min.d) {
    return {
      ok: false,
      error: `A ${room.label.toLowerCase()} needs at least ${min.w}′ × ${min.d}′ to work. Shrink a different wall, or move the room instead.`,
    };
  }

  const next: Room = { ...room, rect };
  const out = outsideEnvelope(next, envelope);
  if (out) return { ok: false, error: `${room.label} would extend ${out}. The buildable area is the lot minus its setbacks.` };

  const hits = collisions(model, next);
  if (hits.length > 0) {
    return { ok: false, error: `${room.label} would overlap ${listLabels(hits)}. Move that room first, or stop the wall short.` };
  }

  const applied = withRoom(model, next);
  return {
    ok: true,
    model: applied.model,
    summary: `Resized ${room.label} to ${rect[2]}′ × ${rect[3]}′${applied.note}`,
  };
}

/** Slide a door or window along the wall it lives on. */
export function moveOpening(model: ParametricModel, openingKey: string, offsetFt: number): EditResult {
  const opening = model.openings.find((o) => o.key === openingKey);
  if (!opening) return { ok: false, error: "That door or window is no longer part of this plan." };
  const room = model.rooms.find((r) => r.key === opening.roomKey);
  if (!room) return { ok: false, error: "That door or window has no room to sit on." };

  const [, , w, d] = room.rect;
  const wallLength = opening.wall === "n" || opening.wall === "s" ? w : d;
  const half = opening.widthFt / 2;
  if (opening.widthFt > wallLength) {
    return { ok: false, error: `This ${opening.kind} is wider than the wall it sits on — widen ${room.label} first.` };
  }

  const target = snap(offsetFt);
  if (target < half || target > wallLength - half) {
    return {
      ok: false,
      error: `A ${opening.widthFt}′ ${opening.kind} has to stay between ${half}′ and ${wallLength - half}′ along this wall — it needs wall on both sides.`,
    };
  }
  if (target === opening.offsetFt) {
    return { ok: false, error: "Nothing moved — drag further than six inches to make a change." };
  }

  const label = opening.kind === "opening" ? "opening" : opening.kind;
  return {
    ok: true,
    model: {
      ...model,
      openings: model.openings.map((o) => (o.key === openingKey ? { ...o, offsetFt: target } : o)),
    },
    summary: `Moved a ${label} on ${room.label} to ${target}′ along the ${WALL_NAMES[opening.wall]} wall`,
  };
}

const WALL_NAMES: Record<"n" | "s" | "e" | "w", string> = {
  n: "north",
  s: "south",
  e: "east",
  w: "west",
};

/**
 * Whether the whole model still satisfies the hard rules. Used to guard
 * edits applied to a plan that was generated before a rule existed, so the
 * editor never reports a pre-existing problem as the user's doing.
 */
export function layoutProblems(model: ParametricModel, envelope: Envelope): string[] {
  const problems: string[] = [];
  for (const room of model.rooms) {
    const out = outsideEnvelope(room, envelope);
    if (out) problems.push(`${room.label} sits ${out}.`);
  }
  const seen = new Set<string>();
  for (const a of model.rooms) {
    for (const b of model.rooms) {
      if (a.key === b.key || a.level !== b.level) continue;
      const pairKey = [a.key, b.key].sort().join("|");
      if (seen.has(pairKey)) continue;
      if (rectsOverlap(a, b)) {
        seen.add(pairKey);
        problems.push(`${a.label} overlaps ${b.label}.`);
      }
    }
  }
  return problems;
}
