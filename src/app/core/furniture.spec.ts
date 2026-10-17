import { describe, expect, it } from 'vite-plus/test';
import { createDefaultPlan, FloorPlan, PlacedObject } from '../models/floor-plan';
import {
  FURNITURE,
  FURNITURE_CATEGORIES,
  CUPBOARD_DOOR_ID,
  cupboardDoorPlacement,
  furniturePreview,
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
  it('puts a cupboard-wide door on the front edge, hinged at one end', () => {
    const item = furnitureById(CUPBOARD_DOOR_ID)!;
    const door = cupboardDoorPlacement({ x: 1, y: 2, width: item.width, depth: item.depth });
    expect(door.center).toEqual({ x: 1.5, y: 2.6 });
    expect(door.width).toBe(item.width);
    expect(door.rotation).toBe(0);
  });

  it('adds cupboard plus door in one undo step', () => {
    const edit = new PlanEdit();
    edit.beginEdit();
    const body = edit.addObject('rect', 0, 0, 1, 0.6, 'Cupboard with door').object;
    const door = cupboardDoorPlacement(body);
    edit.addOpening('door', door.center, {
      width: door.width,
      rotation: 0,
      wallId: null,
      flipV: true,
    });
    edit.endEdit();
    expect(edit.plan.objects).toHaveLength(1);
    expect(edit.plan.openings).toHaveLength(1);
    expect(edit.plan.openings[0]).toMatchObject({ kind: 'door', flipV: true, wallId: null });
    expect(edit.undo()).toBe(true);
    expect(edit.plan.objects).toHaveLength(0);
    expect(edit.plan.openings).toHaveLength(0);
    expect(edit.canUndo).toBe(false);
  });

  it('previews every item at its true proportions with one uniform scale', () => {
    for (const item of FURNITURE) {
      const pv = furniturePreview(item);
      // Body ratio matches the placed footprint ratio (both should be width:depth).
      expect(pv.body.w / pv.body.h).toBeCloseTo(item.width / item.depth, 6);
      // One uniform scale on both axes - no stretching.
      expect(pv.body.w / item.width).toBeCloseTo(pv.scale, 6);
      expect(pv.body.h / item.depth).toBeCloseTo(pv.scale, 6);
      // Preview fits and is centred in the 100x70 tile viewBox.
      expect(pv.total.x).toBeGreaterThanOrEqual(0);
      expect(pv.total.y).toBeGreaterThanOrEqual(0);
      expect(pv.total.x + pv.total.w).toBeLessThanOrEqual(100.001);
      expect(pv.total.y + pv.total.h).toBeLessThanOrEqual(70.001);
      expect(pv.total.x + pv.total.w / 2).toBeCloseTo(50, 6);
      expect(pv.total.y + pv.total.h / 2).toBeCloseTo(35, 6);
      if (item.kind === 'circle') {
        expect(pv.body.rx).toBeCloseTo(pv.body.ry, 6);
      }
      if (item.id !== CUPBOARD_DOOR_ID) {
        expect(pv.door).toBeNull();
        expect(pv.total.w).toBeCloseTo(pv.body.w, 6);
        expect(pv.total.h).toBeCloseTo(pv.body.h, 6);
      }
    }
  });

  it('cupboard preview derives its door from the placement geometry, arc included', () => {
    const item = furnitureById(CUPBOARD_DOOR_ID)!;
    const pv = furniturePreview(item);
    expect(pv.door).not.toBeNull();
    const door = pv.door!;
    // Body is 1.00 x 0.60 m at the preview scale.
    expect(pv.body.w / pv.body.h).toBeCloseTo(item.width / item.depth, 6);
    expect(pv.body.w).toBeCloseTo(item.width * pv.scale, 6);
    expect(pv.body.h).toBeCloseTo(item.depth * pv.scale, 6);
    // Hinged at the left end of the front (bottom) edge.
    expect(door.hinge.x).toBeCloseTo(pv.body.x, 6);
    expect(door.hinge.y).toBeCloseTo(pv.body.y + pv.body.h, 6);
    expect(door.frontEnd.x).toBeCloseTo(pv.body.x + pv.body.w, 6);
    expect(door.frontEnd.y).toBeCloseTo(door.hinge.y, 6);
    // Leaf length and arc radius both equal the door width (= cupboard front width).
    expect(door.leafEnd.x).toBeCloseTo(door.hinge.x, 6);
    expect(door.leafEnd.y - door.hinge.y).toBeCloseTo(item.width * pv.scale, 6);
    expect(door.radius).toBeCloseTo(item.width * pv.scale, 6);
    expect(door.arcEnd).toEqual(door.frontEnd);
    expect(door.arcPath).toContain(`A ${door.radius} ${door.radius} 0 0 1`);
    // Total bounding box includes the arc: width = front width, height = depth + door width.
    expect(pv.total.w).toBeCloseTo(item.width * pv.scale, 6);
    expect(pv.total.h).toBeCloseTo((item.depth + item.width) * pv.scale, 6);
    expect(pv.total.y + pv.total.h).toBeCloseTo(door.leafEnd.y, 6);
  });

  it('cupboard preview follows a different cupboard size (no hardcoded tile geometry)', () => {
    const pv = furniturePreview({ id: CUPBOARD_DOOR_ID, width: 2, depth: 1 });
    expect(pv.body.w / pv.body.h).toBeCloseTo(2, 6);
    expect(pv.door!.radius).toBeCloseTo(2 * pv.scale, 6);
    expect(pv.total.h).toBeCloseTo(3 * pv.scale, 6);
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
