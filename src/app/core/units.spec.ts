import { describe, expect, it } from 'vite-plus/test';
import { formatDisplayNumber, roundMetersForDisplay } from './units';

describe('roundMetersForDisplay', () => {
  it('stores the same meters the field will show', () => {
    expect(roundMetersForDisplay(0.3333, 'cm')).toBeCloseTo(0.333);
    expect(formatDisplayNumber(roundMetersForDisplay(0.3333, 'cm'), 'cm')).toBe('33.3');
    expect(roundMetersForDisplay(1.23456, 'm')).toBeCloseTo(1.235);
    expect(formatDisplayNumber(roundMetersForDisplay(1.23456, 'm'), 'm')).toBe('1.235');
  });
});
