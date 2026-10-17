import {
  afterNextRender,
  afterRenderEffect,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  borderPaint,
  fillPaint,
  measurementColor,
  PlacedObject,
  Point,
  SNAP_PIXELS,
  ShapeKind,
} from '../../models/floor-plan';
import {
  angleDeg,
  dimensionView,
  dist,
  hitTest,
  itemsBBox,
  linePointToMeasured,
  measurementLine,
  midpoint,
  normalizeRect,
  objectCenter,
  rotatedObjectPose,
  rotationHandles,
  rotationHandlesFromBox,
  signedPerpendicularOffset,
  SnapResult,
  snapAngle,
  snapObjectMove,
  snapToGeometry,
  snapToRightAngle,
} from '../../core/geometry';
import { drawnHelperStep, MAJOR_HELPER_MULTIPLE } from '../../core/helper-grid';
import { PlannerStore } from '../../core/planner-store';
import { formatLength, metersToDisplay } from '../../core/units';

type DragState =
  | { type: 'none' }
  | { type: 'pan'; startX: number; startY: number; panX: number; panY: number }
  | {
      type: 'move-objects';
      orig: { id: string; x: number; y: number }[];
      start: Point;
      recorded: boolean;
    }
  | {
      type: 'move-measurement';
      id: string;
      origStart: Point;
      origEnd: Point;
      start: Point;
      recorded: boolean;
    }
  | { type: 'move-measurement-end'; id: string; end: 'start' | 'end'; recorded: boolean }
  | { type: 'move-wall'; id: string; origPoints: Point[]; start: Point; recorded: boolean }
  | {
      type: 'rotate-objects';
      orig: { id: string; x: number; y: number; width: number; depth: number; rotation: number }[];
      startAngle: number;
      center: Point;
      recorded: boolean;
    }
  | { type: 'draw-shape'; kind: ShapeKind; start: Point }
  | { type: 'box-select'; start: Point; current: Point; additive: boolean };

@Component({
  selector: 'app-canvas',
  host: {
    role: 'main',
    'aria-label': 'Floor plan drawing',
    '(document:keydown)': 'onModifierDown($event)',
    '(document:keyup)': 'onModifierUp($event)',
    '(window:blur)': 'onModifierBlur()',
  },
  styles: `
    :host {
      display: block;
      position: relative;
      min-width: 0;
      min-height: 0;
      background: var(--canvas);
    }

    svg {
      display: block;
      width: 100%;
      height: 100%;
      touch-action: none;
      user-select: none;
    }

    .hud {
      position: absolute;
      inset: auto 12px 12px 12px;
      display: flex;
      justify-content: space-between;
      gap: 12px;
      pointer-events: none;
      color: var(--text-dim);
      font-size: 12px;
    }

    .hud-group {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: center;
    }

    .chip {
      background: color-mix(in srgb, var(--bg-panel) 88%, transparent);
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 4px 10px;
      backdrop-filter: blur(8px);
    }

    .chip-action {
      pointer-events: auto;
      cursor: pointer;
      color: var(--accent);
      font: inherit;
    }

    .scale-banner {
      position: absolute;
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 12px;
      max-width: min(40rem, calc(100% - 24px));
      box-sizing: border-box;
      padding: 8px 8px 8px 14px;
      background: var(--bg-panel);
      border: 1px solid var(--accent);
      border-radius: 10px;
      color: var(--text);
      font-size: 13px;
      line-height: 1.4;
    }

    .scale-banner p {
      margin: 0;
    }

    .scale-banner button {
      flex: none;
      background: transparent;
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 6px 10px;
      cursor: pointer;
      font: inherit;
    }

    .empty {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      pointer-events: none;
      text-align: center;
      color: var(--text-dim);
      padding: 24px;
    }

    .empty h2 {
      margin: 0 0 8px;
      color: var(--text);
      font-size: 20px;
      font-weight: 600;
    }

    .empty p {
      margin: 0;
      max-width: 36ch;
      line-height: 1.45;
    }
  `,
  template: `
    <svg
      #viewport
      xmlns="http://www.w3.org/2000/svg"
      [attr.viewBox]="viewBox()"
      preserveAspectRatio="none"
      [style.cursor]="cssCursor()"
      (pointerdown)="onPointerDown($event)"
      (pointermove)="onPointerMove($event)"
      (pointerup)="onPointerUp($event)"
      (pointercancel)="onPointerUp($event)"
      (contextmenu)="$event.preventDefault()"
      (dblclick)="onDoubleClick($event)"
      (dragover)="onDragOver($event)"
      (drop)="onDrop($event)"
    >
      <g class="world" style="pointer-events: none">
        @if (grid(); as g) {
          @for (x of g.minor.vertical; track x) {
            <line
              [attr.x1]="x"
              [attr.x2]="x"
              [attr.y1]="g.top"
              [attr.y2]="g.bottom"
              stroke="var(--grid)"
              stroke-width="1"
              vector-effect="non-scaling-stroke"
            />
          }
          @for (y of g.minor.horizontal; track y) {
            <line
              [attr.x1]="g.left"
              [attr.x2]="g.right"
              [attr.y1]="y"
              [attr.y2]="y"
              stroke="var(--grid)"
              stroke-width="1"
              vector-effect="non-scaling-stroke"
            />
          }
          @for (x of g.major.vertical; track x) {
            <line
              [attr.x1]="x"
              [attr.x2]="x"
              [attr.y1]="g.top"
              [attr.y2]="g.bottom"
              stroke="var(--grid-major)"
              stroke-width="1"
              vector-effect="non-scaling-stroke"
            />
          }
          @for (y of g.major.horizontal; track y) {
            <line
              [attr.x1]="g.left"
              [attr.x2]="g.right"
              [attr.y1]="y"
              [attr.y2]="y"
              stroke="var(--grid-major)"
              stroke-width="1"
              vector-effect="non-scaling-stroke"
            />
          }
        }

        @if (store.imageDataUrl()) {
          <image
            #bgImage
            [attr.width]="imageWidth()"
            [attr.height]="imageHeight()"
            x="0"
            y="0"
            preserveAspectRatio="none"
            opacity="0.92"
          />
        }

        @for (wall of wallsView(); track wall.id) {
          <polyline
            [attr.points]="wall.points"
            fill="none"
            stroke="#d7dde8"
            [attr.stroke-width]="wall.thickness"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          @if (wall.selected) {
            <polyline
              [attr.points]="wall.points"
              fill="none"
              stroke="var(--accent)"
              stroke-width="2"
              stroke-dasharray="6 4"
              vector-effect="non-scaling-stroke"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          }
        }
        @if (wallPreview(); as preview) {
          <polyline
            [attr.points]="preview"
            fill="none"
            stroke="var(--accent)"
            [attr.stroke-width]="wallThickness()"
            stroke-linecap="round"
            stroke-linejoin="round"
            opacity="0.75"
          />
        }

        @for (item of drawList(); track item.obj.id) {
          <g [attr.transform]="rotateTransform(item.obj)">
            @if (item.obj.kind === 'rect') {
              <rect
                [attr.x]="item.obj.x"
                [attr.y]="item.obj.y"
                [attr.width]="item.obj.width"
                [attr.height]="item.obj.depth"
                [attr.fill]="item.fill"
                [attr.fill-opacity]="item.fillOpacity"
                [attr.stroke]="item.border ?? 'none'"
                [attr.stroke-opacity]="item.borderOpacity"
                [attr.stroke-width]="item.border ? 3 : 0"
                vector-effect="non-scaling-stroke"
              />
            } @else {
              <ellipse
                [attr.cx]="item.obj.x + item.obj.width / 2"
                [attr.cy]="item.obj.y + item.obj.depth / 2"
                [attr.rx]="item.obj.width / 2"
                [attr.ry]="item.obj.depth / 2"
                [attr.fill]="item.fill"
                [attr.fill-opacity]="item.fillOpacity"
                [attr.stroke]="item.border ?? 'none'"
                [attr.stroke-opacity]="item.borderOpacity"
                [attr.stroke-width]="item.border ? 3 : 0"
                vector-effect="non-scaling-stroke"
              />
            }
            @if (item.obj.name && item.obj.width * zoom() > 28 && item.obj.depth * zoom() > 16) {
              @if (item.obj.kind === 'rect') {
                <text
                  [attr.x]="item.obj.x + labelSize() * 0.35"
                  [attr.y]="item.obj.y + item.obj.depth - labelSize() * 0.28"
                  text-anchor="start"
                  fill="#1a1d23"
                  [attr.font-size]="labelSize()"
                  font-weight="600"
                >
                  {{ item.obj.name }}
                </text>
              } @else {
                <text
                  [attr.x]="item.obj.x + item.obj.width / 2"
                  [attr.y]="item.obj.y + item.obj.depth / 2"
                  text-anchor="middle"
                  dominant-baseline="middle"
                  fill="#1a1d23"
                  [attr.font-size]="labelSize()"
                  font-weight="600"
                >
                  {{ item.obj.name }}
                </text>
              }
            }
          </g>
        }

        @for (obj of highlightedObjects(); track obj.id) {
          <rect
            [attr.x]="obj.x"
            [attr.y]="obj.y"
            [attr.width]="obj.width"
            [attr.height]="obj.depth"
            fill="none"
            stroke="var(--accent)"
            stroke-width="2"
            stroke-dasharray="6 4"
            vector-effect="non-scaling-stroke"
            [attr.transform]="rotateTransform(obj)"
          />
        }

        @if (groupBounds(); as box) {
          <rect
            [attr.x]="box.x"
            [attr.y]="box.y"
            [attr.width]="box.width"
            [attr.height]="box.depth"
            fill="none"
            stroke="var(--accent)"
            stroke-opacity="0.55"
            stroke-width="1.5"
            stroke-dasharray="4 3"
            vector-effect="non-scaling-stroke"
          />
        }

        @for (handle of rotateHandles(); track $index) {
          <line
            [attr.x1]="handle.corner.x"
            [attr.y1]="handle.corner.y"
            [attr.x2]="handle.handle.x"
            [attr.y2]="handle.handle.y"
            stroke="var(--accent)"
            stroke-width="1.5"
            vector-effect="non-scaling-stroke"
          />
          <circle
            [attr.cx]="handle.handle.x"
            [attr.cy]="handle.handle.y"
            [attr.r]="handleSize() * 0.45"
            fill="var(--bg-panel)"
            stroke="var(--accent)"
            stroke-width="2"
            vector-effect="non-scaling-stroke"
          />
        }

        @if (shapePreview(); as preview) {
          @if (preview.kind === 'rect') {
            <rect
              [attr.x]="preview.x"
              [attr.y]="preview.y"
              [attr.width]="preview.width"
              [attr.height]="preview.depth"
              fill="var(--accent)"
              fill-opacity="0.16"
              stroke="var(--accent)"
              stroke-width="1.5"
              vector-effect="non-scaling-stroke"
            />
          } @else {
            <ellipse
              [attr.cx]="preview.x + preview.width / 2"
              [attr.cy]="preview.y + preview.depth / 2"
              [attr.rx]="preview.width / 2"
              [attr.ry]="preview.depth / 2"
              fill="var(--accent)"
              fill-opacity="0.16"
              stroke="var(--accent)"
              stroke-width="1.5"
              vector-effect="non-scaling-stroke"
            />
          }
          <text
            [attr.x]="preview.x + preview.width / 2"
            [attr.y]="preview.y - labelSize() * 0.4"
            text-anchor="middle"
            fill="var(--accent)"
            [attr.font-size]="labelSize()"
            font-weight="600"
          >
            {{ preview.label }}
          </text>
        }

        @for (item of measurements(); track item.id) {
          <g [attr.opacity]="item.selected ? 1 : 0.92">
            <line
              [attr.x1]="item.originStart.x"
              [attr.y1]="item.originStart.y"
              [attr.x2]="item.start.x"
              [attr.y2]="item.start.y"
              [attr.stroke]="item.color"
              stroke-width="1.5"
              vector-effect="non-scaling-stroke"
            />
            <line
              [attr.x1]="item.originEnd.x"
              [attr.y1]="item.originEnd.y"
              [attr.x2]="item.end.x"
              [attr.y2]="item.end.y"
              [attr.stroke]="item.color"
              stroke-width="1.5"
              vector-effect="non-scaling-stroke"
            />
            <line
              [attr.x1]="item.start.x"
              [attr.y1]="item.start.y"
              [attr.x2]="item.end.x"
              [attr.y2]="item.end.y"
              [attr.stroke]="item.color"
              stroke-width="2"
              vector-effect="non-scaling-stroke"
            />
            <line
              [attr.x1]="item.start.x - item.tickDx"
              [attr.y1]="item.start.y - item.tickDy"
              [attr.x2]="item.start.x + item.tickDx"
              [attr.y2]="item.start.y + item.tickDy"
              [attr.stroke]="item.color"
              stroke-width="2"
              vector-effect="non-scaling-stroke"
            />
            <line
              [attr.x1]="item.end.x - item.tickDx"
              [attr.y1]="item.end.y - item.tickDy"
              [attr.x2]="item.end.x + item.tickDx"
              [attr.y2]="item.end.y + item.tickDy"
              [attr.stroke]="item.color"
              stroke-width="2"
              vector-effect="non-scaling-stroke"
            />
            <text
              [attr.x]="item.mid.x"
              [attr.y]="item.mid.y - labelSize()"
              text-anchor="middle"
              [attr.fill]="item.color"
              [attr.font-size]="labelSize()"
              font-weight="600"
            >
              {{ item.lengthLabel }}
            </text>
          </g>
        }

        @if (selectedMeasurementHandles(); as handles) {
          <rect
            [attr.x]="handles.start.x - handleSize() / 2"
            [attr.y]="handles.start.y - handleSize() / 2"
            [attr.width]="handleSize()"
            [attr.height]="handleSize()"
            fill="var(--measure)"
            stroke="#0d1117"
            stroke-width="1"
            vector-effect="non-scaling-stroke"
          />
          <rect
            [attr.x]="handles.end.x - handleSize() / 2"
            [attr.y]="handles.end.y - handleSize() / 2"
            [attr.width]="handleSize()"
            [attr.height]="handleSize()"
            fill="var(--measure)"
            stroke="#0d1117"
            stroke-width="1"
            vector-effect="non-scaling-stroke"
          />
        }

        @if (scalePreview(); as preview) {
          <line
            [attr.x1]="preview.start.x"
            [attr.y1]="preview.start.y"
            [attr.x2]="preview.end.x"
            [attr.y2]="preview.end.y"
            stroke="var(--snap)"
            stroke-width="2"
            vector-effect="non-scaling-stroke"
          />
          <circle
            [attr.cx]="preview.start.x"
            [attr.cy]="preview.start.y"
            [attr.r]="handleSize() * 0.45"
            fill="var(--snap)"
          />
          <circle
            [attr.cx]="preview.end.x"
            [attr.cy]="preview.end.y"
            [attr.r]="handleSize() * 0.45"
            fill="var(--snap)"
          />
          <text
            [attr.x]="preview.mid.x"
            [attr.y]="preview.mid.y - labelSize()"
            text-anchor="middle"
            fill="var(--snap)"
            [attr.font-size]="labelSize()"
            font-weight="600"
          >
            {{ preview.length }}
          </text>
        }

        @if (measurePreview(); as preview) {
          <line
            [attr.x1]="preview.originStart.x"
            [attr.y1]="preview.originStart.y"
            [attr.x2]="preview.start.x"
            [attr.y2]="preview.start.y"
            stroke="var(--measure)"
            stroke-width="1.5"
            vector-effect="non-scaling-stroke"
          />
          <line
            [attr.x1]="preview.originEnd.x"
            [attr.y1]="preview.originEnd.y"
            [attr.x2]="preview.end.x"
            [attr.y2]="preview.end.y"
            stroke="var(--measure)"
            stroke-width="1.5"
            vector-effect="non-scaling-stroke"
          />
          <line
            [attr.x1]="preview.start.x"
            [attr.y1]="preview.start.y"
            [attr.x2]="preview.end.x"
            [attr.y2]="preview.end.y"
            stroke="var(--measure)"
            stroke-width="2"
            vector-effect="non-scaling-stroke"
          />
          <line
            [attr.x1]="preview.start.x - preview.tickDx"
            [attr.y1]="preview.start.y - preview.tickDy"
            [attr.x2]="preview.start.x + preview.tickDx"
            [attr.y2]="preview.start.y + preview.tickDy"
            stroke="var(--measure)"
            stroke-width="2"
            vector-effect="non-scaling-stroke"
          />
          <line
            [attr.x1]="preview.end.x - preview.tickDx"
            [attr.y1]="preview.end.y - preview.tickDy"
            [attr.x2]="preview.end.x + preview.tickDx"
            [attr.y2]="preview.end.y + preview.tickDy"
            stroke="var(--measure)"
            stroke-width="2"
            vector-effect="non-scaling-stroke"
          />
          <text
            [attr.x]="preview.mid.x"
            [attr.y]="preview.mid.y - labelSize()"
            text-anchor="middle"
            fill="var(--measure)"
            [attr.font-size]="labelSize()"
            font-weight="600"
          >
            {{ preview.lengthLabel }}
          </text>
        }

        @if (boxSelect(); as box) {
          <rect
            [attr.x]="box.x"
            [attr.y]="box.y"
            [attr.width]="box.width"
            [attr.height]="box.depth"
            [attr.fill]="box.fill"
            fill-opacity="0.16"
            [attr.stroke]="box.stroke"
            stroke-width="1.5"
            [attr.stroke-dasharray]="box.dash"
            vector-effect="non-scaling-stroke"
          />
        }

        @if (snap(); as snapHit) {
          @if (snapHit.snapped) {
            <circle
              [attr.cx]="snapHit.point.x"
              [attr.cy]="snapHit.point.y"
              [attr.r]="handleSize() * 0.55"
              fill="none"
              stroke="var(--snap)"
              stroke-width="2"
              vector-effect="non-scaling-stroke"
            />
          }
        }
      </g>
    </svg>

    @if (isEmpty()) {
      <div class="empty">
        <div>
          <h2>Import a floor plan image</h2>
          <p>
            Drop an image onto the canvas, then mark a known length to set its scale so everything
            is in real-world units. You can redo the scale later in Settings.
          </p>
        </div>
      </div>
    }

    @if (store.tool() === 'scale') {
      <div class="scale-banner" role="region" aria-label="Set scale">
        <p>
          <strong>Set the scale:</strong> click both ends of a length you know, then type it. Alt
          locks to 90°, Shift turns snap off.
        </p>
        <button type="button" (click)="store.cancelScale()">
          {{ store.plan().background?.calibrated ? 'Cancel' : 'Skip for now' }}
        </button>
      </div>
    }

    <div class="hud">
      <div class="hud-group">
        <span class="chip">{{ cursorLabel() }}</span>
        <span class="chip">{{ snapLabel() }}</span>
      </div>
      <div class="hud-group">
        <span class="chip">{{ zoomLabel() }}</span>
        @if (store.plan().background?.calibrated === false && store.tool() !== 'scale') {
          <button type="button" class="chip chip-action" (click)="store.startScale()">
            Not calibrated · Set scale
          </button>
        } @else {
          <span class="chip">{{ scaleLabel() }}</span>
        }
      </div>
    </div>
  `,
})
export class Canvas {
  protected readonly store = inject(PlannerStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly viewport = viewChild.required<ElementRef<SVGSVGElement>>('viewport');
  private readonly bgImage = viewChild<ElementRef<SVGImageElement>>('bgImage');

  private readonly viewportSize = signal({ width: 800, height: 600 });
  private readonly drag = signal<DragState>({ type: 'none' });
  protected readonly scaleP1 = signal<Point | null>(null);
  protected readonly measureDraft = signal<{ start: Point; end?: Point } | null>(null);
  protected readonly wallDraft = signal<Point[]>([]);
  protected readonly cursor = signal<Point | null>(null);
  protected readonly snap = signal<SnapResult>({
    point: { x: 0, y: 0 },
    snapped: false,
    kind: 'none',
  });

  private readonly shiftHeld = signal(false);
  private readonly altHeld = signal(false);
  private readonly ctrlHeld = signal(false);

  protected readonly zoom = computed(() => this.store.plan().viewport.zoom);
  protected readonly labelSize = computed(() => 12 / this.zoom());
  protected readonly handleSize = computed(() => 8 / this.zoom());
  protected readonly imageWidth = computed(() => this.store.imageSizeMeters()?.width ?? 0);
  protected readonly imageHeight = computed(() => this.store.imageSizeMeters()?.height ?? 0);
  protected readonly selectedMeasurement = this.store.selectedMeasurement;
  protected readonly selectedMeasurementHandles = computed(() => {
    const measurement = this.selectedMeasurement();
    return measurement ? measurementLine(measurement) : null;
  });

  protected readonly viewBox = computed(() => {
    const { panX, panY, zoom } = this.store.plan().viewport;
    const { width, height } = this.viewportSize();
    return `${panX} ${panY} ${width / zoom} ${height / zoom}`;
  });

  protected readonly grid = computed(() => {
    const { panX, panY, zoom } = this.store.plan().viewport;
    const { width, height } = this.viewportSize();
    const worldW = width / zoom;
    const worldH = height / zoom;
    const minorStep = drawnHelperStep(this.store.gridSpacingMeters(), zoom);
    const majorStep = minorStep * MAJOR_HELPER_MULTIPLE;
    return {
      left: panX,
      top: panY,
      right: panX + worldW,
      bottom: panY + worldH,
      minor: axisLines(panX, panY, worldW, worldH, minorStep),
      major: axisLines(panX, panY, worldW, worldH, majorStep),
    };
  });

  protected readonly wallsView = computed(() =>
    (this.store.plan().walls ?? []).map((w) => ({
      ...w,
      points: w.points.map((pt) => `${pt.x},${pt.y}`).join(' '),
      selected: this.store.selectedWall()?.id === w.id,
    })),
  );
  protected readonly wallThickness = computed(() => this.store.selectedWall()?.thickness ?? 0.15);
  protected readonly wallPreview = computed(() => {
    if (this.store.tool() !== 'wall' || this.wallDraft().length === 0) return null;
    const last = this.wallDraft()[this.wallDraft().length - 1];
    const raw = this.snap().snapped ? this.snap().point : (this.cursor() ?? last);
    const end = this.constrainOrthoPoint(last, raw, this.altHeld());
    return [...this.wallDraft(), end].map((pt) => `${pt.x},${pt.y}`).join(' ');
  });
  protected readonly drawList = computed(() =>
    this.store.plan().objects.map((obj) => {
      const fill = fillPaint(obj);
      const border = borderPaint(obj);
      return {
        obj,
        fill: fill.fill,
        fillOpacity: fill.opacity,
        border: border?.stroke ?? null,
        borderOpacity: border?.opacity ?? 0,
      };
    }),
  );

  protected readonly isEmpty = computed(() => {
    const plan = this.store.plan();
    return !this.store.imageDataUrl() && plan.objects.length === 0;
  });

  protected readonly cssCursor = computed(() => {
    const drag = this.drag();
    if (drag.type === 'pan') {
      return 'grabbing';
    }
    if (this.store.spaceHeld() || this.store.tool() === 'pan') {
      return 'grab';
    }
    if (this.drag().type === 'rotate-objects') {
      return 'grabbing';
    }
    if (this.store.tool() === 'select') {
      return 'default';
    }
    return 'crosshair';
  });

  protected readonly shapePreview = computed(() => {
    const drag = this.drag();
    const current = this.cursor() ?? this.snap().point;
    if (drag.type === 'draw-shape') {
      const rect = previewShape(drag.kind, drag.start, current);
      return {
        ...rect,
        kind: drag.kind,
        label: `${formatLength(rect.width, this.store.lengthUnit())} × ${formatLength(rect.depth, this.store.lengthUnit())}`,
      };
    }
    return null;
  });

  protected readonly scalePreview = computed(() => {
    const p1 = this.scaleP1();
    if (!p1 || this.store.tool() !== 'scale') {
      return null;
    }
    const raw = this.snap().snapped ? this.snap().point : (this.cursor() ?? p1);
    const p2 = this.constrainOrthoPoint(p1, raw, this.altHeld());
    return {
      start: p1,
      end: p2,
      mid: midpoint(p1, p2),
      length: formatLength(dist(p1, p2), this.store.lengthUnit()),
    };
  });

  protected readonly measurePreview = computed(() => {
    const draft = this.measureDraft();
    if (!draft || this.store.tool() !== 'measure') {
      return null;
    }
    const tick = this.handleSize() * 0.9;
    const unit = this.store.lengthUnit();
    const raw = this.snap().snapped ? this.snap().point : (this.cursor() ?? draft.start);
    if (!draft.end) {
      const end = this.constrainOrthoPoint(draft.start, raw, this.altHeld());
      return dimensionView(draft.start, end, tick, unit);
    }
    const offset = signedPerpendicularOffset(draft.start, draft.end, raw);
    return dimensionView(draft.start, draft.end, tick, unit, offset);
  });

  protected readonly measurements = computed(() => {
    const selectedIds = new Set(this.highlightedMeasurements().map((item) => item.id));
    const tick = this.handleSize() * 0.9;
    return (this.store.plan().measurements ?? []).map((item) => ({
      ...dimensionView(item.start, item.end, tick, this.store.lengthUnit(), item.offset ?? 0),
      id: item.id,
      color: measurementColor(item),
      selected: selectedIds.has(item.id),
    }));
  });

  protected readonly cursorLabel = computed(() => {
    const point = this.cursor();
    if (!point) {
      return '—';
    }
    const unit = this.store.lengthUnit();
    const x = metersToDisplay(point.x, unit);
    const y = metersToDisplay(point.y, unit);
    const digits = unit === 'cm' ? 1 : 2;
    return `${x.toFixed(digits)} ${unit}, ${y.toFixed(digits)} ${unit}`;
  });

  protected readonly hoverPick = computed(() => {
    const drag = this.drag();
    if (drag.type !== 'box-select') {
      return null;
    }
    const rect = normalizeRect(drag.start, drag.current);
    if (rect.width * this.zoom() < 4 && rect.depth * this.zoom() < 4) {
      return null;
    }
    return this.store.previewBox(drag.start, drag.current, drag.additive);
  });

  protected readonly highlightedObjects = computed(() => {
    const hover = this.hoverPick();
    if (!hover) {
      return this.store.selectedObjects();
    }
    const ids = new Set(hover.objectIds);
    return this.store.plan().objects.filter((obj) => ids.has(obj.id));
  });

  protected readonly highlightedMeasurements = computed(() => {
    const hover = this.hoverPick();
    if (!hover) {
      return this.store.selectedMeasurements();
    }
    const ids = new Set(hover.measurementIds);
    return (this.store.plan().measurements ?? []).filter((item) => ids.has(item.id));
  });

  protected readonly rotateHandles = computed(() => {
    if (this.drag().type === 'box-select') {
      return [];
    }
    const objects = this.store.selectedObjects();
    if (objects.length === 0) {
      return [];
    }
    if (objects.length === 1) {
      return rotationHandles(objects[0], this.zoom());
    }
    const box = itemsBBox(objects);
    return box ? rotationHandlesFromBox(box, this.zoom()) : [];
  });

  protected readonly boxSelect = computed(() => {
    const drag = this.drag();
    if (drag.type !== 'box-select') {
      return null;
    }
    const rect = normalizeRect(drag.start, drag.current);
    const windowMode = drag.current.x >= drag.start.x;
    return {
      ...rect,
      fill: windowMode ? 'var(--window-select)' : 'var(--crossing-select)',
      stroke: windowMode ? 'var(--window-select)' : 'var(--crossing-select)',
      dash: windowMode ? null : '8 5',
    };
  });

  protected readonly groupBounds = computed(() => {
    if (this.drag().type === 'box-select') {
      return null;
    }
    const objects = this.store.selectedObjects();
    if (objects.length < 2) {
      return null;
    }
    return itemsBBox(objects);
  });

  protected readonly snapLabel = computed(() => {
    if (this.drag().type === 'rotate-objects' && this.altHeld()) {
      return '45° snap (Alt)';
    }
    if (this.altHeld()) {
      return '90° snap (Alt)';
    }
    if (this.store.tool() === 'select' && this.ctrlHeld()) {
      const snap = this.snap();
      if (snap.snapped && snap.kind === 'object-corner') {
        return 'Snap: object corner';
      }
      return 'Corner snap (Ctrl)';
    }
    if (this.shiftHeld()) {
      return 'Snap off (Shift)';
    }
    const snap = this.snap();
    if (snap.snapped && snap.kind === 'object-corner') {
      return 'Snap: object corner';
    }
    return 'Snap on';
  });

  protected readonly zoomLabel = computed(() => {
    const pct = Math.round((this.zoom() / 40) * 100);
    return `${pct}%`;
  });

  protected readonly scaleLabel = computed(() => {
    const background = this.store.plan().background;
    if (!background) {
      return 'No image';
    }
    return background.calibrated ? 'Scaled' : 'Not calibrated';
  });

  constructor() {
    afterNextRender(() => {
      const el = this.viewport().nativeElement;
      const resize = () => {
        const rect = el.getBoundingClientRect();
        this.viewportSize.set({ width: rect.width, height: rect.height });
        this.store.reportViewSize(rect.width, rect.height);
      };
      const observer = new ResizeObserver(resize);
      observer.observe(el);
      resize();

      const onWheel = (event: WheelEvent) => {
        event.preventDefault();
        const world = this.clientToWorld(event);
        const offset = this.clientOffset(event);
        const zoom = this.store.plan().viewport.zoom;
        const factor = Math.exp(-event.deltaY * 0.0015);
        this.store.zoomAround(world, offset, zoom * factor);
      };
      el.addEventListener('wheel', onWheel, { passive: false });

      this.destroyRef.onDestroy(() => {
        observer.disconnect();
        el.removeEventListener('wheel', onWheel);
      });
    });

    afterRenderEffect({
      earlyRead: () => ({
        el: this.bgImage()?.nativeElement ?? null,
        url: this.store.imageDataUrl(),
      }),
      write: (value) => {
        const { el, url } = value();
        if (!el) {
          return;
        }
        if (url) {
          el.setAttribute('href', url);
          el.setAttributeNS('http://www.w3.org/1999/xlink', 'href', url);
        } else {
          el.removeAttribute('href');
          el.removeAttributeNS('http://www.w3.org/1999/xlink', 'href');
        }
      },
    });

    effect(() => {
      this.store.tool();
      this.scaleP1.set(null);
      this.measureDraft.set(null);
      this.wallDraft.set([]);
    });
  }

  finishWallDraft(): void {
    const pts = this.wallDraft();
    if (pts.length >= 2) this.store.addWall(pts);
    this.wallDraft.set([]);
    if (this.store.tool() === 'wall') this.store.setTool('select');
  }
  cancelDraft(): void {
    this.store.endEdit();
    this.drag.set({ type: 'none' });
    this.scaleP1.set(null);
    this.measureDraft.set(null);
    this.wallDraft.set([]);
  }

  protected onModifierDown(event: KeyboardEvent): void {
    this.shiftHeld.set(event.shiftKey);
    this.altHeld.set(event.altKey);
    this.ctrlHeld.set(event.ctrlKey || event.metaKey);
  }

  protected onModifierUp(event: KeyboardEvent): void {
    this.shiftHeld.set(event.shiftKey);
    this.altHeld.set(event.altKey);
    this.ctrlHeld.set(event.ctrlKey || event.metaKey);
    if (event.key === 'Shift') {
      this.shiftHeld.set(false);
    }
    if (event.key === 'Alt') {
      this.altHeld.set(false);
    }
    if (event.key === 'Control' || event.key === 'Meta') {
      this.ctrlHeld.set(false);
    }
  }

  protected onModifierBlur(): void {
    this.shiftHeld.set(false);
    this.altHeld.set(false);
    this.ctrlHeld.set(false);
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  protected async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    const file = event.dataTransfer?.files.item(0);
    if (file?.type.startsWith('image/')) {
      try {
        await this.store.importImageFile(file);
      } catch {
        this.store.setStatus('Could not import that image.');
      }
    }
  }

  protected onPointerDown(event: PointerEvent): void {
    if (!this.store.ready()) {
      return;
    }
    const svg = this.viewport().nativeElement;
    svg.setPointerCapture(event.pointerId);

    if (event.button === 2) {
      this.cancelDraft();
      return;
    }

    const world = this.clientToWorld(event);
    this.cursor.set(world);
    const snapped = this.computeSnap(event);
    this.snap.set(snapped);

    if (event.button === 1 || this.store.spaceHeld() || this.store.tool() === 'pan') {
      const viewport = this.store.plan().viewport;
      this.drag.set({
        type: 'pan',
        startX: event.clientX,
        startY: event.clientY,
        panX: viewport.panX,
        panY: viewport.panY,
      });
      return;
    }

    if (event.button !== 0) {
      return;
    }

    const tool = this.store.tool();

    if (tool === 'scale') {
      const p1 = this.scaleP1();
      if (!p1) {
        this.scaleP1.set({ ...snapped.point });
        this.store.setStatus('Click the other end of the known length · hold Alt for 90°');
      } else {
        const end = this.constrainOrthoPoint(p1, snapped.point, event.altKey || this.altHeld());
        this.store.openScaleDialog(p1, end);
        this.scaleP1.set(null);
      }
      return;
    }

    if (tool === 'measure') {
      const draft = this.measureDraft();
      if (!draft) {
        this.measureDraft.set({ start: { ...snapped.point } });
        this.store.setStatus('Click the other end to measure · hold Alt for 90°');
      } else if (!draft.end) {
        const end = this.constrainOrthoPoint(
          draft.start,
          snapped.point,
          event.altKey || this.altHeld(),
        );
        if (dist(draft.start, end) < 0.01) {
          return;
        }
        this.measureDraft.set({ start: draft.start, end });
        this.store.setStatus('Click to place the dimension line');
      } else {
        const offset = signedPerpendicularOffset(draft.start, draft.end, snapped.point);
        this.store.addMeasurement(draft.start, draft.end, offset);
        this.measureDraft.set(null);
      }
      return;
    }

    if (tool === 'wall') {
      const last = this.wallDraft()[this.wallDraft().length - 1];
      const pt = last
        ? this.constrainOrthoPoint(last, snapped.point, event.altKey || this.altHeld())
        : { ...snapped.point };
      if (!last || dist(last, pt) > 0.01) this.wallDraft.update((pts) => [...pts, pt]);
      this.store.setStatus(
        this.wallDraft().length < 2
          ? 'Click the next wall point'
          : 'Click to add a segment · double-click or Enter to finish',
      );
      return;
    }
    if (tool === 'rect' || tool === 'circle' || tool === 'ellipse') {
      this.drag.set({ type: 'draw-shape', kind: tool, start: world });
      return;
    }

    if (tool === 'select') {
      const hit = hitTest(this.store.plan(), world, this.store.plan().viewport.zoom, {
        objects: this.store.selectedObjects(),
        measurementId: this.store.selectedMeasurement()?.id ?? null,
      });
      if (!hit) {
        this.drag.set({
          type: 'box-select',
          start: world,
          current: world,
          additive: event.shiftKey || this.shiftHeld(),
        });
        return;
      }
      const additive = event.shiftKey || this.shiftHeld();
      if (hit.type === 'object') {
        if (additive || !this.store.isObjectSelected(hit.id)) {
          this.store.selectFromHit(hit, additive);
        }
      } else if (hit.type !== 'rotate-object' && hit.type !== 'rotate-objects') {
        this.store.selectFromHit(hit, additive);
      }
      if (hit.type === 'rotate-object' || hit.type === 'rotate-objects') {
        const targets = this.store.selectedObjects();
        if (targets.length === 0) {
          return;
        }
        const box = itemsBBox(targets);
        const center =
          targets.length === 1
            ? objectCenter(targets[0])
            : box
              ? { x: box.x + box.width / 2, y: box.y + box.depth / 2 }
              : objectCenter(targets[0]);
        this.drag.set({
          type: 'rotate-objects',
          orig: targets.map((obj) => ({
            id: obj.id,
            x: obj.x,
            y: obj.y,
            width: obj.width,
            depth: obj.depth,
            rotation: obj.rotation ?? 0,
          })),
          startAngle: angleDeg(center, world),
          center,
          recorded: false,
        });
        return;
      }
      if (hit.type === 'measurement-end') {
        this.drag.set({
          type: 'move-measurement-end',
          id: hit.id,
          end: hit.end,
          recorded: false,
        });
        return;
      }
      if (hit.type === 'wall') {
        const wall = this.store.plan().walls.find((w) => w.id === hit.id);
        if (!wall) return;
        this.drag.set({
          type: 'move-wall',
          id: wall.id,
          origPoints: wall.points.map((pt) => ({ ...pt })),
          start: world,
          recorded: false,
        });
        return;
      }
      if (hit.type === 'measurement') {
        const measurement = this.store.plan().measurements.find((item) => item.id === hit.id);
        if (!measurement) {
          return;
        }
        this.drag.set({
          type: 'move-measurement',
          id: measurement.id,
          origStart: { ...measurement.start },
          origEnd: { ...measurement.end },
          start: world,
          recorded: false,
        });
        return;
      }
      if (hit.type === 'object') {
        const targets = this.store.selectedObjects();
        if (targets.length === 0) {
          this.drag.set({ type: 'none' });
          return;
        }
        this.drag.set({
          type: 'move-objects',
          orig: targets.map((item) => ({ id: item.id, x: item.x, y: item.y })),
          start: world,
          recorded: false,
        });
        return;
      }
    }
  }

  protected onDoubleClick(event: MouseEvent): void {
    if (this.store.tool() === 'wall') {
      event.preventDefault();
      this.finishWallDraft();
    }
  }
  protected onPointerMove(event: PointerEvent): void {
    const world = this.clientToWorld(event);
    this.cursor.set(world);
    const snapped = this.computeSnap(event);
    this.snap.set(snapped);

    const drag = this.drag();
    if (drag.type === 'box-select') {
      this.drag.set({ ...drag, current: world });
      return;
    }
    if (drag.type === 'pan') {
      const zoom = this.store.plan().viewport.zoom;
      this.store.setViewport({
        panX: drag.panX - (event.clientX - drag.startX) / zoom,
        panY: drag.panY - (event.clientY - drag.startY) / zoom,
        zoom,
      });
      return;
    }

    const moveThreshold = 3 / this.store.plan().viewport.zoom;

    const alt = event.altKey || this.altHeld();

    if (drag.type === 'rotate-objects') {
      const rawDelta = angleDeg(drag.center, world) - drag.startAngle;
      const delta =
        alt && drag.orig.length === 1
          ? snapAngle(drag.orig[0].rotation + rawDelta, 45) - drag.orig[0].rotation
          : alt
            ? snapAngle(rawDelta, 45)
            : rawDelta;
      if (!drag.recorded && Math.abs(delta) < 0.5) {
        return;
      }
      if (!drag.recorded) {
        this.store.beginEdit();
        this.drag.set({ ...drag, recorded: true });
      }
      this.store.applyObjectPoses(
        drag.orig.map((item) => ({
          id: item.id,
          ...rotatedObjectPose(item, drag.center, delta),
        })),
      );
      return;
    }

    if (drag.type === 'move-objects') {
      const rawDx = world.x - drag.start.x;
      const rawDy = world.y - drag.start.y;
      if (!drag.recorded && Math.hypot(rawDx, rawDy) < moveThreshold) {
        return;
      }
      if (!drag.recorded) {
        this.store.beginEdit();
        this.drag.set({ ...drag, recorded: true });
      }
      let { dx, dy } = this.orthoDelta(rawDx, rawDy, alt);
      const ctrl = event.ctrlKey || this.ctrlHeld();
      if (ctrl) {
        const snappedMove = this.objectMoveSnap(drag.orig, dx, dy);
        if (snappedMove.snapped) {
          if (alt) {
            if (dy === 0) {
              dx += snappedMove.dx;
            } else if (dx === 0) {
              dy += snappedMove.dy;
            }
          } else {
            dx += snappedMove.dx;
            dy += snappedMove.dy;
          }
          this.snap.set({
            point: snappedMove.point,
            snapped: true,
            kind: snappedMove.kind,
          });
        }
      }
      this.store.applyObjectPoses(
        drag.orig.map((item) => ({ id: item.id, x: item.x + dx, y: item.y + dy })),
      );
      return;
    }

    if (drag.type === 'move-wall') {
      const rawDx = world.x - drag.start.x,
        rawDy = world.y - drag.start.y;
      if (!drag.recorded && Math.hypot(rawDx, rawDy) < moveThreshold) return;
      if (!drag.recorded) {
        this.store.beginEdit();
        this.drag.set({ ...drag, recorded: true });
      }
      const { dx, dy } = this.orthoDelta(rawDx, rawDy, alt);
      this.store.updateWall(drag.id, {
        points: drag.origPoints.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })),
      });
      return;
    }
    if (drag.type === 'move-measurement') {
      const rawDx = world.x - drag.start.x;
      const rawDy = world.y - drag.start.y;
      if (!drag.recorded && Math.hypot(rawDx, rawDy) < moveThreshold) {
        return;
      }
      if (!drag.recorded) {
        this.store.beginEdit();
        this.drag.set({ ...drag, recorded: true });
      }
      const { dx, dy } = this.orthoDelta(rawDx, rawDy, alt);
      this.store.updateMeasurement(drag.id, {
        start: { x: drag.origStart.x + dx, y: drag.origStart.y + dy },
        end: { x: drag.origEnd.x + dx, y: drag.origEnd.y + dy },
      });
      return;
    }

    if (drag.type === 'move-measurement-end') {
      if (!drag.recorded) {
        this.store.beginEdit();
        this.drag.set({ ...drag, recorded: true });
      }
      const measurement = this.store.plan().measurements.find((item) => item.id === drag.id);
      if (!measurement) {
        return;
      }
      const measuredPoint = linePointToMeasured(measurement, snapped.point);
      const origin = drag.end === 'start' ? measurement.end : measurement.start;
      const point = this.constrainOrthoPoint(origin, measuredPoint, event.altKey || this.altHeld());
      if (drag.end === 'start') {
        this.store.updateMeasurement(drag.id, { start: { ...point } });
      } else {
        this.store.updateMeasurement(drag.id, { end: { ...point } });
      }
    }
  }

  protected onPointerUp(event: PointerEvent): void {
    const drag = this.drag();
    const world = this.clientToWorld(event);

    if (drag.type === 'draw-shape') {
      const rect = previewShape(drag.kind, drag.start, world);
      this.store.addObject(drag.kind, rect.x, rect.y, rect.width, rect.depth);
    } else if (drag.type === 'box-select') {
      const zoom = this.store.plan().viewport.zoom;
      const size = Math.hypot(world.x - drag.start.x, world.y - drag.start.y);
      if (size < 4 / zoom) {
        if (!drag.additive) {
          this.store.clearSelection();
        }
      } else {
        this.store.selectBox(drag.start, world, drag.additive);
      }
    }

    this.store.endEdit();
    this.drag.set({ type: 'none' });
  }

  protected rotateTransform(obj: PlacedObject): string {
    const rotation = obj.rotation ?? 0;
    const cx = obj.x + obj.width / 2;
    const cy = obj.y + obj.depth / 2;
    return `rotate(${rotation} ${cx} ${cy})`;
  }

  private objectMoveSnap(
    orig: readonly { id: string; x: number; y: number }[],
    dx: number,
    dy: number,
  ) {
    const plan = this.store.plan();
    const movingIds = new Set(orig.map((item) => item.id));
    const byId = new Map(plan.objects.map((obj) => [obj.id, obj]));
    const moving = orig.flatMap((item) => {
      const live = byId.get(item.id);
      return live ? [{ ...live, x: item.x + dx, y: item.y + dy }] : [];
    });
    const others = plan.objects.filter((obj) => !movingIds.has(obj.id));
    const zoom = plan.viewport.zoom;
    return snapObjectMove(moving, others, SNAP_PIXELS / zoom);
  }

  private constrainOrthoPoint(origin: Point, point: Point, altHeld: boolean): Point {
    return altHeld ? snapToRightAngle(origin, point) : point;
  }

  private orthoDelta(dx: number, dy: number, altHeld: boolean): { dx: number; dy: number } {
    if (!altHeld) {
      return { dx, dy };
    }
    if (Math.abs(dx) >= Math.abs(dy)) {
      return { dx, dy: 0 };
    }
    return { dx: 0, dy };
  }

  private computeSnap(event: PointerEvent): SnapResult {
    const world = this.clientToWorld(event);
    const tool = this.store.tool();
    const drag = this.drag();
    const wantsSnap =
      tool === 'scale' ||
      tool === 'measure' ||
      tool === 'wall' ||
      drag.type === 'move-measurement-end';
    const shift = event.shiftKey || this.shiftHeld();
    const zoom = this.store.plan().viewport.zoom;
    const enabled = wantsSnap && !shift;
    const plan = this.store.plan();
    return snapToGeometry(world, plan.objects, SNAP_PIXELS / zoom, enabled);
  }

  private clientToWorld(event: { clientX: number; clientY: number }): Point {
    const rect = this.viewport().nativeElement.getBoundingClientRect();
    const { panX, panY, zoom } = this.store.plan().viewport;
    return {
      x: panX + (event.clientX - rect.left) / zoom,
      y: panY + (event.clientY - rect.top) / zoom,
    };
  }

  private clientOffset(event: { clientX: number; clientY: number }): Point {
    const rect = this.viewport().nativeElement.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
}

function axisLines(
  x: number,
  y: number,
  width: number,
  height: number,
  step: number,
): { vertical: number[]; horizontal: number[] } {
  const vertical: number[] = [];
  const horizontal: number[] = [];
  const x0 = Math.floor(x / step) * step;
  const y0 = Math.floor(y / step) * step;
  const xEnd = x + width + step;
  const yEnd = y + height + step;
  for (let value = x0; value <= xEnd; value += step) {
    vertical.push(Number(value.toFixed(6)));
  }
  for (let value = y0; value <= yEnd; value += step) {
    horizontal.push(Number(value.toFixed(6)));
  }
  return { vertical, horizontal };
}

function previewShape(
  kind: ShapeKind,
  start: Point,
  current: Point,
): { x: number; y: number; width: number; depth: number } {
  const rect = normalizeRect(start, current);
  if (rect.width < 0.05 && rect.depth < 0.05) {
    if (kind === 'circle') {
      return { x: start.x - 0.3, y: start.y - 0.3, width: 0.6, depth: 0.6 };
    }
    return { x: start.x - 0.4, y: start.y - 0.4, width: 0.8, depth: 0.8 };
  }
  if (kind === 'circle') {
    const diameter = Math.max(0.05, Math.min(rect.width, rect.depth));
    return { x: rect.x, y: rect.y, width: diameter, depth: diameter };
  }
  return {
    x: rect.x,
    y: rect.y,
    width: Math.max(0.05, rect.width),
    depth: Math.max(0.05, rect.depth),
  };
}
