import { buildPlumbingPlan, type Fixture } from "@/lib/engine/plumbing";
import type { ParametricModel } from "@/lib/types";

/**
 * Plumbing coordination drawing: fixture symbols, water heater, hose
 * bibs, and highlighted wet walls. Pure consumer of the plumbing engine.
 */

function FixtureSymbol({ f }: { f: Fixture }) {
  const { x, z } = f;
  switch (f.type) {
    case "toilet":
      return (
        <g stroke="var(--fg)" strokeWidth={0.16} fill="var(--card)">
          <ellipse cx={x} cy={z + 0.4} rx={0.7} ry={0.9} />
          <rect x={x - 0.8} y={z - 0.7} width={1.6} height={0.7} />
        </g>
      );
    case "shower_tub":
      return (
        <g stroke="var(--fg)" strokeWidth={0.16} fill="var(--card)">
          <rect x={x - 1.3} y={z - 0.9} width={2.6} height={1.8} rx={0.3} />
          <circle cx={x - 0.7} cy={z} r={0.18} fill="var(--fg)" />
        </g>
      );
    case "water_heater":
      return (
        <g stroke="var(--fg)" strokeWidth={0.18} fill="var(--plan-window)">
          <circle cx={x} cy={z} r={1.1} />
          <text x={x} y={z + 0.08} fontSize={0.8} fill="var(--fg)" textAnchor="middle" dominantBaseline="middle">
            WH
          </text>
        </g>
      );
    case "hose_bib":
      return (
        <g stroke="var(--fg)" strokeWidth={0.16} fill="var(--card)">
          <circle cx={x} cy={z} r={0.45} />
          <text x={x} y={z + 0.06} fontSize={0.5} fill="var(--fg)" textAnchor="middle" dominantBaseline="middle">
            HB
          </text>
        </g>
      );
    case "washer":
    case "dishwasher":
      return (
        <g stroke="var(--fg)" strokeWidth={0.16} fill="var(--card)">
          <rect x={x - 1} y={z - 1} width={2} height={2} />
          <circle cx={x} cy={z} r={0.55} fill="none" />
        </g>
      );
    default:
      // Sinks and lavatories: bowl with tap tick.
      return (
        <g stroke="var(--fg)" strokeWidth={0.16} fill="var(--card)">
          <ellipse cx={x} cy={z} rx={0.8} ry={0.6} />
          <line x1={x} y1={z - 1} x2={x} y2={z - 0.6} />
        </g>
      );
  }
}

export function PlumbingPlanView({ model, level }: { model: ParametricModel; level: number }) {
  const plan = buildPlumbingPlan(model);
  const rooms = model.rooms.filter((r) => r.level === level);
  if (rooms.length === 0) return null;
  const maxX = Math.max(...rooms.map((r) => r.rect[0] + r.rect[2]));
  const maxY = Math.max(...rooms.map((r) => r.rect[1] + r.rect[3]));
  const pad = 2.5;
  const roomKeys = new Set(rooms.map((r) => r.key));

  return (
    <div>
      <svg
        viewBox={`${-pad} ${-pad} ${maxX + pad * 2} ${maxY + pad * 2}`}
        role="img"
        aria-label={`Plumbing plan, level ${level + 1}`}
        style={{ width: "100%", height: "auto", display: "block" }}
      >
        {rooms.map((room) => {
          const [x, y, w, d] = room.rect;
          return (
            <g key={room.key}>
              <rect x={x} y={y} width={w} height={d} fill="var(--card)" stroke="var(--fg)" strokeWidth={0.3} />
              {w > 8 && d > 5 && (
                <text x={x + 1} y={y + 1.8} fontSize={1.5} fill="var(--muted)">
                  {room.label}
                </text>
              )}
            </g>
          );
        })}
        {plan.wetWalls.map((ww, i) => (
          <line
            key={i}
            x1={ww.x1}
            y1={ww.z1}
            x2={ww.x2}
            y2={ww.z2}
            stroke="var(--accent)"
            strokeWidth={0.9}
            opacity={0.8}
          />
        ))}
        {plan.rooms
          .filter((re) => roomKeys.has(re.room.key))
          .flatMap((re) => re.fixtures.map((f, i) => <FixtureSymbol key={`${re.room.key}-${i}`} f={f} />))}
        {level === 0 && plan.hoseBibs.map((f, i) => <FixtureSymbol key={`hb-${i}`} f={f} />)}
      </svg>
      <p style={{ margin: "0.5rem 0 0", fontSize: "0.78rem", color: "var(--muted)" }}>
        {plan.totalWsfu} fixture units → {plan.serviceSize} water service (starting point) · thick
        accent lines are wet walls worth stacking. {plan.notes[2]}
      </p>
    </div>
  );
}
