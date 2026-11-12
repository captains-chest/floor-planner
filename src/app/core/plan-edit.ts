import {
  createDefaultPlan,
  createId,
  DEFAULT_IMAGE_WIDTH_METERS,
  FloorPlan,
  MAX_ZOOM,
  Measurement,
  MIN_ZOOM,
  ObjectGroup,
  PlacedObject,
  Point,
  Selection,
  ShapeKind,
  Viewport,
  Opening,
  OpeningKind,
  Wall,
  clampOpeningWidth,
  clampWallThickness,
  DEFAULT_WALL_THICKNESS,
} from '../models/floor-plan';
import {
  clamp,
  connectedWallEnds,
  type ConnectedWallEnd,
  contentBBox,
  dist,
  moveWallEndpoint,
  scalePoint,
  wallSegments,
} from './geometry';
import { followAttachedOpenings, objectEdgeSegments } from './openings';
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
  openings: Opening[];
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
    return (this.#clipboard?.objects.length ?? 0) + (this.#clipboard?.openings.length ?? 0) > 0;
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

  addObject(
    kind: ShapeKind,
    x: number,
    y: number,
    width: number,
    depth: number,
    name?: string,
  ): { object: PlacedObject } {
    const size = sanitizeSize(kind, width, depth);
    const obj: PlacedObject = {
      id: createId('obj'),
      kind,
      name: name ?? defaultObjectName(kind, this.#plan),
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
    const before = this.#plan.objects.find((obj) => obj.id === id);
    let after: PlacedObject | undefined;
    const objects = this.#plan.objects.map((obj) => {
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
      after = next;
      return next;
    });
    this.#plan = { ...this.#plan, objects };
    if (before && after) {
      this.#followHosts(
        new Map([[`object:${id}`, objectEdgeSegments(before)]]),
        new Map([[`object:${id}`, objectEdgeSegments(after)]]),
      );
    }
  }

  applyObjectPoses(poses: readonly ObjectPose[]): void {
    if (poses.length === 0) {
      return;
    }
    this.#record();
    const byId = new Map(poses.map((pose) => [pose.id, pose]));
    const hostsBefore = new Map<string, [Point, Point][]>();
    for (const obj of this.#plan.objects) {
      if (byId.has(obj.id)) hostsBefore.set(`object:${obj.id}`, objectEdgeSegments(obj));
    }
    const objects = this.#plan.objects.map((obj) => {
      const pose = byId.get(obj.id);
      if (!pose) {
        return obj;
      }
      return { ...obj, x: pose.x, y: pose.y, rotation: pose.rotation ?? obj.rotation };
    });
    this.#plan = { ...this.#plan, objects };
    const hostsAfter = new Map<string, [Point, Point][]>();
    for (const obj of objects) {
      if (byId.has(obj.id)) hostsAfter.set(`object:${obj.id}`, objectEdgeSegments(obj));
    }
    this.#followHosts(hostsBefore, hostsAfter);
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

  addOpening(
    kind: OpeningKind,
    center: Point,
    opts: {
      width?: number;
      rotation?: number;
      wallId?: string | null;
      objectId?: string | null;
      flipH?: boolean;
      flipV?: boolean;
    } = {},
  ): { opening: Opening } {
    const opening: Opening = {
      id: createId(kind),
      kind,
      center: { ...center },
      width: clampOpeningWidth(kind, opts.width),
      rotation: opts.rotation ?? 0,
      flipH: Boolean(opts.flipH),
      flipV: Boolean(opts.flipV),
      wallId: opts.wallId ?? null,
      objectId: opts.objectId ?? null,
    };
    this.#record();
    this.#plan = { ...this.#plan, openings: [...(this.#plan.openings ?? []), opening] };
    return { opening };
  }
  updateOpening(id: string, patch: Partial<Opening>): void {
    this.#record();
    this.#plan = {
      ...this.#plan,
      openings: (this.#plan.openings ?? []).map((o) =>
        o.id === id
          ? {
              ...o,
              ...patch,
              width: clampOpeningWidth(o.kind, patch.width ?? o.width),
              center: patch.center ? { ...patch.center } : o.center,
            }
          : o,
      ),
    };
  }
  copySelection(selection: Selection): PlanEditResult {
    const objects = selectedPlacedObjects(this.#plan, selection);
    const openings =
      selection?.type === 'opening'
        ? (this.#plan.openings ?? []).filter((o) => o.id === selection.id)
        : [];
    if (objects.length === 0 && openings.length === 0)
      return { notice: { kind: 'nothing-to-copy' } };
    const groupIds = new Set(
      objects.map((item) => item.groupId).filter((id): id is string => typeof id === 'string'),
    );
    this.#clipboard = {
      objects: objects.map((obj) => ({ ...obj })),
      groups: (this.#plan.groups ?? [])
        .filter((group) => groupIds.has(group.id))
        .map((group) => ({ ...group })),
      openings: openings.map((o) => ({ ...o, center: { ...o.center } })),
    };
    this.#pasteGeneration = 0;
    return { notice: { kind: 'copied', count: objects.length + openings.length } };
  }

  pasteClipboard(): PlanEditResult {
    const clipboard = this.#clipboard;
    if (!clipboard || (clipboard.objects.length === 0 && (clipboard.openings ?? []).length === 0)) {
      return { notice: { kind: 'nothing-to-paste' } };
    }
    this.#pasteGeneration += 1;
    const offset = PASTE_OFFSET_METERS * this.#pasteGeneration;
    const duplicated = duplicateClipboard(clipboard, { x: offset, y: offset });
    const dupOpenings = (clipboard.openings ?? []).map((o) => ({
      ...o,
      id: createId(o.kind),
      center: { x: o.center.x + offset, y: o.center.y + offset },
      wallId: null,
      objectId: null,
    }));
    this.#record();
    this.#plan = {
      ...this.#plan,
      objects: [...this.#plan.objects, ...duplicated.objects],
      groups: [...(this.#plan.groups ?? []), ...duplicated.groups],
      openings: [...(this.#plan.openings ?? []), ...dupOpenings],
    };
    return {
      notice: { kind: 'pasted', count: duplicated.objects.length + dupOpenings.length },
      selection: duplicated.objects.length
        ? selectionFromObjectIds(
            this.#plan,
            duplicated.objects.map((obj) => obj.id),
          )
        : dupOpenings[0]
          ? { type: 'opening', id: dupOpenings[0].id }
          : null,
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
        notice:
          direction === 'front' || direction === 'forward'
            ? { kind: 'already-front' }
            : { kind: 'already-back' },
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

  addMeasurement(
    start: Point,
    end: Point,
    offset = 0,
  ): { measurement: Measurement } | PlanEditResult {
    if (dist(start, end) < 0.01) {
      return { notice: null };
    }
    const measurement: Measurement = {
      id: createId('measure'),
      start: { ...start },
      end: { ...end },
      offset,
    };
    this.#record();
    this.#plan = {
      ...this.#plan,
      measurements: [...this.#plan.measurements, measurement],
    };
    return { measurement };
  }

  updateMeasurement(
    id: string,
    patch: Partial<Pick<Measurement, 'start' | 'end' | 'offset' | 'color'>>,
  ): void {
    this.#record();
    this.#plan = {
      ...this.#plan,
      measurements: this.#plan.measurements.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    };
  }

  addWall(points: Point[], thickness = DEFAULT_WALL_THICKNESS): { wall: Wall } | PlanEditResult {
    const clean = points.filter((pt, i) => i === 0 || dist(pt, points[i - 1]) > 0.01);
    if (clean.length < 2) return { notice: null };
    const wall: Wall = {
      id: createId('wall'),
      points: clean.map((pt) => ({ ...pt })),
      thickness: clampWallThickness(thickness),
    };
    this.#record();
    this.#plan = { ...this.#plan, walls: [...(this.#plan.walls ?? []), wall] };
    return { wall };
  }

  updateWall(id: string, patch: Partial<Pick<Wall, 'points' | 'thickness' | 'color'>>): void {
    this.#record();
    const before = (this.#plan.walls ?? []).find((w) => w.id === id);
    let after: Wall | undefined;
    const walls = (this.#plan.walls ?? []).map((w) => {
      if (w.id !== id) return w;
      const next: Wall = {
        ...w,
        ...patch,
        thickness: clampWallThickness(patch.thickness ?? w.thickness),
        points: patch.points ? patch.points.map((pt) => ({ ...pt })) : w.points,
      };
      after = next;
      return next;
    });
    this.#plan = { ...this.#plan, walls };
    if (before && after && patch.points) {
      this.#followHosts(
        new Map([[`wall:${id}`, wallSegments(before)]]),
        new Map([[`wall:${id}`, wallSegments(after)]]),
      );
    }
  }

  /**
   * Moves a wall end together with every wall end coincident with it, so connected
   * walls stay joined at their shared corner. One call is one undo step, and
   * openings attached to any moved wall follow.
   */
  moveConnectedWallEndpoint(id: string, end: 'start' | 'end', target: Point): ConnectedWallEnd[] {
    const connected = connectedWallEnds(this.#plan.walls ?? [], id, end);
    if (connected.length === 0) return [];
    this.#record();
    const endsByWall = new Map<string, Set<'start' | 'end'>>();
    for (const ref of connected) {
      const ends = endsByWall.get(ref.id) ?? new Set<'start' | 'end'>();
      ends.add(ref.end);
      endsByWall.set(ref.id, ends);
    }
    const hostsBefore = new Map<string, [Point, Point][]>();
    const hostsAfter = new Map<string, [Point, Point][]>();
    const walls = (this.#plan.walls ?? []).map((wall) => {
      const ends = endsByWall.get(wall.id);
      if (!ends) return wall;
      hostsBefore.set(`wall:${wall.id}`, wallSegments(wall));
      let points = wall.points.map((pt) => ({ ...pt }));
      for (const which of ends) points = moveWallEndpoint(points, which, target);
      const next = { ...wall, points };
      hostsAfter.set(`wall:${wall.id}`, wallSegments(next));
      return next;
    });
    this.#plan = { ...this.#plan, walls };
    this.#followHosts(hostsBefore, hostsAfter);
    return connected;
  }

  /** Moves openings attached to changed hosts so they keep their place along the host. */
  #followHosts(
    hostsBefore: ReadonlyMap<string, [Point, Point][]>,
    hostsAfter: ReadonlyMap<string, [Point, Point][]>,
  ): void {
    if (hostsBefore.size === 0) return;
    const openings = followAttachedOpenings(this.#plan.openings ?? [], hostsBefore, hostsAfter);
    if (openings.some((o, i) => o !== (this.#plan.openings ?? [])[i])) {
      this.#plan = { ...this.#plan, openings };
    }
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
      objects: this.#plan.objects.map((obj) => ({
        ...obj,
        x: obj.x * factor,
        y: obj.y * factor,
        width: obj.width * factor,
        depth: obj.depth * factor,
      })),
      measurements: (this.#plan.measurements ?? []).map((item) => ({
        ...item,
        start: scalePoint(item.start, factor),
        end: scalePoint(item.end, factor),
        offset: (item.offset ?? 0) * factor,
      })),
      openings: (this.#plan.openings ?? []).map((o) => ({
        ...o,
        center: scalePoint(o.center, factor),
        width: o.width * factor,
      })),
      walls: (this.#plan.walls ?? []).map((w) => ({
        ...w,
        points: w.points.map((pt) => scalePoint(pt, factor)),
        thickness: w.thickness * factor,
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
  const moving = objects.filter((item) => selected.has(item.id));
  if (moving.length === 0 || moving.length === objects.length) {
    return [...objects];
  }
  if (direction === 'front') {
    return [...objects.filter((item) => !selected.has(item.id)), ...moving];
  }
  if (direction === 'back') {
    return [...moving, ...objects.filter((item) => !selected.has(item.id))];
  }
  const result = [...objects];
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
    return { ...plan, measurements: plan.measurements.filter((item) => item.id !== selection.id) };
  }
  if (selection.type === 'wall') {
    return {
      ...plan,
      walls: (plan.walls ?? []).filter((item) => item.id !== selection.id),
      openings: (plan.openings ?? []).map((o) =>
        o.wallId === selection.id ? { ...o, wallId: null } : o,
      ),
    };
  }
  if (selection.type === 'opening') {
    return { ...plan, openings: (plan.openings ?? []).filter((o) => o.id !== selection.id) };
  }
  if (selection.type === 'multi') {
    let next = removeObjects(plan, new Set(selection.objectIds));
    const wallIds = new Set(selection.wallIds ?? []);
    const openingIds = new Set(selection.openingIds ?? []);
    next = {
      ...next,
      measurements: (next.measurements ?? []).filter(
        (item) => !selection.measurementIds.includes(item.id),
      ),
      walls: (next.walls ?? []).filter((item) => !wallIds.has(item.id)),
      openings: (next.openings ?? [])
        .filter((o) => !openingIds.has(o.id))
        .map((o) => ({
          ...o,
          wallId: o.wallId && wallIds.has(o.wallId) ? null : o.wallId,
          objectId: o.objectId && selection.objectIds.includes(o.objectId) ? null : o.objectId,
        })),
    };
    return next;
  }
  return plan;
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
    openings: (plan.openings ?? []).map((o) =>
      o.objectId && ids.has(o.objectId) ? { ...o, objectId: null } : o,
    ),
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
