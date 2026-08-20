/**
 * Exterior material palette: maps the customer's siding/roofing selections
 * to the colors and surface textures the deterministic renderer draws.
 * These are material colors, not theme colors — a brick-veneer home is
 * brick red in light mode and dark mode alike. Unknown keys degrade to the
 * default selection's palette, never to a crash.
 */

import { DEFAULT_FINISHES, type FinishSelections } from "../catalog/materials";

export type WallTexture = "clapboard" | "smooth" | "brick";
export type RoofTexture = "shingle" | "standing_seam" | "tile" | "shake" | "slate";

export interface ExteriorPalette {
  wall: string;
  /** Darker wall variant for shaded isometric faces. */
  wallShade: string;
  roof: string;
  roofShade: string;
  trim: string;
  glass: string;
  door: string;
  /** Vehicle doors are a panel product, not the same thing as a front door. */
  garageDoor: string;
  wallTexture: WallTexture;
  roofTexture: RoofTexture;
}

/** Darken a #rrggbb color by scaling its channels toward black. */
export function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const scale = (c: number) => Math.round(c * factor);
  const r = scale((n >> 16) & 0xff);
  const g = scale((n >> 8) & 0xff);
  const b = scale(n & 0xff);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

const SIDING_COLORS: Record<string, { color: string; texture: WallTexture }> = {
  vinyl: { color: "#d8d3c6", texture: "clapboard" },
  engineered_wood: { color: "#b5936b", texture: "clapboard" },
  fiber_cement: { color: "#aab4ae", texture: "clapboard" },
  stucco: { color: "#e2d7c0", texture: "smooth" },
  cedar: { color: "#a5713f", texture: "clapboard" },
  brick_veneer: { color: "#9e4a3a", texture: "brick" },
};

const ROOF_COLORS: Record<string, { color: string; texture: RoofTexture }> = {
  asphalt_3tab: { color: "#6b6b68", texture: "shingle" },
  architectural_shingle: { color: "#4a4642", texture: "shingle" },
  metal_standing_seam: { color: "#46545c", texture: "standing_seam" },
  cedar_shake: { color: "#8a6844", texture: "shake" },
  clay_tile: { color: "#b05f3c", texture: "tile" },
  slate: { color: "#3d4451", texture: "slate" },
};

export function exteriorPalette(finishes?: FinishSelections): ExteriorPalette {
  const siding =
    SIDING_COLORS[finishes?.siding ?? ""] ?? SIDING_COLORS[DEFAULT_FINISHES.siding];
  const roofing =
    ROOF_COLORS[finishes?.roofing ?? ""] ?? ROOF_COLORS[DEFAULT_FINISHES.roofing];
  return {
    wall: siding.color,
    wallShade: shade(siding.color, 0.72),
    roof: roofing.color,
    roofShade: shade(roofing.color, 0.7),
    trim: "#f2efe8",
    glass: "#b9d4e2",
    // A front door is the one place on an elevation that gets a colour of its
    // own. Taking 45% of the siding gave a near-black rectangle that read as a
    // hole in the wall rather than a way into the house.
    door: "#5c4433",
    // And a garage door is a light panelled product in almost every house
    // built — dark grey is the exception, not the default.
    garageDoor: "#e6e2d9",
    wallTexture: siding.texture,
    roofTexture: roofing.texture,
  };
}
