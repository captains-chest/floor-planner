import { describe, expect, it } from 'vitest';
import { TOOL_PREVIEW_GAP_PX, TOOL_PREVIEW_MARGIN_PX } from './constants';
import { placeToolPreview, type Bounds, type ToolPreviewPlacement } from './functions';

const canvas: Bounds = { left: 40, top: 80, width: 700, height: 500 };
const preview = { width: 220, height: 240 };
const gap = TOOL_PREVIEW_GAP_PX;
const margin = TOOL_PREVIEW_MARGIN_PX;

const expectInsideCanvas = (
  placement: ToolPreviewPlacement,
  bounds: Bounds,
  marginPx: number,
): void => {
  const marginX = Math.min(marginPx, bounds.width / 2);
  const marginY = Math.min(marginPx, bounds.height / 2);
  expect(placement.left).toBeGreaterThanOrEqual(bounds.left + marginX);
  expect(placement.top).toBeGreaterThanOrEqual(bounds.top + marginY);
  expect(placement.left + placement.width).toBeLessThanOrEqual(
    bounds.left + bounds.width - marginX,
  );
  expect(placement.top + placement.height).toBeLessThanOrEqual(
    bounds.top + bounds.height - marginY,
  );
  expect(placement.top + placement.maxHeight).toBeLessThanOrEqual(
    bounds.top + bounds.height - marginY,
  );
};

describe('placeToolPreview', () => {
  it('keeps a top-edge preview inside the canvas', () => {
    const placement = placeToolPreview(
      { left: 4, top: 80, width: 32, height: 32 },
      canvas,
      preview,
      gap,
      margin,
    );

    expect(placement.top).toBe(88);
    expect(placement.left).toBe(48);
    expect(placement.width).toBe(220);
    expect(placement.height).toBe(240);
    expectInsideCanvas(placement, canvas, margin);
  });

  it('keeps a bottom-edge preview inside the canvas', () => {
    const placement = placeToolPreview(
      { left: 4, top: 540, width: 32, height: 32 },
      canvas,
      preview,
      gap,
      margin,
    );

    expect(placement.top).toBe(332);
    expect(placement.top + placement.height).toBe(572);
    expectInsideCanvas(placement, canvas, margin);
  });

  it('centers a preview that fits beside its anchor', () => {
    const roomy: Bounds = { left: 0, top: 0, width: 900, height: 700 };
    const placement = placeToolPreview(
      { left: 120, top: 300, width: 32, height: 32 },
      roomy,
      preview,
      gap,
      margin,
    );

    expect(placement.left).toBe(162);
    expect(placement.top).toBe(196);
    expectInsideCanvas(placement, roomy, margin);
  });

  it('shifts left when the preview would pass the canvas right edge', () => {
    const narrow: Bounds = { left: 0, top: 0, width: 400, height: 600 };
    const placement = placeToolPreview(
      { left: 300, top: 200, width: 32, height: 32 },
      narrow,
      preview,
      gap,
      margin,
    );

    expect(placement.left).toBe(172);
    expect(placement.left + placement.width).toBe(392);
    expectInsideCanvas(placement, narrow, margin);
  });

  it('shrinks a preview that is larger than the canvas', () => {
    const small: Bounds = { left: 10, top: 20, width: 120, height: 100 };
    const placement = placeToolPreview(
      { left: 0, top: 0, width: 20, height: 20 },
      small,
      { width: 400, height: 500 },
      gap,
      margin,
    );

    expect(placement.width).toBe(104);
    expect(placement.height).toBe(84);
    expect(placement.left).toBe(18);
    expect(placement.top).toBe(28);
    expect(placement.maxHeight).toBe(84);
    expectInsideCanvas(placement, small, margin);
  });

  it('stays inside a canvas smaller than the requested margin', () => {
    const tiny: Bounds = { left: 10, top: 20, width: 6, height: 4 };
    const placement = placeToolPreview(
      { left: 0, top: 0, width: 10, height: 10 },
      tiny,
      preview,
      gap,
      margin,
    );

    expect(placement.width).toBe(0);
    expect(placement.height).toBe(0);
    expect(placement.left).toBe(13);
    expect(placement.top).toBe(22);
    expectInsideCanvas(placement, tiny, margin);
  });

  it('treats a negative preview size as empty', () => {
    const placement = placeToolPreview(canvas, canvas, { width: -20, height: -10 }, gap, margin);

    expect(placement.width).toBe(0);
    expect(placement.height).toBe(0);
    expectInsideCanvas(placement, canvas, margin);
  });

  it('stays inside the canvas for every tool along the left edge', () => {
    for (let top = canvas.top; top <= canvas.top + canvas.height; top += 16) {
      const placement = placeToolPreview(
        { left: 4, top, width: 32, height: 32 },
        canvas,
        preview,
        gap,
        margin,
      );
      expectInsideCanvas(placement, canvas, margin);
    }
  });
});
