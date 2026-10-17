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
  objectId: string | null;
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
  const free: OpeningSnap = {
    center: { ...center },
    rotation: 0,
    wallId: null,
    objectId: null,
    target: null,
  };
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
          objectId: null,
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
          objectId: obj.id,
          target: 'object',
          distance: d,
        };
    }
  }
  return best
    ? {
        center: best.center,
        rotation: best.rotation,
        wallId: best.wallId,
        objectId: best.objectId,
        target: best.target,
      }
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
      // Only the segment the opening actually lies on may be cut. Projecting with a
      // clamped t (the old behaviour) also cut width-sized chunks out of every other
      // segment of a multi-segment wall — on a closed loop an opening in the bottom
      // wall ate pieces of the top and side walls too, detaching it visually.
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const rawT = ((opening.center.x - a.x) * dx + (opening.center.y - a.y) * dy) / (len * len);
      const onLine = { x: a.x + rawT * dx, y: a.y + rawT * dy };
      if (dist(opening.center, onLine) > wall.thickness / 2 + 1e-6) {
        next.push([a, b]);
        continue;
      }
      const along = rawT * len,
        half = opening.width / 2;
      if (along + half <= 0 || along - half >= len) {
        next.push([a, b]);
        continue;
      }
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

/** Host segments an opening can be attached to, in order (wall polyline or object edges). */
export function objectEdgeSegments(obj: PlacedObject): [Point, Point][] {
  const corners = objectCorners(obj);
  return corners.map((corner, i) => [corner, corners[(i + 1) % corners.length]] as [Point, Point]);
}

interface AttachmentAnchor {
  segmentIndex: number;
  t: number;
  /** Signed distance from the segment to the opening centre, along the segment normal. */
  perpendicular: number;
  segmentAngle: number;
}

function anchorOn(opening: Opening, segments: readonly [Point, Point][]): AttachmentAnchor | null {
  let best: (AttachmentAnchor & { distance: number }) | null = null;
  segments.forEach(([a, b], index) => {
    const hit = closestPointOnSegment(opening.center, a, b);
    // At a joint two segments share an endpoint; a centre clamped onto a neighbouring
    // segment must not win over the segment it truly lies on, or following a host
    // change could flip the opening onto the wrong (perpendicular) segment.
    const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    const rawT =
      len2 < 1e-12
        ? 0
        : ((opening.center.x - a.x) * (b.x - a.x) + (opening.center.y - a.y) * (b.y - a.y)) / len2;
    const score = hit.distance + (rawT < -1e-9 || rawT > 1 + 1e-9 ? 1 : 0);
    if (!best || score < best.distance) {
      const len = dist(a, b) || 1;
      const nx = -(b.y - a.y) / len;
      const ny = (b.x - a.x) / len;
      const perpendicular =
        (opening.center.x - hit.point.x) * nx + (opening.center.y - hit.point.y) * ny;
      best = {
        segmentIndex: index,
        t: hit.t,
        perpendicular,
        segmentAngle: angleDeg(a, b),
        distance: score,
      };
    }
  });
  return best;
}

function applyAnchor(
  opening: Opening,
  anchor: AttachmentAnchor,
  segments: readonly [Point, Point][],
): { center: Point; rotation: number } | null {
  const segment = segments[anchor.segmentIndex] ?? segments[segments.length - 1];
  if (!segment) return null;
  const [a, b] = segment;
  const len = dist(a, b) || 1;
  const nx = -(b.y - a.y) / len;
  const ny = (b.x - a.x) / len;
  const rotationDelta = angleDeg(a, b) - anchor.segmentAngle;
  return {
    center: {
      x: a.x + (b.x - a.x) * anchor.t + nx * anchor.perpendicular,
      y: a.y + (b.y - a.y) * anchor.t + ny * anchor.perpendicular,
    },
    rotation: (opening.rotation ?? 0) + rotationDelta,
  };
}

/**
 * Where every attached opening should sit after its host (wall or object) changed geometry,
 * keeping each opening's position along its host segment (and its perpendicular offset).
 * `hostsBefore`/`hostsAfter` map a host key ("wall:<id>" / "object:<id>") to its segments
 * before and after the change. Openings whose host is absent from both maps are left alone.
 */
export function followAttachedOpenings(
  openings: readonly Opening[],
  hostsBefore: ReadonlyMap<string, [Point, Point][]>,
  hostsAfter: ReadonlyMap<string, [Point, Point][]>,
): Opening[] {
  return openings.map((opening) => {
    const key = opening.wallId
      ? `wall:${opening.wallId}`
      : opening.objectId
        ? `object:${opening.objectId}`
        : null;
    if (!key) return opening;
    const before = hostsBefore.get(key);
    const after = hostsAfter.get(key);
    if (!before || !after) return opening;
    const anchor = anchorOn(opening, before);
    if (!anchor) return opening;
    const moved = applyAnchor(opening, anchor, after);
    if (!moved) return opening;
    if (
      Math.abs(moved.center.x - opening.center.x) < 1e-9 &&
      Math.abs(moved.center.y - opening.center.y) < 1e-9 &&
      Math.abs(moved.rotation - (opening.rotation ?? 0)) < 1e-9
    ) {
      return opening;
    }
    return { ...opening, center: moved.center, rotation: moved.rotation };
  });
}
