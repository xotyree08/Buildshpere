import { buildElectricalPlan, type Device } from "@/lib/engine/electrical";
import type { ParametricModel } from "@/lib/types";

/**
 * The electrical & lighting coordination drawing, in standard symbols:
 * duplex receptacle (circle + twin ticks), GFCI (filled tick), S for
 * switches, circle-cross fixtures, dotted circles for recessed cans,
 * SD/CO discs. Pure consumer of the electrical engine.
 */

function DeviceSymbol({ dev }: { dev: Device }) {
  const { x, z } = dev;
  switch (dev.type) {
    case "receptacle":
    case "gfci":
      return (
        <g stroke="var(--fg)" strokeWidth={0.18} fill={dev.type === "gfci" ? "var(--accent)" : "var(--card)"}>
          <circle cx={x} cy={z} r={0.55} />
          <line x1={x - 0.9} y1={z} x2={x - 0.55} y2={z} />
          <line x1={x + 0.55} y1={z} x2={x + 0.9} y2={z} />
        </g>
      );
    case "switch":
      return (
        <text x={x} y={z} fontSize={1.6} fontStyle="italic" fill="var(--fg)" textAnchor="middle" dominantBaseline="middle">
          S
        </text>
      );
    case "fixture":
      return (
        <g stroke="var(--fg)" strokeWidth={0.18} fill="none">
          <circle cx={x} cy={z} r={0.8} />
          <line x1={x - 0.57} y1={z - 0.57} x2={x + 0.57} y2={z + 0.57} />
          <line x1={x - 0.57} y1={z + 0.57} x2={x + 0.57} y2={z - 0.57} />
        </g>
      );
    case "recessed":
      return <circle cx={x} cy={z} r={0.5} fill="none" stroke="var(--fg)" strokeWidth={0.18} strokeDasharray="0.3 0.25" />;
    case "smoke":
    case "smoke_co":
      return (
        <g>
          <circle cx={x} cy={z} r={0.9} fill="var(--plan-window)" stroke="var(--fg)" strokeWidth={0.15} />
          <text x={x} y={z + 0.05} fontSize={0.75} fill="var(--fg)" textAnchor="middle" dominantBaseline="middle">
            {dev.type === "smoke" ? "SD" : "CO"}
          </text>
        </g>
      );
    case "exterior_light":
      return (
        <g stroke="var(--fg)" strokeWidth={0.16} fill="var(--card)">
          <circle cx={x} cy={z} r={0.6} />
          <line x1={x} y1={z - 1} x2={x} y2={z - 0.6} />
          <line x1={x - 0.9} y1={z - 0.4} x2={x - 0.55} y2={z - 0.25} />
          <line x1={x + 0.9} y1={z - 0.4} x2={x + 0.55} y2={z - 0.25} />
        </g>
      );
  }
}

const LEGEND: { symbol: Device["type"]; label: string }[] = [
  { symbol: "receptacle", label: "Duplex receptacle" },
  { symbol: "gfci", label: "GFCI receptacle" },
  { symbol: "switch", label: "Switch" },
  { symbol: "fixture", label: "Surface fixture" },
  { symbol: "recessed", label: "Recessed can" },
  { symbol: "smoke", label: "Smoke alarm" },
  { symbol: "smoke_co", label: "Smoke/CO combo" },
];

export function ElectricalPlanView({ model, level }: { model: ParametricModel; level: number }) {
  const plan = buildElectricalPlan(model);
  const rooms = model.rooms.filter((r) => r.level === level);
  if (rooms.length === 0) return null;
  const maxX = Math.max(...rooms.map((r) => r.rect[0] + r.rect[2]));
  const maxY = Math.max(...rooms.map((r) => r.rect[1] + r.rect[3]));
  const pad = 2;
  const roomKeys = new Set(rooms.map((r) => r.key));

  return (
    <div>
      <svg
        viewBox={`${-pad} ${-pad} ${maxX + pad * 2} ${maxY + pad * 2}`}
        role="img"
        aria-label={`Electrical plan, level ${level + 1}`}
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
        {plan.rooms
          .filter((re) => roomKeys.has(re.room.key))
          .flatMap((re) => re.devices.map((dev, i) => <DeviceSymbol key={`${re.room.key}-${i}`} dev={dev} />))}
      </svg>
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", margin: "0.5rem 0 0", fontSize: "0.78rem", color: "var(--muted)" }}>
        {LEGEND.map((l) => (
          <span key={l.symbol} style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
            <svg viewBox="-1.2 -1.2 2.4 2.4" width={16} height={16}>
              <DeviceSymbol dev={{ type: l.symbol, x: 0, z: 0 }} />
            </svg>
            {l.label}
          </span>
        ))}
      </div>
      <p style={{ margin: "0.5rem 0 0", fontSize: "0.78rem", color: "var(--muted)" }}>
        {plan.totals.receptacle + plan.totals.gfci} receptacles ({plan.totals.gfci} GFCI) ·{" "}
        {plan.totals.switch} switches · {plan.totals.fixture + plan.totals.recessed} luminaires ·{" "}
        {plan.totals.smoke + plan.totals.smoke_co} smoke/CO. {plan.notes[2]}
      </p>
    </div>
  );
}
