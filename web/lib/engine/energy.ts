/**
 * Energy & efficiency engine: a first-order steady-state envelope model
 * (UA × degree-days) from the real geometry and the chosen windows.
 * Deterministic (ADR-007) and honest about being a planning band — a
 * certified HERS rating comes from an energy rater, not from us (L8).
 */

import type { ParametricModel } from "../types";
import { estimateRevision, takeoff, type EstimateFinishes } from "./estimate";
import { WINDOWS } from "../catalog/materials";

/** Whole-window U-factors (Btu/hr·ft²·°F) by catalog option. */
const WINDOW_U: Record<string, number> = {
  builder_vinyl: 0.32,
  vinyl_lowe: 0.29,
  fiberglass: 0.26,
  clad_wood: 0.28,
  steel: 0.4,
};

/** Heating / cooling degree days (base 65°F) by pricing region. */
const DEGREE_DAYS: Record<string, { hdd: number; cdd: number }> = {
  US_NATIONAL: { hdd: 4500, cdd: 1200 },
  US_SOUTH: { hdd: 2500, cdd: 2200 },
  US_MIDWEST: { hdd: 6200, cdd: 900 },
  US_NORTHEAST: { hdd: 5800, cdd: 800 },
  US_WEST: { hdd: 3000, cdd: 1000 },
};

const WALL_R = 21; // code-minimum assembly
const ROOF_R = 38;
const SLAB_U = 0.05;
const WINDOW_SQFT = 16; // 4 ft × 4 ft (sill 3 → head 7)
const CEILING_FT = 9;
const NATURAL_ACH = 0.25; // ~ACH50 5 for new construction
const FURNACE_EFF = 0.95;
const SEER = 15;
const THERM_USD = 1.5;
const KWH_USD = 0.17;
const BAND_PCT = 0.25;

export interface EnergyComponent {
  name: string;
  ua: number;
  sharePct: number;
}

export interface EnergyUpgrade {
  description: string;
  savingsPerYearCents: number;
  /** Real price delta from the estimate engine; null for advisory-only. */
  extraCostCents: number | null;
  paybackYears: number | null;
}

export interface EnergyReport {
  components: EnergyComponent[];
  totalUa: number;
  heatingCostCents: number;
  coolingCostCents: number;
  annualLowCents: number;
  annualHighCents: number;
  windowLabel: string;
  regionCode: string;
  upgrades: EnergyUpgrade[];
  notes: string[];
}

interface Envelope {
  wallUa: number;
  windowUa: number;
  roofUa: number;
  slabUa: number;
  infiltrationUa: number;
  windowCount: number;
}

function envelope(model: ParametricModel, windowKey: string): Envelope {
  const q = takeoff(model);
  const windowArea = q.windows * WINDOW_SQFT;
  const grossWallArea = q.exteriorWallGrossSqft;
  const wallArea = Math.max(0, grossWallArea - windowArea);
  // The thermal roof is the CEILING plane over conditioned space, not the
  // sloped surface: in a vented attic the insulation sits flat on the ceiling,
  // so a steeper roof adds no heat loss. The old line applied a 1.15 slope
  // factor to the sloped area AND folded in the unheated garage, inflating
  // this on both counts. Slab area still follows the ground floor.
  const footprint = q.grossFootprintSqft;
  const ceilingSqft = q.roofCoveredSqft - q.garageSqft;
  const volume = q.livableSqft * CEILING_FT;
  const windowU = WINDOW_U[windowKey] ?? WINDOW_U.vinyl_lowe;
  return {
    wallUa: wallArea / WALL_R,
    windowUa: windowArea * windowU,
    roofUa: Math.max(0, ceilingSqft) / ROOF_R,
    slabUa: footprint * SLAB_U,
    infiltrationUa: 0.018 * volume * NATURAL_ACH,
    windowCount: q.windows,
  };
}

function annualCosts(totalUa: number, regionCode: string): { heating: number; cooling: number } {
  const dd = DEGREE_DAYS[regionCode] ?? DEGREE_DAYS.US_NATIONAL;
  const heatingBtu = totalUa * 24 * dd.hdd;
  const coolingBtu = totalUa * 24 * dd.cdd;
  const therms = heatingBtu / FURNACE_EFF / 100_000;
  const kwh = coolingBtu / (SEER * 1000);
  return {
    heating: Math.round(therms * THERM_USD * 100),
    cooling: Math.round(kwh * KWH_USD * 100),
  };
}

export function buildEnergyReport(
  model: ParametricModel,
  regionCode: string = "US_NATIONAL",
  finishes: EstimateFinishes = {},
): EnergyReport {
  const windowKey = finishes.windows ?? "vinyl_lowe";
  const env = envelope(model, windowKey);
  const totalUa = env.wallUa + env.windowUa + env.roofUa + env.slabUa + env.infiltrationUa;
  const { heating, cooling } = annualCosts(totalUa, regionCode);
  const annual = heating + cooling;

  const components: EnergyComponent[] = [
    { name: "Walls", ua: env.wallUa, sharePct: 0 },
    { name: `Windows (${env.windowCount})`, ua: env.windowUa, sharePct: 0 },
    { name: "Roof", ua: env.roofUa, sharePct: 0 },
    { name: "Slab & floors", ua: env.slabUa, sharePct: 0 },
    { name: "Air leakage", ua: env.infiltrationUa, sharePct: 0 },
  ].map((c) => ({ ...c, sharePct: Math.round((c.ua / totalUa) * 100) }));

  // Upgrades with real numbers: step the windows up one catalog rung and
  // price the delta through the same estimate engine the budget uses.
  const upgrades: EnergyUpgrade[] = [];
  const idx = WINDOWS.findIndex((w) => w.key === windowKey);
  const better = idx >= 0 && idx < WINDOWS.length - 1 ? WINDOWS[idx + 1] : null;
  if (better && (WINDOW_U[better.key] ?? 1) < (WINDOW_U[windowKey] ?? 1)) {
    const upEnv = envelope(model, better.key);
    const upUa = upEnv.wallUa + upEnv.windowUa + upEnv.roofUa + upEnv.slabUa + upEnv.infiltrationUa;
    const upCosts = annualCosts(upUa, regionCode);
    const savings = annual - (upCosts.heating + upCosts.cooling);
    const base = estimateRevision(model, "energy-base", regionCode, finishes);
    const upgraded = estimateRevision(model, "energy-up", regionCode, { ...finishes, windows: better.key });
    const extra = upgraded.totalCents - base.totalCents;
    if (savings > 0) {
      upgrades.push({
        description: `Step windows up to ${better.label}`,
        savingsPerYearCents: savings,
        extraCostCents: extra,
        paybackYears: extra > 0 ? Math.round((extra / savings) * 10) / 10 : 0,
      });
    }
  }
  // Advisory: tighter air sealing (no priced line yet — labor practice).
  const tightUa = totalUa - env.infiltrationUa * 0.4;
  const tightCosts = annualCosts(tightUa, regionCode);
  const sealingSavings = annual - (tightCosts.heating + tightCosts.cooling);
  if (sealingSavings > 0) {
    upgrades.push({
      description: "Blower-door-guided air sealing (ACH50 5 → 3)",
      savingsPerYearCents: sealingSavings,
      extraCostCents: null,
      paybackYears: null,
    });
  }

  return {
    components,
    totalUa: Math.round(totalUa),
    heatingCostCents: heating,
    coolingCostCents: cooling,
    annualLowCents: Math.round(annual * (1 - BAND_PCT)),
    annualHighCents: Math.round(annual * (1 + BAND_PCT)),
    windowLabel: WINDOWS.find((w) => w.key === windowKey)?.label ?? windowKey,
    regionCode,
    upgrades,
    notes: [
      "First-order steady-state model: code-minimum R-21 walls / R-38 roof, regional degree days, $1.50/therm gas heat at 95% efficiency, SEER 15 cooling at $0.17/kWh. Your utility rates and climate will move these numbers — that's why it's a ±25% band.",
      "Solar gain, thermal mass, and occupant behavior are not modeled. A certified HERS rating comes from an independent energy rater during construction.",
      "Upgrade savings are computed by re-running this model; upgrade costs come from the same price book as your estimate.",
    ],
  };
}
