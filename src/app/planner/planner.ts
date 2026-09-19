import { Component, inject, signal, viewChild } from '@angular/core';
import { formatLength as formatLengthValue, parseLengthToMeters } from '../core/units';
import { PlannerStore } from '../core/planner-store';
import { Tool } from '../models/floor-plan';
import { Canvas } from './canvas/canvas';
import { Inspector } from './inspector/inspector';
import { LayerPanel } from './layer-panel/layer-panel';
import { Toolbar } from './toolbar/toolbar';
import { Toolbox } from './toolbox/toolbox';

@Component({
  selector: 'app-planner',
  imports: [Toolbar, Toolbox, Canvas, LayerPanel, Inspector],
  host: {
    '(document:keydown)': 'onKeyDown($event)',
    '(document:keyup)': 'onKeyUp($event)',
    '(window:blur)': 'onWindowBlur()',
  },
  styles: `
    :host {
      display: grid;
      grid-template-rows: auto 1fr auto;
      grid-template-columns: auto minmax(0, 1fr) 240px max-content;
      height: 100%;
      background: var(--bg);
      color: var(--text);
    }

    app-toolbar,
    .status {
      grid-column: 1 / -1;
    }

    app-toolbox,
    app-canvas,
    app-layer-panel,
    app-inspector {
      min-height: 0;
    }

    .status {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 6px 12px;
      border-top: 1px solid var(--border);
      background: var(--bg-panel);
      color: var(--text-dim);
      font-size: 12px;
    }

    .boot,
    .modal-backdrop {
      grid-column: 1 / -1;
      grid-row: 1 / -1;
    }

    .boot {
      display: grid;
      place-items: center;
      background: var(--bg);
    }

    .modal-backdrop {
      background: color-mix(in srgb, #000 45%, transparent);
      display: grid;
      place-items: center;
      z-index: 10;
      padding: 24px;
    }

    .modal {
      width: min(420px, 100%);
      background: var(--bg-panel);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 20px;
      box-shadow: 0 24px 60px rgb(0 0 0 / 35%);
    }

    .modal h2 {
      margin: 0 0 8px;
      font-size: 18px;
    }

    .modal p {
      margin: 0 0 12px;
      color: var(--text-dim);
      line-height: 1.45;
    }

    .modal label {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 13px;
      color: var(--text-dim);
    }

    .modal input {
      background: var(--bg);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px 12px;
      font: inherit;
    }

    .error {
      color: var(--danger);
      font-size: 12px;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 16px;
    }

    .actions button {
      background: var(--bg-panel-2);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 8px 12px;
      font: inherit;
      cursor: pointer;
    }

    .actions .primary {
      background: var(--accent);
      border-color: var(--accent);
      color: #0d1117;
      font-weight: 600;
    }
  `,
  template: `
    @if (!store.ready()) {
      <div class="boot">Loading saved plan…</div>
    } @else {
      <app-toolbar />
      <app-toolbox />
      <app-canvas />
      <app-layer-panel />
      <app-inspector />
      <div class="status">
        <span>{{ store.status() }}</span>
        <span
          >Units: {{ store.lengthUnit() }} · Shift: no wall snap · Alt: 90° · Ctrl: corner snap ·
          Space: pan</span
        >
      </div>
    }

    @if (store.scaleDialog(); as dialog) {
      <div class="modal-backdrop" (click)="cancelScale()">
        <form
          class="modal"
          role="dialog"
          aria-labelledby="scale-title"
          (click)="$event.stopPropagation()"
          (submit)="applyScale($event, length.value)"
        >
          <h2 id="scale-title">Set scale</h2>
          <p>
            Marked length on the plan:
            <strong>{{ formatLength(dialog.measured) }}</strong>
            at the current scale.
          </p>
          <label>
            Actual distance ({{ store.lengthUnit() }})
            <input
              #length
              name="length"
              autocomplete="off"
              autofocus
              [placeholder]="scalePlaceholder()"
            />
          </label>
          <p>
            Bare numbers use {{ store.lengthUnit() }}. You can also type a unit: <code>m</code>,
            <code>cm</code>, or <code>mm</code>.
          </p>
          @if (scaleError()) {
            <p class="error">{{ scaleError() }}</p>
          }
          <div class="actions">
            <button type="button" (click)="cancelScale()">Cancel</button>
            <button class="primary" type="submit">Apply scale</button>
          </div>
        </form>
      </div>
    }
  `,
})
export class Planner {
  protected readonly store = inject(PlannerStore);
  private readonly canvas = viewChild(Canvas);
  protected readonly scaleError = signal<string | null>(null);
  protected formatLength(meters: number): string {
    return formatLengthValue(meters, this.store.lengthUnit());
  }

  protected scalePlaceholder(): string {
    return this.store.lengthUnit() === 'cm' ? 'e.g. 425 or 4.25 m' : 'e.g. 4.25 or 425 cm';
  }

  protected cancelScale(): void {
    this.scaleError.set(null);
    this.store.cancelScaleDialog();
  }

  protected applyScale(event: Event, raw: string): void {
    event.preventDefault();
    const meters = parseLengthToMeters(raw, this.store.lengthUnit());
    if (!meters) {
      this.scaleError.set(`Enter a positive length in ${this.store.lengthUnit()}, or add a unit.`);
      return;
    }
    if (!this.store.applyScale(meters)) {
      this.scaleError.set('Could not apply that scale. Mark a longer distance.');
      return;
    }
    this.scaleError.set(null);
  }

  protected onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Alt' && !isTypingTarget(event.target)) {
      event.preventDefault();
    }
    if (event.repeat && event.key === ' ') {
      event.preventDefault();
      return;
    }

    const typing = isTypingTarget(event.target);
    if (event.key === ' ' && !typing) {
      event.preventDefault();
      this.store.setSpaceHeld(true);
    }

    if (typing) {
      if (event.key === 'Escape') {
        (event.target as HTMLElement).blur();
      }
      return;
    }

    if (this.store.scaleDialog()) {
      if (event.key === 'Escape') {
        this.cancelScale();
      }
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        this.store.redo();
      } else {
        this.store.undo();
      }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      this.store.redo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === '0') {
      event.preventDefault();
      this.store.fitToView();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'g') {
      event.preventDefault();
      if (event.shiftKey) {
        this.store.ungroupSelection();
      } else {
        this.store.groupSelection();
      }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      this.store.copySelection();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
      event.preventDefault();
      this.store.pasteClipboard();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.code === 'BracketRight') {
      event.preventDefault();
      this.store.restackSelection(event.shiftKey ? 'front' : 'forward');
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.code === 'BracketLeft') {
      event.preventDefault();
      this.store.restackSelection(event.shiftKey ? 'back' : 'backward');
      return;
    }

    if (event.key === 'Escape') {
      this.canvas()?.cancelDraft();
      this.store.clearSelection();
      this.store.setStatus('Cancelled');
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.store.deleteSelection();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    const tool = shortcutTool(event.key);
    if (tool) {
      this.store.setTool(tool);
    }
  }

  protected onKeyUp(event: KeyboardEvent): void {
    if (event.key === ' ') {
      this.store.setSpaceHeld(false);
    }
  }

  protected onWindowBlur(): void {
    this.store.setSpaceHeld(false);
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

function shortcutTool(key: string): Tool | null {
  switch (key.toLowerCase()) {
    case 'v':
      return 'select';
    case 'h':
      return 'pan';
    case 's':
      return 'scale';
    case 'm':
      return 'measure';
    case 'w':
      return 'wall';
    case 'r':
      return 'rect';
    case 'c':
      return 'circle';
    case 'e':
      return 'ellipse';
    case 'g':
      return 'room';
    default:
      return null;
  }
}
