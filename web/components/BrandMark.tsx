/**
 * The BuildSphere mark: a fine-line sphere with two turning meridians and
 * an orbiting point — pure SVG + CSS, no JavaScript, honors
 * prefers-reduced-motion. Server-renderable anywhere.
 */
export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <span className="brandmark" style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 48 48" width={size} height={size}>
        <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <ellipse cx="24" cy="24" rx="20" ry="7" fill="none" stroke="currentColor" strokeWidth="0.9" opacity="0.55" />
        <g className="bm-spin">
          <ellipse cx="24" cy="24" rx="9" ry="20" fill="none" stroke="currentColor" strokeWidth="0.9" opacity="0.7" />
        </g>
        <g className="bm-spin-rev">
          <ellipse cx="24" cy="24" rx="15.5" ry="20" fill="none" stroke="currentColor" strokeWidth="0.7" opacity="0.4" />
        </g>
        <g className="bm-orbit">
          <circle cx="44" cy="24" r="2.2" fill="var(--brass, #9a7b3f)" stroke="none" />
        </g>
      </svg>
    </span>
  );
}
