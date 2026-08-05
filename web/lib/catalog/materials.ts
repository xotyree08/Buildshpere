/**
 * Interior finish catalog: the options a customer picks from, each carrying
 * its real cost basis. The estimate engine reads these — picking marble
 * genuinely reprices the home. Defaults are the "standard" tier in every
 * category, matching the baseline price book.
 */

export type FinishTier = "builder" | "standard" | "premium" | "luxury";

export interface FinishOption {
  key: string;
  label: string;
  tier: FinishTier;
}

export interface FlooringOption extends FinishOption {
  costPerSqftCents: number;
}

export interface LumpOption extends FinishOption {
  costCents: number;
}

export interface DeltaOption extends FinishOption {
  /** Added to the relevant per-sqft base rate. */
  deltaPerSqftCents: number;
}

export const FLOORING: FlooringOption[] = [
  { key: "carpet", label: "Carpet", tier: "builder", costPerSqftCents: 600 },
  { key: "laminate", label: "Laminate", tier: "builder", costPerSqftCents: 800 },
  { key: "lvp", label: "Luxury Vinyl Plank", tier: "standard", costPerSqftCents: 900 },
  { key: "polished_concrete", label: "Polished Concrete", tier: "standard", costPerSqftCents: 1000 },
  { key: "engineered", label: "Engineered Hardwood", tier: "standard", costPerSqftCents: 1200 },
  { key: "tile", label: "Porcelain Tile", tier: "premium", costPerSqftCents: 1600 },
  { key: "hardwood", label: "Solid Hardwood", tier: "premium", costPerSqftCents: 1800 },
  { key: "wide_plank_oak", label: "Wide-Plank White Oak", tier: "luxury", costPerSqftCents: 2600 },
];

export const COUNTERTOPS: LumpOption[] = [
  { key: "laminate", label: "Laminate", tier: "builder", costCents: 300000 },
  { key: "butcher_block", label: "Butcher Block", tier: "standard", costCents: 500000 },
  { key: "quartz", label: "Quartz", tier: "standard", costCents: 800000 },
  { key: "granite", label: "Granite", tier: "premium", costCents: 900000 },
  { key: "quartzite", label: "Quartzite", tier: "premium", costCents: 1200000 },
  { key: "marble", label: "Marble", tier: "luxury", costCents: 1500000 },
];

export const CABINETS: LumpOption[] = [
  { key: "stock", label: "Stock", tier: "builder", costCents: 1500000 },
  { key: "semi_custom", label: "Semi-Custom", tier: "standard", costCents: 2200000 },
  { key: "custom", label: "Full Custom", tier: "luxury", costCents: 4000000 },
];

export const APPLIANCES: LumpOption[] = [
  { key: "builder", label: "Builder Package", tier: "builder", costCents: 800000 },
  { key: "standard", label: "Standard Stainless", tier: "standard", costCents: 1200000 },
  { key: "premium", label: "Premium (counter-depth, induction)", tier: "premium", costCents: 2500000 },
  { key: "luxury", label: "Luxury (pro range, panel-ready)", tier: "luxury", costCents: 6000000 },
];

export const LIGHTING: DeltaOption[] = [
  { key: "builder", label: "Builder Basics", tier: "builder", deltaPerSqftCents: -100 },
  { key: "standard", label: "Standard Recessed + Fixtures", tier: "standard", deltaPerSqftCents: 0 },
  { key: "designer", label: "Designer Layered Lighting", tier: "premium", deltaPerSqftCents: 250 },
  { key: "smart", label: "Smart Whole-Home Lighting", tier: "luxury", deltaPerSqftCents: 450 },
];

export const PAINT: DeltaOption[] = [
  { key: "standard", label: "Standard (one palette)", tier: "standard", deltaPerSqftCents: 0 },
  { key: "premium", label: "Premium (multi-palette, accents)", tier: "premium", deltaPerSqftCents: 150 },
  { key: "designer", label: "Designer (specialty finishes)", tier: "luxury", deltaPerSqftCents: 300 },
];

// ---------- Exterior materials ----------
// Defaults reproduce the pre-catalog baseline exactly (claims.test.ts holds
// the estimate honest): siding 1100/sqft wall, roofing 900/sqft, windows $850.

export const SIDING: FlooringOption[] = [
  { key: "vinyl", label: "Vinyl", tier: "builder", costPerSqftCents: 700 },
  { key: "engineered_wood", label: "Engineered Wood", tier: "standard", costPerSqftCents: 1000 },
  { key: "fiber_cement", label: "Fiber Cement", tier: "standard", costPerSqftCents: 1100 },
  { key: "stucco", label: "Stucco", tier: "premium", costPerSqftCents: 1250 },
  { key: "cedar", label: "Natural Cedar", tier: "premium", costPerSqftCents: 1500 },
  { key: "brick_veneer", label: "Brick Veneer", tier: "luxury", costPerSqftCents: 1800 },
];

export const ROOFING: FlooringOption[] = [
  { key: "asphalt_3tab", label: "3-Tab Asphalt", tier: "builder", costPerSqftCents: 650 },
  { key: "architectural_shingle", label: "Architectural Shingle", tier: "standard", costPerSqftCents: 900 },
  { key: "metal_standing_seam", label: "Standing-Seam Metal", tier: "premium", costPerSqftCents: 1400 },
  { key: "cedar_shake", label: "Cedar Shake", tier: "premium", costPerSqftCents: 1500 },
  { key: "clay_tile", label: "Clay Tile", tier: "premium", costPerSqftCents: 1700 },
  { key: "slate", label: "Natural Slate", tier: "luxury", costPerSqftCents: 2800 },
];

export const WINDOWS: LumpOption[] = [
  { key: "builder_vinyl", label: "Builder Vinyl", tier: "builder", costCents: 60000 },
  { key: "vinyl_lowe", label: "Vinyl Low-E", tier: "standard", costCents: 85000 },
  { key: "fiberglass", label: "Fiberglass", tier: "premium", costCents: 120000 },
  { key: "clad_wood", label: "Aluminum-Clad Wood", tier: "premium", costCents: 160000 },
  { key: "steel", label: "Steel Frame", tier: "luxury", costCents: 260000 },
];

export interface FinishSelections {
  flooring?: string;
  countertops?: string;
  cabinets?: string;
  appliances?: string;
  lighting?: string;
  paint?: string;
  siding?: string;
  roofing?: string;
  windows?: string;
}

export const DEFAULT_FINISHES: Required<FinishSelections> = {
  flooring: "engineered",
  countertops: "quartz",
  cabinets: "semi_custom",
  appliances: "standard",
  lighting: "standard",
  paint: "standard",
  siding: "fiber_cement",
  roofing: "architectural_shingle",
  windows: "vinyl_lowe",
};

export function pick<T extends FinishOption>(options: T[], key: string | undefined, fallbackKey: string): T {
  return options.find((o) => o.key === key) ?? options.find((o) => o.key === fallbackKey)!;
}

export const FINISH_CATEGORIES: { field: keyof FinishSelections; label: string; options: FinishOption[] }[] = [
  { field: "flooring", label: "Flooring", options: FLOORING },
  { field: "countertops", label: "Countertops", options: COUNTERTOPS },
  { field: "cabinets", label: "Cabinets", options: CABINETS },
  { field: "appliances", label: "Appliances", options: APPLIANCES },
  { field: "lighting", label: "Lighting", options: LIGHTING },
  { field: "paint", label: "Paint", options: PAINT },
];

export const EXTERIOR_CATEGORIES: { field: keyof FinishSelections; label: string; options: FinishOption[] }[] = [
  { field: "siding", label: "Siding", options: SIDING },
  { field: "roofing", label: "Roofing", options: ROOFING },
  { field: "windows", label: "Windows", options: WINDOWS },
];
