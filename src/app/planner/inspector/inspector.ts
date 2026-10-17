import { Component, inject } from '@angular/core';
import { dist, wallLength } from '../../core/geometry';
import {
  measurementColor,
  normalizeColor,
  objectBorderColor,
  colorWithOpacity,
  objectColor,
  opacityPercent,
  wallColor,
} from '../../models/floor-plan';
import { PlannerStore } from '../../core/planner-store';
import {
  displayToMeters,
  formatDisplayNumber,
  formatLength,
  inputMin,
  inputStep,
} from '../../core/units';
import { StackOrder } from './stack-order/stack-order';

@Component({
  selector: 'app-inspector',
  host: { role: 'complementary', 'aria-label': 'Properties' },
  imports: [StackOrder],
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      background: var(--bg-panel);
      border-left: 1px solid var(--border);
      box-sizing: border-box;
      width: 20rem;
      min-width: 20rem;
      min-height: 0;
      overflow: hidden;
    }

    .header {
      padding: 12px;
      border-bottom: 1px solid var(--border);
    }

    h2 {
      margin: 0;
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-dim);
      font-weight: 600;
    }

    .body {
      overflow: auto;
      min-width: 0;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    label {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 12px;
      color: var(--text-dim);
    }

    input,
    select {
      display: block;
      width: 100%;
      min-width: 0;
      max-width: 100%;
      box-sizing: border-box;
      background: var(--bg);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 8px 10px;
      font: inherit;
      font-size: 13px;
    }

    .color-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .color-row input[type='color'] {
      width: 3rem;
      height: 2.25rem;
      padding: 2px;
      cursor: pointer;
    }

    .color-row .action {
      width: auto;
    }

    .transparent {
      flex: none;
      width: 2.25rem;
      height: 2.25rem;
      padding: 0;
      border: 1px solid var(--border);
      border-radius: 8px;
      cursor: pointer;
      background: repeating-conic-gradient(#c9d1d9 0% 25%, #ffffff 0% 50%) 0 0 / 12px 12px;
    }

    .transparent[aria-pressed='true'] {
      outline: 2px solid var(--accent);
      outline-offset: 1px;
    }

    .opacity-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: var(--text-dim);
    }

    .opacity-row input[type='range'] {
      flex: 1;
      padding: 0;
      border: none;
      background: transparent;
    }

    .opacity-row output {
      min-width: 2.6em;
      text-align: right;
      color: var(--text);
    }

    .row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 8px;
    }

    .metric {
      font-size: 13px;
      color: var(--text);
      overflow-wrap: anywhere;
    }

    .empty {
      color: var(--text-dim);
      font-size: 13px;
      line-height: 1.45;
      margin: 0;
    }

    .action,
    .danger {
      width: 100%;
      box-sizing: border-box;
      background: transparent;
      border-radius: 8px;
      padding: 8px 10px;
      cursor: pointer;
      font: inherit;
    }

    .action {
      color: var(--text);
      border: 1px solid var(--border);
    }

    .danger {
      color: var(--danger);
      border: 1px solid color-mix(in srgb, var(--danger) 45%, var(--border));
    }
  `,
  template: `
    <div class="header">
      <h2>Properties</h2>
    </div>
    <div class="body">
      @if (store.selectedGroup(); as group) {
        <label>
          Group name
          <input [value]="group.name" (change)="renameGroup(group.id, $event)" />
        </label>
        <p class="metric">{{ store.selectedObjects().length }} objects</p>
        <p class="empty">Rotate and move the group together. Ungroup to edit pieces.</p>
        <button type="button" class="action" (click)="store.ungroupSelection()">Ungroup</button>
        <button type="button" class="action" (click)="store.copySelection()">Copy group</button>
        <app-stack-order />
        <button class="danger" type="button" (click)="store.deleteSelection()">Delete group</button>
      } @else if (store.selection()?.type === 'multi') {
        <p class="metric">{{ store.selectionCount() }} items selected</p>
        @if (store.canGroup()) {
          <button type="button" class="action" (click)="store.groupSelection()">
            Group objects
          </button>
        }
        @if (store.canCopy()) {
          <button type="button" class="action" (click)="store.copySelection()">Copy objects</button>
        }
        @if (store.selectedObjects().length > 0) {
          <app-stack-order />
        }
        <button class="danger" type="button" (click)="store.deleteSelection()">
          Delete selected
        </button>
      } @else if (store.selectedObjects().length > 1) {
        <p class="metric">{{ store.selectedObjects().length }} objects selected</p>
        <button type="button" class="action" (click)="store.groupSelection()">Group</button>
        <button type="button" class="action" (click)="store.copySelection()">Copy</button>
        <app-stack-order />
      } @else if (store.selectedObject(); as obj) {
        <label>
          Name
          <input [value]="obj.name" (change)="patchObject({ name: inputValue($event) })" />
        </label>
        <p class="metric">Shape: {{ obj.kind }}</p>
        <div class="row">
          <label>
            Width ({{ store.lengthUnit() }})
            <input
              type="number"
              [min]="min()"
              [step]="step()"
              [value]="display(obj.width)"
              (change)="patchObject({ width: lengthValue($event) })"
            />
          </label>
          <label>
            Depth ({{ store.lengthUnit() }})
            <input
              type="number"
              [min]="min()"
              [step]="step()"
              [value]="display(obj.depth)"
              [disabled]="obj.kind === 'circle'"
              (change)="patchObject({ depth: lengthValue($event) })"
            />
          </label>
        </div>
        <p class="metric">{{ format(obj.width) }} × {{ format(obj.depth) }}</p>
        <label>
          Rotation (°)
          <input
            type="number"
            step="1"
            [value]="round(obj.rotation ?? 0)"
            (change)="patchObject({ rotation: numberValue($event) })"
          />
        </label>
        <div class="color-row">
          <label for="object-color">Color</label>
          <input
            id="object-color"
            type="color"
            [value]="objectColor(obj)"
            (focus)="store.beginEdit()"
            (input)="setObjectColor(obj.id, $event)"
            (change)="store.endEdit()"
            (blur)="store.endEdit()"
          />
          <button
            type="button"
            class="transparent"
            aria-label="Transparent fill color"
            [attr.aria-pressed]="fillOpacity(obj) === 0"
            (click)="setFillTransparent(obj.id)"
          ></button>
          @if (obj.color && obj.color !== 'transparent') {
            <button
              type="button"
              class="action"
              (click)="store.updateObject(obj.id, { color: undefined })"
            >
              Reset color
            </button>
          }
        </div>
        <div class="opacity-row">
          <label for="object-fill-opacity">Fill opacity</label>
          <input
            id="object-fill-opacity"
            type="range"
            min="0"
            max="100"
            step="1"
            [value]="fillOpacity(obj)"
            [attr.aria-valuetext]="fillOpacity(obj) + '%'"
            (focus)="store.beginEdit()"
            (input)="setFillOpacity(obj, $event)"
            (change)="store.endEdit()"
            (blur)="store.endEdit()"
          />
          <output for="object-fill-opacity">{{ fillOpacity(obj) }}%</output>
        </div>
        <div class="color-row">
          <label for="object-border-color">Border color</label>
          <input
            id="object-border-color"
            type="color"
            [value]="objectBorderColor(obj)"
            (focus)="store.beginEdit()"
            (input)="setObjectBorderColor(obj.id, $event)"
            (change)="store.endEdit()"
            (blur)="store.endEdit()"
          />
          <button
            type="button"
            class="transparent"
            aria-label="Transparent border color (no border)"
            [attr.aria-pressed]="borderOpacity(obj) === 0"
            (click)="setBorderTransparent(obj.id)"
          ></button>
        </div>
        <div class="opacity-row">
          <label for="object-border-opacity">Border opacity</label>
          <input
            id="object-border-opacity"
            type="range"
            min="0"
            max="100"
            step="1"
            [value]="borderOpacity(obj)"
            [attr.aria-valuetext]="borderOpacity(obj) + '%'"
            (focus)="store.beginEdit()"
            (input)="setBorderOpacity(obj, $event)"
            (change)="store.endEdit()"
            (blur)="store.endEdit()"
          />
          <output for="object-border-opacity">{{ borderOpacity(obj) }}%</output>
        </div>
        <button type="button" class="action" (click)="store.copySelection()">Copy object</button>
        <app-stack-order />
        <button class="danger" type="button" (click)="store.deleteSelection()">
          Delete object
        </button>
      } @else if (store.selectedWall(); as wall) {
        <p class="metric">
          Wall · {{ format(wallLength(wall)) }} long · {{ wall.points.length - 1 }} segments
        </p>
        <label
          >Thickness ({{ store.lengthUnit() }})<input
            type="number"
            [min]="min()"
            [step]="step()"
            [value]="display(wall.thickness)"
            (change)="setWallThickness(wall.id, $event)"
        /></label>
        <div class="color-row">
          <label for="wall-color">Color</label>
          <input
            id="wall-color"
            type="color"
            [value]="wallColor(wall)"
            (focus)="store.beginEdit()"
            (input)="setWallColor(wall.id, $event)"
            (change)="store.endEdit()"
            (blur)="store.endEdit()"
          />
          <button
            type="button"
            class="transparent"
            aria-label="Transparent wall color"
            [attr.aria-pressed]="wallOpacity(wall) === 0"
            (click)="setWallTransparent(wall.id)"
          ></button>
          @if (wall.color) {
            <button
              type="button"
              class="action"
              (click)="store.updateWall(wall.id, { color: undefined })"
            >
              Reset color
            </button>
          }
        </div>
        <div class="opacity-row">
          <label for="wall-opacity">Wall opacity</label>
          <input
            id="wall-opacity"
            type="range"
            min="0"
            max="100"
            step="1"
            [value]="wallOpacity(wall)"
            [attr.aria-valuetext]="wallOpacity(wall) + '%'"
            (focus)="store.beginEdit()"
            (input)="setWallOpacity(wall, $event)"
            (change)="store.endEdit()"
            (blur)="store.endEdit()"
          />
          <output for="wall-opacity">{{ wallOpacity(wall) }}%</output>
        </div>
        <p class="empty">
          Drag the wall to move it. Thickness is in real-world units from the plan scale.
        </p>
        <button class="danger" type="button" (click)="store.deleteSelection()">Delete wall</button>
      } @else if (store.selectedOpening(); as opening) {
        <p class="metric">
          {{ opening.kind === 'door' ? 'Door' : 'Window' }} ·
          {{
            opening.wallId
              ? 'Snapped to a wall'
              : opening.objectId
                ? 'Snapped to an object'
                : 'Free-standing'
          }}
        </p>
        <label
          >Width ({{ store.lengthUnit() }})<input
            type="number"
            [min]="min()"
            [step]="step()"
            [value]="display(opening.width)"
            (change)="setOpeningWidth(opening.id, $event)"
        /></label>
        <label
          >Rotation (°)<input
            type="number"
            step="1"
            [value]="round(opening.rotation ?? 0)"
            (change)="setOpeningRotation(opening.id, $event)"
        /></label>
        @if (opening.kind === 'door') {
          <button
            type="button"
            class="action"
            (click)="store.updateOpening(opening.id, { flipH: !opening.flipH })"
          >
            Flip door horizontally
          </button>
          <button
            type="button"
            class="action"
            (click)="store.updateOpening(opening.id, { flipV: !opening.flipV })"
          >
            Flip door vertically
          </button>
        }
        <button type="button" class="action" (click)="store.copySelection()">
          Copy {{ opening.kind }}
        </button>
        <button class="danger" type="button" (click)="store.deleteSelection()">
          Delete {{ opening.kind }}
        </button>
      } @else if (store.selectedMeasurement(); as measurement) {
        <p class="metric">Length: {{ format(dist(measurement.start, measurement.end)) }}</p>
        <p class="metric">
          Δx {{ format(abs(measurement.end.x - measurement.start.x)) }} · Δy
          {{ format(abs(measurement.end.y - measurement.start.y)) }}
        </p>
        <div class="color-row">
          <label for="measurement-color">Color</label>
          <input
            id="measurement-color"
            type="color"
            [value]="measurementColor(measurement)"
            (focus)="store.beginEdit()"
            (input)="setMeasurementColor(measurement.id, $event)"
            (change)="store.endEdit()"
          />
          @if (measurement.color) {
            <button
              type="button"
              class="action"
              (click)="store.updateMeasurement(measurement.id, { color: undefined })"
            >
              Reset color
            </button>
          }
        </div>
        <button class="danger" type="button" (click)="store.deleteSelection()">
          Delete measurement
        </button>
      } @else {
        <p class="empty">
          Select an object, wall, door, window or measurement. Enter sizes in
          {{ store.lengthUnit() }}.
        </p>
      }
    </div>
  `,
})
export class Inspector {
  protected readonly store = inject(PlannerStore);
  protected readonly dist = dist;
  protected readonly abs = Math.abs;
  protected readonly objectColor = objectColor;
  protected readonly objectBorderColor = objectBorderColor;
  protected readonly measurementColor = measurementColor;
  protected readonly wallLength = wallLength;

  protected fillOpacity(obj: { color?: string }): number {
    return opacityPercent(obj.color, 100);
  }
  protected borderOpacity(obj: { borderColor?: string }): number {
    return opacityPercent(obj.borderColor, 0);
  }
  protected setFillOpacity(
    obj: { id: string; kind: 'rect' | 'circle' | 'ellipse'; color?: string },
    event: Event,
  ): void {
    const pct = this.numberValue(event);
    this.store.updateObject(obj.id, { color: colorWithOpacity(objectColor(obj), pct) });
  }
  protected setBorderOpacity(obj: { id: string; borderColor?: string }, event: Event): void {
    const pct = this.numberValue(event);
    if (pct <= 0) {
      this.store.updateObject(obj.id, { borderColor: undefined });
    } else {
      this.store.updateObject(obj.id, {
        borderColor: colorWithOpacity(objectBorderColor(obj), pct),
      });
    }
  }
  protected setFillTransparent(id: string): void {
    this.store.updateObject(id, { color: 'transparent' });
    this.store.endEdit();
  }
  protected setBorderTransparent(id: string): void {
    this.store.updateObject(id, { borderColor: undefined });
    this.store.endEdit();
  }
  protected setObjectBorderColor(id: string, event: Event): void {
    const color = normalizeColor(this.inputValue(event));
    const obj = this.store.selectedObject();
    if (color && obj) {
      const pct = this.borderOpacity(obj);
      this.store.updateObject(id, { borderColor: colorWithOpacity(color, pct > 0 ? pct : 100) });
    }
  }
  protected setOpeningWidth(id: string, event: Event): void {
    const v = this.lengthValue(event);
    if (v > 0) this.store.updateOpening(id, { width: v });
  }
  protected setOpeningRotation(id: string, event: Event): void {
    const v = this.numberValue(event);
    if (Number.isFinite(v)) this.store.updateOpening(id, { rotation: v });
  }
  protected setWallThickness(id: string, event: Event): void {
    const v = this.lengthValue(event);
    if (v > 0) this.store.updateWall(id, { thickness: v });
  }
  protected readonly wallColor = wallColor;
  protected wallOpacity(wall: { color?: string }): number {
    return opacityPercent(wall.color, 100);
  }
  protected setWallColor(id: string, event: Event): void {
    const color = normalizeColor(this.inputValue(event));
    const wall = this.store.selectedWall();
    if (color && wall) {
      const pct = this.wallOpacity(wall);
      this.store.updateWall(id, { color: colorWithOpacity(color, pct > 0 ? pct : 100) });
    }
  }
  protected setWallOpacity(wall: { id: string; color?: string }, event: Event): void {
    const pct = this.numberValue(event);
    this.store.updateWall(wall.id, { color: colorWithOpacity(wallColor(wall), pct) });
  }
  protected setWallTransparent(id: string): void {
    this.store.updateWall(id, { color: 'transparent' });
    this.store.endEdit();
  }
  protected setObjectColor(id: string, event: Event): void {
    const color = normalizeColor(this.inputValue(event));
    const obj = this.store.selectedObject();
    if (color && obj) {
      const pct = this.fillOpacity(obj);
      this.store.updateObject(id, { color: colorWithOpacity(color, pct > 0 ? pct : 100) });
    }
  }

  protected setMeasurementColor(id: string, event: Event): void {
    const color = normalizeColor(this.inputValue(event));
    if (color) {
      this.store.updateMeasurement(id, { color });
    }
  }

  protected format(meters: number): string {
    return formatLength(meters, this.store.lengthUnit());
  }

  protected display(meters: number): string {
    return formatDisplayNumber(meters, this.store.lengthUnit());
  }

  protected step(): number {
    return inputStep(this.store.lengthUnit());
  }

  protected min(): number {
    return inputMin(this.store.lengthUnit());
  }

  protected lengthValue(event: Event): number {
    return displayToMeters(this.numberValue(event), this.store.lengthUnit());
  }

  protected renameGroup(id: string, event: Event): void {
    this.store.renameGroup(id, this.inputValue(event));
  }

  protected round(value: number): string {
    return (Math.round(value * 1000) / 1000).toString();
  }

  protected inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected numberValue(event: Event): number {
    return Number((event.target as HTMLInputElement).value);
  }

  protected patchObject(patch: {
    name?: string;
    width?: number;
    depth?: number;
    rotation?: number;
  }): void {
    const obj = this.store.selectedObject();
    if (!obj) {
      return;
    }
    if (patch.width != null && !(patch.width > 0)) {
      return;
    }
    if (patch.depth != null && !(patch.depth > 0)) {
      return;
    }
    if (patch.rotation != null && !Number.isFinite(patch.rotation)) {
      return;
    }
    this.store.updateObject(obj.id, patch);
  }
}
