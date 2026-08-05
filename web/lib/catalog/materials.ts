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

export interface FinishSelections {
  flooring?: string;
  countertops?: string;
  cabinets?: string;
  appliances?: string;
  lighting?: string;
  paint?: string;
}

export const DEFAULT_FINISHES: Required<FinishSelections> = {
  flooring: "engineered",
  countertops: "quartz",
  cabinets: "semi_custom",
  appliances: "standard",
  lighting: "standard",
  paint: "standard",
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
