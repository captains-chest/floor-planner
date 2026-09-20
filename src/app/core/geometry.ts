import {
  FloorPlan,
  Point,
  type PlacedObject,
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
  kind: 'none' | 'object-corner';
}

export function snapToGeometry(
  p: Point,
  objects: PlacedObject[],
  threshold: number,
  enabled: boolean,
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
  return bestCorner;
}

export interface ObjectMoveSnap {
  dx: number;
  dy: number;
  snapped: boolean;
  kind: 'none' | 'object-corner';
  point: Point;
}

export function snapObjectMove(
  moving: PlacedObject[],
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

  return bestCorner;
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

export type Hit =
  | { type: 'object'; id: string }
  | { type: 'measurement'; id: string }
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
    measurementId: string | null;
  },
): Hit | null {
  const handleR = 10 / zoom;
  const measureExtra = 8 / zoom;

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
    if (distance <= measureExtra) {
      return { type: 'measurement', id: measurement.id };
    }
  }

  for (let j = plan.objects.length - 1; j >= 0; j -= 1) {
    const obj = plan.objects[j];
    if (objectContains(obj, p)) {
      return { type: 'object', id: obj.id };
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

  for (const obj of plan.objects) {
    for (const corner of objectCorners(obj)) {
      include(corner.x, corner.y);
    }
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
