/**
 * Inspiration-photo analysis: the vision model proposes architectural
 * attributes for an uploaded home photo; this module deterministically
 * validates and clamps that proposal to our catalogs (ADR-007 / ADR-010).
 * Geometry, checks, and pricing still come only from the deterministic
 * engines — the photo influences the brief, never the math.
 */

import { ROOFING, SIDING } from "../catalog/materials";
import { STYLES, styleInfo } from "../catalog/styles";
import type { HomeStyle } from "../types";

export const KNOWN_FEATURES = [
  "front_porch",
  "wraparound_porch",
  "large_windows",
  "dormers",
  "columns",
  "stone_accents",
  "brick_facade",
  "board_and_batten",
  "metal_roof",
  "attached_garage",
  "balcony",
  "courtyard",
  "outdoor_living",
  "solar_panels",
] as const;

export type InspirationFeature = (typeof KNOWN_FEATURES)[number];

export interface InspirationAnalysis {
  /** Best-match style from our catalog; null when nothing matched. */
  styleKey: HomeStyle | null;
  /** Runner-up style, when the photo sits between two styles. */
  secondaryStyleKey: HomeStyle | null;
  /** Model's confidence in the primary style match, clamped 0–1. */
  confidence: number;
  /** Visible stories, clamped 1–2 (our generator's range). */
  levels: 1 | 2;
  /** Recognized exterior features, clamped to KNOWN_FEATURES. */
  features: InspirationFeature[];
  /** One-sentence description of the home's character, for display. */
  notes: string;
  /** Closest siding option from the catalog, or null when unclear. */
  sidingKey: string | null;
  /** Closest roofing option from the catalog, or null when unclear. */
  roofingKey: string | null;
}

/**
 * JSON Schema for the model's structured output. Mirrors InspirationAnalysis
 * but permissive on strings — validateAnalysis does the clamping.
 */
export const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    styleKey: {
      type: "string",
      enum: STYLES.map((s) => s.key),
      description: "Best-match architectural style from the catalog.",
    },
    secondaryStyleKey: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description: "Runner-up style key from the same catalog, or null.",
    },
    confidence: {
      type: "number",
      description: "Confidence in the primary style match, 0 to 1.",
    },
    levels: {
      type: "integer",
      description: "Number of visible stories: 1 or 2.",
    },
    features: {
      type: "array",
      items: { type: "string", enum: [...KNOWN_FEATURES] },
      description: "Exterior features visible in the photo.",
    },
    notes: {
      type: "string",
      description: "One sentence describing the home's architectural character.",
    },
    sidingKey: {
      anyOf: [{ type: "string", enum: SIDING.map((s) => s.key) }, { type: "null" }],
      description: "Closest match for the visible primary siding material, or null if unclear.",
    },
    roofingKey: {
      anyOf: [{ type: "string", enum: ROOFING.map((r) => r.key) }, { type: "null" }],
      description: "Closest match for the visible roofing material, or null if unclear.",
    },
  },
  required: ["styleKey", "secondaryStyleKey", "confidence", "levels", "features", "notes", "sidingKey", "roofingKey"],
  additionalProperties: false,
} as const;

/** Deterministic clamp of whatever the model returned to our domain. */
export function validateAnalysis(raw: unknown): InspirationAnalysis {
  const r = (raw ?? {}) as Record<string, unknown>;

  const style = styleInfo(typeof r.styleKey === "string" ? r.styleKey : undefined);
  const secondary = styleInfo(typeof r.secondaryStyleKey === "string" ? r.secondaryStyleKey : undefined);

  const rawConfidence = typeof r.confidence === "number" && Number.isFinite(r.confidence) ? r.confidence : 0;
  const confidence = Math.min(1, Math.max(0, rawConfidence));

  const levels: 1 | 2 = typeof r.levels === "number" && r.levels >= 2 ? 2 : 1;

  const features = Array.isArray(r.features)
    ? [...new Set(r.features.filter((f): f is InspirationFeature => KNOWN_FEATURES.includes(f as InspirationFeature)))]
    : [];

  const notes = typeof r.notes === "string" ? r.notes.slice(0, 300) : "";

  // Materials clamp to the real catalog — an unknown key becomes null,
  // never a guess (the photo influences selections, not the price book).
  const sidingKey = SIDING.some((s) => s.key === r.sidingKey) ? (r.sidingKey as string) : null;
  const roofingKey = ROOFING.some((o) => o.key === r.roofingKey) ? (r.roofingKey as string) : null;

  return {
    styleKey: style?.key ?? null,
    secondaryStyleKey: secondary?.key && secondary.key !== style?.key ? secondary.key : null,
    confidence,
    levels,
    features,
    notes,
    sidingKey,
    roofingKey,
  };
}

/** Human-readable label for a feature key. */
export function featureLabel(feature: InspirationFeature): string {
  return feature.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
