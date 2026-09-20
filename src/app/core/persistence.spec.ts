import { describe, expect, it } from 'vitest';
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
    expect(parsed?.plan).not.toHaveProperty('walls');
    expect(parsed?.plan).not.toHaveProperty('layers');
    expect(parsed?.plan).not.toHaveProperty('activeLayerId');
    expect(parsed?.plan).not.toHaveProperty('rooms');
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
});
