/**
 * Minor or major? The question a revision credit hangs on.
 *
 * The handoff draws the line by example: paint, flooring, cabinets, tile and
 * fixtures are minor; moving a staircase, adding a bedroom, changing the
 * footprint or relocating the kitchen are major. Rather than guess from the
 * words someone typed — "make the kitchen nicer" could be either — this
 * classifies the DIFFERENCE BETWEEN TWO MODELS. What actually changed in the
 * geometry is the only thing that can be judged consistently, and it gives
 * the same answer whether the change arrived by conversation, by the layout
 * editor, or by applying a value-engineering suggestion.
 *
 * Finish and material changes never reach here at all: they don't alter the
 * model, so they are free by construction, which is exactly right.
 *
 * Bias: when a change sits near a threshold it is treated as MINOR. A
 * customer who is wrongly charged a revision round feels cheated; one who
 * gets a borderline change for free feels well treated. The asymmetry is
 * deliberate.
 */

import type { ParametricModel, Room } from "../types";

/** Conditioned area — garages and outdoor rooms aren't living space. */
export function conditionedSqft(model: ParametricModel): number {
  return model.rooms
    .filter((r) => r.kind !== "garage" && r.kind !== "outdoor")
    .reduce((sum, r) => sum + r.rect[2] * r.rect[3], 0);
}

function footprint(model: ParametricModel): { widthFt: number; depthFt: number } {
  if (model.rooms.length === 0) return { widthFt: 0, depthFt: 0 };
  const maxX = Math.max(...model.rooms.map((r) => r.rect[0] + r.rect[2]));
  const maxY = Math.max(...model.rooms.map((r) => r.rect[1] + r.rect[3]));
  const minX = Math.min(...model.rooms.map((r) => r.rect[0]));
  const minY = Math.min(...model.rooms.map((r) => r.rect[1]));
  return { widthFt: maxX - minX, depthFt: maxY - minY };
}

/** Distance a room's near corner travelled between models. */
function moved(before: Room, after: Room): number {
  return Math.hypot(after.rect[0] - before.rect[0], after.rect[1] - before.rect[1]);
}

/** Thresholds, in one place so they can be argued with as a unit. */
export const MAJOR = {
  /** Share of conditioned area that counts as a real size change. */
  sqftFraction: 0.05,
  /** …but never call a change major below this absolute area. */
  sqftFloor: 120,
  /** Footprint growth that changes the building's outline on the site. */
  footprintFt: 2,
  /** A room that travels this far has been relocated, not adjusted. */
  relocationFt: 6,
};

export interface RevisionScope {
  major: boolean;
  /** Plain-language reasons, shown before a credit is spent. */
  reasons: string[];
}

export function classifyRevision(before: ParametricModel, after: ParametricModel): RevisionScope {
  const reasons: string[] = [];

  if (after.levels !== before.levels) {
    reasons.push(
      after.levels > before.levels
        ? `Added a floor (${before.levels} → ${after.levels})`
        : `Removed a floor (${before.levels} → ${after.levels})`,
    );
  }

  const beforeKeys = new Set(before.rooms.map((r) => r.key));
  const afterKeys = new Set(after.rooms.map((r) => r.key));
  const added = after.rooms.filter((r) => !beforeKeys.has(r.key));
  const removed = before.rooms.filter((r) => !afterKeys.has(r.key));
  if (added.length > 0) reasons.push(`Added ${added.map((r) => r.label).join(", ")}`);
  if (removed.length > 0) reasons.push(`Removed ${removed.map((r) => r.label).join(", ")}`);

  const sqftBefore = conditionedSqft(before);
  const sqftAfter = conditionedSqft(after);
  const sqftDelta = Math.abs(sqftAfter - sqftBefore);
  if (sqftDelta > MAJOR.sqftFloor && sqftDelta > sqftBefore * MAJOR.sqftFraction) {
    reasons.push(
      `Living area changed by ${Math.round(sqftDelta).toLocaleString()} sq ft ` +
        `(${Math.round(sqftBefore).toLocaleString()} → ${Math.round(sqftAfter).toLocaleString()})`,
    );
  }

  const fpBefore = footprint(before);
  const fpAfter = footprint(after);
  if (
    Math.abs(fpAfter.widthFt - fpBefore.widthFt) > MAJOR.footprintFt ||
    Math.abs(fpAfter.depthFt - fpBefore.depthFt) > MAJOR.footprintFt
  ) {
    reasons.push(
      `Footprint changed from ${Math.round(fpBefore.widthFt)}′ × ${Math.round(fpBefore.depthFt)}′ ` +
        `to ${Math.round(fpAfter.widthFt)}′ × ${Math.round(fpAfter.depthFt)}′`,
    );
  }

  const relocated = after.rooms.filter((room) => {
    const was = before.rooms.find((r) => r.key === room.key);
    return was ? moved(was, room) > MAJOR.relocationFt : false;
  });
  if (relocated.length > 0) {
    reasons.push(`Relocated ${relocated.map((r) => r.label).join(", ")}`);
  }

  return { major: reasons.length > 0, reasons };
}

export const MAJOR_REVISION_NOTICE =
  "This is a major revision — it uses one of your project's revision rounds.";

/** What the customer is told when the rounds are gone. */
export function majorRevisionExhausted(kindLabel = "major revisions"): string {
  return (
    `This project has used all of its included ${kindLabel}. ` +
    `Minor changes — finishes, fixtures, furniture, and small adjustments — stay free and unlimited. ` +
    `A major redesign add-on is available on the project page.`
  );
}
