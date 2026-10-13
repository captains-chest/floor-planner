import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HELPER_SPACING_METERS,
  drawnHelperStep,
  MAX_HELPER_SPACING_METERS,
  MIN_HELPER_SPACING_METERS,
  normalizeHelperSpacing,
} from './helper-grid';

describe('normalizeHelperSpacing', () => {
  it('keeps a positive spacing and falls back when the value is missing or unusable', () => {
    expect(normalizeHelperSpacing(0.5)).toBe(0.5);
    expect(normalizeHelperSpacing(undefined)).toBe(DEFAULT_HELPER_SPACING_METERS);
    expect(normalizeHelperSpacing(0)).toBe(DEFAULT_HELPER_SPACING_METERS);
    expect(normalizeHelperSpacing(-2)).toBe(DEFAULT_HELPER_SPACING_METERS);
    expect(normalizeHelperSpacing(Number.NaN)).toBe(DEFAULT_HELPER_SPACING_METERS);
  });

  it('clamps spacing to the allowed range', () => {
    expect(normalizeHelperSpacing(0.0001)).toBe(MIN_HELPER_SPACING_METERS);
    expect(normalizeHelperSpacing(250)).toBe(MAX_HELPER_SPACING_METERS);
  });
});

describe('drawnHelperStep', () => {
  it('draws the chosen spacing when the view can show it', () => {
    expect(drawnHelperStep(1, 30)).toBe(1);
    expect(drawnHelperStep(0.25, 40)).toBe(0.25);
  });

  it('draws a whole multiple of the chosen spacing when lines would be too dense', () => {
    expect(drawnHelperStep(0.001, 50)).toBe(0.125);
    expect(drawnHelperStep(0.001, 50) % 0.001).toBeCloseTo(0);
  });
});
