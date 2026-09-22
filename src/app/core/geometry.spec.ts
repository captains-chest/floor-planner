import { describe, expect, it } from 'vitest';
import { createDefaultPlan, type Measurement } from '../models/floor-plan';
import {
  dimensionView,
  hitTest,
  measurementLine,
  offsetSegment,
  signedPerpendicularOffset,
  unitPerpendicular,
} from './geometry';

describe('unitPerpendicular', () => {
  it('points left of travel along a horizontal segment', () => {
    const normal = unitPerpendicular({ x: 0, y: 0 }, { x: 4, y: 0 });
    expect(normal.x).toBeCloseTo(0);
    expect(normal.y).toBeCloseTo(1);
  });

  it('returns a zero vector for a degenerate segment', () => {
    expect(unitPerpendicular({ x: 1, y: 1 }, { x: 1, y: 1 })).toEqual({ x: 0, y: 0 });
  });
});

describe('signedPerpendicularOffset', () => {
  it('is the signed distance from a horizontal segment to a point', () => {
    const start = { x: 0, y: 0 };
    const end = { x: 4, y: 0 };
    expect(signedPerpendicularOffset(start, end, { x: 2, y: 3 })).toBe(3);
    expect(signedPerpendicularOffset(start, end, { x: 9, y: -2 })).toBe(-2);
    expect(signedPerpendicularOffset(start, end, { x: 1, y: 0 })).toBe(0);
  });

  it('ignores motion along the segment', () => {
    expect(
      signedPerpendicularOffset({ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 100, y: 1.5 }),
    ).toBe(1.5);
  });
});

describe('offsetSegment', () => {
  it('translates a segment along its perpendicular', () => {
    expect(offsetSegment({ x: 0, y: 0 }, { x: 4, y: 0 }, 2)).toEqual({
      start: { x: 0, y: 2 },
      end: { x: 4, y: 2 },
    });
    expect(offsetSegment({ x: 0, y: 0 }, { x: 4, y: 0 }, -1)).toEqual({
      start: { x: 0, y: -1 },
      end: { x: 4, y: -1 },
    });
  });
});

describe('dimensionView', () => {
  it('keeps length and moves the dimension line by the offset', () => {
    const view = dimensionView({ x: 0, y: 0 }, { x: 4, y: 0 }, 0.1, 'm', 2);
    expect(view.originStart).toEqual({ x: 0, y: 0 });
    expect(view.originEnd).toEqual({ x: 4, y: 0 });
    expect(view.start).toEqual({ x: 0, y: 2 });
    expect(view.end).toEqual({ x: 4, y: 2 });
    expect(view.mid).toEqual({ x: 2, y: 2 });
    expect(view.lengthLabel).toBe('4.00 m');
  });
});

describe('measurementLine', () => {
  it('returns the visible dimension segment', () => {
    const measurement: Measurement = {
      id: 'm1',
      start: { x: 0, y: 0 },
      end: { x: 4, y: 0 },
      offset: 2,
    };
    expect(measurementLine(measurement)).toEqual({
      start: { x: 0, y: 2 },
      end: { x: 4, y: 2 },
    });
  });
});

describe('hitTest measurements', () => {
  it('still hits an unoffset measurement on its segment', () => {
    const plan = {
      ...createDefaultPlan(),
      measurements: [
        {
          id: 'm1',
          start: { x: 0, y: 0 },
          end: { x: 4, y: 0 },
          offset: 0,
        },
      ],
    };
    expect(hitTest(plan, { x: 2, y: 0 }, 40, { objects: [], measurementId: null })).toEqual({
      type: 'measurement',
      id: 'm1',
    });
  });

  it('hits the offset dimension line, not the measured segment', () => {
    const plan = {
      ...createDefaultPlan(),
      measurements: [
        {
          id: 'm1',
          start: { x: 0, y: 0 },
          end: { x: 4, y: 0 },
          offset: 2,
        },
      ],
    };
    const handles = { objects: [], measurementId: 'm1' };
    expect(hitTest(plan, { x: 2, y: 2 }, 40, handles)).toEqual({
      type: 'measurement',
      id: 'm1',
    });
    expect(hitTest(plan, { x: 2, y: 0 }, 40, handles)).toBeNull();
  });

  it('uses offset endpoints for measurement handles', () => {
    const plan = {
      ...createDefaultPlan(),
      measurements: [
        {
          id: 'm1',
          start: { x: 0, y: 0 },
          end: { x: 4, y: 0 },
          offset: 2,
        },
      ],
    };
    const handles = { objects: [], measurementId: 'm1' };
    expect(hitTest(plan, { x: 0, y: 2 }, 40, handles)).toEqual({
      type: 'measurement-end',
      id: 'm1',
      end: 'start',
    });
    expect(hitTest(plan, { x: 0, y: 0 }, 40, handles)).toBeNull();
  });
});
