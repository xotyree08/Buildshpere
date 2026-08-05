import { buildIsoScene, type FaceKind } from "@/lib/engine/iso";
import type { FinishSelections } from "@/lib/catalog/materials";
import { exteriorPalette, type ExteriorPalette } from "@/lib/render/palette";
import type { HomeStyle, ParametricModel } from "@/lib/types";

const TOP_FILLS: Record<string, string> = {
  bedroom: "var(--plan-bedroom)",
  bathroom: "var(--plan-bathroom)",
  kitchen: "var(--plan-kitchen)",
  living: "var(--plan-living)",
  dining: "var(--plan-living)",
  office: "var(--plan-office)",
  gym: "var(--plan-office)",
  theater: "var(--plan-office)",
  garage: "var(--plan-garage)",
  hallway: "var(--plan-hall)",
  mudroom: "var(--plan-hall)",
  laundry: "var(--plan-hall)",
  closet: "var(--plan-hall)",
  outdoor: "var(--plan-outdoor)",
};

/** Tops keep the room-color legend for readability; exterior faces show the
 * selected materials — siding on walls (sun side lighter), roofing on roofs. */
function faceFill(roomKind: string, face: FaceKind, palette: ExteriorPalette): string {
  if (face === "roof") return palette.roof;
  if (face === "roof_shade") return palette.roofShade;
  if (face === "top") return TOP_FILLS[roomKind] ?? "var(--plan-hall)";
  return face === "south" ? palette.wall : palette.wallShade;
}

export function MassingView({
  model,
  style,
  finishes,
}: {
  model: ParametricModel;
  style?: HomeStyle;
  finishes?: FinishSelections;
}) {
  const scene = buildIsoScene(model, style);
  const palette = exteriorPalette(finishes);
  const pad = 3;

  return (
    <svg
      viewBox={`${scene.minX - pad} ${scene.minY - pad} ${scene.width + pad * 2} ${scene.height + pad * 2}`}
      role="img"
      aria-label="3D massing preview"
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      {scene.faces.map((f, i) => (
        <polygon
          key={`${f.roomKey}-${f.kind}-${i}`}
          points={f.points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ")}
          fill={faceFill(f.roomKind, f.kind, palette)}
          stroke="var(--fg)"
          strokeWidth={0.18}
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
