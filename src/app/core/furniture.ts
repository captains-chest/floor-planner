import { FloorPlan, ShapeKind } from '../models/floor-plan';

/** A ready-made object: a named shape with a typical real-world footprint, in meters. */
export interface FurnitureItem {
  id: string;
  name: string;
  category: FurnitureCategory;
  kind: ShapeKind;
  width: number;
  depth: number;
}

export type FurnitureCategory = 'Living' | 'Bedroom' | 'Dining' | 'Kitchen' | 'Bathroom' | 'Office';

/** Common footprints (width × depth) for European furniture and fixtures. */
export const FURNITURE: readonly FurnitureItem[] = [
  {
    id: 'sofa-3',
    name: 'Sofa (3 seats)',
    category: 'Living',
    kind: 'rect',
    width: 2.2,
    depth: 0.9,
  },
  {
    id: 'sofa-2',
    name: 'Sofa (2 seats)',
    category: 'Living',
    kind: 'rect',
    width: 1.6,
    depth: 0.9,
  },
  { id: 'armchair', name: 'Armchair', category: 'Living', kind: 'rect', width: 0.8, depth: 0.8 },
  {
    id: 'coffee-table',
    name: 'Coffee table',
    category: 'Living',
    kind: 'rect',
    width: 1.2,
    depth: 0.6,
  },
  { id: 'tv-bench', name: 'TV bench', category: 'Living', kind: 'rect', width: 1.8, depth: 0.4 },
  { id: 'bookcase', name: 'Bookcase', category: 'Living', kind: 'rect', width: 0.8, depth: 0.3 },
  {
    id: 'bed-double',
    name: 'Double bed',
    category: 'Bedroom',
    kind: 'rect',
    width: 1.6,
    depth: 2.0,
  },
  {
    id: 'bed-single',
    name: 'Single bed',
    category: 'Bedroom',
    kind: 'rect',
    width: 0.9,
    depth: 2.0,
  },
  { id: 'wardrobe', name: 'Wardrobe', category: 'Bedroom', kind: 'rect', width: 1.0, depth: 0.6 },
  {
    id: 'cupboard-door',
    name: 'Cupboard with door',
    category: 'Bedroom',
    kind: 'rect',
    width: 1.0,
    depth: 0.6,
  },
  {
    id: 'nightstand',
    name: 'Nightstand',
    category: 'Bedroom',
    kind: 'rect',
    width: 0.45,
    depth: 0.4,
  },
  { id: 'dresser', name: 'Dresser', category: 'Bedroom', kind: 'rect', width: 0.8, depth: 0.5 },
  {
    id: 'dining-table-6',
    name: 'Dining table (6)',
    category: 'Dining',
    kind: 'rect',
    width: 1.8,
    depth: 0.9,
  },
  {
    id: 'dining-table-round',
    name: 'Round table',
    category: 'Dining',
    kind: 'circle',
    width: 1.1,
    depth: 1.1,
  },
  { id: 'chair', name: 'Chair', category: 'Dining', kind: 'rect', width: 0.45, depth: 0.5 },
  {
    id: 'counter',
    name: 'Kitchen counter',
    category: 'Kitchen',
    kind: 'rect',
    width: 0.6,
    depth: 0.6,
  },
  { id: 'fridge', name: 'Fridge', category: 'Kitchen', kind: 'rect', width: 0.6, depth: 0.65 },
  {
    id: 'kitchen-island',
    name: 'Kitchen island',
    category: 'Kitchen',
    kind: 'rect',
    width: 1.8,
    depth: 0.9,
  },
  { id: 'bathtub', name: 'Bathtub', category: 'Bathroom', kind: 'rect', width: 1.7, depth: 0.75 },
  { id: 'shower', name: 'Shower', category: 'Bathroom', kind: 'rect', width: 0.9, depth: 0.9 },
  { id: 'toilet', name: 'Toilet', category: 'Bathroom', kind: 'rect', width: 0.4, depth: 0.65 },
  { id: 'sink', name: 'Sink', category: 'Bathroom', kind: 'rect', width: 0.6, depth: 0.45 },
  {
    id: 'washer',
    name: 'Washing machine',
    category: 'Bathroom',
    kind: 'rect',
    width: 0.6,
    depth: 0.6,
  },
  { id: 'desk', name: 'Desk', category: 'Office', kind: 'rect', width: 1.4, depth: 0.7 },
  {
    id: 'office-chair',
    name: 'Office chair',
    category: 'Office',
    kind: 'circle',
    width: 0.65,
    depth: 0.65,
  },
];

export const FURNITURE_CATEGORIES: readonly FurnitureCategory[] = [
  'Living',
  'Bedroom',
  'Dining',
  'Kitchen',
  'Bathroom',
  'Office',
];

export const CUPBOARD_DOOR_ID = 'cupboard-door';

/**
 * The normal door for a cupboard-with-door: centred on the front (bottom) edge, as wide as the
 * cupboard front, hinged at its left end and swinging outward (flipV in door rendering).
 */
export function cupboardDoorPlacement(obj: {
  x: number;
  y: number;
  width: number;
  depth: number;
}): { center: { x: number; y: number }; width: number; rotation: number } {
  return {
    center: { x: obj.x + obj.width / 2, y: obj.y + obj.depth },
    width: obj.width,
    rotation: 0,
  };
}

export interface FurniturePreviewPoint {
  x: number;
  y: number;
}
export interface FurniturePreview {
  /** Body footprint in tile coordinates. For circles rx/ry are its radii. */
  body: { x: number; y: number; w: number; h: number; rx: number; ry: number };
  /** Door drawn on the body front edge (cupboard-with-door only), in tile coordinates. */
  door: {
    hinge: FurniturePreviewPoint;
    leafEnd: FurniturePreviewPoint;
    arcEnd: FurniturePreviewPoint;
    frontStart: FurniturePreviewPoint;
    frontEnd: FurniturePreviewPoint;
    arcPath: string;
    radius: number;
  } | null;
  /** Full bounding box in tile coordinates, including the swing arc when present. */
  total: { x: number; y: number; w: number; h: number };
  /** Tile units per metre (uniform on both axes). */
  scale: number;
}

/**
 * Preview geometry for a catalog tile, computed from the exact placed geometry so the tile
 * cannot drift from what gets placed: the body is the item footprint, and the cupboard door
 * comes from cupboardDoorPlacement at the origin, hinged at the left end of the front edge,
 * swinging outward (downward on screen) with leaf and arc radius equal to the door width.
 * Everything, arc included, is scaled uniformly to fit and be centred in the tile viewBox.
 */
export function furniturePreview(
  item: Pick<FurnitureItem, 'id' | 'width' | 'depth'>,
  viewWidth = 100,
  viewHeight = 70,
  inset = 6,
): FurniturePreview {
  let doorWorld: (FurniturePreview['door'] & { radiusWorld: number }) | null = null;
  let maxY = item.depth;
  if (item.id === CUPBOARD_DOOR_ID) {
    const placed = cupboardDoorPlacement({ x: 0, y: 0, width: item.width, depth: item.depth });
    const hingeWorld = { x: placed.center.x - placed.width / 2, y: placed.center.y };
    const leafEndWorld = { x: hingeWorld.x, y: hingeWorld.y + placed.width };
    const arcEndWorld = { x: placed.center.x + placed.width / 2, y: placed.center.y };
    maxY = Math.max(maxY, leafEndWorld.y);
    doorWorld = {
      hinge: hingeWorld,
      leafEnd: leafEndWorld,
      arcEnd: arcEndWorld,
      frontStart: hingeWorld,
      frontEnd: arcEndWorld,
      arcPath: '',
      radius: placed.width,
      radiusWorld: placed.width,
    };
  }
  const bboxW = item.width;
  const bboxH = maxY;
  const scale = Math.min((viewWidth - 2 * inset) / bboxW, (viewHeight - 2 * inset) / bboxH);
  const offX = (viewWidth - bboxW * scale) / 2;
  const offY = (viewHeight - bboxH * scale) / 2;
  const toTile = (pt: FurniturePreviewPoint): FurniturePreviewPoint => ({
    x: offX + pt.x * scale,
    y: offY + pt.y * scale,
  });
  const bodyW = item.width * scale;
  const bodyH = item.depth * scale;
  const bodyOrigin = toTile({ x: 0, y: 0 });
  let door: FurniturePreview['door'] = null;
  if (doorWorld) {
    const hingeT = toTile(doorWorld.hinge);
    const leafEndT = toTile(doorWorld.leafEnd);
    const arcEndT = toTile(doorWorld.arcEnd);
    const radius = doorWorld.radiusWorld * scale;
    door = {
      hinge: hingeT,
      leafEnd: leafEndT,
      arcEnd: arcEndT,
      frontStart: hingeT,
      frontEnd: arcEndT,
      arcPath: `M ${leafEndT.x} ${leafEndT.y} A ${radius} ${radius} 0 0 1 ${arcEndT.x} ${arcEndT.y}`,
      radius,
    };
  }
  return {
    body: { x: bodyOrigin.x, y: bodyOrigin.y, w: bodyW, h: bodyH, rx: bodyW / 2, ry: bodyH / 2 },
    door,
    total: { x: offX, y: offY, w: bboxW * scale, h: bboxH * scale },
    scale,
  };
}

export function filterFurniture(query: string): readonly FurnitureItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return FURNITURE;
  return FURNITURE.filter(
    (item) => item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q),
  );
}

export function furnitureById(id: string): FurnitureItem | undefined {
  return FURNITURE.find((item) => item.id === id);
}

/** "Chair", then "Chair 2", "Chair 3", … so every placed piece keeps a distinct label. */
export function furnitureObjectName(item: FurnitureItem, plan: FloorPlan): string {
  const taken = new Set(plan.objects.map((obj) => obj.name));
  if (!taken.has(item.name)) {
    return item.name;
  }
  let n = 2;
  while (taken.has(`${item.name} ${n}`)) {
    n++;
  }
  return `${item.name} ${n}`;
}

/**
 * Top-left for a new piece centred on `center`, nudged diagonally (0.3 m steps) while another
 * object already starts at that spot, so repeated placements don't hide under each other.
 */
export function placementSpot(
  item: Pick<FurnitureItem, 'width' | 'depth'>,
  center: { x: number; y: number },
  plan: FloorPlan,
): { x: number; y: number } {
  const step = 0.3;
  const near = (a: number, b: number) => Math.abs(a - b) < 0.05;
  let x = center.x - item.width / 2;
  let y = center.y - item.depth / 2;
  for (let i = 0; i < 50 && plan.objects.some((obj) => near(obj.x, x) && near(obj.y, y)); i++) {
    x += step;
    y += step;
  }
  return { x, y };
}
