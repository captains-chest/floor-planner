import { describe, expect, it } from 'vitest';
import { createDefaultPlan, FloorPlan, PlacedObject } from '../models/floor-plan';
import { FURNITURE, FURNITURE_CATEGORIES, furnitureById, furnitureObjectName } from './furniture';
import { PlanEdit } from './plan-edit';

const planWith = (...names: string[]): FloorPlan => ({
  ...createDefaultPlan(),
  objects: names.map((name, i): PlacedObject => ({
    id: `o${i}`,
    kind: 'rect',
    name,
    x: 0,
    y: 0,
    width: 1,
    depth: 1,
    rotation: 0,
    groupId: null,
  })),
});

describe('furniture library', () => {
  it('has unique ids, known categories and positive real-world sizes', () => {
    expect(new Set(FURNITURE.map((item) => item.id)).size).toBe(FURNITURE.length);
    for (const item of FURNITURE) {
      expect(FURNITURE_CATEGORIES).toContain(item.category);
      expect(item.width).toBeGreaterThan(0.2);
      expect(item.width).toBeLessThan(3);
      expect(item.depth).toBeGreaterThan(0.2);
      expect(item.depth).toBeLessThan(3);
      if (item.kind === 'circle') {
        expect(item.width).toBe(item.depth);
      }
    }
  });

  it('every category has at least one item', () => {
    for (const category of FURNITURE_CATEGORIES) {
      expect(FURNITURE.some((item) => item.category === category)).toBe(true);
    }
  });

  it('looks items up by id', () => {
    expect(furnitureById('bed-double')?.width).toBe(1.6);
    expect(furnitureById('nope')).toBeUndefined();
  });

  it('numbers repeated pieces so labels stay distinct', () => {
    const chair = furnitureById('chair')!;
    expect(furnitureObjectName(chair, planWith())).toBe('Chair');
    expect(furnitureObjectName(chair, planWith('Chair'))).toBe('Chair 2');
    expect(furnitureObjectName(chair, planWith('Chair', 'Chair 2', 'Chair 4'))).toBe('Chair 3');
  });

  it('places a named object with the item footprint, undoable', () => {
    const edit = new PlanEdit();
    const bed = furnitureById('bed-double')!;
    const { object } = edit.addObject(bed.kind, 1, 2, bed.width, bed.depth, 'Double bed');
    expect(object).toMatchObject({ name: 'Double bed', x: 1, y: 2, width: 1.6, depth: 2 });
    expect(edit.plan.objects).toHaveLength(1);
    edit.undo();
    expect(edit.plan.objects).toHaveLength(0);
  });

  it('keeps the default shape name when none is given', () => {
    const edit = new PlanEdit();
    expect(edit.addObject('rect', 0, 0, 1, 1).object.name).toBe('Rect 1');
  });
});
