import { Opening, PlacedObject, Point, Wall } from '../models/floor-plan';
import {
  angleDeg,
  closestPointOnSegment,
  dist,
  objectCorners,
  rotateAround,
  wallSegments,
} from './geometry';

export interface OpeningSnap {
  center: Point;
  rotation: number;
  wallId: string | null;
  target: 'wall' | 'object' | null;
}

/** Endpoints of an opening span in world space. */
export function openingEndpoints(
  o: Pick<Opening, 'center' | 'width' | 'rotation'>,
): [Point, Point] {
  const rad = ((o.rotation ?? 0) * Math.PI) / 180;
  const dx = (Math.cos(rad) * o.width) / 2,
    dy = (Math.sin(rad) * o.width) / 2;
  return [
    { x: o.center.x - dx, y: o.center.y - dy },
    { x: o.center.x + dx, y: o.center.y + dy },
  ];
}

export function snapOpening(
  center: Point,
  walls: readonly Wall[],
  objects: readonly PlacedObject[],
  threshold: number,
  enabled: boolean,
): OpeningSnap {
  const free: OpeningSnap = { center: { ...center }, rotation: 0, wallId: null, target: null };
  if (!enabled || threshold <= 0) return { ...free, center: { ...center } };
  let best: (OpeningSnap & { distance: number }) | null = null;
  for (const wall of walls ?? [])
    for (const [a, b] of wallSegments(wall)) {
      const hit = closestPointOnSegment(center, a, b);
      if (hit.distance <= threshold + wall.thickness / 2 && (!best || hit.distance < best.distance))
        best = {
          center: hit.point,
          rotation: angleDeg(a, b),
          wallId: wall.id,
          target: 'wall',
          distance: hit.distance,
        };
    }
  for (const obj of objects ?? []) {
    const corners = objectCorners(obj);
    for (let i = 0; i < corners.length; i++) {
      const a = corners[i],
        b = corners[(i + 1) % corners.length];
      const hit = closestPointOnSegment(center, a, b);
      const d = hit.distance;
      if (d <= threshold && (!best || d < (best.distance ?? Infinity)))
        best = {
          center: hit.point,
          rotation: angleDeg(a, b),
          wallId: null,
          target: 'object',
          distance: d,
        };
    }
  }
  return best
    ? { center: best.center, rotation: best.rotation, wallId: best.wallId, target: best.target }
    : free;
}

/** Wall segments with gaps cut where wall-snapped openings sit. Wall data itself is unchanged. */
export function wallRenderSegments(wall: Wall, openings: readonly Opening[]): [Point, Point][] {
  let segments = wallSegments(wall);
  for (const opening of openings ?? []) {
    if (opening.wallId !== wall.id) continue;
    const next: [Point, Point][] = [];
    for (const [a, b] of segments) {
      const len = dist(a, b);
      if (len < 1e-9) continue;
      const proj = closestPointOnSegment(opening.center, a, b);
      const along = proj.t * len,
        half = opening.width / 2;
      const cuts: [number, number][] = [[Math.max(0, along - half), Math.min(len, along + half)]];
      let spans: [number, number][] = [[0, len]];
      for (const [c0, c1] of cuts) {
        const kept: [number, number][] = [];
        for (const [s0, s1] of spans) {
          if (c0 > s0) kept.push([s0, Math.min(c0, s1)]);
          if (c1 < s1) kept.push([Math.max(c1, s0), s1]);
        }
        spans = kept;
      }
      for (const [s0, s1] of spans)
        if (s1 - s0 > 0.01) next.push([pointAlong(a, b, s0 / len), pointAlong(a, b, s1 / len)]);
    }
    segments = next;
  }
  return segments;
}
const pointAlong = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
export { rotateAround };
