import { describe, expect, it } from 'vite-plus/test';
import { scaleStatus } from './scale-status';

describe('scaleStatus', () => {
  it('asks for an image first when there is none', () => {
    expect(scaleStatus(null, 'm')).toMatch(/Import an image first/);
  });

  it('says the scale is not set for a fresh import', () => {
    const bg = { widthPx: 1000, heightPx: 500, metersPerPixel: 0.012, calibrated: false };
    expect(scaleStatus(bg, 'm')).toMatch(/^Not set yet/);
  });

  it('shows the calibrated image width in the chosen unit', () => {
    const bg = { widthPx: 1000, heightPx: 500, metersPerPixel: 0.0084, calibrated: true };
    expect(scaleStatus(bg, 'm')).toContain('8.40 m wide');
    expect(scaleStatus(bg, 'cm')).toContain('840 cm wide');
  });
});
