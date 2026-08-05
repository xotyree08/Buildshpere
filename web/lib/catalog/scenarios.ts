/**
 * Budget scenarios (spec BS-COST-004): named finish-tier presets priced
 * side by side, never overwriting the customer's actual selections —
 * "custom" IS their current selections, shown alongside. Deterministic:
 * each scenario is just a FinishSelections preset run through the same
 * estimate engine as everything else.
 */

import type { FinishSelections } from "./materials";

export interface BudgetScenario {
  key: "target" | "base" | "premium";
  label: string;
  blurb: string;
  finishes: FinishSelections;
}

export const SCENARIOS: BudgetScenario[] = [
  {
    key: "target",
    label: "Target",
    blurb: "Builder-tier selections across the board — the disciplined floor.",
    finishes: {
      flooring: "laminate",
      countertops: "laminate",
      cabinets: "stock",
      appliances: "builder",
      lighting: "builder",
      paint: "standard",
      siding: "vinyl",
      roofing: "asphalt_3tab",
      windows: "builder_vinyl",
    },
  },
  {
    key: "base",
    label: "Base",
    blurb: "The standard tier — the defaults every estimate starts from.",
    finishes: {
      flooring: "engineered",
      countertops: "quartz",
      cabinets: "semi_custom",
      appliances: "standard",
      lighting: "standard",
      paint: "standard",
      siding: "fiber_cement",
      roofing: "architectural_shingle",
      windows: "vinyl_lowe",
    },
  },
  {
    key: "premium",
    label: "Premium",
    blurb: "Premium-tier selections without stepping into luxury pricing.",
    finishes: {
      flooring: "hardwood",
      countertops: "quartzite",
      cabinets: "semi_custom",
      appliances: "premium",
      lighting: "designer",
      paint: "premium",
      siding: "cedar",
      roofing: "metal_standing_seam",
      windows: "clad_wood",
    },
  },
];
