import { describe, expect, it } from 'vite-plus/test';
import { PlacedObject } from '../models/floor-plan';
import { PlanEdit } from './plan-edit';

const place = (
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

describe('PlanEdit', () => {
  it('pastes grouped objects with remapped group ids', () => {
    const edit = new PlanEdit();
    const a = place({ id: 'a', x: 0, y: 0, groupId: 'g1' });
    const b = place({ id: 'b', x: 1, y: 0, groupId: 'g1' });
    edit.hydrate(
      {
        ...edit.plan,
        objects: [a, b],
        groups: [{ id: 'g1', name: 'Sofa' }],
      },
      null,
    );
    const copied = edit.copySelection({ type: 'group', id: 'g1' });
    expect(copied.notice).toEqual({ kind: 'copied', count: 2 });
    const first = edit.pasteClipboard();
    expect(first.notice?.kind).toBe('pasted');
    expect(edit.plan.objects).toHaveLength(4);
    const pasted = edit.plan.objects.slice(2);
    expect(new Set(pasted.map((obj) => obj.groupId)).size).toBe(1);
    expect(pasted[0].groupId).not.toBe('g1');
    expect(pasted[0].x).toBeCloseTo(0.25);
    const second = edit.pasteClipboard();
    expect(second.notice?.kind).toBe('pasted');
    expect(edit.plan.objects[4].x).toBeCloseTo(0.5);
  });

  it('groups a live color-picking gesture into one undo step', () => {
    const edit = new PlanEdit();
    edit.hydrate({ ...edit.plan, objects: [place({ id: 'a', x: 0, y: 0 })] }, null);
    edit.beginEdit();
    edit.updateObject('a', { color: '#111111' });
    edit.updateObject('a', { color: '#222222', borderColor: '#333333' });
    edit.endEdit();
    expect(edit.plan.objects[0].color).toBe('#222222');
    expect(edit.undo()).toBe(true);
    expect(edit.plan.objects[0].color).toBeUndefined();
    expect(edit.plan.objects[0].borderColor).toBeUndefined();
    expect(edit.canUndo).toBe(false);
  });

  it('restacks objects in the plan order', () => {
    const edit = new PlanEdit();
    edit.hydrate(
      {
        ...edit.plan,
        objects: [
          place({ id: 'f1', x: 0, y: 0 }),
          place({ id: 'w1', x: 0, y: 2 }),
          place({ id: 'f2', x: 2, y: 0 }),
        ],
      },
      null,
    );
    edit.restackSelection({ type: 'object', id: 'f1' }, 'front');
    expect(edit.plan.objects.map((obj) => obj.id)).toEqual(['w1', 'f2', 'f1']);
  });

  it('scales geometry from two points', () => {
    const edit = new PlanEdit();
    edit.hydrate(
      {
        ...edit.plan,
        background: { widthPx: 1000, heightPx: 800, metersPerPixel: 0.01, calibrated: false },
        objects: [place({ id: 'o', x: 1, y: 1, width: 2, depth: 1 })],
      },
      null,
    );
    const result = edit.applyScale({ x: 0, y: 0 }, { x: 2, y: 0 }, 4);
    expect(result.notice?.kind).toBe('scale-applied');
    expect(edit.plan.objects[0].x).toBeCloseTo(2);
    expect(edit.plan.objects[0].width).toBeCloseTo(4);
    expect(edit.plan.background?.calibrated).toBe(true);
  });

  it('stores a measurement offset and scales it with the plan', () => {
    const edit = new PlanEdit();
    const added = edit.addMeasurement({ x: 0, y: 0 }, { x: 2, y: 0 }, 0.5);
    expect('measurement' in added).toBe(true);
    if (!('measurement' in added)) {
      return;
    }
    expect(added.measurement.offset).toBe(0.5);
    edit.applyScale({ x: 0, y: 0 }, { x: 2, y: 0 }, 4);
    expect(edit.plan.measurements[0].start).toEqual({ x: 0, y: 0 });
    expect(edit.plan.measurements[0].end).toEqual({ x: 4, y: 0 });
    expect(edit.plan.measurements[0].offset).toBe(1);
  });

  it('records one undo step for a gesture of live poses', () => {
    const edit = new PlanEdit();
    edit.hydrate(
      {
        ...edit.plan,
        objects: [place({ id: 'o', x: 0, y: 0 })],
      },
      null,
    );
    edit.beginEdit();
    edit.applyObjectPoses([{ id: 'o', x: 0.1, y: 0 }]);
    edit.applyObjectPoses([{ id: 'o', x: 0.4, y: 0 }]);
    edit.applyObjectPoses([{ id: 'o', x: 1, y: 0 }]);
    edit.endEdit();
    expect(edit.plan.objects[0].x).toBeCloseTo(1);
    expect(edit.undo()).toBe(true);
    expect(edit.plan.objects[0].x).toBeCloseTo(0);
    expect(edit.undo()).toBe(false);
  });

  it('snapshots a named inspector patch', () => {
    const edit = new PlanEdit();
    edit.hydrate(
      {
        ...edit.plan,
        objects: [place({ id: 'o', x: 0, y: 0, width: 1, depth: 1 })],
      },
      null,
    );
    edit.updateObject('o', { width: 2 });
    expect(edit.plan.objects[0].width).toBe(2);
    expect(edit.undo()).toBe(true);
    expect(edit.plan.objects[0].width).toBe(1);
  });
});

describe('walls', () => {
  it('places one straight wall per placement; the next placement is a separate wall', () => {
    const edit = new PlanEdit();
    edit.addWall([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
    ]);
    // Even starting exactly where the previous wall ended, this is its own wall,
    // not a continuation of a chain.
    edit.addWall([
      { x: 2, y: 0 },
      { x: 2, y: 2 },
    ]);
    expect(edit.plan.walls).toHaveLength(2);
    expect(edit.plan.walls[0].points).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
    ]);
    expect(edit.plan.walls[1].points).toEqual([
      { x: 2, y: 0 },
      { x: 2, y: 2 },
    ]);
    expect(edit.plan.walls[0].id).not.toBe(edit.plan.walls[1].id);
  });

  it('adds, updates, scales, deletes and undoes walls', () => {
    const edit = new PlanEdit();
    const added = edit.addWall(
      [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 2, y: 0 },
      ],
      0.2,
    );
    if (!('wall' in added)) throw new Error('wall not added');
    expect(edit.plan.walls).toHaveLength(1);
    expect(edit.plan.walls[0].points).toHaveLength(2);
    edit.updateWall(added.wall.id, { thickness: 5 });
    expect(edit.plan.walls[0].thickness).toBe(1);
    edit.applyScale({ x: 0, y: 0 }, { x: 1, y: 0 }, 2);
    expect(edit.plan.walls[0].points[1].x).toBeCloseTo(4);
    expect(edit.plan.walls[0].thickness).toBeCloseTo(2);
    edit.deleteSelection({ type: 'wall', id: added.wall.id });
    expect(edit.plan.walls).toHaveLength(0);
    expect(edit.undo()).toBe(true);
    expect(edit.plan.walls).toHaveLength(1);
  });
});
