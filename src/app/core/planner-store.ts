import { computed, effect, inject, Service, signal } from '@angular/core';
import {
  FloorPlan,
  Measurement,
  PlacedObject,
  Point,
  Selection,
  ShapeKind,
  Tool,
  Viewport,
} from '../models/floor-plan';
import { type Hit } from './geometry';
import { furnitureById, furnitureObjectName, placementSpot } from './furniture';
import { renderPlanSvg, type RenderedPlan } from './plan-export';
import { measureImage, readFileAsDataUrl } from './image';
import { parseProjectDocument, Persistence, serializeProject } from './persistence';
import {
  ObjectPose,
  PlanEdit,
  PlanEditResult,
  PlanNotice,
  StackDirection,
} from './plan-edit';
import {
  BoxPick,
  collectBoxSelection,
  isObjectSelected as objectIsSelected,
  previewBoxPick,
  selectBox as applySelectBox,
  selectedGroup as groupOf,
  selectedMeasurement as measurementOf,
  selectedMeasurements as measurementsOf,
  selectedObject as objectOf,
  selectedPlacedObjects,
  selectFromHit as applySelectFromHit,
  selectionCount as countSelection,
} from './selection';
import { DEFAULT_HELPER_SPACING_METERS, normalizeHelperSpacing } from './helper-grid';
import { formatLength, type LengthUnit } from './units';

export type { ObjectPose, StackDirection };

export interface ScaleDialog {
  p1: Point;
  p2: Point;
  measured: number;
}

@Service()
export class PlannerStore {
  readonly #persistence = inject(Persistence);
  readonly #edit = new PlanEdit();

  readonly #plan = signal<FloorPlan>(this.#edit.plan);
  readonly #imageDataUrl = signal<string | null>(this.#edit.imageDataUrl);
  readonly #tool = signal<Tool>('select');
  readonly #selection = signal<Selection>(null);
  readonly #spaceHeld = signal(false);
  readonly #ready = signal(false);
  readonly #scaleDialog = signal<ScaleDialog | null>(null);
  readonly #status = signal('Ready');
  readonly #historyTick = signal(0);
  readonly #lengthUnit = signal<LengthUnit>('m');
  readonly #gridSpacingMeters = signal(DEFAULT_HELPER_SPACING_METERS);

  #viewSize = { width: 1200, height: 800 };
  #pendingFit = false;

  readonly plan = this.#plan.asReadonly();
  readonly imageDataUrl = this.#imageDataUrl.asReadonly();
  readonly tool = this.#tool.asReadonly();
  readonly selection = this.#selection.asReadonly();
  readonly spaceHeld = this.#spaceHeld.asReadonly();
  readonly ready = this.#ready.asReadonly();
  readonly scaleDialog = this.#scaleDialog.asReadonly();
  readonly status = this.#status.asReadonly();
  readonly lengthUnit = this.#lengthUnit.asReadonly();
  /** Space between background helper lines, in meters. */
  readonly gridSpacingMeters = this.#gridSpacingMeters.asReadonly();

  readonly imageSizeMeters = computed(() => {
    const background = this.#plan().background;
    if (!background) {
      return null;
    }
    return {
      width: background.widthPx * background.metersPerPixel,
      height: background.heightPx * background.metersPerPixel,
    };
  });

  readonly selectedObject = computed(() => objectOf(this.#plan(), this.#selection()));
  readonly selectedMeasurement = computed(() => measurementOf(this.#plan(), this.#selection()));
  readonly selectedObjects = computed(() => selectedPlacedObjects(this.#plan(), this.#selection()));
  readonly selectedGroup = computed(() => groupOf(this.#plan(), this.#selection()));
  readonly selectedMeasurements = computed(() => measurementsOf(this.#plan(), this.#selection()));
  readonly selectionCount = computed(() => countSelection(this.#plan(), this.#selection()));

  readonly canGroup = computed(() => this.selectedObjects().length >= 2);
  readonly canUngroup = computed(() => this.#selection()?.type === 'group');
  readonly canCopy = computed(() => this.selectedObjects().length > 0);
  readonly canPaste = computed(() => {
    this.#historyTick();
    return this.#edit.canPaste;
  });
  readonly canBringToFront = computed(() => this.#canRestack('front'));
  readonly canSendToBack = computed(() => this.#canRestack('back'));
  readonly canBringForward = computed(() => this.#canRestack('forward'));
  readonly canSendBackward = computed(() => this.#canRestack('backward'));
  readonly canUndo = computed(() => {
    this.#historyTick();
    return this.#edit.canUndo;
  });
  readonly canRedo = computed(() => {
    this.#historyTick();
    return this.#edit.canRedo;
  });

  constructor() {
    void this.#hydrate();

    effect((onCleanup) => {
      const plan = this.#plan();
      const imageDataUrl = this.#imageDataUrl();
      const lengthUnit = this.#lengthUnit();
      const gridSpacingMeters = this.#gridSpacingMeters();
      const ready = this.#ready();
      if (!ready) {
        return;
      }
      const handle = setTimeout(() => {
        void this.#persistence.save({ plan, imageDataUrl, lengthUnit, gridSpacingMeters });
      }, 280);
      onCleanup(() => clearTimeout(handle));
    });
  }

  setTool(tool: Tool): void {
    this.#tool.set(tool);
    this.#status.set(toolHint(tool));
  }

  setSpaceHeld(value: boolean): void {
    this.#spaceHeld.set(value);
  }

  selectFromHit(hit: Hit, additive: boolean): void {
    this.#selection.set(applySelectFromHit(this.#plan(), this.#selection(), hit, additive));
  }

  selectBox(start: Point, current: Point, additive: boolean): void {
    const pick = collectBoxSelection(this.#plan(), start, current);
    const selection = applySelectBox(this.#plan(), this.#selection(), pick, additive);
    this.#selection.set(selection);
    const count = countSelection(this.#plan(), selection);
    this.#status.set(count === 0 ? 'Nothing in selection' : `Selected ${count}`);
  }

  previewBox(start: Point, current: Point, additive: boolean): BoxPick {
    return previewBoxPick(this.#plan(), this.#selection(), start, current, additive);
  }

  clearSelection(): void {
    this.#selection.set(null);
  }

  isObjectSelected(id: string): boolean {
    return objectIsSelected(this.#plan(), this.#selection(), id);
  }

  setStatus(status: string): void {
    this.#status.set(status);
  }

  setLengthUnit(unit: LengthUnit): void {
    this.#lengthUnit.set(unit);
  }

  /** Set the helper-line spacing, in meters. */
  setGridSpacing(meters: number): void {
    this.#gridSpacingMeters.set(normalizeHelperSpacing(meters));
  }

  /** The plan as a standalone, print-friendly SVG (for PNG export and printing). */
  renderPlan(options?: { longSidePx?: number }): RenderedPlan {
    return renderPlanSvg(
      { plan: this.#plan(), imageDataUrl: this.#imageDataUrl(), lengthUnit: this.#lengthUnit() },
      options,
    );
  }

  exportProject(): { filename: string; json: string } {
    const document = serializeProject({
      plan: this.#plan(),
      imageDataUrl: this.#imageDataUrl(),
      lengthUnit: this.#lengthUnit(),
      gridSpacingMeters: this.#gridSpacingMeters(),
    });
    return {
      filename: `${fileSlug(this.#plan().name)}.floorplan.json`,
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
    this.#lengthUnit.set(parsed.lengthUnit);
    this.#gridSpacingMeters.set(parsed.gridSpacingMeters);
    this.#apply(this.#edit.importProject(parsed.plan, parsed.imageDataUrl));
    this.setTool('select');
  }

  reportViewSize(width: number, height: number): void {
    if (width > 0 && height > 0) {
      this.#viewSize = { width, height };
    }
    if (this.#pendingFit) {
      this.fitToView();
    }
  }

  setViewport(viewport: Viewport): void {
    this.#edit.setViewport(viewport);
    this.#sync();
  }

  zoomAround(world: Point, clientOffset: Point, nextZoom: number): void {
    this.#edit.zoomAround(world, clientOffset, nextZoom);
    this.#sync();
  }

  zoomBy(factor: number): void {
    this.#edit.zoomBy(factor, this.#viewSize);
    this.#sync();
  }

  fitToView(): void {
    if (!this.#edit.fitToView(this.#viewSize)) {
      this.#pendingFit = true;
      return;
    }
    this.#pendingFit = false;
    this.#sync();
  }

  setName(name: string): void {
    this.#edit.setName(name);
    this.#sync();
  }

  async importImageFile(file: File): Promise<void> {
    const imageDataUrl = await readFileAsDataUrl(file);
    const size = await measureImage(imageDataUrl);
    this.#apply(this.#edit.importImage(imageDataUrl, size));
    this.setTool('scale');
  }

  openScaleDialog(p1: Point, p2: Point): void {
    this.#scaleDialog.set({ p1, p2, measured: Math.hypot(p2.x - p1.x, p2.y - p1.y) });
  }

  cancelScaleDialog(): void {
    this.#scaleDialog.set(null);
  }

  applyScale(actualMeters: number): boolean {
    const dialog = this.#scaleDialog();
    if (!dialog) {
      return false;
    }
    const result = this.#edit.applyScale(dialog.p1, dialog.p2, actualMeters);
    if (result.notice?.kind !== 'scale-applied') {
      return false;
    }
    this.#scaleDialog.set(null);
    this.setTool('select');
    this.#apply(result);
    return true;
  }

  addObject(kind: ShapeKind, x: number, y: number, width: number, depth: number): PlacedObject {
    const result = this.#edit.addObject(kind, x, y, width, depth);
    this.#sync();
    this.#selection.set({ type: 'object', id: result.object.id });
    this.setTool('select');
    return result.object;
  }

  /** Places a furniture library item, named and centered in the current view. */
  addFurniture(itemId: string): PlacedObject | null {
    const item = furnitureById(itemId);
    if (!item) {
      return null;
    }
    const { panX, panY, zoom } = this.#plan().viewport;
    const centerX = panX + this.#viewSize.width / zoom / 2;
    const centerY = panY + this.#viewSize.height / zoom / 2;
    const name = furnitureObjectName(item, this.#plan());
    const spot = placementSpot(item, { x: centerX, y: centerY }, this.#plan());
    const result = this.#edit.addObject(item.kind, spot.x, spot.y, item.width, item.depth, name);
    this.#sync();
    this.#selection.set({ type: 'object', id: result.object.id });
    this.setTool('select');
    this.#status.set(`Added ${name}. Drag to move, or set its size in Properties.`);
    return result.object;
  }

  updateObject(id: string, patch: Partial<PlacedObject>): void {
    this.#edit.updateObject(id, patch);
    this.#sync();
  }

  applyObjectPoses(poses: readonly ObjectPose[]): void {
    this.#edit.applyObjectPoses(poses);
    this.#sync();
  }

  beginEdit(): void {
    this.#edit.beginEdit();
    this.#sync();
  }

  endEdit(): void {
    this.#edit.endEdit();
  }

  groupSelection(): void {
    this.#apply(this.#edit.groupSelection(this.#selection()));
  }

  copySelection(): void {
    this.#apply(this.#edit.copySelection(this.#selection()));
  }

  pasteClipboard(): void {
    const result = this.#edit.pasteClipboard();
    this.#apply(result);
    if (result.notice?.kind === 'pasted') {
      this.setTool('select');
    }
  }

  restackSelection(direction: StackDirection): void {
    this.#apply(this.#edit.restackSelection(this.#selection(), direction));
  }

  ungroupSelection(): void {
    this.#apply(this.#edit.ungroupSelection(this.#selection()));
  }

  renameGroup(id: string, name: string): void {
    this.#edit.renameGroup(id, name);
    this.#sync();
  }

  addMeasurement(start: Point, end: Point, offset = 0): Measurement | null {
    const result = this.#edit.addMeasurement(start, end, offset);
    this.#sync();
    if ('measurement' in result) {
      this.#selection.set({ type: 'measurement', id: result.measurement.id });
      this.#status.set(`Measured ${formatLength(Math.hypot(end.x - start.x, end.y - start.y), this.#lengthUnit())}`);
      return result.measurement;
    }
    this.#applyNotice(result.notice);
    return null;
  }

  updateMeasurement(
    id: string,
    patch: Partial<Pick<Measurement, 'start' | 'end' | 'offset'>>,
  ): void {
    this.#edit.updateMeasurement(id, patch);
    this.#sync();
  }

  undo(): void {
    if (!this.#edit.undo()) {
      return;
    }
    this.#selection.set(null);
    this.#sync();
  }

  redo(): void {
    if (!this.#edit.redo()) {
      return;
    }
    this.#selection.set(null);
    this.#sync();
  }

  deleteSelection(): void {
    this.#apply(this.#edit.deleteSelection(this.#selection()));
  }

  #canRestack(direction: StackDirection): boolean {
    this.#historyTick();
    return this.#edit.canRestack(this.#selection(), direction);
  }

  #apply(result: PlanEditResult): void {
    this.#sync();
    if ('selection' in result) {
      this.#selection.set(result.selection ?? null);
    }
    this.#applyNotice(result.notice);
    if (result.fit) {
      this.fitToView();
    }
  }

  #applyNotice(notice: PlanNotice | null): void {
    if (!notice) {
      return;
    }
    this.#status.set(noticeText(notice));
  }

  #sync(): void {
    this.#plan.set(this.#edit.plan);
    this.#imageDataUrl.set(this.#edit.imageDataUrl);
    this.#historyTick.update((tick) => tick + 1);
  }

  async #hydrate(): Promise<void> {
    const saved = await this.#persistence.load();
    if (saved) {
      this.#edit.hydrate(saved.plan, saved.imageDataUrl);
      this.#lengthUnit.set(saved.lengthUnit);
      this.#gridSpacingMeters.set(saved.gridSpacingMeters);
      this.#sync();
    }
    this.#ready.set(true);
    this.#status.set(toolHint(this.#tool()));
  }
}

const noticeText = (notice: PlanNotice): string => {
  switch (notice.kind) {
    case 'copied':
      return notice.count === 1 ? 'Copied 1 object' : `Copied ${notice.count} objects`;
    case 'pasted':
      return notice.count === 1 ? 'Pasted 1 object' : `Pasted ${notice.count} objects`;
    case 'nothing-to-copy':
      return 'Select objects to copy.';
    case 'nothing-to-paste':
      return 'Nothing to paste.';
    case 'select-to-group':
      return 'Select at least two objects to group.';
    case 'grouped':
      return `Grouped ${notice.count} objects. Drag a corner handle to rotate together.`;
    case 'ungrouped':
      return 'Ungrouped';
    case 'select-to-restack':
      return 'Select objects to change order.';
    case 'already-front':
      return 'Already at the front';
    case 'already-back':
      return 'Already at the back';
    case 'restacked':
      return stackStatus(notice.direction, notice.count);
    case 'image-imported':
      return 'Image imported. Use Scale and mark a known length.';
    case 'scale-applied':
      return 'Scale applied. Distances use real-world units.';
    case 'project-imported':
      return 'Project imported.';
    default: {
      const _never: never = notice;
      return _never;
    }
  }
};

const stackStatus = (direction: StackDirection, count: number): string => {
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
};

const fileSlug = (name: string): string => {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'floor-plan';
};

const toolHint = (tool: Tool): string => {
  switch (tool) {
    case 'select':
      return 'Select · drag right: window · drag left: crossing · Shift adds · Ctrl snaps corners';
    case 'pan':
      return 'Drag to pan · scroll to zoom';
    case 'scale':
      return 'Click two points on a known length · hold Alt to snap to 90°';
    case 'measure':
      return 'Click start, end, then place the dimension line · snaps to object corners · Alt: 90°';
    case 'rect':
      return 'Click and drag to place a rectangle';
    case 'circle':
      return 'Click and drag to place a circle';
    case 'ellipse':
      return 'Click and drag to place an ellipse';
    default: {
      const _never: never = tool;
      return _never;
    }
  }
};
