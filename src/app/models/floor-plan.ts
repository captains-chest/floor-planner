export type Tool =
  | 'select'
  | 'pan'
  | 'scale'
  | 'measure'
  | 'wall'
  | 'rect'
  | 'circle'
  | 'ellipse'
  | 'room';

export type ShapeKind = 'rect' | 'circle' | 'ellipse';

export type RoomCategory =
  | 'living'
  | 'bedroom'
  | 'kitchen'
  | 'bathroom'
  | 'hallway'
  | 'office'
  | 'dining'
  | 'storage'
  | 'outdoor'
  | 'other';

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

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
}

export interface Background {
  widthPx: number;
  heightPx: number;
  metersPerPixel: number;
  calibrated: boolean;
}

export interface Wall {
  id: string;
  layerId: string;
  start: Point;
  end: Point;
  /** Wall thickness in meters. */
  thickness: number;
}

export interface PlacedObject {
  id: string;
  layerId: string;
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
}

export interface Room {
  id: string;
  layerId: string;
  name: string;
  category: RoomCategory;
  x: number;
  y: number;
  width: number;
  depth: number;
}

export interface FloorPlan {
  version: 1;
  name: string;
  background: Background | null;
  layers: Layer[];
  activeLayerId: string;
  walls: Wall[];
  objects: PlacedObject[];
  rooms: Room[];
  measurements: Measurement[];
  groups: ObjectGroup[];
  viewport: Viewport;
}

export type Selection =
  | { type: 'wall'; id: string }
  | { type: 'object'; id: string }
  | { type: 'objects'; ids: string[] }
  | { type: 'group'; id: string }
  | { type: 'room'; id: string }
  | { type: 'measurement'; id: string }
  | {
      type: 'multi';
      objectIds: string[];
      wallIds: string[];
      roomIds: string[];
      measurementIds: string[];
    }
  | null;

export interface RoomCategoryInfo {
  id: RoomCategory;
  label: string;
  color: string;
}

export const ROOM_CATEGORIES: readonly RoomCategoryInfo[] = [
  { id: 'living', label: 'Living', color: '#e8c36a' },
  { id: 'bedroom', label: 'Bedroom', color: '#6aa7e8' },
  { id: 'kitchen', label: 'Kitchen', color: '#e89a5c' },
  { id: 'bathroom', label: 'Bathroom', color: '#5cc4c9' },
  { id: 'hallway', label: 'Hallway', color: '#9aa3b2' },
  { id: 'office', label: 'Office', color: '#9b7ee8' },
  { id: 'dining', label: 'Dining', color: '#d4a017' },
  { id: 'storage', label: 'Storage', color: '#b08968' },
  { id: 'outdoor', label: 'Outdoor', color: '#6fbf73' },
  { id: 'other', label: 'Other', color: '#7d8799' },
];

export const ROOM_CATEGORY_MAP = new Map<RoomCategory, RoomCategoryInfo>(
  ROOM_CATEGORIES.map((item) => [item.id, item]),
);

export const DEFAULT_WALL_THICKNESS = 0.1;
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
  const rooms: Layer = {
    id: createId('layer'),
    name: 'Rooms',
    visible: true,
    locked: false,
  };
  const walls: Layer = {
    id: createId('layer'),
    name: 'Walls',
    visible: true,
    locked: false,
  };
  const furniture: Layer = {
    id: createId('layer'),
    name: 'Furniture',
    visible: true,
    locked: false,
  };

  return {
    version: 1,
    name: 'Floor plan',
    background: null,
    layers: [rooms, walls, furniture],
    activeLayerId: walls.id,
    walls: [],
    objects: [],
    rooms: [],
    measurements: [],
    groups: [],
    viewport: { panX: -1, panY: -1, zoom: 40 },
  };
}
