/**
 * Architectural style catalog. Each style carries a cost factor applied to
 * the structure-and-envelope portion of the estimate (framing, roofing,
 * exterior, windows & doors) — a Victorian's turned trim and steep complex
 * roof genuinely cost more per square foot than a ranch's simple envelope.
 */

import type { HomeStyle } from "../types";

export interface StyleInfo {
  key: HomeStyle;
  label: string;
  category: string;
  description: string;
  /** Multiplier on structure/envelope line items. 1.0 = baseline. */
  costFactor: number;
  roof: string;
}

export const STYLE_CATEGORIES = [
  "Modern & Contemporary",
  "Classic American",
  "European",
  "Rustic & Country",
  "Coastal & Resort",
] as const;

export const STYLES: StyleInfo[] = [
  // Modern & Contemporary
  { key: "modern", label: "Modern", category: "Modern & Contemporary", costFactor: 1.05, roof: "flat or low-slope", description: "Clean lines, open plans, expansive glass, honest materials." },
  { key: "contemporary", label: "Contemporary", category: "Modern & Contemporary", costFactor: 1.05, roof: "mixed low-slope", description: "Today's design language — mixed materials, asymmetry, indoor-outdoor flow." },
  { key: "mid_century_modern", label: "Mid-Century Modern", category: "Modern & Contemporary", costFactor: 1.08, roof: "low gable or butterfly", description: "Post-and-beam feel, walls of glass, connection to the landscape." },
  { key: "minimalist", label: "Minimalist", category: "Modern & Contemporary", costFactor: 1.1, roof: "flat", description: "Reduction to essentials; flawless surfaces demand exacting construction." },
  { key: "industrial", label: "Industrial", category: "Modern & Contemporary", costFactor: 1.02, roof: "flat or shed", description: "Exposed structure, concrete and steel, loft-like volumes." },
  { key: "scandinavian", label: "Scandinavian", category: "Modern & Contemporary", costFactor: 1.0, roof: "simple gable", description: "Light woods, bright interiors, warm functional simplicity." },
  { key: "japandi", label: "Japandi", category: "Modern & Contemporary", costFactor: 1.08, roof: "low gable", description: "Japanese restraint meets Scandinavian warmth; crafted joinery." },

  // Classic American
  { key: "traditional", label: "Traditional", category: "Classic American", costFactor: 1.0, roof: "gable or hip", description: "Familiar proportions, defined rooms, timeless curb appeal." },
  { key: "colonial", label: "Colonial", category: "Classic American", costFactor: 1.04, roof: "side gable", description: "Symmetric facade, center entry, double-hung windows with shutters." },
  { key: "georgian", label: "Georgian", category: "Classic American", costFactor: 1.12, roof: "hip", description: "Formal symmetry, brick facades, classical detailing." },
  { key: "cape_cod", label: "Cape Cod", category: "Classic American", costFactor: 0.98, roof: "steep side gable", description: "Compact, shingled, dormered — efficient and enduring." },
  { key: "craftsman", label: "Craftsman", category: "Classic American", costFactor: 1.1, roof: "low gable, deep eaves", description: "Handcrafted woodwork, tapered porch columns, built-ins." },
  { key: "victorian", label: "Victorian", category: "Classic American", costFactor: 1.25, roof: "steep, complex", description: "Ornate trim, turrets and bays, rich color — maximal character." },
  { key: "prairie", label: "Prairie", category: "Classic American", costFactor: 1.1, roof: "broad hip, deep eaves", description: "Horizontal lines, banded windows, Wright-inspired massing." },
  { key: "ranch", label: "Ranch", category: "Classic American", costFactor: 0.95, roof: "low hip or gable", description: "Single-story living, simple envelope, easy indoor-outdoor access." },

  // European
  { key: "tudor", label: "Tudor", category: "European", costFactor: 1.2, roof: "steep cross-gable", description: "Half-timbering, masonry, leaded glass, storybook rooflines." },
  { key: "french_country", label: "French Country", category: "European", costFactor: 1.15, roof: "steep hip", description: "Stone and stucco, soft curves, rustic elegance." },
  { key: "mediterranean", label: "Mediterranean", category: "European", costFactor: 1.12, roof: "low tile", description: "Stucco walls, clay tile roofs, arches and courtyards." },
  { key: "spanish_revival", label: "Spanish Revival", category: "European", costFactor: 1.12, roof: "low tile", description: "White stucco, wrought iron, hand-painted tile accents." },

  // Rustic & Country
  { key: "farmhouse", label: "Farmhouse", category: "Rustic & Country", costFactor: 1.0, roof: "gable with porch", description: "Practical warmth — big porches, gabled simplicity." },
  { key: "modern_farmhouse", label: "Modern Farmhouse", category: "Rustic & Country", costFactor: 1.05, roof: "gable, standing seam", description: "Black-on-white palette, board-and-batten, clean rustic lines." },
  { key: "cottage", label: "Cottage", category: "Rustic & Country", costFactor: 1.02, roof: "steep gable", description: "Cozy scale, charming detail, garden-first living." },
  { key: "mountain", label: "Mountain", category: "Rustic & Country", costFactor: 1.15, roof: "heavy-snow gable", description: "Timber and stone, big spans, built for weather and views." },
  { key: "barndominium", label: "Barndominium", category: "Rustic & Country", costFactor: 0.9, roof: "metal gable", description: "Metal-shell efficiency outside, open custom volumes inside." },
  { key: "a_frame", label: "A-Frame", category: "Rustic & Country", costFactor: 1.05, roof: "full-height A", description: "Dramatic roofline as the whole architecture; cabin icon." },

  // Coastal & Resort
  { key: "coastal", label: "Coastal", category: "Coastal & Resort", costFactor: 1.08, roof: "hip, metal or shingle", description: "Breezy, light-filled, weather-resistant materials." },
  { key: "tropical", label: "Tropical", category: "Coastal & Resort", costFactor: 1.1, roof: "broad hip, deep overhangs", description: "Shade-first design, ventilation, seamless lanai living." },
  { key: "luxury_contemporary", label: "Luxury Contemporary", category: "Coastal & Resort", costFactor: 1.3, roof: "flat, parapet", description: "Statement architecture — cantilevers, floor-to-ceiling glass, resort amenities." },
];

const BY_KEY = new Map(STYLES.map((s) => [s.key, s]));

export function styleInfo(key: HomeStyle | string | undefined): StyleInfo | undefined {
  return key ? BY_KEY.get(key as HomeStyle) : undefined;
}

export function stylesByCategory(): [string, StyleInfo[]][] {
  return STYLE_CATEGORIES.map((cat) => [cat, STYLES.filter((s) => s.category === cat)]);
}
