import { buildElevation, type ElevationDirection } from "@/lib/engine/elevation";
import type { HomeStyle, ParametricModel } from "@/lib/types";

const OPENING_FILL: Record<string, string> = {
  window: "var(--plan-window)",
  door: "var(--plan-garage)",
  garage: "var(--plan-garage)",
};

export function ElevationView({
  model,
  style,
  direction,
}: {
  model: ParametricModel;
  style: HomeStyle;
  direction: ElevationDirection;
}) {
  const elevation = buildElevation(model, style, direction);
  const pad = 2;

  return (
    <svg
      viewBox={`${-pad} ${-pad} ${elevation.width + pad * 2} ${elevation.height + pad * 2}`}
      role="img"
      aria-label={`${direction === "north" ? "Front" : "Side"} elevation`}
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      {elevation.walls.map((wall, i) => (
        <rect
          key={`w${i}`}
          x={wall.x}
          y={wall.y}
          width={wall.w}
          height={wall.h}
          fill="var(--elev-wall)"
          stroke="var(--fg)"
          strokeWidth={0.25}
        />
      ))}
      {elevation.roof && (
        <polygon
          points={elevation.roof.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ")}
          fill="var(--plan-roof)"
          stroke="var(--fg)"
          strokeWidth={0.25}
          strokeLinejoin="round"
        />
      )}
      {elevation.openings.map((o, i) => (
        <rect
          key={`o${i}`}
          x={o.x}
          y={o.y}
          width={o.w}
          height={o.h}
          fill={OPENING_FILL[o.kind]}
          stroke="var(--fg)"
          strokeWidth={0.2}
        />
      ))}
      {/* grade line */}
      <line
        x1={-pad}
        y1={elevation.height}
        x2={elevation.width + pad}
        y2={elevation.height}
        stroke="var(--fg)"
        strokeWidth={0.4}
      />
    </svg>
  );
}
