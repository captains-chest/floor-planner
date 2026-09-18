import { computed, effect, inject, Service, signal } from '@angular/core';
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
  Tool,
  Viewport,
  Wall,
} from '../models/floor-plan';
import { BoxPick, clamp, contentBBox, dist, scalePoint, selectedPlacedObjects } from './geometry';
import { measureImage, readFileAsDataUrl } from './image';
import { parseProjectDocument, Persistence, serializeProject } from './persistence';
import { formatLength, type LengthUnit } from './units';

export interface ScaleDialog {
  p1: Point;
  p2: Point;
  measured: number;
}

export type StackDirection = 'front' | 'back' | 'forward' | 'backward';

const HISTORY_LIMIT = 50;
const PASTE_OFFSET_METERS = 0.25;

interface HistorySnapshot {
  plan: FloorPlan;
  imageDataUrl: string | null;
}

interface ObjectClipboard {
  objects: PlacedObject[];
  groups: ObjectGroup[];
}

@Service()
export class PlannerStore {
  private readonly persistence = inject(Persistence);

  private readonly _plan = signal<FloorPlan>(createDefaultPlan());
  private readonly _imageDataUrl = signal<string | null>(null);
  private readonly _tool = signal<Tool>('select');
  private readonly _selection = signal<Selection>(null);
  private readonly _shiftHeld = signal(false);
  private readonly _altHeld = signal(false);
  private readonly _ctrlHeld = signal(false);
  private readonly _spaceHeld = signal(false);
  private readonly _ready = signal(false);
  private readonly _fitToken = signal(0);
  private readonly _scaleDialog = signal<ScaleDialog | null>(null);
  private readonly _status = signal('Ready');
  private readonly _historyTick = signal(0);
  private readonly _lengthUnit = signal<LengthUnit>('m');

  private history: HistorySnapshot[] = [];
  private future: HistorySnapshot[] = [];
  private viewSize = { width: 1200, height: 800 };
  private readonly _clipboard = signal<ObjectClipboard | null>(null);
  private pasteGeneration = 0;

  readonly plan = this._plan.asReadonly();
  readonly imageDataUrl = this._imageDataUrl.asReadonly();
  readonly tool = this._tool.asReadonly();
  readonly selection = this._selection.asReadonly();
  readonly shiftHeld = this._shiftHeld.asReadonly();
  readonly altHeld = this._altHeld.asReadonly();
  readonly ctrlHeld = this._ctrlHeld.asReadonly();
  readonly spaceHeld = this._spaceHeld.asReadonly();
  readonly ready = this._ready.asReadonly();
  readonly fitToken = this._fitToken.asReadonly();
  readonly scaleDialog = this._scaleDialog.asReadonly();
  readonly status = this._status.asReadonly();
  readonly lengthUnit = this._lengthUnit.asReadonly();

  readonly imageSizeMeters = computed(() => {
    const background = this._plan().background;
    if (!background) {
      return null;
    }
    return {
      width: background.widthPx * background.metersPerPixel,
      height: background.heightPx * background.metersPerPixel,
    };
  });

  readonly activeLayer = computed(() => {
    const plan = this._plan();
    return plan.layers.find((layer) => layer.id === plan.activeLayerId) ?? plan.layers[0];
  });

  readonly selectedWall = computed(() => {
    const selection = this._selection();
    if (selection?.type !== 'wall') {
      return null;
    }
    return this._plan().walls.find((wall) => wall.id === selection.id) ?? null;
  });

  readonly selectedObject = computed(() => {
    const selection = this._selection();
    if (selection?.type !== 'object') {
      return null;
    }
    return this._plan().objects.find((obj) => obj.id === selection.id) ?? null;
  });

  readonly selectedRoom = computed(() => {
    const selection = this._selection();
    if (selection?.type !== 'room') {
      return null;
    }
    return this._plan().rooms.find((room) => room.id === selection.id) ?? null;
  });

  readonly selectedMeasurement = computed(() => {
    const selection = this._selection();
    if (selection?.type !== 'measurement') {
      return null;
    }
    return (this._plan().measurements ?? []).find((item) => item.id === selection.id) ?? null;
  });

  readonly selectedObjects = computed(() => selectedPlacedObjects(this._plan(), this._selection()));

  readonly selectedGroup = computed(() => {
    const selection = this._selection();
    if (selection?.type !== 'group') {
      return null;
    }
    return (this._plan().groups ?? []).find((group) => group.id === selection.id) ?? null;
  });

  readonly canGroup = computed(() => this.selectedObjects().length >= 2);

  readonly canUngroup = computed(() => this._selection()?.type === 'group');

  readonly canCopy = computed(() => this.selectedObjects().length > 0);

  readonly canPaste = computed(() => (this._clipboard()?.objects.length ?? 0) > 0);

  readonly canBringToFront = computed(() => this.canRestack('front'));

  readonly canSendToBack = computed(() => this.canRestack('back'));

  readonly canBringForward = computed(() => this.canRestack('forward'));

  readonly canSendBackward = computed(() => this.canRestack('backward'));

  readonly selectedWalls = computed(() => {
    const selection = this._selection();
    const plan = this._plan();
    if (selection?.type === 'wall') {
      const wall = plan.walls.find((item) => item.id === selection.id);
      return wall ? [wall] : [];
    }
    if (selection?.type === 'multi') {
      const ids = new Set(selection.wallIds);
      return plan.walls.filter((wall) => ids.has(wall.id));
    }
    return [];
  });

  readonly selectedRooms = computed(() => {
    const selection = this._selection();
    const plan = this._plan();
    if (selection?.type === 'room') {
      const room = plan.rooms.find((item) => item.id === selection.id);
      return room ? [room] : [];
    }
    if (selection?.type === 'multi') {
      const ids = new Set(selection.roomIds);
      return plan.rooms.filter((room) => ids.has(room.id));
    }
    return [];
  });

  readonly selectedMeasurements = computed(() => {
    const selection = this._selection();
    const plan = this._plan();
    if (selection?.type === 'measurement') {
      const item = (plan.measurements ?? []).find((entry) => entry.id === selection.id);
      return item ? [item] : [];
    }
    if (selection?.type === 'multi') {
      const ids = new Set(selection.measurementIds);
      return (plan.measurements ?? []).filter((item) => ids.has(item.id));
    }
    return [];
  });

  readonly selectionCount = computed(() => {
    const objects = this.selectedObjects().length;
    const walls = this.selectedWalls().length;
    const rooms = this.selectedRooms().length;
    const measurements = this.selectedMeasurements().length;
    return objects + walls + rooms + measurements;
  });

  readonly canUndo = computed(() => {
    this._historyTick();
    return this.history.length > 0;
  });

  readonly canRedo = computed(() => {
    this._historyTick();
    return this.future.length > 0;
  });

  constructor() {
    void this.hydrate();

    effect((onCleanup) => {
      const plan = this._plan();
      const imageDataUrl = this._imageDataUrl();
      const lengthUnit = this._lengthUnit();
      const ready = this._ready();
      if (!ready) {
        return;
      }
      const handle = setTimeout(() => {
        void this.persistence.save({ plan, imageDataUrl, lengthUnit });
      }, 280);
      onCleanup(() => clearTimeout(handle));
    });
  }

  setTool(tool: Tool): void {
    this._tool.set(tool);
    this._status.set(toolHint(tool));
    const layerName = defaultLayerName(tool);
    if (!layerName) {
      return;
    }
    const layer = this._plan().layers.find((item) => item.name === layerName);
    if (layer && layer.visible && !layer.locked && this._plan().activeLayerId !== layer.id) {
      this._plan.update((plan) => ({ ...plan, activeLayerId: layer.id }));
    }
  }

  setShiftHeld(value: boolean): void {
    this._shiftHeld.set(value);
  }

  setAltHeld(value: boolean): void {
    this._altHeld.set(value);
  }

  setCtrlHeld(value: boolean): void {
    this._ctrlHeld.set(value);
  }

  setSpaceHeld(value: boolean): void {
    this._spaceHeld.set(value);
  }

  setSelection(selection: Selection): void {
    this._selection.set(selection);
  }

  selectObject(id: string, additive: boolean): void {
    const plan = this._plan();
    const obj = plan.objects.find((item) => item.id === id);
    if (!obj) {
      return;
    }
    if (additive) {
      const currentIds = new Set(this.selectedObjects().map((item) => item.id));
      const unitIds = obj.groupId
        ? plan.objects.filter((item) => item.groupId === obj.groupId).map((item) => item.id)
        : [obj.id];
      const allSelected = unitIds.every((unitId) => currentIds.has(unitId));
      if (allSelected) {
        for (const unitId of unitIds) {
          currentIds.delete(unitId);
        }
      } else {
        for (const unitId of unitIds) {
          currentIds.add(unitId);
        }
      }
      this._selection.set(selectionFromObjectIds(plan, [...currentIds]));
      return;
    }
    if (obj.groupId) {
      this._selection.set({ type: 'group', id: obj.groupId });
      return;
    }
    this._selection.set({ type: 'object', id: obj.id });
  }

  selectBox(pick: BoxPick, additive: boolean): void {
    const plan = this._plan();
    const merged = additive ? mergePicks(pickFromSelection(plan, this._selection()), pick) : pick;
    const selection = collapsePick(plan, merged);
    this._selection.set(selection);
    const count =
      merged.objectIds.length +
      merged.wallIds.length +
      merged.roomIds.length +
      merged.measurementIds.length;
    this._status.set(count === 0 ? 'Nothing in selection' : `Selected ${count}`);
  }

  isObjectSelected(id: string): boolean {
    return this.selectedObjects().some((obj) => obj.id === id);
  }

  setStatus(status: string): void {
    this._status.set(status);
  }

  setLengthUnit(unit: LengthUnit): void {
    this._lengthUnit.set(unit);
  }

  exportProject(): { filename: string; json: string } {
    const document = serializeProject({
      plan: this._plan(),
      imageDataUrl: this._imageDataUrl(),
      lengthUnit: this._lengthUnit(),
    });
    return {
      filename: `${fileSlug(this._plan().name)}.floorplan.json`,
      json: JSON.stringify(document),
    };
  }

  async importProjectFile(file: File): Promise<void> {
    const text = await file.text();
    let raw: unknown;
    try {
      raw = JSON.parse(text) as unknown;
    } catch {
      throw new Error('Invalid project file');
    }
    const parsed = parseProjectDocument(raw);
    if (!parsed) {
      throw new Error('Not a floor planner project');
    }
    this.captureHistory();
    this._plan.set(parsed.plan);
    this._imageDataUrl.set(parsed.imageDataUrl);
    this._lengthUnit.set(parsed.lengthUnit);
    this._selection.set(null);
    this._scaleDialog.set(null);
    this.future = [];
    this.setTool('select');
    this._fitToken.update((token) => token + 1);
    this._status.set('Project imported.');
  }

  reportViewSize(width: number, height: number): void {
    if (width > 0 && height > 0) {
      this.viewSize = { width, height };
    }
  }

  setViewport(viewport: Viewport): void {
    this._plan.update((plan) => ({ ...plan, viewport }));
  }

  zoomAround(world: Point, clientOffset: Point, nextZoom: number): void {
    const zoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    this.setViewport({
      panX: world.x - clientOffset.x / zoom,
      panY: world.y - clientOffset.y / zoom,
      zoom,
    });
  }

  zoomBy(factor: number): void {
    const { width, height } = this.viewSize;
    const { panX, panY, zoom } = this._plan().viewport;
    const z = clamp(zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const cx = panX + width / zoom / 2;
    const cy = panY + height / zoom / 2;
    this.setViewport({
      panX: cx - width / z / 2,
      panY: cy - height / z / 2,
      zoom: z,
    });
  }

  fitToView(): void {
    const { width, height } = this.viewSize;
    if (width < 10 || height < 10) {
      this._fitToken.update((token) => token + 1);
      return;
    }
    const box = contentBBox(this._plan(), this.imageSizeMeters());
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
  }

  setName(name: string): void {
    this._plan.update((plan) => ({ ...plan, name }));
  }

  async importImageFile(file: File): Promise<void> {
    const imageDataUrl = await readFileAsDataUrl(file);
    const size = await measureImage(imageDataUrl);
    const metersPerPixel = DEFAULT_IMAGE_WIDTH_METERS / size.width;
    this.captureHistory();
    this._imageDataUrl.set(imageDataUrl);
    this._plan.update((plan) => ({
      ...plan,
      background: {
        widthPx: size.width,
        heightPx: size.height,
        metersPerPixel,
        calibrated: false,
      },
    }));
    this._fitToken.update((token) => token + 1);
    this._status.set('Image imported. Use Scale and mark a known length.');
    this.setTool('scale');
  }

  openScaleDialog(p1: Point, p2: Point): void {
    this._scaleDialog.set({ p1, p2, measured: dist(p1, p2) });
  }

  cancelScaleDialog(): void {
    this._scaleDialog.set(null);
  }

  applyScale(actualMeters: number): boolean {
    const dialog = this._scaleDialog();
    if (!dialog || actualMeters <= 0 || dialog.measured < 1e-6) {
      return false;
    }
    const factor = actualMeters / dialog.measured;
    this.captureHistory();
    this._plan.update((plan) => ({
      ...plan,
      background: plan.background
        ? {
            ...plan.background,
            metersPerPixel: plan.background.metersPerPixel * factor,
            calibrated: true,
          }
        : plan.background,
      walls: plan.walls.map((wall) => ({
        ...wall,
        start: scalePoint(wall.start, factor),
        end: scalePoint(wall.end, factor),
        thickness: wall.thickness * factor,
      })),
      objects: plan.objects.map((obj) => ({
        ...obj,
        x: obj.x * factor,
        y: obj.y * factor,
        width: obj.width * factor,
        depth: obj.depth * factor,
      })),
      rooms: plan.rooms.map((room) => ({
        ...room,
        x: room.x * factor,
        y: room.y * factor,
        width: room.width * factor,
        depth: room.depth * factor,
      })),
      measurements: (plan.measurements ?? []).map((item) => ({
        ...item,
        start: scalePoint(item.start, factor),
        end: scalePoint(item.end, factor),
      })),
      viewport: {
        panX: plan.viewport.panX * factor,
        panY: plan.viewport.panY * factor,
        zoom: clamp(plan.viewport.zoom / factor, MIN_ZOOM, MAX_ZOOM),
      },
    }));
    this._scaleDialog.set(null);
    this.setTool('select');
    this._status.set('Scale applied. Distances use real-world units.');
    return true;
  }

  setActiveLayer(id: string): void {
    this._plan.update((plan) => ({ ...plan, activeLayerId: id }));
  }

  addLayer(): void {
    this.captureHistory();
    const layer: Layer = {
      id: createId('layer'),
      name: `Layer ${this._plan().layers.length + 1}`,
      visible: true,
      locked: false,
    };
    this._plan.update((plan) => ({
      ...plan,
      layers: [...plan.layers, layer],
      activeLayerId: layer.id,
    }));
  }

  renameLayer(id: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    this.captureHistory();
    this._plan.update((plan) => ({
      ...plan,
      layers: plan.layers.map((layer) => (layer.id === id ? { ...layer, name: trimmed } : layer)),
    }));
  }

  patchLayer(id: string, patch: Partial<Pick<Layer, 'visible' | 'locked'>>): void {
    this._plan.update((plan) => ({
      ...plan,
      layers: plan.layers.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer)),
    }));
  }

  moveLayer(id: string, direction: -1 | 1): void {
    this.captureHistory();
    this._plan.update((plan) => {
      const index = plan.layers.findIndex((layer) => layer.id === id);
      const next = index + direction;
      if (index < 0 || next < 0 || next >= plan.layers.length) {
        return plan;
      }
      const layers = [...plan.layers];
      const [item] = layers.splice(index, 1);
      layers.splice(next, 0, item);
      return { ...plan, layers };
    });
  }

  removeLayer(id: string): void {
    const plan = this._plan();
    if (plan.layers.length <= 1) {
      return;
    }
    const remaining = plan.layers.filter((layer) => layer.id !== id);
    const fallbackId = remaining[0].id;
    this.captureHistory();
    this._plan.update((current) => ({
      ...current,
      layers: remaining,
      activeLayerId: current.activeLayerId === id ? fallbackId : current.activeLayerId,
      walls: current.walls.map((wall) =>
        wall.layerId === id ? { ...wall, layerId: fallbackId } : wall,
      ),
      objects: current.objects.map((obj) =>
        obj.layerId === id ? { ...obj, layerId: fallbackId } : obj,
      ),
      rooms: current.rooms.map((room) =>
        room.layerId === id ? { ...room, layerId: fallbackId } : room,
      ),
    }));
  }

  addWall(start: Point, end: Point): Wall | null {
    if (dist(start, end) < 0.02) {
      return null;
    }
    const layer = this.requireUnlockedActiveLayer();
    if (!layer) {
      return null;
    }
    const wall: Wall = {
      id: createId('wall'),
      layerId: layer.id,
      start: { ...start },
      end: { ...end },
      thickness: DEFAULT_WALL_THICKNESS,
    };
    this.captureHistory();
    this._plan.update((plan) => ({ ...plan, walls: [...plan.walls, wall] }));
    return wall;
  }

  updateWall(
    id: string,
    patch: Partial<Pick<Wall, 'start' | 'end' | 'thickness' | 'layerId'>>,
  ): void {
    this._plan.update((plan) => ({
      ...plan,
      walls: plan.walls.map((wall) => (wall.id === id ? { ...wall, ...patch } : wall)),
    }));
  }

  addObject(
    kind: ShapeKind,
    x: number,
    y: number,
    width: number,
    depth: number,
  ): PlacedObject | null {
    const layer = this.requireUnlockedActiveLayer();
    if (!layer) {
      return null;
    }
    const size = sanitizeSize(kind, width, depth);
    const obj: PlacedObject = {
      id: createId('obj'),
      layerId: layer.id,
      kind,
      name: defaultObjectName(kind, this._plan()),
      x,
      y,
      width: size.width,
      depth: size.depth,
      rotation: 0,
      groupId: null,
    };
    this.captureHistory();
    this._plan.update((plan) => ({ ...plan, objects: [...plan.objects, obj] }));
    this._selection.set({ type: 'object', id: obj.id });
    this.setTool('select');
    return obj;
  }

  updateObject(id: string, patch: Partial<PlacedObject>): void {
    this._plan.update((plan) => ({
      ...plan,
      objects: plan.objects.map((obj) => {
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
    }));
  }

  applyObjectPoses(poses: readonly ObjectPose[]): void {
    if (poses.length === 0) {
      return;
    }
    const byId = new Map(poses.map((pose) => [pose.id, pose]));
    this._plan.update((plan) => ({
      ...plan,
      objects: plan.objects.map((obj) => {
        const pose = byId.get(obj.id);
        if (!pose) {
          return obj;
        }
        return { ...obj, x: pose.x, y: pose.y, rotation: pose.rotation ?? obj.rotation };
      }),
    }));
  }

  groupSelection(): void {
    const members = this.selectedObjects();
    if (members.length < 2) {
      this._status.set('Select at least two objects to group.');
      return;
    }
    this.captureHistory();
    const group: ObjectGroup = {
      id: createId('group'),
      name: defaultGroupName(this._plan()),
    };
    const memberIds = new Set(members.map((item) => item.id));
    const oldGroupIds = new Set(
      members.map((item) => item.groupId).filter((id): id is string => typeof id === 'string'),
    );
    this._plan.update((plan) => {
      const objects = plan.objects.map((obj) =>
        memberIds.has(obj.id) ? { ...obj, groupId: group.id } : obj,
      );
      const remainingGroups = (plan.groups ?? []).filter((item) => {
        if (!oldGroupIds.has(item.id)) {
          return true;
        }
        return objects.some((obj) => obj.groupId === item.id);
      });
      return { ...plan, objects, groups: [...remainingGroups, group] };
    });
    this._selection.set({ type: 'group', id: group.id });
    this._status.set(`Grouped ${members.length} objects. Drag a corner handle to rotate together.`);
  }

  copySelection(): void {
    const objects = this.selectedObjects();
    if (objects.length === 0) {
      this._status.set('Select objects to copy.');
      return;
    }
    const groupIds = new Set(
      objects.map((item) => item.groupId).filter((id): id is string => typeof id === 'string'),
    );
    this._clipboard.set({
      objects: objects.map((obj) => ({ ...obj })),
      groups: (this._plan().groups ?? [])
        .filter((group) => groupIds.has(group.id))
        .map((group) => ({ ...group })),
    });
    this.pasteGeneration = 0;
    this._status.set(objects.length === 1 ? 'Copied 1 object' : `Copied ${objects.length} objects`);
  }

  pasteClipboard(): void {
    const clipboard = this._clipboard();
    if (!clipboard || clipboard.objects.length === 0) {
      this._status.set('Nothing to paste.');
      return;
    }
    const layer = this.requireUnlockedActiveLayer();
    if (!layer) {
      return;
    }
    this.pasteGeneration += 1;
    const offset = PASTE_OFFSET_METERS * this.pasteGeneration;
    const duplicated = duplicateClipboard(clipboard, { x: offset, y: offset }, layer.id);
    this.captureHistory();
    this._plan.update((plan) => ({
      ...plan,
      objects: [...plan.objects, ...duplicated.objects],
      groups: [...(plan.groups ?? []), ...duplicated.groups],
    }));
    this._selection.set(
      selectionFromObjectIds(
        this._plan(),
        duplicated.objects.map((obj) => obj.id),
      ),
    );
    this.setTool('select');
    this._status.set(
      duplicated.objects.length === 1
        ? 'Pasted 1 object'
        : `Pasted ${duplicated.objects.length} objects`,
    );
  }

  restackSelection(direction: StackDirection): void {
    const ids = this.selectedObjects().map((obj) => obj.id);
    if (ids.length === 0) {
      this._status.set('Select objects to change order.');
      return;
    }
    const objects = this._plan().objects;
    const next = restackObjects(objects, ids, direction);
    if (sameObjectOrder(objects, next)) {
      this._status.set(
        direction === 'front' || direction === 'forward'
          ? 'Already at the front'
          : 'Already at the back',
      );
      return;
    }
    this.captureHistory();
    this._plan.update((plan) => ({ ...plan, objects: next }));
    this._status.set(stackStatus(direction, ids.length));
  }

  ungroupSelection(): void {
    const selection = this._selection();
    if (selection?.type !== 'group') {
      return;
    }
    const members = this.selectedObjects();
    this.captureHistory();
    this._plan.update((plan) => ({
      ...plan,
      objects: plan.objects.map((obj) =>
        obj.groupId === selection.id ? { ...obj, groupId: null } : obj,
      ),
      groups: (plan.groups ?? []).filter((group) => group.id !== selection.id),
    }));
    this._selection.set(
      members.length > 1
        ? { type: 'objects', ids: members.map((item) => item.id) }
        : members[0]
          ? { type: 'object', id: members[0].id }
          : null,
    );
    this._status.set('Ungrouped');
  }

  renameGroup(id: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    this.captureHistory();
    this._plan.update((plan) => ({
      ...plan,
      groups: (plan.groups ?? []).map((group) =>
        group.id === id ? { ...group, name: trimmed } : group,
      ),
    }));
  }

  addRoom(
    x: number,
    y: number,
    width: number,
    depth: number,
    category: RoomCategory = 'other',
  ): Room | null {
    const layer = this.requireUnlockedActiveLayer();
    if (!layer) {
      return null;
    }
    const room: Room = {
      id: createId('room'),
      layerId: layer.id,
      name: defaultRoomName(category, this._plan()),
      category,
      x,
      y,
      width: Math.max(0.2, width),
      depth: Math.max(0.2, depth),
    };
    this.captureHistory();
    this._plan.update((plan) => ({ ...plan, rooms: [...plan.rooms, room] }));
    this._selection.set({ type: 'room', id: room.id });
    return room;
  }

  addMeasurement(start: Point, end: Point): Measurement | null {
    if (dist(start, end) < 0.01) {
      return null;
    }
    const measurement: Measurement = {
      id: createId('measure'),
      start: { ...start },
      end: { ...end },
    };
    this.captureHistory();
    this._plan.update((plan) => ({
      ...plan,
      measurements: [...plan.measurements, measurement],
    }));
    this._selection.set({ type: 'measurement', id: measurement.id });
    this._status.set(`Measured ${formatLength(dist(start, end), this._lengthUnit())}`);
    return measurement;
  }

  updateMeasurement(id: string, patch: Partial<Pick<Measurement, 'start' | 'end'>>): void {
    this._plan.update((plan) => ({
      ...plan,
      measurements: plan.measurements.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    }));
  }

  updateRoom(id: string, patch: Partial<Room>): void {
    this._plan.update((plan) => ({
      ...plan,
      rooms: plan.rooms.map((room) => {
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
    }));
  }

  captureHistory(): void {
    this.history.push(this.snapshot());
    if (this.history.length > HISTORY_LIMIT) {
      this.history.shift();
    }
    this.future = [];
    this._historyTick.update((tick) => tick + 1);
  }

  undo(): void {
    const previous = this.history.pop();
    if (!previous) {
      return;
    }
    this.future.push(this.snapshot());
    this.restore(previous);
    this._historyTick.update((tick) => tick + 1);
  }

  redo(): void {
    const next = this.future.pop();
    if (!next) {
      return;
    }
    this.history.push(this.snapshot());
    this.restore(next);
    this._historyTick.update((tick) => tick + 1);
  }

  private snapshot(): HistorySnapshot {
    return {
      plan: structuredClone(this._plan()),
      imageDataUrl: this._imageDataUrl(),
    };
  }

  private restore(snapshot: HistorySnapshot): void {
    this._plan.set(snapshot.plan);
    this._imageDataUrl.set(snapshot.imageDataUrl);
    this._selection.set(null);
  }

  deleteSelection(): void {
    const selection = this._selection();
    if (!selection) {
      return;
    }
    this.captureHistory();
    this._plan.update((plan) => {
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
    });
    this._selection.set(null);
  }

  private requireUnlockedActiveLayer(): Layer | null {
    const layer = this.activeLayer();
    if (!layer) {
      this._status.set('Create a layer first.');
      return null;
    }
    if (layer.locked) {
      this._status.set(`Layer “${layer.name}” is locked.`);
      return null;
    }
    if (!layer.visible) {
      this._status.set(`Layer “${layer.name}” is hidden.`);
      return null;
    }
    return layer;
  }

  private async hydrate(): Promise<void> {
    const saved = await this.persistence.load();
    if (saved) {
      this._plan.set(saved.plan);
      this._imageDataUrl.set(saved.imageDataUrl);
      this._lengthUnit.set(saved.lengthUnit);
    }
    this._ready.set(true);
    this._status.set(toolHint(this._tool()));
  }

  private canRestack(direction: StackDirection): boolean {
    const ids = this.selectedObjects().map((obj) => obj.id);
    if (ids.length === 0) {
      return false;
    }
    const objects = this._plan().objects;
    return !sameObjectOrder(objects, restackObjects(objects, ids, direction));
  }
}

export interface ObjectPose {
  id: string;
  x: number;
  y: number;
  rotation?: number;
}

function restackObjects(
  objects: readonly PlacedObject[],
  selectedIds: readonly string[],
  direction: StackDirection,
): PlacedObject[] {
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
}

function restackLayerItems(
  items: PlacedObject[],
  selected: Set<string>,
  direction: StackDirection,
): PlacedObject[] {
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
}

function sameObjectOrder(a: readonly PlacedObject[], b: readonly PlacedObject[]): boolean {
  return a.length === b.length && a.every((obj, index) => obj.id === b[index].id);
}

function stackStatus(direction: StackDirection, count: number): string {
  const noun = count === 1 ? 'object' : `${count} objects`;
  switch (direction) {
    case 'front':
      return `Brought ${noun} to front`;
    case 'back':
      return `Sent ${noun} to back`;
    case 'forward':
      return `Brought ${noun} forward`;
    case 'backward':
      return `Sent ${noun} backward`;
    default: {
      const _never: never = direction;
      return _never;
    }
  }
}

function duplicateClipboard(
  clipboard: ObjectClipboard,
  offset: Point,
  layerId: string,
): { objects: PlacedObject[]; groups: ObjectGroup[] } {
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
}

function selectionFromObjectIds(plan: FloorPlan, ids: string[]): Selection {
  if (ids.length === 0) {
    return null;
  }
  if (ids.length === 1) {
    const obj = plan.objects.find((item) => item.id === ids[0]);
    if (obj?.groupId) {
      return { type: 'group', id: obj.groupId };
    }
    return { type: 'object', id: ids[0] };
  }
  const idSet = new Set(ids);
  const objs = plan.objects.filter((item) => idSet.has(item.id));
  const groupId = objs[0]?.groupId;
  if (groupId && objs.every((item) => item.groupId === groupId)) {
    const memberCount = plan.objects.filter((item) => item.groupId === groupId).length;
    if (memberCount === objs.length) {
      return { type: 'group', id: groupId };
    }
  }
  return { type: 'objects', ids };
}

function removeObjects(plan: FloorPlan, ids: Set<string>): FloorPlan {
  const objects = plan.objects.filter((obj) => !ids.has(obj.id));
  const usedGroups = new Set(
    objects.map((obj) => obj.groupId).filter((id): id is string => typeof id === 'string'),
  );
  return {
    ...plan,
    objects,
    groups: (plan.groups ?? []).filter((group) => usedGroups.has(group.id)),
  };
}

function pickFromSelection(plan: FloorPlan, selection: Selection): BoxPick {
  const empty: BoxPick = { objectIds: [], wallIds: [], roomIds: [], measurementIds: [] };
  if (!selection) {
    return empty;
  }
  if (selection.type === 'object') {
    return { ...empty, objectIds: [selection.id] };
  }
  if (selection.type === 'objects') {
    return { ...empty, objectIds: [...selection.ids] };
  }
  if (selection.type === 'group') {
    return {
      ...empty,
      objectIds: plan.objects.filter((obj) => obj.groupId === selection.id).map((obj) => obj.id),
    };
  }
  if (selection.type === 'wall') {
    return { ...empty, wallIds: [selection.id] };
  }
  if (selection.type === 'room') {
    return { ...empty, roomIds: [selection.id] };
  }
  if (selection.type === 'measurement') {
    return { ...empty, measurementIds: [selection.id] };
  }
  return {
    objectIds: [...selection.objectIds],
    wallIds: [...selection.wallIds],
    roomIds: [...selection.roomIds],
    measurementIds: [...selection.measurementIds],
  };
}

function mergePicks(a: BoxPick, b: BoxPick): BoxPick {
  return {
    objectIds: uniqueIds([...a.objectIds, ...b.objectIds]),
    wallIds: uniqueIds([...a.wallIds, ...b.wallIds]),
    roomIds: uniqueIds([...a.roomIds, ...b.roomIds]),
    measurementIds: uniqueIds([...a.measurementIds, ...b.measurementIds]),
  };
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

function collapsePick(plan: FloorPlan, pick: BoxPick): Selection {
  const objects = pick.objectIds.length;
  const walls = pick.wallIds.length;
  const rooms = pick.roomIds.length;
  const measurements = pick.measurementIds.length;
  const kinds =
    (objects > 0 ? 1 : 0) + (walls > 0 ? 1 : 0) + (rooms > 0 ? 1 : 0) + (measurements > 0 ? 1 : 0);
  if (kinds === 0) {
    return null;
  }
  if (kinds === 1 && objects > 0) {
    return selectionFromObjectIds(plan, pick.objectIds);
  }
  if (kinds === 1 && walls === 1) {
    return { type: 'wall', id: pick.wallIds[0] };
  }
  if (kinds === 1 && rooms === 1) {
    return { type: 'room', id: pick.roomIds[0] };
  }
  if (kinds === 1 && measurements === 1) {
    return { type: 'measurement', id: pick.measurementIds[0] };
  }
  return {
    type: 'multi',
    objectIds: pick.objectIds,
    wallIds: pick.wallIds,
    roomIds: pick.roomIds,
    measurementIds: pick.measurementIds,
  };
}

function fileSlug(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'floor-plan';
}

function defaultGroupName(plan: FloorPlan): string {
  return `Group ${(plan.groups ?? []).length + 1}`;
}

function defaultLayerName(tool: Tool): string | null {
  switch (tool) {
    case 'wall':
      return 'Walls';
    case 'room':
      return 'Rooms';
    case 'rect':
    case 'circle':
    case 'ellipse':
      return 'Furniture';
    default:
      return null;
  }
}

function toolHint(tool: Tool): string {
  switch (tool) {
    case 'select':
      return 'Select · drag right: window · drag left: crossing · Shift adds · Ctrl snaps corners';
    case 'pan':
      return 'Drag to pan · scroll to zoom';
    case 'scale':
      return 'Click two points on a known length · hold Alt to snap to 90°';
    case 'measure':
      return 'Click two points to measure · snaps to walls and object corners · Alt: 90°';
    case 'wall':
      return 'Click to place wall corners · Shift disables snap · Esc ends the chain';
    case 'rect':
      return 'Click and drag to place a rectangle';
    case 'circle':
      return 'Click and drag to place a circle';
    case 'ellipse':
      return 'Click and drag to place an ellipse';
    case 'room':
      return 'Click and drag to mark a room, then set its category';
    default: {
      const _never: never = tool;
      return _never;
    }
  }
}

function sanitizeSize(
  kind: ShapeKind,
  width: number,
  depth: number,
): { width: number; depth: number } {
  const w = Math.max(0.05, width);
  const d = Math.max(0.05, depth);
  if (kind === 'circle') {
    const diameter = Math.min(w, d);
    return { width: diameter, depth: diameter };
  }
  return { width: w, depth: d };
}

function defaultObjectName(kind: ShapeKind, plan: FloorPlan): string {
  const count = plan.objects.filter((obj) => obj.kind === kind).length + 1;
  const label = kind === 'rect' ? 'Rect' : kind === 'circle' ? 'Circle' : 'Ellipse';
  return `${label} ${count}`;
}

function defaultRoomName(category: RoomCategory, plan: FloorPlan): string {
  const label = categoryLabel(category);
  const count = plan.rooms.filter((room) => room.category === category).length + 1;
  return count === 1 ? label : `${label} ${count}`;
}

function categoryLabel(category: RoomCategory): string {
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
}
