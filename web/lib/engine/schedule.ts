/**
 * Construction schedule engine: a deterministic milestone timeline sized
 * from the actual design (sqft, stories, scope), plus a payment draw
 * schedule mapped to the real hard-cost number. ADR-007: deterministic;
 * planning ranges, honestly labeled — not a builder's promise (L8).
 */

import type { Estimate, ParametricModel } from "../types";
import { takeoff } from "./estimate";

export interface Milestone {
  id: string;
  name: string;
  detail: string;
  startWeek: number;
  weeks: number;
  /** Trades on site during this milestone (matches bid package names). */
  trades: string[];
}

export interface Draw {
  milestoneId: string;
  name: string;
  pct: number;
  amountCents: number;
}

export interface ConstructionSchedule {
  milestones: Milestone[];
  totalWeeks: number;
  draws: Draw[];
  /** The construction contract amount draws are computed from (hard costs). */
  contractCents: number;
  notes: string[];
}

/** Categories excluded from the builder contract (owner-carried). */
const OWNER_CATEGORIES = new Set(["Soft Costs", "Contingency"]);

function weeksFor(sqft: number, base: number, perThousandSqft: number): number {
  return Math.max(1, Math.round(base + (sqft / 1000) * perThousandSqft));
}

/** Standard construction-loan draw structure; last draw absorbs rounding. */
const DRAW_PLAN: { milestoneId: string; name: string; pct: number }[] = [
  { milestoneId: "foundation", name: "Mobilization & foundation complete", pct: 20 },
  { milestoneId: "dryin", name: "Framed and dried-in", pct: 25 },
  { milestoneId: "roughin", name: "Rough-ins complete & inspected", pct: 20 },
  { milestoneId: "drywall", name: "Insulation & drywall complete", pct: 15 },
  { milestoneId: "finishes", name: "Interior finishes complete", pct: 10 },
  { milestoneId: "closeout", name: "Final completion & certificate of occupancy", pct: 10 },
];

export function buildSchedule(model: ParametricModel, estimate: Estimate): ConstructionSchedule {
  const q = takeoff(model);
  const sqft = q.livableSqft + q.garageSqft;
  const twoStory = q.levels === 2;

  const defs: Omit<Milestone, "startWeek">[] = [
    {
      id: "permits",
      name: "Permits & pre-construction",
      detail: "Permit review, builder contracts, utility applications. Duration varies widely by jurisdiction — confirm locally.",
      weeks: 8,
      trades: [],
    },
    {
      id: "sitework",
      name: "Sitework & excavation",
      detail: "Clearing, rough grading, excavation, temporary utilities.",
      weeks: 2,
      trades: ["Sitework, Concrete & Foundation"],
    },
    {
      id: "foundation",
      name: "Foundation",
      detail: "Footings, slab, cure time, and foundation inspection.",
      weeks: 3,
      trades: ["Sitework, Concrete & Foundation"],
    },
    {
      id: "framing",
      name: "Framing",
      detail: `Walls, floors, and roof structure${twoStory ? " across two stories" : ""}.`,
      weeks: weeksFor(sqft, twoStory ? 4 : 3, 1),
      trades: ["Framing & Structure"],
    },
    {
      id: "dryin",
      name: "Dry-in",
      detail: "Roofing, windows and exterior doors, house wrap — the weather-tight shell.",
      weeks: 3,
      trades: ["Roofing", "Windows & Exterior Doors"],
    },
    {
      id: "roughin",
      name: "Mechanical rough-ins",
      detail: "Plumbing, electrical, and HVAC rough-ins, then framing/MEP inspections.",
      weeks: 4,
      trades: ["Plumbing", "Electrical", "HVAC"],
    },
    {
      id: "drywall",
      name: "Insulation & drywall",
      detail: "Insulation inspection, hang, tape, and finish.",
      weeks: 3,
      trades: ["Drywall, Paint & Interior Trim"],
    },
    {
      id: "exterior",
      name: "Exterior cladding & flatwork",
      detail: "Siding, exterior paint, driveway and walks. Runs alongside interior work.",
      weeks: 3,
      trades: ["Exterior Cladding", "Sitework, Concrete & Foundation"],
    },
    {
      id: "finishes",
      name: "Interior finishes",
      detail: "Trim, paint, flooring, cabinets, countertops, tile.",
      weeks: weeksFor(q.livableSqft, 4, 1),
      trades: ["Drywall, Paint & Interior Trim", "Flooring", "Kitchen & Millwork"],
    },
    {
      id: "closeout",
      name: "Trim-out & closeout",
      detail: "Fixture and appliance install, punch list, final inspections, certificate of occupancy.",
      weeks: 3,
      trades: ["Plumbing", "Electrical", "HVAC"],
    },
  ];

  // Sequential timeline except exterior, which overlaps interior finishes.
  const milestones: Milestone[] = [];
  let cursor = 0;
  for (const def of defs) {
    if (def.id === "exterior") {
      // Starts with drywall; doesn't push the critical path unless longer.
      const drywall = milestones.find((m) => m.id === "drywall")!;
      milestones.push({ ...def, startWeek: drywall.startWeek });
      continue;
    }
    milestones.push({ ...def, startWeek: cursor });
    cursor += def.weeks;
  }
  const totalWeeks = Math.max(...milestones.map((m) => m.startWeek + m.weeks));

  const contractCents = Math.round(
    estimate.lineItems
      .filter((li) => !OWNER_CATEGORIES.has(li.category))
      .reduce((s, li) => s + li.qty * li.unitCostCents, 0),
  );

  let allocated = 0;
  const draws: Draw[] = DRAW_PLAN.map((d, i) => {
    const last = i === DRAW_PLAN.length - 1;
    const amountCents = last
      ? contractCents - allocated
      : Math.round((contractCents * d.pct) / 100);
    allocated += amountCents;
    return { ...d, amountCents };
  });

  return {
    milestones,
    totalWeeks,
    draws,
    contractCents,
    notes: [
      "Durations are typical planning ranges for this design's size — weather, inspections, and trade availability move real schedules. This is a planning tool, not a builder's commitment.",
      "Permit timelines vary from days to months by jurisdiction; confirm before contracting.",
      "Tie each draw to inspected, in-place work — never pay ahead of completed milestones.",
      "Soft costs and contingency are owner-carried and sit outside the builder contract and draws.",
    ],
  };
}
