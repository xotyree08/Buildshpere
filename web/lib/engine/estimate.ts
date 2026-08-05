/**
 * Takeoff + estimate engine: quantities derived from the parametric model,
 * priced from a unit-cost book with regional adjustment. Every estimate
 * carries a confidence range — at concept stage, ±15%.
 *
 * ADR-007: deterministic. The Value Engineer AI may narrate these numbers;
 * it never changes them.
 */

import type {
  Estimate,
  EstimateLineItem,
  HomeStyle,
  ParametricModel,
  ValueEngineeringSuggestion,
} from "../types";
import { applyRevision } from "./revise";
import {
  APPLIANCES,
  CABINETS,
  COUNTERTOPS,
  DEFAULT_FINISHES,
  FLOORING,
  LIGHTING,
  PAINT,
  ROOFING,
  SIDING,
  WINDOWS,
  pick,
  type FinishSelections,
} from "../catalog/materials";
import { styleInfo } from "../catalog/styles";

export interface EstimateFinishes extends FinishSelections {
  /** Architectural style; its cost factor scales structure & envelope. */
  styleKey?: HomeStyle;
}

/** Line-item categories the style cost factor applies to. */
const STYLE_SCALED = new Set(["Framing", "Roofing", "Exterior", "Windows & Doors"]);

/** Regional cost multipliers vs. national baseline. Grows into a real price book. */
const REGION_FACTORS: Record<string, number> = {
  US_NATIONAL: 1.0,
  US_SOUTH: 0.92,
  US_MIDWEST: 0.95,
  US_NORTHEAST: 1.18,
  US_WEST: 1.22,
};

interface Quantities {
  livableSqft: number;
  garageSqft: number;
  outdoorSqft: number;
  wallLf: number;
  doors: number;
  windows: number;
  baths: number;
  kitchens: number;
  levels: number;
}

export function takeoff(model: ParametricModel): Quantities {
  let livableSqft = 0;
  let garageSqft = 0;
  let outdoorSqft = 0;
  let wallLf = 0;
  let baths = 0;
  let kitchens = 0;

  for (const r of model.rooms) {
    const a = r.rect[2] * r.rect[3];
    const perimeter = 2 * (r.rect[2] + r.rect[3]);
    wallLf += perimeter / 2; // shared-wall discount
    if (r.kind === "garage") garageSqft += a;
    else if (r.kind === "outdoor") outdoorSqft += a;
    else livableSqft += a;
    if (r.kind === "bathroom") baths++;
    if (r.kind === "kitchen") kitchens++;
  }

  return {
    livableSqft: Math.round(livableSqft),
    garageSqft: Math.round(garageSqft),
    outdoorSqft: Math.round(outdoorSqft),
    wallLf: Math.round(wallLf),
    doors: model.openings.filter((o) => o.kind === "door").length,
    windows: model.openings.filter((o) => o.kind === "window").length,
    baths,
    kitchens,
    levels: model.levels,
  };
}

interface BookEntry {
  category: string;
  description: string;
  unit: string;
  unitCostCents: number;
  qty: (q: Quantities) => number;
  source: "takeoff" | "allowance";
}

const PRICE_BOOK: BookEntry[] = [
  { category: "Foundation", description: "Slab & footings", unit: "sqft", unitCostCents: 1400, qty: (q) => (q.livableSqft / q.levels) + q.garageSqft, source: "takeoff" },
  { category: "Framing", description: "Wall framing", unit: "lf", unitCostCents: 12500, qty: (q) => q.wallLf, source: "takeoff" },
  { category: "Framing", description: "Floor/roof structure", unit: "sqft", unitCostCents: 1800, qty: (q) => q.livableSqft + q.garageSqft, source: "takeoff" },
  { category: "Windows & Doors", description: "Doors", unit: "ea", unitCostCents: 35000, qty: (q) => q.doors, source: "takeoff" },
  { category: "Plumbing", description: "Bath rough-in & fixtures", unit: "bath", unitCostCents: 1250000, qty: (q) => q.baths, source: "takeoff" },
  { category: "Electrical", description: "Service, wiring, fixtures", unit: "sqft", unitCostCents: 950, qty: (q) => q.livableSqft, source: "takeoff" },
  { category: "HVAC", description: "Heating & cooling", unit: "sqft", unitCostCents: 850, qty: (q) => q.livableSqft, source: "takeoff" },
  { category: "Interior", description: "Drywall, paint, trim", unit: "sqft", unitCostCents: 1600, qty: (q) => q.livableSqft, source: "takeoff" },
  { category: "Outdoor", description: "Outdoor kitchen/living", unit: "sqft", unitCostCents: 6000, qty: (q) => q.outdoorSqft, source: "allowance" },
];

/** Finish-driven entries, resolved from the customer's selections. */
function finishBook(finishes: EstimateFinishes): BookEntry[] {
  const flooring = pick(FLOORING, finishes.flooring, DEFAULT_FINISHES.flooring);
  const counters = pick(COUNTERTOPS, finishes.countertops, DEFAULT_FINISHES.countertops);
  const cabinets = pick(CABINETS, finishes.cabinets, DEFAULT_FINISHES.cabinets);
  const appliances = pick(APPLIANCES, finishes.appliances, DEFAULT_FINISHES.appliances);
  const lighting = pick(LIGHTING, finishes.lighting, DEFAULT_FINISHES.lighting);
  const paint = pick(PAINT, finishes.paint, DEFAULT_FINISHES.paint);
  const siding = pick(SIDING, finishes.siding, DEFAULT_FINISHES.siding);
  const roofing = pick(ROOFING, finishes.roofing, DEFAULT_FINISHES.roofing);
  const windows = pick(WINDOWS, finishes.windows, DEFAULT_FINISHES.windows);

  const entries: BookEntry[] = [
    { category: "Roofing", description: `Roofing — ${roofing.label}`, unit: "sqft", unitCostCents: roofing.costPerSqftCents, qty: (q) => (q.livableSqft / q.levels) * 1.15 + q.garageSqft, source: "takeoff" },
    { category: "Exterior", description: `Siding — ${siding.label}`, unit: "sqft", unitCostCents: siding.costPerSqftCents, qty: (q) => q.wallLf * 9, source: "takeoff" },
    { category: "Windows & Doors", description: `Windows — ${windows.label}`, unit: "ea", unitCostCents: windows.costCents, qty: (q) => q.windows, source: "takeoff" },
    { category: "Flooring", description: flooring.label, unit: "sqft", unitCostCents: flooring.costPerSqftCents, qty: (q) => q.livableSqft, source: "allowance" },
    { category: "Kitchen", description: `Cabinets — ${cabinets.label}`, unit: "ea", unitCostCents: cabinets.costCents, qty: (q) => q.kitchens, source: "allowance" },
    { category: "Kitchen", description: `Countertops — ${counters.label}`, unit: "ea", unitCostCents: counters.costCents, qty: (q) => q.kitchens, source: "allowance" },
    { category: "Kitchen", description: `Appliances — ${appliances.label}`, unit: "ea", unitCostCents: appliances.costCents, qty: (q) => q.kitchens, source: "allowance" },
  ];
  if (lighting.deltaPerSqftCents !== 0)
    entries.push({ category: "Electrical", description: `Lighting — ${lighting.label}`, unit: "sqft", unitCostCents: lighting.deltaPerSqftCents, qty: (q) => q.livableSqft, source: "allowance" });
  if (paint.deltaPerSqftCents !== 0)
    entries.push({ category: "Interior", description: `Paint — ${paint.label}`, unit: "sqft", unitCostCents: paint.deltaPerSqftCents, qty: (q) => q.livableSqft, source: "allowance" });
  return entries;
}

const SOFT_COST_PCT = 0.08;
const CONTINGENCY_PCT = 0.1;
const CONCEPT_RANGE_PCT = 0.15;

export function estimateRevision(
  model: ParametricModel,
  revisionId: string,
  regionCode: string = "US_NATIONAL",
  finishes: EstimateFinishes = {},
): Estimate {
  const factor = REGION_FACTORS[regionCode] ?? 1.0;
  const styleFactor = styleInfo(finishes.styleKey)?.costFactor ?? 1.0;
  const q = takeoff(model);

  const lineItems: EstimateLineItem[] = [...PRICE_BOOK, ...finishBook(finishes)]
    .map((entry, i) => {
      const qty = Math.round(entry.qty(q) * 10) / 10;
      const style = STYLE_SCALED.has(entry.category) ? styleFactor : 1.0;
      return {
        id: `li-${i}`,
        estimateId: `est-${revisionId}`,
        category: entry.category,
        description: entry.description,
        qty,
        unit: entry.unit,
        unitCostCents: Math.round(entry.unitCostCents * factor * style),
        source: entry.source,
      };
    })
    .filter((li) => li.qty > 0);

  const hardCents = lineItems.reduce((s, li) => s + li.qty * li.unitCostCents, 0);
  const softCents = hardCents * SOFT_COST_PCT;
  const contingencyCents = (hardCents + softCents) * CONTINGENCY_PCT;

  lineItems.push(
    {
      id: `li-soft`,
      estimateId: `est-${revisionId}`,
      category: "Soft Costs",
      description: "Design, permits, fees",
      qty: 1,
      unit: "ls",
      unitCostCents: Math.round(softCents),
      source: "allowance",
    },
    {
      id: `li-cont`,
      estimateId: `est-${revisionId}`,
      category: "Contingency",
      description: `Contingency (${CONTINGENCY_PCT * 100}%)`,
      qty: 1,
      unit: "ls",
      unitCostCents: Math.round(contingencyCents),
      source: "allowance",
    },
  );

  const totalCents = Math.round(lineItems.reduce((s, li) => s + li.qty * li.unitCostCents, 0));

  return {
    id: `est-${revisionId}`,
    revisionId,
    totalCents,
    lowCents: Math.round(totalCents * (1 - CONCEPT_RANGE_PCT)),
    highCents: Math.round(totalCents * (1 + CONCEPT_RANGE_PCT)),
    regionCode,
    lineItems,
  };
}

/** Downgrade ladders: each category's options, cheapest first. */
const DOWNGRADE_LADDERS: {
  field: keyof FinishSelections;
  label: string;
  options: { key: string; label: string }[];
  impact: "low" | "med";
}[] = [
  { field: "flooring", label: "flooring", options: FLOORING, impact: "low" },
  { field: "countertops", label: "countertops", options: COUNTERTOPS, impact: "low" },
  { field: "cabinets", label: "cabinets", options: CABINETS, impact: "low" },
  { field: "appliances", label: "appliances", options: APPLIANCES, impact: "low" },
  { field: "siding", label: "siding", options: SIDING, impact: "med" },
  { field: "roofing", label: "roofing", options: ROOFING, impact: "med" },
  { field: "windows", label: "windows", options: WINDOWS, impact: "med" },
];

/** Rooms worth deferring when over budget, in preference order. */
const DEFERRABLE: { kind: string; label: string }[] = [
  { kind: "theater", label: "theater" },
  { kind: "gym", label: "gym" },
  { kind: "outdoor", label: "outdoor space" },
];

/**
 * Value engineering with EXACT savings: every actionable suggestion is
 * priced by actually re-running the estimate with the change applied —
 * a finish stepped down one option, or a deferrable room removed — so
 * "saves $X" is the real delta, not a heuristic. Suggestions without a
 * safe automatic action stay advisory (no `action`).
 */
export function valueEngineering(
  estimate: Estimate,
  budgetCents: number | null,
  model: ParametricModel,
  finishes: EstimateFinishes = {},
): ValueEngineeringSuggestion[] {
  if (budgetCents == null || estimate.totalCents <= budgetCents) return [];
  const suggestions: ValueEngineeringSuggestion[] = [];
  let i = 0;

  // Finish downgrades: one step down the ladder from the current selection.
  for (const ladder of DOWNGRADE_LADDERS) {
    const currentKey = (finishes[ladder.field] as string | undefined) ?? DEFAULT_FINISHES[ladder.field];
    const idx = ladder.options.findIndex((o) => o.key === currentKey);
    if (idx <= 0) continue; // unknown or already the cheapest
    const cheaper = ladder.options[idx - 1];
    const current = ladder.options[idx];
    const candidate = estimateRevision(model, "ve-candidate", estimate.regionCode, {
      ...finishes,
      [ladder.field]: cheaper.key,
    });
    const savings = estimate.totalCents - candidate.totalCents;
    if (savings <= 0) continue;
    suggestions.push({
      id: `ve-${i++}`,
      estimateId: estimate.id,
      description: `Step ${ladder.label} down from ${current.label} to ${cheaper.label}`,
      savingsCents: savings,
      designImpact: ladder.impact,
      status: "proposed",
      action: { kind: "set_finish", field: ladder.field, option: cheaper.key },
    });
  }

  // Deferrable rooms: exact savings via the same revision path the apply uses.
  for (const deferrable of DEFERRABLE) {
    const room = model.rooms.find((r) => r.kind === deferrable.kind);
    if (!room) continue;
    const removed = applyRevision(model, [{ kind: "remove", target: room.label }]);
    if (removed.applied.length === 0) continue;
    const candidate = estimateRevision(removed.model, "ve-candidate", estimate.regionCode, finishes);
    const savings = estimate.totalCents - candidate.totalCents;
    if (savings <= 0) continue;
    suggestions.push({
      id: `ve-${i++}`,
      estimateId: estimate.id,
      description: `Defer the ${deferrable.label} (${room.label}) to a future phase`,
      savingsCents: savings,
      designImpact: "high",
      status: "proposed",
      action: { kind: "remove_room", target: room.label },
    });
  }

  // Advisory only — massing changes need a fresh generation pass.
  if (model.levels === 1) {
    suggestions.push({
      id: `ve-${i++}`,
      estimateId: estimate.id,
      description: "Two-story massing on a smaller foundation (regenerate with a two-story style)",
      savingsCents: Math.round(estimate.totalCents * 0.03),
      designImpact: "high",
      status: "proposed",
    });
  }

  return suggestions.sort((a, b) => b.savingsCents - a.savingsCents).slice(0, 5);
}
