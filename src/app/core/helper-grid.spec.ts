import { describe, expect, it } from 'vitest';
import { MAX_ZOOM } from '../models/floor-plan';
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
    expect(normalizeHelperSpacing(0.005)).toBe(0.01);
    expect(normalizeHelperSpacing(0.01)).toBe(0.01);
    expect(normalizeHelperSpacing(250)).toBe(MAX_HELPER_SPACING_METERS);
  });
});

describe('drawnHelperStep', () => {
  it('draws the chosen spacing when lines are at least 4 px apart', () => {
    expect(drawnHelperStep(1, 40)).toBe(1);
    expect(drawnHelperStep(0.25, 40)).toBe(0.25);
  });

  it('steps up through a 1-2-5 multiple when lines would be closer than 4 px', () => {
    expect(drawnHelperStep(0.01, 200) / 0.01).toBeCloseTo(2);
    expect(drawnHelperStep(0.01, 100) / 0.01).toBeCloseTo(5);
    expect(drawnHelperStep(0.01, 40) / 0.01).toBeCloseTo(10);
    expect(drawnHelperStep(0.01, 10) / 0.01).toBeCloseTo(50);
  });

  it('draws a 1 cm spacing exactly at maximum zoom on a wide canvas', () => {
    const wideSpanMeters = 4000 / MAX_ZOOM;
    expect(wideSpanMeters / MIN_HELPER_SPACING_METERS).toBeGreaterThan(400);
    expect(drawnHelperStep(MIN_HELPER_SPACING_METERS, MAX_ZOOM)).toBeCloseTo(
      MIN_HELPER_SPACING_METERS,
    );
  });
});
