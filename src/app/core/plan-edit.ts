import {
  createDefaultPlan,
  createId,
  DEFAULT_IMAGE_WIDTH_METERS,
  DEFAULT_WALL_THICKNESS,
  FloorPlan,
  Layer,
  MAX_ZOOM,
  Measurement,
  MIN_ZOOM,
  ObjectGroup,
  PlacedObject,
  Point,
  Room,
  RoomCategory,
  Selection,
  ShapeKind,
  Viewport,
  Wall,
} from '../models/floor-plan';
import { clamp, contentBBox, dist, scalePoint } from './geometry';
import { selectionFromObjectIds, selectedPlacedObjects } from './selection';

export type StackDirection = 'front' | 'back' | 'forward' | 'backward';

export interface ObjectPose {
  id: string;
  x: number;
  y: number;
  rotation?: number;
}

export type PlanNotice =
  | { kind: 'copied'; count: number }
  | { kind: 'pasted'; count: number }
  | { kind: 'nothing-to-copy' }
  | { kind: 'nothing-to-paste' }
  | { kind: 'select-to-group' }
  | { kind: 'grouped'; count: number }
  | { kind: 'ungrouped' }
  | { kind: 'select-to-restack' }
  | { kind: 'already-front' }
  | { kind: 'already-back' }
  | { kind: 'restacked'; direction: StackDirection; count: number }
  | { kind: 'layer-locked'; name: string }
  | { kind: 'layer-hidden'; name: string }
  | { kind: 'no-layer' }
  | { kind: 'image-imported' }
  | { kind: 'scale-applied' }
  | { kind: 'project-imported' };

export interface PlanEditResult {
  notice: PlanNotice | null;
  selection?: Selection | null;
  fit?: boolean;
}

interface HistorySnapshot {
  plan: FloorPlan;
  imageDataUrl: string | null;
}

interface ObjectClipboard {
  objects: PlacedObject[];
  groups: ObjectGroup[];
}

const HISTORY_LIMIT = 50;
const PASTE_OFFSET_METERS = 0.25;

export class PlanEdit {
  #plan: FloorPlan;
  #imageDataUrl: string | null;
  #history: HistorySnapshot[] = [];
  #future: HistorySnapshot[] = [];
  #clipboard: ObjectClipboard | null = null;
  #pasteGeneration = 0;
  #gesturing = false;

  constructor(plan: FloorPlan = createDefaultPlan(), imageDataUrl: string | null = null) {
    this.#plan = plan;
    this.#imageDataUrl = imageDataUrl;
  }

  get plan(): FloorPlan {
    return this.#plan;
  }

  get imageDataUrl(): string | null {
    return this.#imageDataUrl;
  }

  get canUndo(): boolean {
    return this.#history.length > 0;
  }

  get canRedo(): boolean {
    return this.#future.length > 0;
  }

  get canPaste(): boolean {
    return (this.#clipboard?.objects.length ?? 0) > 0;
  }

  get imageSizeMeters(): { width: number; height: number } | null {
    const background = this.#plan.background;
    if (!background) {
      return null;
    }
    return {
      width: background.widthPx * background.metersPerPixel,
      height: background.heightPx * background.metersPerPixel,
    };
  }

  beginEdit(): void {
    if (this.#gesturing) {
      return;
    }
    this.#snapshot();
    this.#gesturing = true;
  }

  endEdit(): void {
    this.#gesturing = false;
  }

  undo(): boolean {
    const previous = this.#history.pop();
    if (!previous) {
      return false;
    }
    this.#future.push(this.#takeSnapshot());
    this.#restore(previous);
    this.#gesturing = false;
    return true;
  }

  redo(): boolean {
    const next = this.#future.pop();
    if (!next) {
      return false;
    }
    this.#history.push(this.#takeSnapshot());
    this.#restore(next);
    this.#gesturing = false;
    return true;
  }

  hydrate(plan: FloorPlan, imageDataUrl: string | null): void {
    this.#plan = plan;
    this.#imageDataUrl = imageDataUrl;
    this.#history = [];
    this.#future = [];
    this.#clipboard = null;
    this.#pasteGeneration = 0;
    this.#gesturing = false;
  }

  setViewport(viewport: Viewport): void {
    this.#plan = { ...this.#plan, viewport };
  }

  zoomAround(world: Point, clientOffset: Point, nextZoom: number): void {
    const zoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    this.setViewport({
      panX: world.x - clientOffset.x / zoom,
      panY: world.y - clientOffset.y / zoom,
      zoom,
    });
  }

  zoomBy(factor: number, viewSize: { width: number; height: number }): void {
    const { panX, panY, zoom } = this.#plan.viewport;
    const z = clamp(zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const cx = panX + viewSize.width / zoom / 2;
    const cy = panY + viewSize.height / zoom / 2;
    this.setViewport({
      panX: cx - viewSize.width / z / 2,
      panY: cy - viewSize.height / z / 2,
      zoom: z,
    });
  }

  fitToView(viewSize: { width: number; height: number }): boolean {
    const { width, height } = viewSize;
    if (width < 10 || height < 10) {
      return false;
    }
    const box = contentBBox(this.#plan, this.imageSizeMeters);
    const pad = Math.max(0.6, Math.max(box.width, box.depth) * 0.06);
    const worldW = box.width + pad * 2;
    const worldH = box.depth + pad * 2;
    const zoom = clamp(Math.min(width / worldW, height / worldH), MIN_ZOOM, MAX_ZOOM);
    const visW = width / zoom;
    const visH = height / zoom;
    this.setViewport({
      panX: box.x - pad - (visW - worldW) / 2,
      panY: box.y - pad - (visH - worldH) / 2,
      zoom,
    });
    return true;
  }

  setName(name: string): void {
    this.#record();
    this.#plan = { ...this.#plan, name };
  }

  setActiveLayer(id: string): void {
    this.#plan = { ...this.#plan, activeLayerId: id };
  }

  addLayer(): PlanEditResult {
    this.#record();
    const layer: Layer = {
      id: createId('layer'),
      name: `Layer ${this.#plan.layers.length + 1}`,
      visible: true,
      locked: false,
    };
    this.#plan = {
      ...this.#plan,
      layers: [...this.#plan.layers, layer],
      activeLayerId: layer.id,
    };
    return { notice: null };
  }

  renameLayer(id: string, name: string): PlanEditResult {
    const trimmed = name.trim();
    if (!trimmed) {
      return { notice: null };
    }
    this.#record();
    this.#plan = {
      ...this.#plan,
      layers: this.#plan.layers.map((layer) => (layer.id === id ? { ...layer, name: trimmed } : layer)),
    };
    return { notice: null };
  }

  patchLayer(id: string, patch: Partial<Pick<Layer, 'visible' | 'locked'>>): void {
    this.#record();
    this.#plan = {
      ...this.#plan,
      layers: this.#plan.layers.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer)),
    };
  }

  moveLayer(id: string, direction: -1 | 1): void {
    this.#record();
    const index = this.#plan.layers.findIndex((layer) => layer.id === id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= this.#plan.layers.length) {
      return;
    }
    const layers = [...this.#plan.layers];
    const [item] = layers.splice(index, 1);
    layers.splice(next, 0, item);
    this.#plan = { ...this.#plan, layers };
  }

  removeLayer(id: string): void {
    if (this.#plan.layers.length <= 1) {
      return;
    }
    const remaining = this.#plan.layers.filter((layer) => layer.id !== id);
    const fallbackId = remaining[0].id;
    this.#record();
    this.#plan = {
      ...this.#plan,
      layers: remaining,
      activeLayerId: this.#plan.activeLayerId === id ? fallbackId : this.#plan.activeLayerId,
      walls: this.#plan.walls.map((wall) =>
        wall.layerId === id ? { ...wall, layerId: fallbackId } : wall,
      ),
      objects: this.#plan.objects.map((obj) =>
        obj.layerId === id ? { ...obj, layerId: fallbackId } : obj,
      ),
      rooms: this.#plan.rooms.map((room) =>
        room.layerId === id ? { ...room, layerId: fallbackId } : room,
      ),
    };
  }

  addWall(start: Point, end: Point): { wall: Wall } | PlanEditResult {
    if (dist(start, end) < 0.02) {
      return { notice: null };
    }
    const layer = this.#requireUnlockedActiveLayer();
    if ('notice' in layer) {
      return layer;
    }
    const wall: Wall = {
      id: createId('wall'),
      layerId: layer.id,
      start: { ...start },
      end: { ...end },
      thickness: DEFAULT_WALL_THICKNESS,
    };
    this.#record();
    this.#plan = { ...this.#plan, walls: [...this.#plan.walls, wall] };
    return { wall };
  }

  updateWall(
    id: string,
    patch: Partial<Pick<Wall, 'start' | 'end' | 'thickness' | 'layerId'>>,
  ): void {
    this.#record();
    this.#plan = {
      ...this.#plan,
      walls: this.#plan.walls.map((wall) => (wall.id === id ? { ...wall, ...patch } : wall)),
    };
  }

  addObject(
    kind: ShapeKind,
    x: number,
    y: number,
    width: number,
    depth: number,
  ): { object: PlacedObject } | PlanEditResult {
    const layer = this.#requireUnlockedActiveLayer();
    if ('notice' in layer) {
      return layer;
    }
    const size = sanitizeSize(kind, width, depth);
    const obj: PlacedObject = {
      id: createId('obj'),
      layerId: layer.id,
      kind,
      name: defaultObjectName(kind, this.#plan),
      x,
      y,
      width: size.width,
      depth: size.depth,
      rotation: 0,
      groupId: null,
    };
    this.#record();
    this.#plan = { ...this.#plan, objects: [...this.#plan.objects, obj] };
    return { object: obj };
  }

  updateObject(id: string, patch: Partial<PlacedObject>): void {
    this.#record();
    this.#plan = {
      ...this.#plan,
      objects: this.#plan.objects.map((obj) => {
        if (obj.id !== id) {
          return obj;
        }
        const next = { ...obj, ...patch };
        if (next.kind === 'circle') {
          if (patch.width != null) {
            next.depth = next.width;
          } else if (patch.depth != null) {
            next.width = next.depth;
          }
        }
        next.width = Math.max(0.01, next.width);
        next.depth = Math.max(0.01, next.depth);
        return next;
      }),
    };
  }

  applyObjectPoses(poses: readonly ObjectPose[]): void {
    if (poses.length === 0) {
      return;
    }
    this.#record();
    const byId = new Map(poses.map((pose) => [pose.id, pose]));
    this.#plan = {
      ...this.#plan,
      objects: this.#plan.objects.map((obj) => {
        const pose = byId.get(obj.id);
        if (!pose) {
          return obj;
        }
        return { ...obj, x: pose.x, y: pose.y, rotation: pose.rotation ?? obj.rotation };
      }),
    };
  }

  groupSelection(selection: Selection): PlanEditResult {
    const members = selectedPlacedObjects(this.#plan, selection);
    if (members.length < 2) {
      return { notice: { kind: 'select-to-group' } };
    }
    this.#record();
    const group: ObjectGroup = {
      id: createId('group'),
      name: defaultGroupName(this.#plan),
    };
    const memberIds = new Set(members.map((item) => item.id));
    const oldGroupIds = new Set(
      members.map((item) => item.groupId).filter((id): id is string => typeof id === 'string'),
    );
    const objects = this.#plan.objects.map((obj) =>
      memberIds.has(obj.id) ? { ...obj, groupId: group.id } : obj,
    );
    const remainingGroups = (this.#plan.groups ?? []).filter((item) => {
      if (!oldGroupIds.has(item.id)) {
        return true;
      }
      return objects.some((obj) => obj.groupId === item.id);
    });
    this.#plan = { ...this.#plan, objects, groups: [...remainingGroups, group] };
    return {
      notice: { kind: 'grouped', count: members.length },
      selection: { type: 'group', id: group.id },
    };
  }

  copySelection(selection: Selection): PlanEditResult {
    const objects = selectedPlacedObjects(this.#plan, selection);
    if (objects.length === 0) {
      return { notice: { kind: 'nothing-to-copy' } };
    }
    const groupIds = new Set(
      objects.map((item) => item.groupId).filter((id): id is string => typeof id === 'string'),
    );
    this.#clipboard = {
      objects: objects.map((obj) => ({ ...obj })),
      groups: (this.#plan.groups ?? [])
        .filter((group) => groupIds.has(group.id))
        .map((group) => ({ ...group })),
    };
    this.#pasteGeneration = 0;
    return { notice: { kind: 'copied', count: objects.length } };
  }

  pasteClipboard(): PlanEditResult {
    const clipboard = this.#clipboard;
    if (!clipboard || clipboard.objects.length === 0) {
      return { notice: { kind: 'nothing-to-paste' } };
    }
    const layer = this.#requireUnlockedActiveLayer();
    if ('notice' in layer) {
      return layer;
    }
    this.#pasteGeneration += 1;
    const offset = PASTE_OFFSET_METERS * this.#pasteGeneration;
    const duplicated = duplicateClipboard(clipboard, { x: offset, y: offset }, layer.id);
    this.#record();
    this.#plan = {
      ...this.#plan,
      objects: [...this.#plan.objects, ...duplicated.objects],
      groups: [...(this.#plan.groups ?? []), ...duplicated.groups],
    };
    return {
      notice: { kind: 'pasted', count: duplicated.objects.length },
      selection: selectionFromObjectIds(
        this.#plan,
        duplicated.objects.map((obj) => obj.id),
      ),
    };
  }

  restackSelection(selection: Selection, direction: StackDirection): PlanEditResult {
    const ids = selectedPlacedObjects(this.#plan, selection).map((obj) => obj.id);
    if (ids.length === 0) {
      return { notice: { kind: 'select-to-restack' } };
    }
    const objects = this.#plan.objects;
    const next = restackObjects(objects, ids, direction);
    if (sameObjectOrder(objects, next)) {
      return {
        notice: direction === 'front' || direction === 'forward' ? { kind: 'already-front' } : { kind: 'already-back' },
      };
    }
    this.#record();
    this.#plan = { ...this.#plan, objects: next };
    return { notice: { kind: 'restacked', direction, count: ids.length } };
  }

  canRestack(selection: Selection, direction: StackDirection): boolean {
    const ids = selectedPlacedObjects(this.#plan, selection).map((obj) => obj.id);
    if (ids.length === 0) {
      return false;
    }
    return !sameObjectOrder(this.#plan.objects, restackObjects(this.#plan.objects, ids, direction));
  }

  ungroupSelection(selection: Selection): PlanEditResult {
    if (selection?.type !== 'group') {
      return { notice: null };
    }
    const members = selectedPlacedObjects(this.#plan, selection);
    this.#record();
    this.#plan = {
      ...this.#plan,
      objects: this.#plan.objects.map((obj) =>
        obj.groupId === selection.id ? { ...obj, groupId: null } : obj,
      ),
      groups: (this.#plan.groups ?? []).filter((group) => group.id !== selection.id),
    };
    const nextSelection: Selection =
      members.length > 1
        ? { type: 'objects', ids: members.map((item) => item.id) }
        : members[0]
          ? { type: 'object', id: members[0].id }
          : null;
    return { notice: { kind: 'ungrouped' }, selection: nextSelection };
  }

  renameGroup(id: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    this.#record();
    this.#plan = {
      ...this.#plan,
      groups: (this.#plan.groups ?? []).map((group) =>
        group.id === id ? { ...group, name: trimmed } : group,
      ),
    };
  }

  addRoom(
    x: number,
    y: number,
    width: number,
    depth: number,
    category: RoomCategory = 'other',
  ): { room: Room } | PlanEditResult {
    const layer = this.#requireUnlockedActiveLayer();
    if ('notice' in layer) {
      return layer;
    }
    const room: Room = {
      id: createId('room'),
      layerId: layer.id,
      name: defaultRoomName(category, this.#plan),
      category,
      x,
      y,
      width: Math.max(0.2, width),
      depth: Math.max(0.2, depth),
    };
    this.#record();
    this.#plan = { ...this.#plan, rooms: [...this.#plan.rooms, room] };
    return { room };
  }

  addMeasurement(start: Point, end: Point): { measurement: Measurement } | PlanEditResult {
    if (dist(start, end) < 0.01) {
      return { notice: null };
    }
    const measurement: Measurement = {
      id: createId('measure'),
      start: { ...start },
      end: { ...end },
    };
    this.#record();
    this.#plan = {
      ...this.#plan,
      measurements: [...this.#plan.measurements, measurement],
    };
    return { measurement };
  }

  updateMeasurement(id: string, patch: Partial<Pick<Measurement, 'start' | 'end'>>): void {
    this.#record();
    this.#plan = {
      ...this.#plan,
      measurements: this.#plan.measurements.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    };
  }

  updateRoom(id: string, patch: Partial<Room>): void {
    this.#record();
    this.#plan = {
      ...this.#plan,
      rooms: this.#plan.rooms.map((room) => {
        if (room.id !== id) {
          return room;
        }
        const next = { ...room, ...patch };
        next.width = Math.max(0.01, next.width);
        next.depth = Math.max(0.01, next.depth);
        if (patch.category && !patch.name) {
          const previousLabel = categoryLabel(room.category);
          if (room.name === previousLabel || room.name.startsWith(`${previousLabel} `)) {
            next.name = categoryLabel(patch.category);
          }
        }
        return next;
      }),
    };
  }

  deleteSelection(selection: Selection): PlanEditResult {
    if (!selection) {
      return { notice: null };
    }
    this.#record();
    this.#plan = removeSelection(this.#plan, selection);
    return { notice: null, selection: null };
  }

  applyScale(p1: Point, p2: Point, actualMeters: number): PlanEditResult {
    const measured = dist(p1, p2);
    if (actualMeters <= 0 || measured < 1e-6) {
      return { notice: null };
    }
    const factor = actualMeters / measured;
    this.#record();
    this.#plan = {
      ...this.#plan,
      background: this.#plan.background
        ? {
            ...this.#plan.background,
            metersPerPixel: this.#plan.background.metersPerPixel * factor,
            calibrated: true,
          }
        : this.#plan.background,
      walls: this.#plan.walls.map((wall) => ({
        ...wall,
        start: scalePoint(wall.start, factor),
        end: scalePoint(wall.end, factor),
        thickness: wall.thickness * factor,
      })),
      objects: this.#plan.objects.map((obj) => ({
        ...obj,
        x: obj.x * factor,
        y: obj.y * factor,
        width: obj.width * factor,
        depth: obj.depth * factor,
      })),
      rooms: this.#plan.rooms.map((room) => ({
        ...room,
        x: room.x * factor,
        y: room.y * factor,
        width: room.width * factor,
        depth: room.depth * factor,
      })),
      measurements: (this.#plan.measurements ?? []).map((item) => ({
        ...item,
        start: scalePoint(item.start, factor),
        end: scalePoint(item.end, factor),
      })),
      viewport: {
        panX: this.#plan.viewport.panX * factor,
        panY: this.#plan.viewport.panY * factor,
        zoom: clamp(this.#plan.viewport.zoom / factor, MIN_ZOOM, MAX_ZOOM),
      },
    };
    return { notice: { kind: 'scale-applied' } };
  }

  importImage(imageDataUrl: string, size: { width: number; height: number }): PlanEditResult {
    const metersPerPixel = DEFAULT_IMAGE_WIDTH_METERS / size.width;
    this.#record();
    this.#imageDataUrl = imageDataUrl;
    this.#plan = {
      ...this.#plan,
      background: {
        widthPx: size.width,
        heightPx: size.height,
        metersPerPixel,
        calibrated: false,
      },
    };
    return { notice: { kind: 'image-imported' }, fit: true };
  }

  importProject(plan: FloorPlan, imageDataUrl: string | null): PlanEditResult {
    this.#record();
    this.#plan = plan;
    this.#imageDataUrl = imageDataUrl;
    this.#future = [];
    this.#gesturing = false;
    return { notice: { kind: 'project-imported' }, selection: null, fit: true };
  }

  #requireUnlockedActiveLayer(): Layer | PlanEditResult {
    const layer =
      this.#plan.layers.find((item) => item.id === this.#plan.activeLayerId) ?? this.#plan.layers[0];
    if (!layer) {
      return { notice: { kind: 'no-layer' } };
    }
    if (layer.locked) {
      return { notice: { kind: 'layer-locked', name: layer.name } };
    }
    if (!layer.visible) {
      return { notice: { kind: 'layer-hidden', name: layer.name } };
    }
    return layer;
  }

  #record(): void {
    if (this.#gesturing) {
      return;
    }
    this.#snapshot();
  }

  #snapshot(): void {
    this.#history.push(this.#takeSnapshot());
    if (this.#history.length > HISTORY_LIMIT) {
      this.#history.shift();
    }
    this.#future = [];
  }

  #takeSnapshot(): HistorySnapshot {
    return {
      plan: structuredClone(this.#plan),
      imageDataUrl: this.#imageDataUrl,
    };
  }

  #restore(snapshot: HistorySnapshot): void {
    this.#plan = snapshot.plan;
    this.#imageDataUrl = snapshot.imageDataUrl;
  }
}

const restackObjects = (
  objects: readonly PlacedObject[],
  selectedIds: readonly string[],
  direction: StackDirection,
): PlacedObject[] => {
  const selected = new Set(selectedIds);
  if (selected.size === 0) {
    return [...objects];
  }
  const layerIds = new Set(objects.filter((obj) => selected.has(obj.id)).map((obj) => obj.layerId));
  const next = [...objects];
  for (const layerId of layerIds) {
    const indices: number[] = [];
    const items: PlacedObject[] = [];
    for (let i = 0; i < next.length; i += 1) {
      if (next[i].layerId === layerId) {
        indices.push(i);
        items.push(next[i]);
      }
    }
    const restacked = restackLayerItems(items, selected, direction);
    for (let i = 0; i < indices.length; i += 1) {
      next[indices[i]] = restacked[i];
    }
  }
  return next;
};

const restackLayerItems = (
  items: PlacedObject[],
  selected: Set<string>,
  direction: StackDirection,
): PlacedObject[] => {
  const moving = items.filter((item) => selected.has(item.id));
  if (moving.length === 0 || moving.length === items.length) {
    return items;
  }
  if (direction === 'front') {
    return [...items.filter((item) => !selected.has(item.id)), ...moving];
  }
  if (direction === 'back') {
    return [...moving, ...items.filter((item) => !selected.has(item.id))];
  }
  const result = [...items];
  if (direction === 'forward') {
    for (let i = result.length - 2; i >= 0; i -= 1) {
      if (selected.has(result[i].id) && !selected.has(result[i + 1].id)) {
        const current = result[i];
        result[i] = result[i + 1];
        result[i + 1] = current;
      }
    }
    return result;
  }
  for (let i = 1; i < result.length; i += 1) {
    if (selected.has(result[i].id) && !selected.has(result[i - 1].id)) {
      const current = result[i];
      result[i] = result[i - 1];
      result[i - 1] = current;
    }
  }
  return result;
};

const sameObjectOrder = (a: readonly PlacedObject[], b: readonly PlacedObject[]): boolean =>
  a.length === b.length && a.every((obj, index) => obj.id === b[index].id);

const duplicateClipboard = (
  clipboard: ObjectClipboard,
  offset: Point,
  layerId: string,
): { objects: PlacedObject[]; groups: ObjectGroup[] } => {
  const groupIdMap = new Map<string, string>();
  for (const obj of clipboard.objects) {
    if (obj.groupId && !groupIdMap.has(obj.groupId)) {
      groupIdMap.set(obj.groupId, createId('group'));
    }
  }
  const groups = clipboard.groups
    .filter((group) => groupIdMap.has(group.id))
    .map((group) => ({
      ...group,
      id: groupIdMap.get(group.id) ?? group.id,
    }));
  const knownGroupIds = new Set(groups.map((group) => group.id));
  for (const newId of groupIdMap.values()) {
    if (!knownGroupIds.has(newId)) {
      groups.push({ id: newId, name: 'Group' });
      knownGroupIds.add(newId);
    }
  }
  const objects = clipboard.objects.map((obj) => ({
    ...obj,
    id: createId('obj'),
    layerId,
    x: obj.x + offset.x,
    y: obj.y + offset.y,
    groupId: obj.groupId ? (groupIdMap.get(obj.groupId) ?? null) : null,
  }));
  return { objects, groups };
};

const removeSelection = (plan: FloorPlan, selection: Selection): FloorPlan => {
  if (!selection) {
    return plan;
  }
  if (selection.type === 'wall') {
    return { ...plan, walls: plan.walls.filter((wall) => wall.id !== selection.id) };
  }
  if (selection.type === 'object') {
    return removeObjects(plan, new Set([selection.id]));
  }
  if (selection.type === 'objects') {
    return removeObjects(plan, new Set(selection.ids));
  }
  if (selection.type === 'group') {
    const ids = new Set(
      plan.objects.filter((obj) => obj.groupId === selection.id).map((obj) => obj.id),
    );
    return removeObjects(plan, ids);
  }
  if (selection.type === 'measurement') {
    return {
      ...plan,
      measurements: plan.measurements.filter((item) => item.id !== selection.id),
    };
  }
  if (selection.type === 'multi') {
    let next = removeObjects(plan, new Set(selection.objectIds));
    next = {
      ...next,
      walls: next.walls.filter((wall) => !selection.wallIds.includes(wall.id)),
      rooms: next.rooms.filter((room) => !selection.roomIds.includes(room.id)),
      measurements: (next.measurements ?? []).filter(
        (item) => !selection.measurementIds.includes(item.id),
      ),
    };
    return next;
  }
  return { ...plan, rooms: plan.rooms.filter((room) => room.id !== selection.id) };
};

const removeObjects = (plan: FloorPlan, ids: Set<string>): FloorPlan => {
  const objects = plan.objects.filter((obj) => !ids.has(obj.id));
  const usedGroups = new Set(
    objects.map((obj) => obj.groupId).filter((id): id is string => typeof id === 'string'),
  );
  return {
    ...plan,
    objects,
    groups: (plan.groups ?? []).filter((group) => usedGroups.has(group.id)),
  };
};

const sanitizeSize = (
  kind: ShapeKind,
  width: number,
  depth: number,
): { width: number; depth: number } => {
  const w = Math.max(0.05, width);
  const d = Math.max(0.05, depth);
  if (kind === 'circle') {
    const diameter = Math.min(w, d);
    return { width: diameter, depth: diameter };
  }
  return { width: w, depth: d };
};

const defaultGroupName = (plan: FloorPlan): string => `Group ${(plan.groups ?? []).length + 1}`;

const defaultObjectName = (kind: ShapeKind, plan: FloorPlan): string => {
  const count = plan.objects.filter((obj) => obj.kind === kind).length + 1;
  const label = kind === 'rect' ? 'Rect' : kind === 'circle' ? 'Circle' : 'Ellipse';
  return `${label} ${count}`;
};

const defaultRoomName = (category: RoomCategory, plan: FloorPlan): string => {
  const label = categoryLabel(category);
  const count = plan.rooms.filter((room) => room.category === category).length + 1;
  return count === 1 ? label : `${label} ${count}`;
};

const categoryLabel = (category: RoomCategory): string => {
  switch (category) {
    case 'living':
      return 'Living';
    case 'bedroom':
      return 'Bedroom';
    case 'kitchen':
      return 'Kitchen';
    case 'bathroom':
      return 'Bathroom';
    case 'hallway':
      return 'Hallway';
    case 'office':
      return 'Office';
    case 'dining':
      return 'Dining';
    case 'storage':
      return 'Storage';
    case 'outdoor':
      return 'Outdoor';
    case 'other':
      return 'Room';
    default: {
      const _never: never = category;
      return _never;
    }
  }
};
