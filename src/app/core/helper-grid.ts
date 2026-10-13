/** Default space between background helper lines. */
export const DEFAULT_HELPER_SPACING_METERS = 1;

/** Finest spacing the canvas will store: 1 mm. */
export const MIN_HELPER_SPACING_METERS = 0.001;

/** Coarsest spacing the canvas will store. */
export const MAX_HELPER_SPACING_METERS = 100;

/** Heavier helper lines repeat every this many spaces. */
export const MAJOR_HELPER_MULTIPLE = 5;

/**
 * Drawing more lines than this on one axis paints a solid band, so the
 * canvas steps by a whole multiple of the chosen spacing instead.
 */
const MAX_HELPER_LINES_PER_AXIS = 400;

/** Keep a positive finite spacing inside the allowed range. Invalid values become the default. */
export function normalizeHelperSpacing(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_HELPER_SPACING_METERS;
  }
  return Math.min(MAX_HELPER_SPACING_METERS, Math.max(MIN_HELPER_SPACING_METERS, value));
}

/**
 * Step actually drawn across `spanMeters`. It is the chosen spacing, or a
 * whole multiple of it when that spacing would draw too many lines.
 */
export function drawnHelperStep(spacingMeters: number, spanMeters: number): number {
  const spacing = normalizeHelperSpacing(spacingMeters);
  if (!(spanMeters > 0)) {
    return spacing;
  }
  const lineCount = spanMeters / spacing;
  if (lineCount <= MAX_HELPER_LINES_PER_AXIS) {
    return spacing;
  }
  return spacing * Math.ceil(lineCount / MAX_HELPER_LINES_PER_AXIS);
}
