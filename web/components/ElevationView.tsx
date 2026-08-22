import { buildElevation, type ElevationDirection } from "@/lib/engine/elevation";
import type { FinishSelections } from "@/lib/catalog/materials";
import { exteriorPalette } from "@/lib/render/palette";
import type { HomeStyle, ParametricModel } from "@/lib/types";

/** Texture overlays are drawn as clipped line work so material choice reads
 * at a glance: clapboard laps, brick courses, standing-seam ribs, tile rows. */
export function ElevationView({
  model,
  style,
  direction,
  finishes,
}: {
  model: ParametricModel;
  style: HomeStyle;
  direction: ElevationDirection;
  finishes?: FinishSelections;
}) {
  const elevation = buildElevation(model, style, direction);
  const palette = exteriorPalette(finishes);
  const pad = 2;
  const clipId = `walls-${direction}`;
  const roofClipId = `roof-${direction}`;

  const wallLines: React.ReactNode[] = [];
  if (palette.wallTexture !== "smooth") {
    const gap = palette.wallTexture === "brick" ? 1.0 : 0.8;
    const maxY = Math.max(...elevation.walls.map((w) => w.y + w.h), 0);
    const minY = Math.min(...elevation.walls.map((w) => w.y), 0);
    for (let y = minY + gap; y < maxY; y += gap) {
      wallLines.push(
        <line
          key={`t${y.toFixed(1)}`}
          x1={0}
          y1={y}
          x2={elevation.width}
          y2={y}
          stroke={palette.wallShade}
          strokeWidth={0.08}
        />,
      );
    }
  }

  const roofLines: React.ReactNode[] = [];
  if (elevation.roof) {
    const xs = elevation.roof.map((p) => p.x);
    const ys = elevation.roof.map((p) => p.y);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    if (palette.roofTexture === "standing_seam") {
      for (let x = x0 + 2; x < x1; x += 2) {
        roofLines.push(
          <line key={`r${x.toFixed(1)}`} x1={x} y1={y0} x2={x} y2={y1} stroke={palette.roofShade} strokeWidth={0.1} />,
        );
      }
    } else {
      const gap = palette.roofTexture === "tile" ? 1.2 : 0.9;
      for (let y = y0 + gap; y < y1; y += gap) {
        roofLines.push(
          <line key={`r${y.toFixed(1)}`} x1={x0} y1={y} x2={x1} y2={y} stroke={palette.roofShade} strokeWidth={0.08} />,
        );
      }
    }
  }

  return (
    <svg
      viewBox={`${-pad} ${-pad} ${elevation.width + pad * 2} ${elevation.height + pad * 2}`}
      role="img"
      aria-label={`${direction === "north" ? "Front" : "Side"} elevation`}
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      <defs>
        <clipPath id={clipId}>
          {elevation.walls.map((wall, i) => (
            <rect key={i} x={wall.x} y={wall.y} width={wall.w} height={wall.h} />
          ))}
        </clipPath>
        {elevation.roof && (
          <clipPath id={roofClipId}>
            <polygon points={elevation.roof.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ")} />
          </clipPath>
        )}
      </defs>
      {elevation.walls.map((wall, i) => (
        <rect
          key={`w${i}`}
          x={wall.x}
          y={wall.y}
          width={wall.w}
          height={wall.h}
          fill={palette.wall}
          stroke="var(--fg)"
          strokeWidth={0.25}
        />
      ))}
      <g clipPath={`url(#${clipId})`}>{wallLines}</g>
      {elevation.roof && (
        <polygon
          points={elevation.roof.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ")}
          fill={palette.roof}
          stroke="var(--fg)"
          strokeWidth={0.25}
          strokeLinejoin="round"
        />
      )}
      {elevation.roof && <g clipPath={`url(#${roofClipId})`}>{roofLines}</g>}
      {elevation.openings.map((o, i) => (
        <rect
          key={`o${i}`}
          x={o.x}
          y={o.y}
          width={o.w}
          height={o.h}
          fill={
            o.kind === "window" ? palette.glass : o.kind === "garage" ? palette.garageDoor : palette.door
          }
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
