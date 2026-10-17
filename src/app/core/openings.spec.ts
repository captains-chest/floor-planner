import { describe, expect, it } from 'vite-plus/test';
import { createDefaultPlan, Opening, PlacedObject, Wall } from '../models/floor-plan';
import { parseProjectDocument, PROJECT_KIND } from './persistence';
import { PlanEdit } from './plan-edit';
import { renderPlanSvg } from './plan-export';
import { snapOpening, wallRenderSegments } from './openings';

const wall: Wall = {
  id: 'w1',
  points: [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
  ],
  thickness: 0.2,
};
const cupboard: PlacedObject = {
  id: 'c1',
  kind: 'rect',
  name: 'Cupboard',
  x: 1,
  y: 2,
  width: 2,
  depth: 0.6,
  rotation: 0,
  groupId: null,
};
const door = (patch: Partial<Opening> = {}): Opening => ({
  id: 'd1',
  kind: 'door',
  center: { x: 2, y: 0 },
  width: 0.9,
  rotation: 0,
  wallId: 'w1',
  ...patch,
});

describe('opening snapping', () => {
  it('snaps to a wall: position on the wall, rotation along it, wall id set', () => {
    const snap = snapOpening({ x: 2, y: 0.18 }, [wall], [], 0.3, true);
    expect(snap.target).toBe('wall');
    expect(snap.wallId).toBe('w1');
    expect(snap.center).toEqual({ x: 2, y: 0 });
    expect(snap.rotation).toBeCloseTo(0);
  });
  it('snaps doors to the nearest object edge (cupboard), with no wall id', () => {
    const snap = snapOpening({ x: 2, y: 1.9 }, [], [cupboard], 0.3, true);
    expect(snap.target).toBe('object');
    expect(snap.wallId).toBeNull();
    expect(snap.objectId).toBe('c1');
    expect(snap.center.y).toBeCloseTo(2);
    expect(snap.rotation).toBeCloseTo(0);
  });
  it('does not snap when disabled (Shift anti-snap) or too far away', () => {
    expect(snapOpening({ x: 2, y: 0.18 }, [wall], [], 0.3, false).target).toBeNull();
    expect(snapOpening({ x: 2, y: 1 }, [wall], [], 0.3, true).target).toBeNull();
  });
  it('cuts the wall only in rendering; wall data stays whole and removal restores it', () => {
    const segs = wallRenderSegments(wall, [door()]);
    expect(segs).toHaveLength(2);
    expect(segs[0][1].x).toBeCloseTo(1.55);
    expect(segs[1][0].x).toBeCloseTo(2.45);
    expect(wall.points).toHaveLength(2);
    expect(wallRenderSegments(wall, [])).toHaveLength(1);
    expect(wallRenderSegments(wall, [door({ wallId: null })])).toHaveLength(1);
  });
});

describe('openings persistence and edit', () => {
  it('loads openings back-compatibly and copies them free of the wall', () => {
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
    expect(old!.plan.openings).toEqual([]);
    const parsed = parseProjectDocument({
      kind: PROJECT_KIND,
      formatVersion: 1,
      plan: {
        version: 1,
        name: 'P',
        objects: [],
        measurements: [],
        walls: [wall],
        openings: [door({ flipH: true })],
        groups: [],
        viewport: { panX: 0, panY: 0, zoom: 40 },
      },
    });
    expect(parsed!.plan.openings[0]).toMatchObject({
      kind: 'door',
      width: 0.9,
      flipH: true,
      wallId: 'w1',
    });
    const edit = new PlanEdit({ ...createDefaultPlan(), openings: [door()] }, null);
    edit.copySelection({ type: 'opening', id: 'd1' });
    const pasted = edit.pasteClipboard();
    expect(pasted.notice?.kind).toBe('pasted');
    expect(edit.plan.openings).toHaveLength(2);
    expect(edit.plan.openings[1].wallId).toBeNull();
    expect(edit.plan.openings[1].center.x).toBeCloseTo(2.25);
    edit.deleteSelection({ type: 'opening', id: 'd1' });
    expect(edit.plan.openings).toHaveLength(1);
    expect(edit.undo()).toBe(true);
    expect(edit.plan.openings).toHaveLength(2);
  });
  it('exports doors with swing arc, flipped doors, windows, and the wall gap', () => {
    const plan = {
      ...createDefaultPlan(),
      walls: [wall],
      openings: [
        door(),
        door({ id: 'd2', center: { x: 1, y: 3 }, wallId: null, flipH: true, flipV: true }),
        {
          id: 'win',
          kind: 'window' as const,
          center: { x: 3, y: 3 },
          width: 1.2,
          rotation: 0,
          wallId: null,
        },
      ],
    };
    const svg = renderPlanSvg({ plan, imageDataUrl: null, lengthUnit: 'm' }).svg;
    expect(svg).toContain('A 0.9 0.9 0 0 1');
    expect(svg).toContain('scale(-1 -1)');
    expect(svg).toContain('<rect x="-0.6" y="-0.075" width="1.2"');
    expect(svg).not.toContain('<line x1="1.55" y1="0" x2="2.45" y2="0"');
  });
});

describe('attached openings follow their host', () => {
  const planWithDoorOnWall = () => ({
    ...createDefaultPlan(),
    walls: [wall],
    openings: [door()],
  });
  it('moves a wall-snapped door with the wall, as one undo step', () => {
    const edit = new PlanEdit(planWithDoorOnWall(), null);
    edit.beginEdit();
    edit.updateWall('w1', {
      points: wall.points.map((pt) => ({ x: pt.x + 1, y: pt.y + 0.5 })),
    });
    edit.endEdit();
    expect(edit.plan.walls[0].points[0]).toEqual({ x: 1, y: 0.5 });
    expect(edit.plan.openings[0].center).toEqual({ x: 3, y: 0.5 });
    expect(edit.plan.openings[0].wallId).toBe('w1');
    expect(edit.undo()).toBe(true);
    expect(edit.plan.walls[0].points[0]).toEqual({ x: 0, y: 0 });
    expect(edit.plan.openings[0].center).toEqual({ x: 2, y: 0 });
    expect(edit.canUndo).toBe(false);
  });
  it('keeps an opening’s place along the wall when the wall rotates', () => {
    const edit = new PlanEdit(planWithDoorOnWall(), null);
    edit.updateWall('w1', {
      points: [
        { x: 0, y: 0 },
        { x: 0, y: 4 },
      ],
    });
    // Door was halfway along the horizontal wall; now halfway along the vertical one.
    expect(edit.plan.openings[0].center.x).toBeCloseTo(0);
    expect(edit.plan.openings[0].center.y).toBeCloseTo(2);
    expect(edit.plan.openings[0].rotation).toBeCloseTo(90);
  });
  it('moves an object-snapped door with the object (move and resize)', () => {
    const edit = new PlanEdit(
      {
        ...createDefaultPlan(),
        objects: [cupboard],
        openings: [
          {
            id: 'd1',
            kind: 'door' as const,
            center: { x: 2, y: 2 },
            width: 2,
            rotation: 0,
            wallId: null,
            objectId: 'c1',
          },
        ],
      },
      null,
    );
    edit.applyObjectPoses([{ id: 'c1', x: 3, y: 4 }]);
    expect(edit.plan.openings[0].center).toEqual({ x: 4, y: 4 });
    // Resizing the cupboard wider keeps the door proportionally on its top edge.
    edit.updateObject('c1', { width: 4 });
    expect(edit.plan.openings[0].center.x).toBeCloseTo(5);
    expect(edit.plan.openings[0].center.y).toBeCloseTo(4);
  });
  it('detaches an object-snapped door when the object is deleted', () => {
    const edit = new PlanEdit(
      {
        ...createDefaultPlan(),
        objects: [cupboard],
        openings: [
          {
            id: 'd1',
            kind: 'door' as const,
            center: { x: 2, y: 2 },
            width: 2,
            rotation: 0,
            wallId: null,
            objectId: 'c1',
          },
        ],
      },
      null,
    );
    edit.deleteSelection({ type: 'object', id: 'c1' });
    expect(edit.plan.openings[0].objectId).toBeNull();
  });
});
