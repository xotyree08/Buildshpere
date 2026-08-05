/**
 * The render-provider seam (ModelSphere, ADR-007 discipline): visualization
 * providers consume the same deterministic scene inputs — parametric model,
 * style, material selections — and return something drawable. The built-in
 * provider is the deterministic SVG palette pipeline; a photorealistic
 * provider (external image-generation service) plugs in here when that
 * decision is made, WITHOUT touching the geometry engines. Per
 * LESSONS_LEARNED.md L8, nothing in the UI advertises photorealism until a
 * real provider ships.
 */

import type { FinishSelections } from "../catalog/materials";
import type { HomeStyle, ParametricModel } from "../types";
import { exteriorPalette, type ExteriorPalette } from "./palette";

export interface ExteriorScene {
  model: ParametricModel;
  style: HomeStyle;
  finishes?: FinishSelections;
}

export type RenderOutput =
  | { kind: "palette"; palette: ExteriorPalette }
  | { kind: "image"; url: string; provider: string };

export interface RenderProvider {
  readonly name: string;
  renderExterior(scene: ExteriorScene): Promise<RenderOutput>;
}

export const deterministicProvider: RenderProvider = {
  name: "deterministic-svg",
  async renderExterior(scene) {
    return { kind: "palette", palette: exteriorPalette(scene.finishes) };
  },
};

/** Today there is exactly one provider; the registry exists so the photoreal
 * pipeline lands as a new entry, not a rewrite. */
export function getRenderProvider(): RenderProvider {
  return deterministicProvider;
}
