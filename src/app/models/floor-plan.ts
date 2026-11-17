export type Tool =
  | 'select'
  | 'pan'
  | 'scale'
  | 'measure'
  | 'rect'
  | 'circle'
  | 'ellipse'
  | 'wall'
  | 'door'
  | 'window';

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
  /** Custom fill: #rrggbb, or 'transparent' for no fill. When missing, the shape's default color is used. */
  color?: string;
  /** Optional border color as #rrggbb. When missing, no custom border (canvas/export keep the subtle hairline). */
  borderColor?: string;
}

export interface Wall {
  id: string;
  points: Point[];
  thickness: number;
  /** Custom wall color: #rrggbb, #rrggbbaa or 'transparent'. When missing, the wall is black. */
  color?: string;
}
export const DEFAULT_WALL_COLOR = '#000000';
/** Solid hex for a wall's stored color (black when unset or invalid). */
export function wallColor(wall: Pick<Wall, 'color'>): string {
  return parseColor(wall.color, DEFAULT_WALL_COLOR).hex;
}
/** Canvas/export paint for a wall: 'none' at 0% opacity, otherwise hex + opacity. */
export function wallPaint(wall: Pick<Wall, 'color'>): { stroke: string; opacity: number } {
  const parsed = parseColor(wall.color, DEFAULT_WALL_COLOR);
  return parsed.alpha <= 0
    ? { stroke: 'none', opacity: 0 }
    : { stroke: parsed.hex, opacity: parsed.alpha };
}
export const DEFAULT_WALL_THICKNESS = 0.15;
export const MIN_WALL_THICKNESS = 0.02;
export const MAX_WALL_THICKNESS = 1;
export function clampWallThickness(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(MAX_WALL_THICKNESS, Math.max(MIN_WALL_THICKNESS, value))
    : DEFAULT_WALL_THICKNESS;
}
export type OpeningKind = 'door' | 'window';
export interface Opening {
  id: string;
  kind: OpeningKind;
  center: Point;
  width: number;
  /** Direction of the opening span, in degrees. */
  rotation: number;
  /** Door only: mirror the hinge side. */
  flipH?: boolean;
  /** Door only: mirror the swing side. */
  flipV?: boolean;
  /** Wall this opening is snapped into, if any. Rendering cuts that wall at the span. */
  wallId?: string | null;
  /** Object this opening is snapped to (e.g. a door on a cupboard edge), if any. */
  objectId?: string | null;
  /** Custom opening color: #rrggbb, #rrggbbaa or 'transparent'. When missing, the opening is black. */
  color?: string;
}
export const DEFAULT_OPENING_COLOR = '#000000';
/** Window default on the (dark) canvas: the near-white windows had before opening colors. */
export const DEFAULT_WINDOW_COLOR = '#f5f7fa';
const defaultOpeningHex = (opening: Pick<Opening, 'color' | 'kind'>): string =>
  opening.kind === 'window' ? DEFAULT_WINDOW_COLOR : DEFAULT_OPENING_COLOR;
/** Solid hex for an opening's stored color (door black / window near-white when unset). */
export function openingColor(opening: Pick<Opening, 'color' | 'kind'>): string {
  return parseColor(opening.color, defaultOpeningHex(opening)).hex;
}
/**
 * Canvas/export paint for an opening: 'none' at 0% opacity, otherwise hex + opacity.
 * `fallbackHex` lets the light-on-white export substitute its print ink for the
 * canvas default (windows were ink-coloured in exports before opening colors).
 */
export function openingPaint(
  opening: Pick<Opening, 'color' | 'kind'>,
  fallbackHex: string = defaultOpeningHex(opening),
): { stroke: string; opacity: number } {
  const parsed = parseColor(opening.color, fallbackHex);
  return parsed.alpha <= 0
    ? { stroke: 'none', opacity: 0 }
    : { stroke: parsed.hex, opacity: parsed.alpha };
}
export const DEFAULT_DOOR_WIDTH = 0.9;
export const DEFAULT_WINDOW_WIDTH = 1.2;
export function clampOpeningWidth(kind: OpeningKind, value: unknown): number {
  const fallback = kind === 'door' ? DEFAULT_DOOR_WIDTH : DEFAULT_WINDOW_WIDTH;
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(4, Math.max(0.3, value))
    : fallback;
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
  /** Custom line color as #rrggbb. When missing, the default measurement color is used. */
  color?: string;
}

export interface FloorPlan {
  version: 1;
  name: string;
  background: Background | null;
  objects: PlacedObject[];
  measurements: Measurement[];
  walls: Wall[];
  openings: Opening[];
  groups: ObjectGroup[];
  viewport: Viewport;
}

export type Selection =
  | { type: 'object'; id: string }
  | { type: 'objects'; ids: string[] }
  | { type: 'group'; id: string }
  | { type: 'measurement'; id: string }
  | { type: 'wall'; id: string }
  | { type: 'opening'; id: string }
  | {
      type: 'multi';
      objectIds: string[];
      measurementIds: string[];
      wallIds: string[];
      openingIds: string[];
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

/** Default measurement color on the canvas (matches the --measure CSS variable). */
export const MEASUREMENT_COLOR = '#7ad0c0';

/** Returns a normalized lowercase #rrggbb color, or undefined when the value is not one. */
export function normalizeColor(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const match = /^#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})$/i.exec(value.trim());
  if (!match) {
    return undefined;
  }
  let hex = match[1].toLowerCase();
  if (hex.length === 3 || hex.length === 4) {
    hex = hex.replace(/./g, '$&$&');
  }
  // Fully opaque alpha collapses to plain #rrggbb so old solid colors stay identical.
  return hex.length === 8 && hex.endsWith('ff') ? `#${hex.slice(0, 6)}` : `#${hex}`;
}

export interface ParsedColor {
  hex: string;
  /** 0 (fully transparent) to 1 (solid). */
  alpha: number;
}

/** Splits a stored color (#rrggbb, #rrggbbaa or 'transparent') into hex + alpha. */
export function parseColor(value: string | undefined, fallbackHex: string): ParsedColor {
  if (value === 'transparent') {
    return { hex: fallbackHex, alpha: 0 };
  }
  const normalized = normalizeColor(value);
  if (!normalized) {
    return { hex: fallbackHex, alpha: 1 };
  }
  if (normalized.length === 9) {
    return { hex: normalized.slice(0, 7), alpha: parseInt(normalized.slice(7), 16) / 255 };
  }
  return { hex: normalized, alpha: 1 };
}

/** Combines a solid #rrggbb with an opacity percent into the stored form. */
export function colorWithOpacity(hex: string, percent: number): string {
  const base = normalizeColor(hex)?.slice(0, 7) ?? '#000000';
  const pct = Math.min(100, Math.max(0, Math.round(percent)));
  if (pct <= 0) {
    return 'transparent';
  }
  if (pct >= 100) {
    return base;
  }
  const alpha = Math.round((pct / 100) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${base}${alpha}`;
}

/** Opacity percent of a stored color; fallback when no color is stored. */
export function opacityPercent(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  if (value === 'transparent') {
    return 0;
  }
  return Math.round(parseColor(value, '#000000').alpha * 100);
}

export const OBJECT_BORDER_COLOR = '#1a1d23';
export const TRANSPARENT = 'transparent';
export function objectBorderColor(obj: Pick<PlacedObject, 'borderColor'>): string {
  return parseColor(obj.borderColor, OBJECT_BORDER_COLOR).hex;
}
/** Fill paint for an object: a #rrggbb color, or 'transparent' when it should render unfilled. */
export function objectFill(obj: Pick<PlacedObject, 'kind' | 'color'>): string {
  return obj.color ?? OBJECT_COLORS[obj.kind];
}
export function objectColor(obj: Pick<PlacedObject, 'kind' | 'color'>): string {
  return parseColor(objectFill(obj), OBJECT_COLORS[obj.kind]).hex;
}

/** Canvas/export fill paint: 'none' at 0% opacity, otherwise hex + combined opacity. */
export function fillPaint(obj: Pick<PlacedObject, 'kind' | 'color'>): {
  fill: string;
  opacity: number;
} {
  const parsed = parseColor(objectFill(obj), OBJECT_COLORS[obj.kind]);
  return parsed.alpha <= 0
    ? { fill: 'none', opacity: 0 }
    : { fill: parsed.hex, opacity: parsed.alpha * 0.82 };
}

/** Canvas/export border paint, or null when the border is fully transparent. */
export function borderPaint(
  obj: Pick<PlacedObject, 'borderColor'>,
): { stroke: string; opacity: number } | null {
  if (!obj.borderColor) {
    return null;
  }
  const parsed = parseColor(obj.borderColor, OBJECT_BORDER_COLOR);
  return parsed.alpha <= 0 ? null : { stroke: parsed.hex, opacity: parsed.alpha };
}

export function measurementColor(item: Pick<Measurement, 'color'>): string {
  return item.color ?? MEASUREMENT_COLOR;
}

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
    walls: [],
    openings: [],
    groups: [],
    viewport: { panX: -1, panY: -1, zoom: 40 },
  };
}
