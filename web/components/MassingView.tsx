import { buildIsoScene } from "@/lib/engine/iso";
import type { ParametricModel } from "@/lib/types";

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

/** Side faces darken the room's top fill for depth; south lighter than east. */
function faceFill(roomKind: string, face: "top" | "south" | "east"): string {
  const base = TOP_FILLS[roomKind] ?? "var(--plan-hall)";
  if (face === "top") return base;
  const shade = face === "south" ? "22%" : "38%";
  return `color-mix(in srgb, ${base}, var(--fg) ${shade})`;
}

export function MassingView({ model }: { model: ParametricModel }) {
  const scene = buildIsoScene(model);
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
          fill={faceFill(f.roomKind, f.kind)}
          stroke="var(--fg)"
          strokeWidth={0.18}
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
