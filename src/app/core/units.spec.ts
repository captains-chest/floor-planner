import { describe, expect, it } from 'vite-plus/test';
import {
  displayToMeters,
  formatDisplayNumber,
  inputMin,
  inputStep,
  metersToDisplay,
  roundMetersForDisplay,
} from './units';

describe('roundMetersForDisplay', () => {
  it('stores the same meters the field will show', () => {
    expect(roundMetersForDisplay(0.3333, 'cm')).toBeCloseTo(0.333);
    expect(formatDisplayNumber(roundMetersForDisplay(0.3333, 'cm'), 'cm')).toBe('33.3');
    expect(roundMetersForDisplay(1.23456, 'm')).toBeCloseTo(1.235);
    expect(formatDisplayNumber(roundMetersForDisplay(1.23456, 'm'), 'm')).toBe('1.235');
  });
});

describe('length input stepping', () => {
  it('keeps the spinner step base on the step series, so cm steps are whole numbers', () => {
    // A number input steps from its minimum: min 0.1 + step 1 lands on 22.1, 23.1, …
    expect(inputMin('cm')).toBe(inputStep('cm'));
    expect(inputStep('cm')).toBe(1);
    expect(inputMin('m')).toBe(inputStep('m'));
  });

  it('steps 15 -> 16 -> 17 cm with no float tails, through the inspector conversions', () => {
    let meters = 0.15;
    for (const expected of ['16', '17', '18']) {
      const steppedDisplay = metersToDisplay(meters, 'cm') + inputStep('cm');
      meters = roundMetersForDisplay(displayToMeters(steppedDisplay, 'cm'), 'cm');
      expect(formatDisplayNumber(meters, 'cm')).toBe(expected);
      expect(meters).toBe(Number(expected) / 100);
    }
  });

  it('normalizes typed values to at most one decimal in cm', () => {
    const meters = roundMetersForDisplay(displayToMeters(22.149, 'cm'), 'cm');
    expect(formatDisplayNumber(meters, 'cm')).toBe('22.1');
    expect(meters).toBe(0.221);
  });
});
