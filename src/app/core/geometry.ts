import {
  FloorPlan,
  Point,
  Selection,
  Wall,
  type PlacedObject,
  type Room,
} from '../models/floor-plan';
import { formatLength, type LengthUnit } from './units';

export function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scalePoint(p: Point, factor: number): Point {
  return { x: p.x * factor, y: p.y * factor };
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function normalizeRect(
  a: Point,
  b: Point,
): { x: number; y: number; width: number; depth: number } {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.abs(b.x - a.x), depth: Math.abs(b.y - a.y) };
}

export function closestPointOnSegment(
  p: Point,
  a: Point,
  b: Point,
): { point: Point; t: number; distance: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) {
    return { point: { x: a.x, y: a.y }, t: 0, distance: dist(p, a) };
  }
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0, 1);
  const point = { x: a.x + t * dx, y: a.y + t * dy };
  return { point, t, distance: dist(p, point) };
}

export function snapToRightAngle(origin: Point, point: Point): Point {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  if (dx === 0 && dy === 0) {
    return { x: origin.x, y: origin.y };
  }
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { x: point.x, y: origin.y };
  }
  return { x: origin.x, y: point.y };
}

export interface SnapResult {
  point: Point;
  snapped: boolean;
  kind: 'none' | 'endpoint' | 'edge' | 'object-corner';
}

export function snapToWalls(
  p: Point,
  walls: Wall[],
  threshold: number,
  enabled: boolean,
  ignoreWallId?: string,
): SnapResult {
  if (!enabled || threshold <= 0) {
    return { point: p, snapped: false, kind: 'none' };
  }

  let best: SnapResult = { point: p, snapped: false, kind: 'none' };
  let bestD = threshold;

  for (const wall of walls) {
    if (wall.id === ignoreWallId) {
      continue;
    }
    for (const ep of [wall.start, wall.end]) {
      const d = dist(p, ep);
      if (d <= bestD) {
        bestD = d;
        best = { point: { x: ep.x, y: ep.y }, snapped: true, kind: 'endpoint' };
      }
    }
  }

  for (const wall of walls) {
    if (wall.id === ignoreWallId) {
      continue;
    }
    const closest = closestPointOnSegment(p, wall.start, wall.end);
    if (closest.distance < bestD) {
      bestD = closest.distance;
      best = { point: closest.point, snapped: true, kind: 'edge' };
    }
  }

  return best;
}

export function snapToGeometry(
  p: Point,
  walls: Wall[],
  objects: PlacedObject[],
  threshold: number,
  enabled: boolean,
  ignoreWallId?: string,
): SnapResult {
  if (!enabled || threshold <= 0) {
    return { point: p, snapped: false, kind: 'none' };
  }

  const cornerThreshold = threshold * 1.25;
  let bestCorner: SnapResult = { point: p, snapped: false, kind: 'none' };
  let bestCornerD = cornerThreshold;
  for (const obj of objects) {
    for (const corner of objectCorners(obj)) {
      const d = dist(p, corner);
      if (d <= bestCornerD) {
        bestCornerD = d;
        bestCorner = { point: { x: corner.x, y: corner.y }, snapped: true, kind: 'object-corner' };
      }
    }
  }
  if (bestCorner.snapped) {
    return bestCorner;
  }

  return snapToWalls(p, walls, threshold, true, ignoreWallId);
}

export interface ObjectMoveSnap {
  dx: number;
  dy: number;
  snapped: boolean;
  kind: 'none' | 'edge' | 'endpoint' | 'object-corner';
  point: Point;
}

export function snapObjectMove(
  moving: PlacedObject[],
  walls: Wall[],
  others: PlacedObject[],
  threshold: number,
): ObjectMoveSnap {
  const none: ObjectMoveSnap = {
    dx: 0,
    dy: 0,
    snapped: false,
    kind: 'none',
    point: { x: 0, y: 0 },
  };
  if (threshold <= 0 || moving.length === 0) {
    return none;
  }

  const movingCorners = moving.flatMap(objectCorners);
  const cornerThreshold = threshold * 1.25;
  let bestCorner = none;
  let bestCornerD = cornerThreshold;

  for (const corner of movingCorners) {
    for (const other of others) {
      for (const target of objectCorners(other)) {
        const d = dist(corner, target);
        if (d <= bestCornerD) {
          bestCornerD = d;
          bestCorner = {
            dx: target.x - corner.x,
            dy: target.y - corner.y,
            snapped: true,
            kind: 'object-corner',
            point: target,
          };
        }
      }
    }
  }

  if (bestCorner.snapped) {
    return bestCorner;
  }

  let bestWall = none;
  let bestWallD = threshold;
  for (const corner of movingCorners) {
    for (const wall of walls) {
      for (const ep of [wall.start, wall.end]) {
        const d = dist(corner, ep);
        if (d <= bestWallD) {
          bestWallD = d;
          bestWall = {
            dx: ep.x - corner.x,
            dy: ep.y - corner.y,
            snapped: true,
            kind: 'endpoint',
            point: { x: ep.x, y: ep.y },
          };
        }
      }
      const closest = closestPointOnSegment(corner, wall.start, wall.end);
      if (closest.distance < bestWallD) {
        bestWallD = closest.distance;
        bestWall = {
          dx: closest.point.x - corner.x,
          dy: closest.point.y - corner.y,
          snapped: true,
          kind: 'edge',
          point: closest.point,
        };
      }
    }
  }

  return bestWall;
}

export function pointInRect(p: Point, x: number, y: number, width: number, depth: number): boolean {
  return p.x >= x && p.x <= x + width && p.y >= y && p.y <= y + depth;
}

export function pointInEllipse(
  p: Point,
  x: number,
  y: number,
  width: number,
  depth: number,
): boolean {
  const rx = width / 2;
  const ry = depth / 2;
  if (rx <= 0 || ry <= 0) {
    return false;
  }
  const nx = (p.x - (x + rx)) / rx;
  const ny = (p.y - (y + ry)) / ry;
  return nx * nx + ny * ny <= 1;
}

export function wallHit(p: Point, wall: Wall, extra: number): boolean {
  const { distance } = closestPointOnSegment(p, wall.start, wall.end);
  return distance <= wall.thickness / 2 + extra;
}

export type Hit =
  | { type: 'object'; id: string }
  | { type: 'wall'; id: string }
  | { type: 'room'; id: string }
  | { type: 'measurement'; id: string }
  | { type: 'wall-end'; id: string; end: 'start' | 'end' }
  | { type: 'measurement-end'; id: string; end: 'start' | 'end' }
  | { type: 'rotate-object'; id: string }
  | { type: 'rotate-objects'; ids: string[] };

export function objectCenter(obj: Pick<PlacedObject, 'x' | 'y' | 'width' | 'depth'>): Point {
  return { x: obj.x + obj.width / 2, y: obj.y + obj.depth / 2 };
}

export function rotateAround(p: Point, origin: Point, degrees: number): Point {
  if (!degrees) {
    return { x: p.x, y: p.y };
  }
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
  };
}

export function angleDeg(from: Point, to: Point): number {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
}

export function snapAngle(degrees: number, step: number): number {
  return Math.round(degrees / step) * step;
}

export function objectCorners(obj: PlacedObject): Point[] {
  const center = objectCenter(obj);
  const rotation = obj.rotation ?? 0;
  return [
    { x: obj.x, y: obj.y },
    { x: obj.x + obj.width, y: obj.y },
    { x: obj.x + obj.width, y: obj.y + obj.depth },
    { x: obj.x, y: obj.y + obj.depth },
  ].map((corner) => rotateAround(corner, center, rotation));
}

export interface RotationHandle {
  handle: Point;
  corner: Point;
}

export function rotationHandles(obj: PlacedObject, zoom: number): RotationHandle[] {
  return rotationHandlesFromCorners(objectCorners(obj), objectCenter(obj), zoom);
}

export function rotationHandlesFromBox(box: BoundingBox, zoom: number): RotationHandle[] {
  const center = { x: box.x + box.width / 2, y: box.y + box.depth / 2 };
  const corners: Point[] = [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.depth },
    { x: box.x, y: box.y + box.depth },
  ];
  return rotationHandlesFromCorners(corners, center, zoom);
}

function rotationHandlesFromCorners(corners: Point[], center: Point, zoom: number): RotationHandle[] {
  const offset = 16 / zoom;
  return corners.map((corner) => {
    const vx = corner.x - center.x;
    const vy = corner.y - center.y;
    const len = Math.hypot(vx, vy);
    if (len < 1e-9) {
      return { handle: corner, corner };
    }
    const scale = (len + offset) / len;
    return {
      corner,
      handle: { x: center.x + vx * scale, y: center.y + vy * scale },
    };
  });
}

export function itemsBBox(objects: PlacedObject[]): BoundingBox | null {
  if (objects.length === 0) {
    return null;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const obj of objects) {
    for (const corner of objectCorners(obj)) {
      minX = Math.min(minX, corner.x);
      minY = Math.min(minY, corner.y);
      maxX = Math.max(maxX, corner.x);
      maxY = Math.max(maxY, corner.y);
    }
  }
  if (!Number.isFinite(minX)) {
    return null;
  }
  return { x: minX, y: minY, width: Math.max(0.01, maxX - minX), depth: Math.max(0.01, maxY - minY) };
}

export function selectedPlacedObjects(plan: FloorPlan, selected: Selection): PlacedObject[] {
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
}

export function rotatedObjectPose(
  obj: Pick<PlacedObject, 'x' | 'y' | 'width' | 'depth' | 'rotation'>,
  center: Point,
  deltaDeg: number,
): Pick<PlacedObject, 'x' | 'y' | 'rotation'> {
  const oldCenter = objectCenter(obj);
  const nextCenter = rotateAround(oldCenter, center, deltaDeg);
  return {
    x: obj.x + (nextCenter.x - oldCenter.x),
    y: obj.y + (nextCenter.y - oldCenter.y),
    rotation: (obj.rotation ?? 0) + deltaDeg,
  };
}

export function hitTest(plan: FloorPlan, p: Point, zoom: number, selected: Selection): Hit | null {
  const handleR = 10 / zoom;
  const wallExtra = 8 / zoom;

  const selectedObjects = selectedPlacedObjects(plan, selected);
  if (selectedObjects.length > 1) {
    const box = itemsBBox(selectedObjects);
    if (box) {
      for (const item of rotationHandlesFromBox(box, zoom)) {
        if (dist(p, item.handle) <= handleR) {
          return { type: 'rotate-objects', ids: selectedObjects.map((obj) => obj.id) };
        }
      }
    }
  } else if (selectedObjects.length === 1) {
    for (const item of rotationHandles(selectedObjects[0], zoom)) {
      if (dist(p, item.handle) <= handleR) {
        return { type: 'rotate-object', id: selectedObjects[0].id };
      }
    }
  }

  if (selected?.type === 'wall') {
    const wall = plan.walls.find((item) => item.id === selected.id);
    if (wall) {
      if (dist(p, wall.start) <= handleR) {
        return { type: 'wall-end', id: wall.id, end: 'start' };
      }
      if (dist(p, wall.end) <= handleR) {
        return { type: 'wall-end', id: wall.id, end: 'end' };
      }
    }
  }

  if (selected?.type === 'measurement') {
    const measurement = (plan.measurements ?? []).find((item) => item.id === selected.id);
    if (measurement) {
      if (dist(p, measurement.start) <= handleR) {
        return { type: 'measurement-end', id: measurement.id, end: 'start' };
      }
      if (dist(p, measurement.end) <= handleR) {
        return { type: 'measurement-end', id: measurement.id, end: 'end' };
      }
    }
  }

  const measurements = plan.measurements ?? [];
  for (let i = measurements.length - 1; i >= 0; i -= 1) {
    const measurement = measurements[i];
    const { distance } = closestPointOnSegment(p, measurement.start, measurement.end);
    if (distance <= wallExtra) {
      return { type: 'measurement', id: measurement.id };
    }
  }

  const hidden = new Set(plan.layers.filter((layer) => !layer.visible).map((layer) => layer.id));
  const locked = new Set(plan.layers.filter((layer) => layer.locked).map((layer) => layer.id));

  for (let i = plan.layers.length - 1; i >= 0; i -= 1) {
    const layer = plan.layers[i];
    if (hidden.has(layer.id) || locked.has(layer.id)) {
      continue;
    }

    for (let j = plan.objects.length - 1; j >= 0; j -= 1) {
      const obj = plan.objects[j];
      if (obj.layerId !== layer.id) {
        continue;
      }
      if (objectContains(obj, p)) {
        return { type: 'object', id: obj.id };
      }
    }

    for (let j = plan.walls.length - 1; j >= 0; j -= 1) {
      const wall = plan.walls[j];
      if (wall.layerId !== layer.id) {
        continue;
      }
      if (wallHit(p, wall, wallExtra)) {
        return { type: 'wall', id: wall.id };
      }
    }

    for (let j = plan.rooms.length - 1; j >= 0; j -= 1) {
      const room = plan.rooms[j];
      if (room.layerId !== layer.id) {
        continue;
      }
      if (pointInRect(p, room.x, room.y, room.width, room.depth)) {
        return { type: 'room', id: room.id };
      }
    }
  }

  return null;
}

function objectContains(obj: PlacedObject, p: Point): boolean {
  const local = rotateAround(p, objectCenter(obj), -(obj.rotation ?? 0));
  if (obj.kind === 'rect') {
    return pointInRect(local, obj.x, obj.y, obj.width, obj.depth);
  }
  return pointInEllipse(local, obj.x, obj.y, obj.width, obj.depth);
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  depth: number;
}

export function contentBBox(
  plan: FloorPlan,
  imageSize: { width: number; height: number } | null,
): BoundingBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const include = (x: number, y: number, w = 0, d = 0) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + d);
  };

  if (imageSize) {
    include(0, 0, imageSize.width, imageSize.height);
  }

  for (const wall of plan.walls) {
    include(wall.start.x, wall.start.y);
    include(wall.end.x, wall.end.y);
  }
  for (const obj of plan.objects) {
    for (const corner of objectCorners(obj)) {
      include(corner.x, corner.y);
    }
  }
  for (const room of plan.rooms) {
    include(room.x, room.y, room.width, room.depth);
  }
  for (const measurement of plan.measurements ?? []) {
    include(measurement.start.x, measurement.start.y);
    include(measurement.end.x, measurement.end.y);
  }

  if (!Number.isFinite(minX)) {
    return { x: 0, y: 0, width: 10, depth: 8 };
  }

  return { x: minX, y: minY, width: Math.max(0.5, maxX - minX), depth: Math.max(0.5, maxY - minY) };
}

export interface DimensionView {
  start: Point;
  end: Point;
  mid: Point;
  lengthLabel: string;
  tickDx: number;
  tickDy: number;
}

export function dimensionView(
  start: Point,
  end: Point,
  tickLength: number,
  unit: LengthUnit = 'm',
): DimensionView {
  const length = dist(start, end);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const inv = length > 1e-9 ? tickLength / length : 0;
  return {
    start,
    end,
    mid: midpoint(start, end),
    lengthLabel: formatLength(length, unit),
    tickDx: -dy * inv,
    tickDy: dx * inv,
  };
}

export function usedRoomCategories(rooms: Room[]): Room['category'][] {
  const seen = new Set<Room['category']>();
  const result: Room['category'][] = [];
  for (const room of rooms) {
    if (!seen.has(room.category)) {
      seen.add(room.category);
      result.push(room.category);
    }
  }
  return result;
}

export type BoxSelectMode = 'window' | 'crossing';

export interface BoxPick {
  objectIds: string[];
  wallIds: string[];
  roomIds: string[];
  measurementIds: string[];
}

export function boxSelectMode(start: Point, current: Point): BoxSelectMode {
  return current.x >= start.x ? 'window' : 'crossing';
}

export function collectBoxSelection(plan: FloorPlan, start: Point, current: Point): BoxPick {
  const box = normalizeRect(start, current);
  const mode = boxSelectMode(start, current);
  const empty: BoxPick = { objectIds: [], wallIds: [], roomIds: [], measurementIds: [] };
  if (box.width < 1e-9 || box.depth < 1e-9) {
    return empty;
  }

  const skip = new Set(
    plan.layers.filter((layer) => !layer.visible || layer.locked).map((layer) => layer.id),
  );
  const windowMode = mode === 'window';

  const objectIds: string[] = [];
  const grouped = new Map<string, PlacedObject[]>();
  const ungrouped: PlacedObject[] = [];
  for (const obj of plan.objects) {
    if (skip.has(obj.layerId)) {
      continue;
    }
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

  const wallIds: string[] = [];
  for (const wall of plan.walls) {
    if (skip.has(wall.layerId)) {
      continue;
    }
    if (windowMode ? segmentFullyInside(wall.start, wall.end, box) : segmentCrossesBox(wall.start, wall.end, box)) {
      wallIds.push(wall.id);
    }
  }

  const roomIds: string[] = [];
  for (const room of plan.rooms) {
    if (skip.has(room.layerId)) {
      continue;
    }
    if (windowMode ? aabbFullyInside(room, box) : aabbOverlaps(room, box)) {
      roomIds.push(room.id);
    }
  }

  const measurementIds: string[] = [];
  for (const measurement of plan.measurements ?? []) {
    if (windowMode
      ? segmentFullyInside(measurement.start, measurement.end, box)
      : segmentCrossesBox(measurement.start, measurement.end, box)) {
      measurementIds.push(measurement.id);
    }
  }

  return { objectIds, wallIds, roomIds, measurementIds };
}

function objectFullyInside(obj: PlacedObject, box: BoundingBox): boolean {
  return objectCorners(obj).every((corner) => pointStrictlyInside(corner, box));
}

function objectCrossesBox(obj: PlacedObject, box: BoundingBox): boolean {
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
}

function segmentFullyInside(a: Point, b: Point, box: BoundingBox): boolean {
  return pointStrictlyInside(a, box) && pointStrictlyInside(b, box);
}

function segmentCrossesBox(a: Point, b: Point, box: BoundingBox): boolean {
  if (pointInsideInclusive(a, box) || pointInsideInclusive(b, box)) {
    return true;
  }
  return segmentsIntersect(a, b, box);
}

function aabbFullyInside(
  rect: { x: number; y: number; width: number; depth: number },
  box: BoundingBox,
): boolean {
  return (
    rect.x > box.x &&
    rect.y > box.y &&
    rect.x + rect.width < box.x + box.width &&
    rect.y + rect.depth < box.y + box.depth
  );
}

function aabbOverlaps(
  rect: { x: number; y: number; width: number; depth: number },
  box: BoundingBox,
): boolean {
  return (
    rect.x <= box.x + box.width &&
    box.x <= rect.x + rect.width &&
    rect.y <= box.y + box.depth &&
    box.y <= rect.y + rect.depth
  );
}

function pointStrictlyInside(p: Point, box: BoundingBox): boolean {
  const eps = 1e-9;
  return (
    p.x > box.x + eps &&
    p.y > box.y + eps &&
    p.x < box.x + box.width - eps &&
    p.y < box.y + box.depth - eps
  );
}

function pointInsideInclusive(p: Point, box: BoundingBox): boolean {
  return p.x >= box.x && p.y >= box.y && p.x <= box.x + box.width && p.y <= box.y + box.depth;
}

function segmentsIntersect(a: Point, b: Point, box: BoundingBox): boolean {
  const edges: [Point, Point][] = [
    [{ x: box.x, y: box.y }, { x: box.x + box.width, y: box.y }],
    [{ x: box.x + box.width, y: box.y }, { x: box.x + box.width, y: box.y + box.depth }],
    [{ x: box.x + box.width, y: box.y + box.depth }, { x: box.x, y: box.y + box.depth }],
    [{ x: box.x, y: box.y + box.depth }, { x: box.x, y: box.y }],
  ];
  return edges.some(([c, d]) => segmentsCross(a, b, c, d));
}

function segmentsCross(p1: Point, p2: Point, q1: Point, q2: Point): boolean {
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
}

function orient(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a: Point, b: Point, p: Point): boolean {
  const eps = 1e-9;
  return (
    p.x >= Math.min(a.x, b.x) - eps &&
    p.x <= Math.max(a.x, b.x) + eps &&
    p.y >= Math.min(a.y, b.y) - eps &&
    p.y <= Math.max(a.y, b.y) + eps
  );
}
