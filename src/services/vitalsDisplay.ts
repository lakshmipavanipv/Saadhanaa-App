/**
 * Display helpers for values that may genuinely not exist yet.
 *
 * This module replaced `dummyData.ts`. The app no longer substitutes
 * plausible-looking numbers when the ring has reported nothing — an absent
 * reading renders as an em dash and a metric bar sits at zero. A number on
 * screen now always means the ring measured it.
 */

/** Rendered in place of any metric the ring has not reported. */
export const NO_DATA = '—';

/** Muted colour for a metric with no reading, so it recedes rather than alarms. */
export const NO_DATA_COLOR = '#9aa0a6';

/** Format a possibly-absent number for display. */
export const showNum = (v: number | null | undefined, digits = 0): string => {
  if (v == null || !Number.isFinite(v)) return NO_DATA;
  return digits > 0 ? v.toFixed(digits) : String(Math.round(v));
};

/** Clamp a possibly-absent 0-100 score to a bar width. Absent → 0. */
export const barPct = (v: number | null | undefined): number => {
  if (v == null || !Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
};

/** True when a numeric reading is present and usable. */
export const hasValue = (v: number | null | undefined): v is number =>
  v != null && Number.isFinite(v);
