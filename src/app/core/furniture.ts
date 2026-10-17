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

export interface CupboardFront {
  panels: { x: number; y: number; width: number; depth: number }[];
  handles: { x: number; y: number; width: number; depth: number }[];
}

/** Two door fronts flush inside the front (bottom) edge, with a centre seam and a handle on each panel near the seam. */
export function cupboardFrontPieces(obj: {
  x: number;
  y: number;
  width: number;
  depth: number;
}): CupboardFront {
  const depth = 0.06;
  const gap = 0.02;
  const inset = 0.01;
  const y = obj.y + obj.depth - depth - 0.005;
  const panelWidth = (obj.width - inset * 2 - gap) / 2;
  const panels = [0, 1].map((i) => ({
    x: obj.x + inset + i * (panelWidth + gap),
    y,
    width: panelWidth,
    depth,
  }));
  const handleSize = 0.05;
  const handles = [-1, 1].map((side) => ({
    x: obj.x + obj.width / 2 + side * 0.07 - handleSize / 2,
    y: y + depth / 2 - handleSize / 2,
    width: handleSize,
    depth: handleSize,
  }));
  return { panels, handles };
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
