export type Tool =
  | 'select'
  | 'pan'
  | 'scale'
  | 'measure'
  | 'rect'
  | 'circle'
  | 'ellipse';

export type ShapeKind = 'rect' | 'circle' | 'ellipse';

export interface Point {
  x: number;
  y: number;
}

export interface Viewport {
  /** World-space left edge of the view, in meters. */
  panX: number;
  /** World-space top edge of the view, in meters. */
  panY: number;
  /** Screen pixels per meter. */
  zoom: number;
}

export interface Background {
  widthPx: number;
  heightPx: number;
  metersPerPixel: number;
  calibrated: boolean;
}

export interface PlacedObject {
  id: string;
  kind: ShapeKind;
  name: string;
  /** Top-left of the axis-aligned bounding box, in meters. */
  x: number;
  y: number;
  /** Width along X, in meters. */
  width: number;
  /** Depth along Y, in meters. */
  depth: number;
  /** Rotation in degrees, around the object center. */
  rotation: number;
  /** When set, this object moves and rotates with the group. */
  groupId: string | null;
}

export interface ObjectGroup {
  id: string;
  name: string;
}

export interface Measurement {
  id: string;
  start: Point;
  end: Point;
  /** Signed perpendicular distance from the measured segment to the dimension line, in meters. */
  offset: number;
}

export interface FloorPlan {
  version: 1;
  name: string;
  background: Background | null;
  objects: PlacedObject[];
  measurements: Measurement[];
  groups: ObjectGroup[];
  viewport: Viewport;
}

export type Selection =
  | { type: 'object'; id: string }
  | { type: 'objects'; ids: string[] }
  | { type: 'group'; id: string }
  | { type: 'measurement'; id: string }
  | {
      type: 'multi';
      objectIds: string[];
      measurementIds: string[];
    }
  | null;

export const MIN_ZOOM = 4;
export const MAX_ZOOM = 500;
export const SNAP_PIXELS = 14;
export const DEFAULT_IMAGE_WIDTH_METERS = 12;

export const OBJECT_COLORS: Record<ShapeKind, string> = {
  rect: '#7eb8ff',
  circle: '#ffb07e',
  ellipse: '#b0e07e',
};

export function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function createDefaultPlan(): FloorPlan {
  return {
    version: 1,
    name: 'Floor plan',
    background: null,
    objects: [],
    measurements: [],
    groups: [],
    viewport: { panX: -1, panY: -1, zoom: 40 },
  };
}
