import type { TourStop } from "@/lib/engine/walkthrough";

const WALL_H = 9;

/**
 * One-point perspective of a room, standing at its entry (south wall)
 * looking north: back wall inset by depth, floor and ceiling receding,
 * the room's actual north windows on the back wall.
 */
export function RoomView({ stop }: { stop: TourStop }) {
  const w = stop.widthFt;
  const d = stop.depthFt;
  // Deeper rooms shrink the back wall more; clamp for legibility.
  const shrink = Math.min(0.62, Math.max(0.28, d / (d + 14)));
  const bx = (w * shrink) / 2; // back wall x-inset
  const by = (WALL_H * shrink) / 2; // back wall y-inset
  const backW = w - 2 * bx;
  const backH = WALL_H - 2 * by;

  const northWindows = stop.windows.filter((win) => win.wall === "n");

  return (
    <svg
      viewBox={`0 0 ${w} ${WALL_H}`}
      role="img"
      aria-label={`${stop.room.label} interior`}
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      {/* ceiling, floor, side walls as receding planes */}
      <polygon points={`0,0 ${w},0 ${w - bx},${by} ${bx},${by}`} fill="var(--elev-wall)" stroke="var(--fg)" strokeWidth={0.06} />
      <polygon
        points={`0,${WALL_H} ${w},${WALL_H} ${w - bx},${WALL_H - by} ${bx},${WALL_H - by}`}
        fill="var(--plan-hall)"
        stroke="var(--fg)"
        strokeWidth={0.06}
      />
      <polygon points={`0,0 ${bx},${by} ${bx},${WALL_H - by} 0,${WALL_H}`} fill="var(--site-street)" stroke="var(--fg)" strokeWidth={0.06} />
      <polygon
        points={`${w},0 ${w - bx},${by} ${w - bx},${WALL_H - by} ${w},${WALL_H}`}
        fill="var(--site-street)"
        stroke="var(--fg)"
        strokeWidth={0.06}
      />
      {/* back wall */}
      <rect x={bx} y={by} width={backW} height={backH} fill="var(--card)" stroke="var(--fg)" strokeWidth={0.08} />
      {/* the room's actual north windows, scaled onto the back wall */}
      {northWindows.map((win, i) => {
        const cx = bx + (Math.min(win.offsetFt, w) / w) * backW;
        const winW = (win.widthFt / w) * backW;
        const sill = by + backH * 0.28;
        const height = backH * 0.42;
        return (
          <rect
            key={i}
            x={cx - winW / 2}
            y={sill}
            width={winW}
            height={height}
            fill="var(--plan-window)"
            stroke="var(--fg)"
            strokeWidth={0.07}
          />
        );
      })}
      {/* floor recession lines for depth */}
      {[0.25, 0.5, 0.75].map((t) => (
        <line
          key={t}
          x1={bx * t}
          y1={WALL_H - by * t}
          x2={w - bx * t}
          y2={WALL_H - by * t}
          stroke="var(--line)"
          strokeWidth={0.05}
        />
      ))}
    </svg>
  );
}
