import { describe, expect, it } from 'vite-plus/test';
import { createDefaultPlan, FloorPlan, Measurement, PlacedObject } from '../models/floor-plan';
import {
  collectBoxSelection,
  selectBox,
  selectFromHit,
  selectedPlacedObjects,
  selectionCount,
} from './selection';

const objectAt = (
  _plan: FloorPlan,
  patch: Partial<PlacedObject> & Pick<PlacedObject, 'id' | 'x' | 'y'>,
): PlacedObject => ({
  kind: 'rect',
  name: patch.id,
  width: 1,
  depth: 1,
  rotation: 0,
  groupId: null,
  ...patch,
});

const measurementAt = (
  id: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): Measurement => ({
  id,
  start: { x: x1, y: y1 },
  end: { x: x2, y: y2 },
  offset: 0,
});

const withObjects = (
  base: FloorPlan,
  objects: PlacedObject[],
  groups: FloorPlan['groups'] = [],
): FloorPlan => ({
  ...base,
  objects,
  groups,
});

describe('selectFromHit', () => {
  it('selects a lone object', () => {
    const base = createDefaultPlan();
    const plan = withObjects(base, [objectAt(base, { id: 'obj-1', x: 0, y: 0 })]);
    const next = selectFromHit(plan, null, { type: 'object', id: 'obj-1' }, false);
    expect(next).toEqual({ type: 'object', id: 'obj-1' });
  });

  it('selects the group when clicking a grouped object', () => {
    const plan = createDefaultPlan();
    const grouped = withObjects(
      plan,
      [
        objectAt(plan, { id: 'a', x: 0, y: 0, groupId: 'g1' }),
        objectAt(plan, { id: 'b', x: 2, y: 0, groupId: 'g1' }),
      ],
      [{ id: 'g1', name: 'Pair' }],
    );
    const next = selectFromHit(grouped, null, { type: 'object', id: 'a' }, false);
    expect(next).toEqual({ type: 'group', id: 'g1' });
    expect(selectedPlacedObjects(grouped, next).map((obj) => obj.id)).toEqual(['a', 'b']);
  });

  it('shift-click adds and removes a group as a unit', () => {
    const plan = createDefaultPlan();
    const grouped = withObjects(
      plan,
      [
        objectAt(plan, { id: 'a', x: 0, y: 0, groupId: 'g1' }),
        objectAt(plan, { id: 'b', x: 2, y: 0, groupId: 'g1' }),
        objectAt(plan, { id: 'c', x: 4, y: 0 }),
      ],
      [{ id: 'g1', name: 'Pair' }],
    );
    const withC = selectFromHit(grouped, null, { type: 'object', id: 'c' }, false);
    const added = selectFromHit(grouped, withC, { type: 'object', id: 'a' }, true);
    expect(
      selectedPlacedObjects(grouped, added)
        .map((obj) => obj.id)
        .sort(),
    ).toEqual(['a', 'b', 'c']);
    const removed = selectFromHit(grouped, added, { type: 'object', id: 'b' }, true);
    expect(selectedPlacedObjects(grouped, removed).map((obj) => obj.id)).toEqual(['c']);
  });

  it('selects a measurement from a measurement hit', () => {
    const plan = createDefaultPlan();
    const next = selectFromHit(plan, null, { type: 'measurement', id: 'm1' }, false);
    expect(next).toEqual({ type: 'measurement', id: 'm1' });
  });
});

describe('selectBox', () => {
  it('window-selects only objects fully inside', () => {
    const plan = createDefaultPlan();
    const filled = withObjects(plan, [
      objectAt(plan, { id: 'inside', x: 1, y: 1, width: 1, depth: 1 }),
      objectAt(plan, { id: 'edge', x: 3, y: 1, width: 2, depth: 1 }),
    ]);
    const pick = collectBoxSelection(filled, { x: 0, y: 0 }, { x: 3, y: 3 });
    expect(pick.objectIds).toEqual(['inside']);
    expect(selectBox(filled, null, pick, false)).toEqual({ type: 'object', id: 'inside' });
  });

  it('crossing-selects objects that overlap the box', () => {
    const plan = createDefaultPlan();
    const filled = withObjects(plan, [
      objectAt(plan, { id: 'inside', x: 1, y: 1, width: 1, depth: 1 }),
      objectAt(plan, { id: 'edge', x: 3, y: 1, width: 2, depth: 1 }),
    ]);
    const pick = collectBoxSelection(filled, { x: 3, y: 0 }, { x: 0, y: 3 });
    expect(pick.objectIds.sort()).toEqual(['edge', 'inside']);
  });

  it('takes a whole group or none on window select', () => {
    const plan = createDefaultPlan();
    const grouped = withObjects(
      plan,
      [
        objectAt(plan, { id: 'a', x: 0, y: 0, groupId: 'g1' }),
        objectAt(plan, { id: 'b', x: 4, y: 0, groupId: 'g1' }),
      ],
      [{ id: 'g1', name: 'Pair' }],
    );
    const partial = collectBoxSelection(grouped, { x: -0.5, y: -0.5 }, { x: 1.5, y: 1.5 });
    expect(partial.objectIds).toEqual([]);
    const full = collectBoxSelection(grouped, { x: -0.5, y: -0.5 }, { x: 5.5, y: 1.5 });
    expect(full.objectIds.sort()).toEqual(['a', 'b']);
    expect(selectBox(grouped, null, full, false)).toEqual({ type: 'group', id: 'g1' });
  });

  it('collapses mixed kinds to multi', () => {
    const plan = createDefaultPlan();
    const mixed: FloorPlan = {
      ...plan,
      objects: [objectAt(plan, { id: 'o1', x: 0, y: 0 })],
      measurements: [measurementAt('m1', 0, 2, 1, 2)],
    };
    const pick = collectBoxSelection(mixed, { x: -0.5, y: -0.5 }, { x: 2, y: 3 });
    const selection = selectBox(mixed, null, pick, false);
    expect(selection?.type).toBe('multi');
    expect(selectionCount(mixed, selection)).toBe(2);
  });

  it('box-selects walls and windows with the select tool', () => {
    const plan: FloorPlan = {
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
          kind: 'window',
          center: { x: 3.5, y: 0 },
          width: 1.2,
          rotation: 0,
          wallId: 'w1',
        },
      ],
    };
    const onlyWall = collectBoxSelection(plan, { x: 2.6, y: -0.4 }, { x: 1.8, y: 0.4 });
    expect(onlyWall.wallIds).toEqual(['w1']);
    expect(selectBox(plan, null, onlyWall, false)).toEqual({ type: 'wall', id: 'w1' });
    const onlyWindow = collectBoxSelection(plan, { x: 2.8, y: -0.4 }, { x: 4.2, y: 0.4 });
    expect(onlyWindow.openingIds).toEqual(['win1']);
    const aroundAll = collectBoxSelection(plan, { x: -0.5, y: -0.5 }, { x: 5.5, y: 0.5 });
    const selection = selectBox(plan, null, aroundAll, false);
    expect(selection?.type).toBe('multi');
    expect(selectionCount(plan, selection)).toBe(2);
  });

  it('window-selects the offset dimension line', () => {
    const plan: FloorPlan = {
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
    const aroundLine = collectBoxSelection(plan, { x: -0.5, y: 1.5 }, { x: 4.5, y: 2.5 });
    expect(aroundLine.measurementIds).toEqual(['m1']);
    const aroundOrigin = collectBoxSelection(plan, { x: -0.5, y: -0.5 }, { x: 4.5, y: 0.5 });
    expect(aroundOrigin.measurementIds).toEqual([]);
  });
});
