import { describe, expect, it } from 'vite-plus/test';
import { parseProjectDocument, PROJECT_KIND } from './persistence';

describe('parseProjectDocument', () => {
  it('keeps objects from older files that still have walls, layers, and rooms', () => {
    const parsed = parseProjectDocument({
      kind: PROJECT_KIND,
      formatVersion: 1,
      plan: {
        version: 1,
        name: 'Old plan',
        layers: [{ id: 'l1', name: 'Walls', visible: true, locked: false }],
        activeLayerId: 'l1',
        walls: [
          {
            id: 'w1',
            layerId: 'l1',
            start: { x: 0, y: 0 },
            end: { x: 2, y: 0 },
            thickness: 0.1,
          },
        ],
        objects: [
          {
            id: 'o1',
            layerId: 'l1',
            kind: 'rect',
            name: 'Table',
            x: 1,
            y: 1,
            width: 0.8,
            depth: 0.8,
            rotation: 0,
            groupId: null,
          },
        ],
        rooms: [
          {
            id: 'r1',
            layerId: 'l1',
            name: 'Kitchen',
            category: 'kitchen',
            x: 0,
            y: 0,
            width: 3,
            depth: 4,
          },
        ],
        measurements: [],
        groups: [],
        viewport: { panX: 0, panY: 0, zoom: 40 },
      },
    });

    expect(parsed?.plan.name).toBe('Old plan');
    // Legacy walls (start/end form) are ignored; the new polyline walls list is empty.
    expect(parsed?.plan.walls).toEqual([]);
    expect(parsed?.plan).not.toHaveProperty('layers');
    expect(parsed?.plan).not.toHaveProperty('activeLayerId');
    expect(parsed?.plan).not.toHaveProperty('rooms');
    expect(parsed?.plan.measurements).toEqual([]);
    expect(parsed?.gridSpacingMeters).toBe(1);
    expect(parsed?.plan.objects).toEqual([
      {
        id: 'o1',
        kind: 'rect',
        name: 'Table',
        x: 1,
        y: 1,
        width: 0.8,
        depth: 0.8,
        rotation: 0,
        groupId: null,
      },
    ]);
  });

  it('keeps a measurement offset and defaults missing offsets to 0', () => {
    const parsed = parseProjectDocument({
      kind: PROJECT_KIND,
      formatVersion: 1,
      plan: {
        version: 1,
        name: 'Measured',
        background: null,
        objects: [],
        measurements: [
          {
            id: 'm1',
            start: { x: 0, y: 0 },
            end: { x: 2, y: 0 },
            offset: 0.4,
          },
          {
            id: 'm2',
            start: { x: 0, y: 1 },
            end: { x: 1, y: 1 },
          },
        ],
        groups: [],
        viewport: { panX: 0, panY: 0, zoom: 40 },
      },
    });

    expect(parsed?.plan.measurements).toEqual([
      {
        id: 'm1',
        start: { x: 0, y: 0 },
        end: { x: 2, y: 0 },
        offset: 0.4,
      },
      {
        id: 'm2',
        start: { x: 0, y: 1 },
        end: { x: 1, y: 1 },
        offset: 0,
      },
    ]);
  });

  it('keeps helper-line spacing in meters and replaces an unusable value', () => {
    const kept = parseProjectDocument({
      kind: PROJECT_KIND,
      formatVersion: 1,
      lengthUnit: 'cm',
      gridSpacingMeters: 0.5,
      plan: {
        version: 1,
        name: 'Spaced',
        background: null,
        objects: [],
        measurements: [],
        groups: [],
        viewport: { panX: 0, panY: 0, zoom: 40 },
      },
    });
    const replaced = parseProjectDocument({
      kind: PROJECT_KIND,
      formatVersion: 1,
      gridSpacingMeters: 0,
      plan: {
        version: 1,
        name: 'Spaced',
        background: null,
        objects: [],
        measurements: [],
        groups: [],
        viewport: { panX: 0, panY: 0, zoom: 40 },
      },
    });

    expect(kept?.lengthUnit).toBe('cm');
    expect(kept?.gridSpacingMeters).toBe(0.5);
    expect(replaced?.gridSpacingMeters).toBe(1);
  });
});

describe('walls persistence', () => {
  it('keeps valid walls, clamps thickness, drops short/invalid walls, older saves get []', () => {
    const parsed = parseProjectDocument({
      kind: PROJECT_KIND,
      formatVersion: 1,
      plan: {
        version: 1,
        name: 'W',
        objects: [],
        measurements: [],
        walls: [
          {
            id: 'w1',
            points: [
              { x: 0, y: 0 },
              { x: 2, y: 0 },
              { x: 2, y: 1 },
            ],
            thickness: 99,
          },
          { id: 'w2', points: [{ x: 0, y: 0 }], thickness: 0.2 },
          {
            id: 'w3',
            points: [
              { x: 0, y: 0 },
              { x: 'a', y: 0 },
            ],
            thickness: 0.2,
          },
        ],
        groups: [],
        viewport: { panX: 0, panY: 0, zoom: 40 },
      },
    });
    expect(parsed!.plan.walls).toHaveLength(1);
    expect(parsed!.plan.walls[0].thickness).toBe(1);
    expect(parsed!.plan.walls[0].points).toHaveLength(3);
    const old = parseProjectDocument({
      kind: PROJECT_KIND,
      formatVersion: 1,
      plan: {
        version: 1,
        name: 'O',
        objects: [],
        measurements: [],
        groups: [],
        viewport: { panX: 0, panY: 0, zoom: 40 },
      },
    });
    expect(old!.plan.walls).toEqual([]);
  });
});
