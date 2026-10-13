/** Default space between background helper lines. */
export const DEFAULT_HELPER_SPACING_METERS = 1;

/** Finest stored spacing. Matches the 1 cm spinner step. */
export const MIN_HELPER_SPACING_METERS = 0.01;

/** Coarsest spacing the canvas will store. */
export const MAX_HELPER_SPACING_METERS = 100;

/** Heavier helper lines repeat every this many spaces. */
export const MAJOR_HELPER_MULTIPLE = 5;

/**
 * Closer than this, helper lines paint a solid band.
 * One centimeter at maximum zoom is 5 px, so that spacing still draws exactly.
 */
const MIN_HELPER_LINE_GAP_PX = 4;

const NICE_STEP_MANTISSAS = [1, 2, 5, 10] as const;

/** Keep a positive finite spacing inside the allowed range. Invalid values become the default. */
export function normalizeHelperSpacing(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_HELPER_SPACING_METERS;
  }
  return Math.min(MAX_HELPER_SPACING_METERS, Math.max(MIN_HELPER_SPACING_METERS, value));
}

/**
 * Step drawn at `zoom` pixels per meter.
 * A spacing closer than the minimum gap moves up to the next 1-2-5 multiple
 * so zooming thins the grid instead of landing on odd intervals.
 */
export function drawnHelperStep(spacingMeters: number, zoom: number): number {
  const spacing = normalizeHelperSpacing(spacingMeters);
  if (!(zoom > 0)) {
    return spacing;
  }
  const gapPx = spacing * zoom;
  if (gapPx >= MIN_HELPER_LINE_GAP_PX) {
    return spacing;
  }
  return spacing * niceMultiplier(MIN_HELPER_LINE_GAP_PX / gapPx);
}

function niceMultiplier(needed: number): number {
  if (!(needed > 1)) {
    return 1;
  }
  const exponent = Math.floor(Math.log10(needed));
  const scale = 10 ** exponent;
  const mantissa = needed / scale;
  for (const step of NICE_STEP_MANTISSAS) {
    if (mantissa <= step * (1 + 1e-9)) {
      return step * scale;
    }
  }
  return 10 * scale;
}
