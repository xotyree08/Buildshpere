/**
 * Style traits that shape geometry: roof form and pitch for the massing
 * view, whether the style traditionally carries a front porch, and which
 * massing (single- vs two-story) the style leads with. Deterministic
 * per-style data — the visual half of what the cost factor prices.
 */

import type { HomeStyle } from "../types";

export type RoofForm = "flat" | "gable" | "hip";

export interface RoofSpec {
  form: RoofForm;
  /** Rise as a fraction of half the roof's shorter span. 0 for flat. */
  steepness: number;
}

const ROOFS: Record<HomeStyle, RoofSpec> = {
  // Modern & Contemporary
  modern: { form: "flat", steepness: 0 },
  contemporary: { form: "flat", steepness: 0 },
  mid_century_modern: { form: "gable", steepness: 0.3 },
  minimalist: { form: "flat", steepness: 0 },
  industrial: { form: "flat", steepness: 0 },
  scandinavian: { form: "gable", steepness: 0.55 },
  japandi: { form: "gable", steepness: 0.4 },
  // Classic American
  traditional: { form: "gable", steepness: 0.6 },
  colonial: { form: "gable", steepness: 0.7 },
  georgian: { form: "hip", steepness: 0.6 },
  cape_cod: { form: "gable", steepness: 0.95 },
  craftsman: { form: "gable", steepness: 0.45 },
  victorian: { form: "gable", steepness: 1.1 },
  prairie: { form: "hip", steepness: 0.3 },
  ranch: { form: "hip", steepness: 0.35 },
  // European
  tudor: { form: "gable", steepness: 1.0 },
  french_country: { form: "hip", steepness: 0.9 },
  mediterranean: { form: "hip", steepness: 0.35 },
  spanish_revival: { form: "hip", steepness: 0.35 },
  // Rustic & Country
  farmhouse: { form: "gable", steepness: 0.6 },
  modern_farmhouse: { form: "gable", steepness: 0.6 },
  cottage: { form: "gable", steepness: 0.9 },
  mountain: { form: "gable", steepness: 0.8 },
  barndominium: { form: "gable", steepness: 0.5 },
  a_frame: { form: "gable", steepness: 1.5 },
  // Coastal & Resort
  coastal: { form: "hip", steepness: 0.6 },
  tropical: { form: "hip", steepness: 0.5 },
  luxury_contemporary: { form: "flat", steepness: 0 },
};

export function roofFor(style: HomeStyle | undefined): RoofSpec {
  return (style && ROOFS[style]) || { form: "gable", steepness: 0.6 };
}

/** Styles whose identity includes a front porch — the plan gets one. */
export const PORCH_STYLES: ReadonlySet<HomeStyle> = new Set([
  "farmhouse",
  "modern_farmhouse",
  "craftsman",
  "victorian",
  "cottage",
  "coastal",
  "tropical",
  "prairie",
]);

/** Which massing the style leads with; null keeps the default variant order. */
export function massingBias(style: HomeStyle | undefined): "single" | "two" | null {
  if (!style) return null;
  if (["ranch", "prairie", "mid_century_modern", "mediterranean", "spanish_revival"].includes(style)) return "single";
  if (["victorian", "colonial", "georgian", "tudor", "cape_cod", "french_country"].includes(style)) return "two";
  return null;
}
