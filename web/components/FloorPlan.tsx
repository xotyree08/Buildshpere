import type { ParametricModel } from "@/lib/types";

const ROOM_FILLS: Record<string, string> = {
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
  outdoor: "var(--plan-outdoor)",
};

export function FloorPlan({ model, level }: { model: ParametricModel; level: number }) {
  const rooms = model.rooms.filter((r) => r.level === level);
  if (rooms.length === 0) return null;

  const maxX = Math.max(...rooms.map((r) => r.rect[0] + r.rect[2]));
  const maxY = Math.max(...rooms.map((r) => r.rect[1] + r.rect[3]));
  const pad = 2;

  return (
    <svg
      viewBox={`${-pad} ${-pad} ${maxX + pad * 2} ${maxY + pad * 2}`}
      role="img"
      aria-label={`Floor plan, level ${level + 1}`}
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      {rooms.map((room) => {
        const [x, y, w, d] = room.rect;
        return (
          <g key={room.key}>
            <rect
              x={x}
              y={y}
              width={w}
              height={d}
              fill={ROOM_FILLS[room.kind] ?? "var(--plan-hall)"}
              stroke="var(--fg)"
              strokeWidth={0.3}
            />
            {w > 8 && d > 5 && (
              <text
                x={x + w / 2}
                y={y + d / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={Math.min(2.4, w / 6)}
                fill="var(--fg)"
              >
                {room.label}
              </text>
            )}
          </g>
        );
      })}
      {model.openings
        .filter((o) => rooms.some((r) => r.key === o.roomKey))
        .map((o) => {
          const room = rooms.find((r) => r.key === o.roomKey)!;
          const [x, y, w, d] = room.rect;
          let ox = x, oy = y, ow = o.widthFt, oh = 0.6;
          if (o.wall === "n") { ox = x + o.offsetFt - o.widthFt / 2; oy = y - 0.3; }
          if (o.wall === "s") { ox = x + o.offsetFt - o.widthFt / 2; oy = y + d - 0.3; }
          if (o.wall === "e") { ox = x + w - 0.3; oy = y + o.offsetFt - o.widthFt / 2; ow = 0.6; oh = o.widthFt; }
          if (o.wall === "w") { ox = x - 0.3; oy = y + o.offsetFt - o.widthFt / 2; ow = 0.6; oh = o.widthFt; }
          return (
            <rect
              key={o.key}
              x={ox}
              y={oy}
              width={ow}
              height={oh}
              fill={o.kind === "window" ? "var(--plan-window)" : "var(--card)"}
              stroke="var(--fg)"
              strokeWidth={0.15}
            />
          );
        })}
    </svg>
  );
}
