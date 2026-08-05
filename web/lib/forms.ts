/**
 * Numeric form fields hold the raw string while the customer types —
 * storing a number means erasing the field coerces "" to 0, which
 * re-renders as an unremovable "0". Parse and clamp only on submit.
 */
export function numField(
  raw: string,
  opts: { min: number; max?: number; fallback: number; integer?: boolean },
): number {
  const n = Number(raw.trim() === "" ? NaN : raw);
  if (!Number.isFinite(n)) return opts.fallback;
  const rounded = opts.integer === false ? n : Math.round(n);
  return Math.min(opts.max ?? Infinity, Math.max(opts.min, rounded));
}
