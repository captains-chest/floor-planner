import { describe, expect, it } from 'vitest';
import { createDefaultPlan, FloorPlan, PlacedObject } from '../models/floor-plan';
import { PlanEdit } from './plan-edit';

const place = (
  plan: FloorPlan,
  patch: Partial<PlacedObject> & Pick<PlacedObject, 'id' | 'x' | 'y'>,
): PlacedObject => ({
  layerId: plan.layers.find((layer) => layer.name === 'Furniture')?.id ?? plan.activeLayerId,
  kind: 'rect',
  name: patch.id,
  width: 1,
  depth: 1,
  rotation: 0,
  groupId: null,
  ...patch,
});

const furnitureLayerId = (plan: FloorPlan): string =>
  plan.layers.find((layer) => layer.name === 'Furniture')?.id ?? plan.activeLayerId;

describe('PlanEdit', () => {
  it('pastes grouped objects with remapped group ids onto the active layer', () => {
    const edit = new PlanEdit();
    const furniture = furnitureLayerId(edit.plan);
    edit.setActiveLayer(furniture);
    const a = place(edit.plan, { id: 'a', x: 0, y: 0, layerId: furniture, groupId: 'g1' });
    const b = place(edit.plan, { id: 'b', x: 1, y: 0, layerId: furniture, groupId: 'g1' });
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
    expect(pasted.every((obj) => obj.layerId === furniture)).toBe(true);
    expect(pasted[0].x).toBeCloseTo(0.25);
    const second = edit.pasteClipboard();
    expect(second.notice?.kind).toBe('pasted');
    expect(edit.plan.objects[4].x).toBeCloseTo(0.5);
  });

  it('restacks objects only within their layer', () => {
    const edit = new PlanEdit();
    const furniture = furnitureLayerId(edit.plan);
    const walls = edit.plan.layers.find((layer) => layer.name === 'Walls')?.id ?? furniture;
    edit.hydrate(
      {
        ...edit.plan,
        objects: [
          place(edit.plan, { id: 'f1', x: 0, y: 0, layerId: furniture }),
          place(edit.plan, { id: 'w1', x: 0, y: 2, layerId: walls }),
          place(edit.plan, { id: 'f2', x: 2, y: 0, layerId: furniture }),
        ],
      },
      null,
    );
    edit.restackSelection({ type: 'object', id: 'f1' }, 'front');
    expect(edit.plan.objects.map((obj) => obj.id)).toEqual(['f2', 'w1', 'f1']);
  });

  it('refuses to add an object on a locked active layer', () => {
    const edit = new PlanEdit();
    const furniture = edit.plan.layers.find((layer) => layer.name === 'Furniture');
    if (!furniture) {
      throw new Error('expected Furniture layer');
    }
    edit.setActiveLayer(furniture.id);
    edit.patchLayer(furniture.id, { locked: true });
    const result = edit.addObject('rect', 0, 0, 1, 1);
    expect('notice' in result && result.notice).toEqual({ kind: 'layer-locked', name: 'Furniture' });
    expect(edit.plan.objects).toHaveLength(0);
  });

  it('scales geometry from two points', () => {
    const edit = new PlanEdit();
    const furniture = furnitureLayerId(edit.plan);
    edit.hydrate(
      {
        ...edit.plan,
        background: { widthPx: 1000, heightPx: 800, metersPerPixel: 0.01, calibrated: false },
        objects: [place(edit.plan, { id: 'o', x: 1, y: 1, width: 2, depth: 1, layerId: furniture })],
      },
      null,
    );
    const result = edit.applyScale({ x: 0, y: 0 }, { x: 2, y: 0 }, 4);
    expect(result.notice?.kind).toBe('scale-applied');
    expect(edit.plan.objects[0].x).toBeCloseTo(2);
    expect(edit.plan.objects[0].width).toBeCloseTo(4);
    expect(edit.plan.background?.calibrated).toBe(true);
  });

  it('records one undo step for a gesture of live poses', () => {
    const edit = new PlanEdit();
    const furniture = furnitureLayerId(edit.plan);
    edit.hydrate(
      {
        ...edit.plan,
        objects: [place(edit.plan, { id: 'o', x: 0, y: 0, layerId: furniture })],
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
    const furniture = furnitureLayerId(edit.plan);
    edit.hydrate(
      {
        ...edit.plan,
        objects: [place(edit.plan, { id: 'o', x: 0, y: 0, width: 1, depth: 1, layerId: furniture })],
      },
      null,
    );
    edit.updateObject('o', { width: 2 });
    expect(edit.plan.objects[0].width).toBe(2);
    expect(edit.undo()).toBe(true);
    expect(edit.plan.objects[0].width).toBe(1);
  });
});
