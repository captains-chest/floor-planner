import {
  FloorPlan,
  Measurement,
  ObjectGroup,
  PlacedObject,
  Point,
  Opening,
  Selection,
  Wall,
} from '../models/floor-plan';
import {
  type BoundingBox,
  type Hit,
  measurementLine,
  normalizeRect,
  objectContains,
  objectCorners,
} from './geometry';

export type BoxSelectMode = 'window' | 'crossing';

export interface BoxPick {
  objectIds: string[];
  measurementIds: string[];
  wallIds: string[];
  openingIds: string[];
}

export const emptyPick = (): BoxPick => ({
  objectIds: [],
  measurementIds: [],
  wallIds: [],
  openingIds: [],
});

export const boxSelectMode = (start: Point, current: Point): BoxSelectMode =>
  current.x >= start.x ? 'window' : 'crossing';

export const selectedPlacedObjects = (plan: FloorPlan, selected: Selection): PlacedObject[] => {
  if (!selected) {
    return [];
  }
  if (selected.type === 'object') {
    const obj = plan.objects.find((item) => item.id === selected.id);
    return obj ? [obj] : [];
  }
  if (selected.type === 'objects') {
    const idSet = new Set(selected.ids);
    return plan.objects.filter((item) => idSet.has(item.id));
  }
  if (selected.type === 'group') {
    return plan.objects.filter((item) => item.groupId === selected.id);
  }
  if (selected.type === 'multi') {
    const idSet = new Set(selected.objectIds);
    return plan.objects.filter((item) => idSet.has(item.id));
  }
  return [];
};

export const selectedMeasurements = (plan: FloorPlan, selected: Selection): Measurement[] => {
  if (selected?.type === 'measurement') {
    const item = (plan.measurements ?? []).find((entry) => entry.id === selected.id);
    return item ? [item] : [];
  }
  if (selected?.type === 'multi') {
    const ids = new Set(selected.measurementIds);
    return (plan.measurements ?? []).filter((item) => ids.has(item.id));
  }
  return [];
};

export const selectedGroup = (plan: FloorPlan, selected: Selection): ObjectGroup | null => {
  if (selected?.type !== 'group') {
    return null;
  }
  return (plan.groups ?? []).find((group) => group.id === selected.id) ?? null;
};

export const selectedObject = (plan: FloorPlan, selected: Selection): PlacedObject | null => {
  if (selected?.type !== 'object') {
    return null;
  }
  return plan.objects.find((obj) => obj.id === selected.id) ?? null;
};

export const selectedMeasurement = (plan: FloorPlan, selected: Selection): Measurement | null =>
  selectedMeasurements(plan, selected)[0] ?? null;

export const selectedOpening = (plan: FloorPlan, selected: Selection): Opening | null =>
  selected?.type === 'opening'
    ? ((plan.openings ?? []).find((o) => o.id === selected.id) ?? null)
    : null;
export const selectedWall = (plan: FloorPlan, selected: Selection): Wall | null =>
  selected?.type === 'wall' ? ((plan.walls ?? []).find((w) => w.id === selected.id) ?? null) : null;

export const selectedWalls = (plan: FloorPlan, selected: Selection): Wall[] => {
  if (selected?.type === 'wall') {
    const wall = (plan.walls ?? []).find((w) => w.id === selected.id);
    return wall ? [wall] : [];
  }
  if (selected?.type === 'multi') {
    const ids = new Set(selected.wallIds ?? []);
    return (plan.walls ?? []).filter((w) => ids.has(w.id));
  }
  return [];
};

export const selectedOpenings = (plan: FloorPlan, selected: Selection): Opening[] => {
  if (selected?.type === 'opening') {
    const opening = (plan.openings ?? []).find((o) => o.id === selected.id);
    return opening ? [opening] : [];
  }
  if (selected?.type === 'multi') {
    const ids = new Set(selected.openingIds ?? []);
    return (plan.openings ?? []).filter((o) => ids.has(o.id));
  }
  return [];
};

export const selectionCount = (plan: FloorPlan, selected: Selection): number =>
  selectedPlacedObjects(plan, selected).length +
  selectedMeasurements(plan, selected).length +
  selectedWalls(plan, selected).length +
  selectedOpenings(plan, selected).length;

export const isObjectSelected = (plan: FloorPlan, selected: Selection, id: string): boolean =>
  selectedPlacedObjects(plan, selected).some((obj) => obj.id === id);

export const collectBoxSelection = (plan: FloorPlan, start: Point, current: Point): BoxPick => {
  const box = normalizeRect(start, current);
  const mode = boxSelectMode(start, current);
  const empty = emptyPick();
  if (box.width < 1e-9 || box.depth < 1e-9) {
    return empty;
  }

  const windowMode = mode === 'window';

  const objectIds: string[] = [];
  const grouped = new Map<string, PlacedObject[]>();
  const ungrouped: PlacedObject[] = [];
  for (const obj of plan.objects) {
    if (obj.groupId) {
      const list = grouped.get(obj.groupId) ?? [];
      list.push(obj);
      grouped.set(obj.groupId, list);
    } else {
      ungrouped.push(obj);
    }
  }
  for (const obj of ungrouped) {
    if (windowMode ? objectFullyInside(obj, box) : objectCrossesBox(obj, box)) {
      objectIds.push(obj.id);
    }
  }
  for (const members of grouped.values()) {
    const hit = windowMode
      ? members.every((member) => objectFullyInside(member, box))
      : members.some((member) => objectCrossesBox(member, box));
    if (hit) {
      objectIds.push(...members.map((member) => member.id));
    }
  }

  const measurementIds: string[] = [];
  for (const measurement of plan.measurements ?? []) {
    const line = measurementLine(measurement);
    if (
      windowMode
        ? segmentFullyInside(line.start, line.end, box)
        : segmentCrossesBox(line.start, line.end, box)
    ) {
      measurementIds.push(measurement.id);
    }
  }

  const wallIds: string[] = [];
  for (const wall of plan.walls ?? []) {
    const segments = wallSegmentsOf(wall);
    const hit = windowMode
      ? wall.points.every((pt) => pointStrictlyInside(pt, box))
      : segments.some(([a, b]) => segmentCrossesBox(a, b, box)) ||
        wall.points.some((pt) => pointInsideInclusive(pt, box));
    if (hit && segments.length > 0) {
      wallIds.push(wall.id);
    }
  }

  const openingIds: string[] = [];
  for (const opening of plan.openings ?? []) {
    const [a, b] = openingSpan(opening);
    const hit = windowMode
      ? segmentFullyInside(a, b, box)
      : segmentCrossesBox(a, b, box) || pointInsideInclusive(opening.center, box);
    if (hit) {
      openingIds.push(opening.id);
    }
  }

  return { objectIds, measurementIds, wallIds, openingIds };
};

export const pickFromSelection = (plan: FloorPlan, selection: Selection): BoxPick => {
  const empty = emptyPick();
  if (!selection) {
    return empty;
  }
  if (selection.type === 'object') {
    return { ...empty, objectIds: [selection.id] };
  }
  if (selection.type === 'objects') {
    return { ...empty, objectIds: [...selection.ids] };
  }
  if (selection.type === 'group') {
    return {
      ...empty,
      objectIds: plan.objects.filter((obj) => obj.groupId === selection.id).map((obj) => obj.id),
    };
  }
  if (selection.type === 'measurement') {
    return { ...empty, measurementIds: [selection.id] };
  }
  if (selection.type === 'wall') return { ...empty, wallIds: [selection.id] };
  if (selection.type === 'opening') return { ...empty, openingIds: [selection.id] };
  return {
    objectIds: [...selection.objectIds],
    measurementIds: [...selection.measurementIds],
    wallIds: [...(selection.wallIds ?? [])],
    openingIds: [...(selection.openingIds ?? [])],
  };
};

export const mergePicks = (a: BoxPick, b: BoxPick): BoxPick => ({
  objectIds: uniqueIds([...a.objectIds, ...b.objectIds]),
  measurementIds: uniqueIds([...a.measurementIds, ...b.measurementIds]),
  wallIds: uniqueIds([...(a.wallIds ?? []), ...(b.wallIds ?? [])]),
  openingIds: uniqueIds([...(a.openingIds ?? []), ...(b.openingIds ?? [])]),
});

export const collapsePick = (plan: FloorPlan, pick: BoxPick): Selection => {
  const objects = pick.objectIds.length;
  const measurements = pick.measurementIds.length;
  const walls = (pick.wallIds ?? []).length;
  const openings = (pick.openingIds ?? []).length;
  const total = objects + measurements + walls + openings;
  if (total === 0) {
    return null;
  }
  if (total === 1 && walls === 1) {
    return { type: 'wall', id: pick.wallIds[0] };
  }
  if (total === 1 && openings === 1) {
    return { type: 'opening', id: pick.openingIds[0] };
  }
  const kinds =
    (objects > 0 ? 1 : 0) +
    (measurements > 0 ? 1 : 0) +
    (walls > 0 ? 1 : 0) +
    (openings > 0 ? 1 : 0);
  if (kinds === 1 && objects > 0) {
    return selectionFromObjectIds(plan, pick.objectIds);
  }
  if (kinds === 1 && measurements === 1) {
    return { type: 'measurement', id: pick.measurementIds[0] };
  }
  return {
    type: 'multi',
    objectIds: pick.objectIds,
    measurementIds: pick.measurementIds,
    wallIds: pick.wallIds ?? [],
    openingIds: pick.openingIds ?? [],
  };
};

export const selectionFromObjectIds = (plan: FloorPlan, ids: string[]): Selection => {
  if (ids.length === 0) {
    return null;
  }
  if (ids.length === 1) {
    const obj = plan.objects.find((item) => item.id === ids[0]);
    if (obj?.groupId) {
      return { type: 'group', id: obj.groupId };
    }
    return { type: 'object', id: ids[0] };
  }
  const idSet = new Set(ids);
  const objs = plan.objects.filter((item) => idSet.has(item.id));
  const groupId = objs[0]?.groupId;
  if (groupId && objs.every((item) => item.groupId === groupId)) {
    const memberCount = plan.objects.filter((item) => item.groupId === groupId).length;
    if (memberCount === objs.length) {
      return { type: 'group', id: groupId };
    }
  }
  return { type: 'objects', ids };
};

export const selectObject = (
  plan: FloorPlan,
  current: Selection,
  id: string,
  additive: boolean,
): Selection => {
  const obj = plan.objects.find((item) => item.id === id);
  if (!obj) {
    return current;
  }
  if (additive) {
    const currentIds = new Set(selectedPlacedObjects(plan, current).map((item) => item.id));
    const unitIds = obj.groupId
      ? plan.objects.filter((item) => item.groupId === obj.groupId).map((item) => item.id)
      : [obj.id];
    const allSelected = unitIds.every((unitId) => currentIds.has(unitId));
    if (allSelected) {
      for (const unitId of unitIds) {
        currentIds.delete(unitId);
      }
    } else {
      for (const unitId of unitIds) {
        currentIds.add(unitId);
      }
    }
    return selectionFromObjectIds(plan, [...currentIds]);
  }
  if (obj.groupId) {
    return { type: 'group', id: obj.groupId };
  }
  return { type: 'object', id: obj.id };
};

export const selectFromHit = (
  plan: FloorPlan,
  current: Selection,
  hit: Hit,
  additive: boolean,
): Selection => {
  if (hit.type === 'rotate-object' || hit.type === 'rotate-objects') {
    return current;
  }
  if (hit.type === 'object') {
    return selectObject(plan, current, hit.id, additive);
  }
  if (hit.type === 'wall') return { type: 'wall', id: hit.id };
  if (hit.type === 'opening') return { type: 'opening', id: hit.id };
  return { type: 'measurement', id: hit.id };
};

export const selectBox = (
  plan: FloorPlan,
  current: Selection,
  pick: BoxPick,
  additive: boolean,
): Selection => {
  const merged = additive ? mergePicks(pickFromSelection(plan, current), pick) : pick;
  return collapsePick(plan, merged);
};

export const previewBoxPick = (
  plan: FloorPlan,
  current: Selection,
  start: Point,
  currentPoint: Point,
  additive: boolean,
): BoxPick => {
  const pick = collectBoxSelection(plan, start, currentPoint);
  return additive ? mergePicks(pickFromSelection(plan, current), pick) : pick;
};

const uniqueIds = (ids: string[]): string[] => [...new Set(ids)];

const objectFullyInside = (obj: PlacedObject, box: BoundingBox): boolean =>
  objectCorners(obj).every((corner) => pointStrictlyInside(corner, box));

const objectCrossesBox = (obj: PlacedObject, box: BoundingBox): boolean => {
  const corners = objectCorners(obj);
  if (corners.some((corner) => pointInsideInclusive(corner, box))) {
    return true;
  }
  for (let i = 0; i < corners.length; i += 1) {
    if (segmentsIntersect(corners[i], corners[(i + 1) % corners.length], box)) {
      return true;
    }
  }
  const boxCorners: Point[] = [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.depth },
    { x: box.x, y: box.y + box.depth },
  ];
  return boxCorners.every((corner) => objectContains(obj, corner));
};

const segmentFullyInside = (a: Point, b: Point, box: BoundingBox): boolean =>
  pointStrictlyInside(a, box) && pointStrictlyInside(b, box);

const segmentCrossesBox = (a: Point, b: Point, box: BoundingBox): boolean => {
  if (pointInsideInclusive(a, box) || pointInsideInclusive(b, box)) {
    return true;
  }
  return segmentsIntersect(a, b, box);
};

const pointStrictlyInside = (p: Point, box: BoundingBox): boolean => {
  const eps = 1e-9;
  return (
    p.x > box.x + eps &&
    p.y > box.y + eps &&
    p.x < box.x + box.width - eps &&
    p.y < box.y + box.depth - eps
  );
};

const pointInsideInclusive = (p: Point, box: BoundingBox): boolean =>
  p.x >= box.x && p.y >= box.y && p.x <= box.x + box.width && p.y <= box.y + box.depth;

const segmentsIntersect = (a: Point, b: Point, box: BoundingBox): boolean => {
  const edges: [Point, Point][] = [
    [
      { x: box.x, y: box.y },
      { x: box.x + box.width, y: box.y },
    ],
    [
      { x: box.x + box.width, y: box.y },
      { x: box.x + box.width, y: box.y + box.depth },
    ],
    [
      { x: box.x + box.width, y: box.y + box.depth },
      { x: box.x, y: box.y + box.depth },
    ],
    [
      { x: box.x, y: box.y + box.depth },
      { x: box.x, y: box.y },
    ],
  ];
  return edges.some(([c, d]) => segmentsCross(a, b, c, d));
};

const segmentsCross = (p1: Point, p2: Point, q1: Point, q2: Point): boolean => {
  const o1 = orient(p1, p2, q1);
  const o2 = orient(p1, p2, q2);
  const o3 = orient(q1, q2, p1);
  const o4 = orient(q1, q2, p2);
  if (o1 * o2 < 0 && o3 * o4 < 0) {
    return true;
  }
  const eps = 1e-12;
  if (Math.abs(o1) <= eps && onSegment(p1, p2, q1)) {
    return true;
  }
  if (Math.abs(o2) <= eps && onSegment(p1, p2, q2)) {
    return true;
  }
  if (Math.abs(o3) <= eps && onSegment(q1, q2, p1)) {
    return true;
  }
  if (Math.abs(o4) <= eps && onSegment(q1, q2, p2)) {
    return true;
  }
  return false;
};

const orient = (a: Point, b: Point, c: Point): number =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

const onSegment = (a: Point, b: Point, p: Point): boolean => {
  const eps = 1e-9;
  return (
    p.x >= Math.min(a.x, b.x) - eps &&
    p.x <= Math.max(a.x, b.x) + eps &&
    p.y >= Math.min(a.y, b.y) - eps &&
    p.y <= Math.max(a.y, b.y) + eps
  );
};

const wallSegmentsOf = (wall: Wall): [Point, Point][] => {
  const out: [Point, Point][] = [];
  for (let i = 1; i < wall.points.length; i++) out.push([wall.points[i - 1], wall.points[i]]);
  return out;
};

const openingSpan = (opening: Opening): [Point, Point] => {
  const rad = ((opening.rotation ?? 0) * Math.PI) / 180;
  const dx = (Math.cos(rad) * opening.width) / 2;
  const dy = (Math.sin(rad) * opening.width) / 2;
  return [
    { x: opening.center.x - dx, y: opening.center.y - dy },
    { x: opening.center.x + dx, y: opening.center.y + dy },
  ];
};
