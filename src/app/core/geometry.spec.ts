import { describe, expect, it } from 'vite-plus/test';
import { createDefaultPlan, type Measurement } from '../models/floor-plan';
import {
  dimensionView,
  hitTest,
  measurementLine,
  offsetSegment,
  signedPerpendicularOffset,
  connectedWallEnds,
  moveWallEndpoint,
  snapWallPoint,
  snapWallTranslation,
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
    expect(signedPerpendicularOffset({ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 100, y: 1.5 })).toBe(1.5);
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

describe('wall snapping', () => {
  const walls = [
    {
      id: 'w1',
      points: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 3 },
      ],
      thickness: 0.15,
    },
  ];
  it('snaps to the nearest wall endpoint first', () => {
    const snap = snapWallPoint({ x: 4.08, y: 0.06 }, walls, 0.2, true);
    expect(snap.snapped).toBe(true);
    expect(snap.kind).toBe('wall-endpoint');
    expect(snap.point).toEqual({ x: 4, y: 0 });
  });
  it('snaps onto a wall segment when no endpoint is near', () => {
    const snap = snapWallPoint({ x: 2, y: 0.12 }, walls, 0.2, true);
    expect(snap.kind).toBe('wall-segment');
    expect(snap.point).toEqual({ x: 2, y: 0 });
  });
  it('does not snap when disabled (Shift) or beyond tolerance', () => {
    expect(snapWallPoint({ x: 4.05, y: 0 }, walls, 0.2, false).snapped).toBe(false);
    expect(snapWallPoint({ x: 2, y: 1 }, walls, 0.2, true).snapped).toBe(false);
  });
  it('adjusts a wall move so its endpoints meet another wall', () => {
    const moving = [
      { x: 6, y: 0.1 },
      { x: 8, y: 0.1 },
    ];
    const adjusted = snapWallTranslation(moving, walls, -1.95, 0, 0.2, true);
    expect(adjusted.snapped).toBe(true);
    // Lands exactly on the other wall's vertical segment (x = 4).
    expect(moving[0].x + adjusted.dx).toBeCloseTo(4);
    expect(moving[0].y + adjusted.dy).toBeCloseTo(0.1);
    expect(snapWallTranslation(moving, walls, -1.95, 0, 0.2, false).snapped).toBe(false);
  });
});

describe('wall endpoint editing', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 3 },
  ];
  it('moves only the start or end point of a polyline', () => {
    expect(moveWallEndpoint(points, 'start', { x: -1, y: 1 })).toEqual([
      { x: -1, y: 1 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
    ]);
    expect(moveWallEndpoint(points, 'end', { x: 5, y: 4 })).toEqual([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 5, y: 4 },
    ]);
    // Original is not mutated.
    expect(points[0]).toEqual({ x: 0, y: 0 });
  });
  it('hit-tests the selected wall’s end handles ahead of the wall body', () => {
    const plan = {
      ...createDefaultPlan(),
      walls: [{ id: 'w1', points, thickness: 0.15 }],
    };
    const withWall = { objects: [], measurementId: null, wallId: 'w1' };
    expect(hitTest(plan, { x: 0.05, y: 0 }, 100, withWall)).toEqual({
      type: 'wall-end',
      id: 'w1',
      end: 'start',
    });
    expect(hitTest(plan, { x: 4, y: 2.95 }, 100, withWall)).toEqual({
      type: 'wall-end',
      id: 'w1',
      end: 'end',
    });
    // Without the wall selected, the same clicks hit the wall body as before.
    const noWall = { objects: [], measurementId: null };
    expect(hitTest(plan, { x: 0.05, y: 0 }, 100, noWall)).toEqual({ type: 'wall', id: 'w1' });
  });
});

describe('connectedWallEnds', () => {
  const walls = [
    {
      id: 'w1',
      points: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
      ],
      thickness: 0.15,
    },
    {
      id: 'w2',
      points: [
        { x: 2, y: 0 },
        { x: 2, y: 2 },
      ],
      thickness: 0.15,
    },
    // Legacy multi-segment wall whose end also lands on the shared corner.
    {
      id: 'w3',
      points: [
        { x: 5, y: 5 },
        { x: 5, y: 0 },
        { x: 2, y: 0 },
      ],
      thickness: 0.15,
    },
    {
      id: 'w4',
      points: [
        { x: 9, y: 9 },
        { x: 10, y: 9 },
      ],
      thickness: 0.15,
    },
  ];
  it('finds every wall end sharing the corner, across separate and multi-segment walls', () => {
    expect(connectedWallEnds(walls, 'w1', 'end')).toEqual([
      { id: 'w1', end: 'end' },
      { id: 'w2', end: 'start' },
      { id: 'w3', end: 'end' },
    ]);
  });
  it('returns only the wall itself for an unconnected end', () => {
    expect(connectedWallEnds(walls, 'w4', 'start')).toEqual([{ id: 'w4', end: 'start' }]);
    expect(connectedWallEnds(walls, 'missing', 'start')).toEqual([]);
  });
});

describe('hitTest walls and openings', () => {
  const plan = {
    ...createDefaultPlan(),
    walls: [
      {
        id: 'w1',
        points: [
          { x: 0, y: 0 },
          { x: 5, y: 0 },
        ],
        thickness: 0.15,
      },
    ],
    openings: [
      {
        id: 'win1',
        kind: 'window' as const,
        center: { x: 3.5, y: 0 },
        width: 1.2,
        rotation: 0,
        wallId: 'w1',
      },
      {
        id: 'door1',
        kind: 'door' as const,
        center: { x: 1, y: 0 },
        width: 0.9,
        rotation: 0,
        wallId: 'w1',
      },
    ],
  };
  const handles = { objects: [], measurementId: null };
  it('selects a wall by clicking its segment', () => {
    expect(hitTest(plan, { x: 2.2, y: 0 }, 100, handles)).toEqual({ type: 'wall', id: 'w1' });
    expect(hitTest(plan, { x: 2.2, y: 0.5 }, 100, handles)).toBeNull();
  });
  it('selects a window by clicking it, ahead of the wall behind it', () => {
    expect(hitTest(plan, { x: 3.5, y: 0 }, 100, handles)).toEqual({
      type: 'opening',
      id: 'win1',
    });
  });
  it('selects a door by its span and by its swung leaf', () => {
    expect(hitTest(plan, { x: 1, y: 0 }, 100, handles)).toEqual({ type: 'opening', id: 'door1' });
    // Leaf hangs from the left hinge (0.55, 0) toward -y for an unflipped door.
    expect(hitTest(plan, { x: 0.55, y: -0.5 }, 100, handles)).toEqual({
      type: 'opening',
      id: 'door1',
    });
  });
});
