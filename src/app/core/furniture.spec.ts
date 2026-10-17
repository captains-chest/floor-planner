import { describe, expect, it } from 'vite-plus/test';
import { createDefaultPlan, FloorPlan, PlacedObject } from '../models/floor-plan';
import {
  FURNITURE,
  FURNITURE_CATEGORIES,
  CUPBOARD_DOOR_ID,
  cupboardFrontPieces,
  filterFurniture,
  furnitureById,
  furnitureObjectName,
  placementSpot,
} from './furniture';
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
  it('finds pieces by name or category for catalog search', () => {
    expect(filterFurniture('sofa').map((i) => i.id)).toContain('sofa-3');
    expect(filterFurniture('bathroom').length).toBeGreaterThan(3);
    expect(filterFurniture('  ')).toHaveLength(FURNITURE.length);
    expect(filterFurniture('zzz')).toEqual([]);
  });
  it('builds two cupboard fronts flush on the front edge, with handles by the seam', () => {
    const item = furnitureById(CUPBOARD_DOOR_ID)!;
    const pieces = cupboardFrontPieces({ x: 1, y: 2, width: item.width, depth: item.depth });
    expect(pieces.panels).toHaveLength(2);
    expect(pieces.handles).toHaveLength(2);
    for (const panel of pieces.panels) {
      expect(panel.y + panel.depth).toBeLessThanOrEqual(2.6 + 1e-9);
      expect(panel.width).toBeLessThan(0.5);
      expect(panel.depth).toBeCloseTo(0.12);
    }
    expect(pieces.panels[1].x - (pieces.panels[0].x + pieces.panels[0].width)).toBeCloseTo(0.02);
  });

  it('places a cupboard with doors as one deletable group in one undo step', () => {
    const edit = new PlanEdit();
    const item = furnitureById(CUPBOARD_DOOR_ID)!;
    const pieces = cupboardFrontPieces({ x: 0, y: 0, width: item.width, depth: item.depth });
    const made = edit.addCupboardWithDoors(item.width, item.depth, 0, 0, item.name, pieces);
    expect(edit.plan.objects).toHaveLength(5);
    expect(new Set(edit.plan.objects.map((o) => o.groupId))).toEqual(new Set([made.group.id]));
    edit.deleteSelection({ type: 'group', id: made.group.id });
    expect(edit.plan.objects).toHaveLength(0);
    expect(edit.undo()).toBe(true);
    expect(edit.plan.objects).toHaveLength(5);
  });

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

  it('centres a new piece, and nudges it off a piece already placed there', () => {
    const chair = { width: 0.4, depth: 0.6 };
    const empty = planWith();
    expect(placementSpot(chair, { x: 2, y: 2 }, empty)).toEqual({ x: 1.8, y: 1.7 });
    const taken = planWith('Chair');
    taken.objects[0] = { ...taken.objects[0], x: 1.8, y: 1.7 };
    const next = placementSpot(chair, { x: 2, y: 2 }, taken);
    expect(next.x).toBeCloseTo(2.1);
    expect(next.y).toBeCloseTo(2.0);
  });
});
