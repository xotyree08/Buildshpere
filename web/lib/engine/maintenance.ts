/**
 * Ownership sphere: the maintenance plan. Generated from the exact
 * materials the customer chose — a slate roof and a 3-tab roof produce
 * different calendars, because they genuinely have different lives.
 * Deterministic (ADR-007); costs are honest BANDS, not fake precision (L8).
 * An unknown material key fails loudly (L2) instead of silently dropping
 * that system from the plan.
 */

import {
  APPLIANCES,
  DEFAULT_FINISHES,
  FLOORING,
  ROOFING,
  SIDING,
  WINDOWS,
  type FinishSelections,
} from "../catalog/materials";

export type CostBand = "diy" | "minor" | "moderate" | "major";

export const COST_BAND_LABELS: Record<CostBand, string> = {
  diy: "DIY / supplies only",
  minor: "typically under $500",
  moderate: "typically $500–$2,500",
  major: "typically over $2,500",
};

export interface MaintenanceTask {
  system: string;
  action: string;
  /** Interval in years; 0.25 = quarterly, 0.5 = twice a year. */
  intervalYears: number;
  costBand: CostBand;
}

export interface CapitalReplacement {
  system: string;
  item: string;
  atYear: number;
  costBand: CostBand;
}

export interface MaintenancePlan {
  /** Sub-annual routines (filters, gutters) — habit, not calendar. */
  routines: MaintenanceTask[];
  /** Annual-or-longer recurring work, drives the year calendar. */
  recurring: MaintenanceTask[];
  replacements: CapitalReplacement[];
  horizonYears: number;
  notes: string[];
}

interface MaterialProfile {
  tasks: Omit<MaintenanceTask, "system">[];
  /** Expected service life in years → capital replacement entry. */
  lifeYears: number;
  replaceBand: CostBand;
}

const ROOFING_PROFILES: Record<string, MaterialProfile> = {
  asphalt_3tab: { tasks: [{ action: "Inspect shingles, flashing, and sealant", intervalYears: 1, costBand: "diy" }], lifeYears: 18, replaceBand: "major" },
  architectural_shingle: { tasks: [{ action: "Inspect shingles, flashing, and sealant", intervalYears: 1, costBand: "diy" }], lifeYears: 25, replaceBand: "major" },
  metal_standing_seam: { tasks: [{ action: "Inspect panels and check fastener torque", intervalYears: 2, costBand: "minor" }], lifeYears: 50, replaceBand: "major" },
  cedar_shake: { tasks: [{ action: "Treat shakes and clear debris from keyways", intervalYears: 5, costBand: "moderate" }], lifeYears: 30, replaceBand: "major" },
  clay_tile: { tasks: [{ action: "Inspect for cracked tiles and slipped underlayment", intervalYears: 2, costBand: "minor" }], lifeYears: 75, replaceBand: "major" },
  slate: { tasks: [{ action: "Professional slate inspection", intervalYears: 5, costBand: "minor" }], lifeYears: 100, replaceBand: "major" },
};

const SIDING_PROFILES: Record<string, MaterialProfile> = {
  vinyl: { tasks: [{ action: "Wash siding and inspect for cracked panels", intervalYears: 1, costBand: "diy" }], lifeYears: 30, replaceBand: "major" },
  engineered_wood: { tasks: [{ action: "Repaint and recaulk joints", intervalYears: 8, costBand: "major" }], lifeYears: 30, replaceBand: "major" },
  fiber_cement: { tasks: [{ action: "Recaulk joints and touch up paint", intervalYears: 5, costBand: "minor" }, { action: "Full repaint", intervalYears: 12, costBand: "major" }], lifeYears: 50, replaceBand: "major" },
  stucco: { tasks: [{ action: "Inspect and patch hairline cracks", intervalYears: 1, costBand: "diy" }, { action: "Professional patch and recoat", intervalYears: 10, costBand: "moderate" }], lifeYears: 60, replaceBand: "major" },
  cedar: { tasks: [{ action: "Re-stain or re-oil cedar", intervalYears: 4, costBand: "moderate" }], lifeYears: 25, replaceBand: "major" },
  brick_veneer: { tasks: [{ action: "Inspect mortar joints; repoint as needed", intervalYears: 10, costBand: "moderate" }], lifeYears: 100, replaceBand: "major" },
};

const WINDOW_PROFILES: Record<string, MaterialProfile> = {
  builder_vinyl: { tasks: [{ action: "Recaulk exterior window perimeters", intervalYears: 5, costBand: "diy" }], lifeYears: 20, replaceBand: "major" },
  vinyl_lowe: { tasks: [{ action: "Recaulk exterior window perimeters", intervalYears: 5, costBand: "diy" }], lifeYears: 25, replaceBand: "major" },
  fiberglass: { tasks: [{ action: "Recaulk and check weatherstripping", intervalYears: 5, costBand: "diy" }], lifeYears: 40, replaceBand: "major" },
  clad_wood: { tasks: [{ action: "Inspect cladding seals and interior wood finish", intervalYears: 3, costBand: "minor" }], lifeYears: 40, replaceBand: "major" },
  steel: { tasks: [{ action: "Inspect glazing seals and touch up frame finish", intervalYears: 3, costBand: "minor" }], lifeYears: 50, replaceBand: "major" },
};

const FLOORING_PROFILES: Record<string, MaterialProfile> = {
  carpet: { tasks: [{ action: "Deep-clean carpet", intervalYears: 1, costBand: "minor" }], lifeYears: 10, replaceBand: "moderate" },
  laminate: { tasks: [], lifeYears: 15, replaceBand: "moderate" },
  lvp: { tasks: [], lifeYears: 20, replaceBand: "moderate" },
  polished_concrete: { tasks: [{ action: "Reseal polished concrete", intervalYears: 5, costBand: "moderate" }], lifeYears: 100, replaceBand: "major" },
  engineered: { tasks: [{ action: "Screen and recoat wood finish", intervalYears: 7, costBand: "moderate" }], lifeYears: 30, replaceBand: "major" },
  tile: { tasks: [{ action: "Regrout and reseal wet areas", intervalYears: 10, costBand: "moderate" }], lifeYears: 50, replaceBand: "major" },
  hardwood: { tasks: [{ action: "Refinish solid hardwood", intervalYears: 10, costBand: "major" }], lifeYears: 80, replaceBand: "major" },
  wide_plank_oak: { tasks: [{ action: "Refinish wide-plank oak", intervalYears: 10, costBand: "major" }], lifeYears: 80, replaceBand: "major" },
};

const APPLIANCE_PROFILES: Record<string, MaterialProfile> = {
  builder: { tasks: [], lifeYears: 10, replaceBand: "moderate" },
  standard: { tasks: [], lifeYears: 12, replaceBand: "moderate" },
  premium: { tasks: [{ action: "Service refrigeration coils and range", intervalYears: 2, costBand: "minor" }], lifeYears: 14, replaceBand: "major" },
  luxury: { tasks: [{ action: "Annual professional appliance service", intervalYears: 1, costBand: "minor" }], lifeYears: 18, replaceBand: "major" },
};

/** Systems every home has, regardless of selections. */
const UNIVERSAL_ROUTINES: MaintenanceTask[] = [
  { system: "HVAC", action: "Replace air filters", intervalYears: 0.25, costBand: "diy" },
  { system: "Gutters", action: "Clean gutters and check downspout drainage", intervalYears: 0.5, costBand: "diy" },
  { system: "Safety", action: "Test smoke/CO detectors", intervalYears: 0.5, costBand: "diy" },
];

const UNIVERSAL_RECURRING: MaintenanceTask[] = [
  { system: "HVAC", action: "Professional HVAC service (heating + cooling)", intervalYears: 1, costBand: "minor" },
  { system: "Water heater", action: "Flush water heater tank", intervalYears: 1, costBand: "diy" },
  { system: "Safety", action: "Replace smoke/CO detector units", intervalYears: 10, costBand: "minor" },
  { system: "Site", action: "Check grading and drainage away from foundation", intervalYears: 1, costBand: "diy" },
];

const UNIVERSAL_REPLACEMENTS: CapitalReplacement[] = [
  { system: "HVAC", item: "Heating & cooling equipment", atYear: 15, costBand: "major" },
  { system: "Water heater", item: "Water heater", atYear: 12, costBand: "moderate" },
];

function profileFor(
  table: Record<string, MaterialProfile>,
  key: string,
  system: string,
): MaterialProfile {
  const profile = table[key];
  if (!profile) {
    throw new Error(
      `No maintenance profile for ${system} option "${key}" — add it to maintenance.ts so the plan doesn't silently skip a system.`,
    );
  }
  return profile;
}

const HORIZON_YEARS = 30;

export function buildMaintenancePlan(finishes: FinishSelections = {}): MaintenancePlan {
  const selections: { system: string; label: string; profile: MaterialProfile }[] = [
    {
      system: "Roof",
      label: ROOFING.find((o) => o.key === (finishes.roofing ?? DEFAULT_FINISHES.roofing))?.label ?? "",
      profile: profileFor(ROOFING_PROFILES, finishes.roofing ?? DEFAULT_FINISHES.roofing, "roofing"),
    },
    {
      system: "Siding",
      label: SIDING.find((o) => o.key === (finishes.siding ?? DEFAULT_FINISHES.siding))?.label ?? "",
      profile: profileFor(SIDING_PROFILES, finishes.siding ?? DEFAULT_FINISHES.siding, "siding"),
    },
    {
      system: "Windows",
      label: WINDOWS.find((o) => o.key === (finishes.windows ?? DEFAULT_FINISHES.windows))?.label ?? "",
      profile: profileFor(WINDOW_PROFILES, finishes.windows ?? DEFAULT_FINISHES.windows, "windows"),
    },
    {
      system: "Flooring",
      label: FLOORING.find((o) => o.key === (finishes.flooring ?? DEFAULT_FINISHES.flooring))?.label ?? "",
      profile: profileFor(FLOORING_PROFILES, finishes.flooring ?? DEFAULT_FINISHES.flooring, "flooring"),
    },
    {
      system: "Appliances",
      label: APPLIANCES.find((o) => o.key === (finishes.appliances ?? DEFAULT_FINISHES.appliances))?.label ?? "",
      profile: profileFor(APPLIANCE_PROFILES, finishes.appliances ?? DEFAULT_FINISHES.appliances, "appliances"),
    },
  ];

  const recurring: MaintenanceTask[] = [...UNIVERSAL_RECURRING];
  const replacements: CapitalReplacement[] = [...UNIVERSAL_REPLACEMENTS];

  for (const sel of selections) {
    for (const task of sel.profile.tasks) {
      recurring.push({ system: `${sel.system} (${sel.label})`, ...task });
    }
    if (sel.profile.lifeYears <= HORIZON_YEARS) {
      replacements.push({
        system: sel.system,
        item: `${sel.label} — end of typical service life`,
        atYear: sel.profile.lifeYears,
        costBand: sel.profile.replaceBand,
      });
    }
  }

  return {
    routines: UNIVERSAL_ROUTINES,
    recurring: recurring.filter((t) => t.intervalYears >= 1).sort((a, b) => a.intervalYears - b.intervalYears),
    replacements: replacements.sort((a, b) => a.atYear - b.atYear),
    horizonYears: HORIZON_YEARS,
    notes: [
      "Intervals and service lives are typical for the material — climate, exposure, and workmanship move them. Cost bands are honest ranges, not quotes.",
      "Warranty terms may require documented maintenance — keep receipts with your home records.",
      "This plan regenerates when you change materials, so it always matches the home as designed.",
    ],
  };
}

/** The year-by-year calendar: what's due in each year of the horizon. */
export function maintenanceCalendar(plan: MaintenancePlan): { year: number; due: { what: string; costBand: CostBand }[] }[] {
  const years: { year: number; due: { what: string; costBand: CostBand }[] }[] = [];
  for (let year = 1; year <= plan.horizonYears; year++) {
    const due: { what: string; costBand: CostBand }[] = [];
    for (const t of plan.recurring) {
      if (t.intervalYears >= 1 && year % Math.round(t.intervalYears) === 0) {
        due.push({ what: `${t.system}: ${t.action}`, costBand: t.costBand });
      }
    }
    for (const r of plan.replacements) {
      if (r.atYear === year) due.push({ what: `${r.system}: ${r.item}`, costBand: r.costBand });
    }
    if (due.length > 0) years.push({ year, due });
  }
  return years;
}
