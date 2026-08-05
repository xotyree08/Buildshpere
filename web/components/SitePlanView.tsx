import { buildSitePlan, GENERIC_SETBACKS, isGenericSetbacks, type SetbackRules } from "@/lib/engine/site";
import type { ParametricModel } from "@/lib/types";

const ROOM_FILLS: Record<string, string> = {
  garage: "var(--plan-garage)",
  outdoor: "var(--plan-outdoor)",
  hallway: "var(--plan-hall)",
};

export function SitePlanView({
  model,
  lotWidthFt,
  lotDepthFt,
  rules = GENERIC_SETBACKS,
}: {
  model: ParametricModel;
  lotWidthFt: number;
  lotDepthFt: number;
  rules?: SetbackRules;
}) {
  const site = buildSitePlan(model, lotWidthFt, lotDepthFt, rules);
  const pad = 4;
  const streetBand = 6;

  return (
    <div>
      <svg
        viewBox={`${-pad} ${-streetBand - pad} ${site.lotWidthFt + pad * 2} ${site.lotDepthFt + streetBand + pad * 2}`}
        role="img"
        aria-label="Site plan"
        style={{ width: "100%", height: "auto", display: "block" }}
      >
        {/* street */}
        <rect x={-pad} y={-streetBand} width={site.lotWidthFt + pad * 2} height={streetBand} fill="var(--site-street)" />
        <text x={site.lotWidthFt / 2} y={-streetBand / 2} textAnchor="middle" dominantBaseline="middle" fontSize={3} fill="var(--muted)">
          street
        </text>

        {/* lot */}
        <rect x={0} y={0} width={site.lotWidthFt} height={site.lotDepthFt} fill="var(--site-lot)" stroke="var(--fg)" strokeWidth={0.4} />

        {/* buildable envelope after setbacks */}
        <rect
          x={site.buildable.x}
          y={site.buildable.y}
          width={site.buildable.w}
          height={site.buildable.d}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={0.3}
          strokeDasharray="2 1.5"
        />

        {/* footprint rooms */}
        {site.placedRooms.map(({ room, x, y, w, d }) => (
          <rect
            key={room.key}
            x={x}
            y={y}
            width={w}
            height={d}
            fill={ROOM_FILLS[room.kind] ?? "var(--elev-wall)"}
            stroke="var(--fg)"
            strokeWidth={0.2}
          />
        ))}

        {/* margin annotations */}
        <text x={site.lotWidthFt / 2} y={site.rules.frontFt / 2} textAnchor="middle" fontSize={2.6} fill="var(--muted)">
          {site.margins.front} ft
        </text>
        <text
          x={site.lotWidthFt / 2}
          y={site.lotDepthFt - Math.max(site.margins.rear, 4) / 2}
          textAnchor="middle"
          fontSize={2.6}
          fill="var(--muted)"
        >
          {site.margins.rear} ft
        </text>
        <text
          x={Math.max(site.margins.side, 3) / 2}
          y={site.lotDepthFt / 2}
          textAnchor="middle"
          fontSize={2.6}
          fill="var(--muted)"
        >
          {site.margins.side} ft
        </text>
      </svg>
      <p style={{ margin: "0.35rem 0 0", fontSize: "0.85rem" }} className={site.fits ? "status-pass" : "status-fail"}>
        {site.fits
          ? `Fits: ${site.coverage.pct}% lot coverage (${site.coverage.footprintSqft.toLocaleString()} of ${site.coverage.lotSqft.toLocaleString()} sqft).`
          : site.violations.join(" ")}
      </p>
      <p style={{ margin: "0.15rem 0 0", fontSize: "0.75rem", color: "var(--muted)" }}>
        {isGenericSetbacks(rules)
          ? `Generic residential setbacks (${rules.frontFt}/${rules.rearFt}/${rules.sideFt} ft, ${rules.maxCoveragePct}% coverage) — county rules arrive with LandSphere.`
          : `Your setback rules (${rules.frontFt}/${rules.rearFt}/${rules.sideFt} ft, ${rules.maxCoveragePct}% coverage) — verify against your jurisdiction's published code.`}
      </p>
    </div>
  );
}
