import {
  FloorPlan,
  Point,
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

export function itemsBBox(objects: readonly PlacedObject[]): BoundingBox | null {
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

export function hitTest(
  plan: FloorPlan,
  p: Point,
  zoom: number,
  handles: {
    objects: readonly PlacedObject[];
    wallId: string | null;
    measurementId: string | null;
  },
): Hit | null {
  const handleR = 10 / zoom;
  const wallExtra = 8 / zoom;

  const selectedObjects = handles.objects;
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

  if (handles.wallId) {
    const wall = plan.walls.find((item) => item.id === handles.wallId);
    if (wall) {
      if (dist(p, wall.start) <= handleR) {
        return { type: 'wall-end', id: wall.id, end: 'start' };
      }
      if (dist(p, wall.end) <= handleR) {
        return { type: 'wall-end', id: wall.id, end: 'end' };
      }
    }
  }

  if (handles.measurementId) {
    const measurement = (plan.measurements ?? []).find((item) => item.id === handles.measurementId);
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

export function objectContains(obj: PlacedObject, p: Point): boolean {
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
