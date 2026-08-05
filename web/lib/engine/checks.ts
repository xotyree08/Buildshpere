/**
 * Design health checks: deterministic screening of a parametric model.
 * Each check returns pass/warn/fail with a human-readable detail and an
 * anchor into the plan. The composite Design Health Score is a weighted
 * average (pass=1, warn=0.5, fail=0) scaled to 0–100.
 *
 * These are screening heuristics, not engineering. Structural spans in
 * particular get real analysis in EngineerSphere (Phase 2).
 */

import type { CheckKey, CheckStatus, DesignCheckResult, ParametricModel, Room } from "../types";

type CheckFn = (model: ParametricModel) => Omit<DesignCheckResult, "revisionId" | "check">[];

function area(r: Room): number {
  return r.rect[2] * r.rect[3];
}

function minDim(r: Room): number {
  return Math.min(r.rect[2], r.rect[3]);
}

function result(
  status: CheckStatus,
  detail: string,
  location?: { roomKey?: string; openingKey?: string },
): Omit<DesignCheckResult, "revisionId" | "check"> {
  return { status, detail, location };
}

const checks: Record<CheckKey, CheckFn> = {
  door_swings: (m) => {
    const out = [];
    for (const room of m.rooms) {
      if (room.kind === "hallway" || room.kind === "outdoor") continue;
      const doors = m.openings.filter((o) => o.roomKey === room.key && o.kind !== "window");
      if (doors.length === 0) out.push(result("fail", `${room.label} has no door.`, { roomKey: room.key }));
      else if (doors.some((d) => d.widthFt > room.rect[2] / 2 && d.kind === "door"))
        out.push(result("warn", `${room.label}'s door swing dominates the wall.`, { roomKey: room.key }));
    }
    return out.length ? out : [result("pass", "Every room has a workable door.")];
  },

  hallway_widths: (m) => {
    const halls = m.rooms.filter((r) => r.kind === "hallway");
    if (halls.length === 0) return [result("warn", "No dedicated hallway; circulation runs through rooms.")];
    const out = halls.map((h) => {
      const w = minDim(h);
      if (w >= 3.5) return result("pass", `${h.label} is ${w} ft wide.`, { roomKey: h.key });
      if (w >= 3) return result("warn", `${h.label} is ${w} ft — tight for furniture moves.`, { roomKey: h.key });
      return result("fail", `${h.label} is ${w} ft — below comfortable minimum.`, { roomKey: h.key });
    });
    return out;
  },

  accessibility: (m) => {
    const out = [];
    const groundBath = m.rooms.some((r) => r.kind === "bathroom" && r.level === 0);
    if (!groundBath) out.push(result("fail", "No bathroom on the ground floor."));
    const narrowDoors = m.openings.filter((o) => o.kind === "door" && o.widthFt < 2.67);
    if (narrowDoors.length > 0)
      out.push(
        result("warn", `${narrowDoors.length} door(s) under 32" clear width.`, {
          openingKey: narrowDoors[0].key,
        }),
      );
    return out.length ? out : [result("pass", "Ground-floor bath present; door widths accessible.")];
  },

  furniture_clearance: (m) => {
    const tight = m.rooms.filter((r) => r.kind === "bedroom" && minDim(r) < 10);
    if (tight.length === 0) return [result("pass", "Bedrooms fit standard furniture with clearance.")];
    return tight.map((r) =>
      result("warn", `${r.label} is ${minDim(r)} ft at its narrowest — a queen set will be tight.`, {
        roomKey: r.key,
      }),
    );
  },

  kitchen_triangle: (m) => {
    const kitchen = m.rooms.find((r) => r.kind === "kitchen");
    if (!kitchen) return [result("fail", "No kitchen in plan.")];
    const a = area(kitchen);
    const aspect = Math.max(kitchen.rect[2], kitchen.rect[3]) / minDim(kitchen);
    if (a < 100) return [result("warn", `Kitchen is ${Math.round(a)} sqft — work triangle will be cramped.`, { roomKey: kitchen.key })];
    if (a > 350) return [result("warn", `Kitchen is ${Math.round(a)} sqft — triangle legs exceed comfortable reach.`, { roomKey: kitchen.key })];
    if (aspect > 2.5) return [result("warn", "Kitchen is a galley; triangle stretches along one axis.", { roomKey: kitchen.key })];
    return [result("pass", "Kitchen proportions support an efficient work triangle.", { roomKey: kitchen.key })];
  },

  storage: (m) => {
    const livable = m.rooms.filter((r) => r.kind !== "garage" && r.kind !== "outdoor").reduce((s, r) => s + area(r), 0);
    const storage = m.rooms.filter((r) => r.kind === "closet" || r.kind === "laundry").reduce((s, r) => s + area(r), 0);
    const pct = livable > 0 ? (storage / livable) * 100 : 0;
    if (pct >= 4) return [result("pass", `Storage is ${pct.toFixed(1)}% of livable area.`)];
    if (pct >= 2) return [result("warn", `Storage is only ${pct.toFixed(1)}% of livable area.`)];
    return [result("fail", "Effectively no dedicated storage.")];
  },

  natural_lighting: (m) => {
    const habitable = m.rooms.filter((r) =>
      ["bedroom", "living", "dining", "kitchen", "office", "gym", "theater"].includes(r.kind),
    );
    const out = [];
    for (const room of habitable) {
      const winArea = m.openings
        .filter((o) => o.roomKey === room.key && o.kind === "window")
        .reduce((s, o) => s + o.widthFt * 4, 0); // assume 4 ft window height
      const ratio = winArea / area(room);
      if (room.kind === "theater") continue; // dark by design
      if (ratio < 0.08)
        out.push(result("warn", `${room.label} glazing is ${(ratio * 100).toFixed(0)}% of floor area (target 8%+).`, { roomKey: room.key }));
    }
    return out.length ? out : [result("pass", "All habitable rooms meet the 8% glazing target.")];
  },

  privacy: (m) => {
    // Bedrooms should open to circulation, not to public rooms; with the
    // spine layout, doors face the hallway strip below the room row.
    const bedrooms = m.rooms.filter((r) => r.kind === "bedroom");
    const publicOnSameLevel = (lvl: number) =>
      m.rooms.some((r) => ["living", "dining", "kitchen"].includes(r.kind) && r.level === lvl);
    const exposed = bedrooms.filter((b) => b.level === 0 && publicOnSameLevel(0));
    if (bedrooms.length === 0) return [result("fail", "No bedrooms in plan.")];
    if (exposed.length === bedrooms.length && bedrooms.length > 1)
      return [result("warn", "All bedrooms share a level with public space; consider separating the primary suite.")];
    return [result("pass", "Bedroom placement maintains privacy from public areas.")];
  },

  hvac_space: (m) => {
    const mech = m.rooms.filter((r) => r.kind === "closet").reduce((s, r) => s + area(r), 0);
    if (mech >= 20) return [result("pass", `${Math.round(mech)} sqft available for mechanical.`)];
    if (mech > 0) return [result("warn", `Only ${Math.round(mech)} sqft for mechanical — air handler will be tight.`)];
    return [result("fail", "No mechanical space allocated.")];
  },

  structural_spans: (m) => {
    // Joists span a room's SHORT dimension — a long narrow hallway is
    // framed trivially; a 26-ft-clear great room is not.
    const wide = m.rooms.filter((r) => minDim(r) > 24);
    if (wide.length === 0) return [result("pass", "All spans within conventional framing.")];
    return wide.map((r) =>
      result(
        minDim(r) > 30 ? "fail" : "warn",
        `${r.label} spans ${minDim(r)} ft clear — needs engineered members (verify in EngineerSphere).`,
        { roomKey: r.key },
      ),
    );
  },
};

const WEIGHTS: Record<CheckKey, number> = {
  door_swings: 1,
  hallway_widths: 1,
  accessibility: 1.5,
  furniture_clearance: 1,
  kitchen_triangle: 1,
  storage: 0.75,
  natural_lighting: 1,
  privacy: 0.75,
  hvac_space: 1,
  structural_spans: 1.5,
};

export interface HealthReport {
  score: number;
  results: DesignCheckResult[];
}

export function runChecks(model: ParametricModel, revisionId: string): HealthReport {
  const results: DesignCheckResult[] = [];
  let weighted = 0;
  let totalWeight = 0;

  for (const key of Object.keys(checks) as CheckKey[]) {
    const found = checks[key](model).map((r) => ({ ...r, revisionId, check: key }));
    results.push(...found);
    // a check's contribution is its worst finding
    const worst: CheckStatus = found.some((f) => f.status === "fail")
      ? "fail"
      : found.some((f) => f.status === "warn")
        ? "warn"
        : "pass";
    weighted += WEIGHTS[key] * (worst === "pass" ? 1 : worst === "warn" ? 0.5 : 0);
    totalWeight += WEIGHTS[key];
  }

  return { score: Math.round((weighted / totalWeight) * 100), results };
}
