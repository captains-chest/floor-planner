import { Component, inject } from '@angular/core';
import { PlannerStore } from '../../core/planner-store';
import { Settings } from '../settings/settings';
import { FurnitureCatalog } from './furniture-catalog/furniture-catalog';

@Component({
  selector: 'app-toolbar',
  imports: [Settings, FurnitureCatalog],
  host: { role: 'banner' },
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
      row-gap: 8px;
      padding: 8px 12px;
      background: var(--bg-panel);
      border-bottom: 1px solid var(--border);
      min-height: 52px;
    }

    .brand {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 140px;
    }

    .brand h1 {
      margin: 0;
      font-weight: 400;
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-dim);
    }

    .brand input {
      background: transparent;
      border: none;
      color: var(--text);
      font: inherit;
      font-weight: 600;
      padding: 0;
      width: 160px;
    }

    .brand input:focus {
      outline: none;
      border-bottom: 1px solid var(--accent);
    }

    .group {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .split {
      width: 1px;
      align-self: stretch;
      background: var(--border);
      margin: 4px 4px;
    }

    button {
      background: var(--bg-panel-2);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 6px 10px;
      font: inherit;
      font-size: 13px;
      cursor: pointer;
    }

    button:hover {
      border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
    }

    button.active {
      background: color-mix(in srgb, var(--accent) 22%, var(--bg-panel-2));
      border-color: var(--accent);
    }

    button:disabled {
      opacity: 0.45;
      cursor: default;
    }

    .grow {
      flex: 1;
    }
  `,
  template: `
    <div class="brand">
      <h1>Floor planner</h1>
      <input [value]="store.plan().name" (change)="rename($event)" aria-label="Plan name" />
    </div>

    <div class="split"></div>

    <app-furniture-catalog />

    <div class="grow"></div>

    <app-settings />

    <div class="split"></div>

    <div class="group">
      <button
        type="button"
        [disabled]="!store.canGroup()"
        (click)="store.groupSelection()"
        title="Group (Ctrl+G)"
      >
        Group
      </button>
      <button
        type="button"
        [disabled]="!store.canUngroup()"
        (click)="store.ungroupSelection()"
        title="Ungroup (Ctrl+Shift+G)"
      >
        Ungroup
      </button>
      <button
        type="button"
        [disabled]="!store.canCopy()"
        (click)="store.copySelection()"
        title="Copy selected objects (Ctrl+C)"
      >
        Copy
      </button>
      <button
        type="button"
        [disabled]="!store.canPaste()"
        (click)="store.pasteClipboard()"
        title="Paste objects (Ctrl+V)"
      >
        Paste
      </button>
      <button
        type="button"
        [disabled]="!store.canUndo()"
        (click)="store.undo()"
        title="Undo (Ctrl+Z)"
      >
        Undo
      </button>
      <button
        type="button"
        [disabled]="!store.canRedo()"
        (click)="store.redo()"
        title="Redo (Ctrl+Y)"
      >
        Redo
      </button>
      <button type="button" (click)="store.zoomBy(1 / 1.15)" title="Zoom out">−</button>
      <button type="button" (click)="store.zoomBy(1.15)" title="Zoom in">+</button>
      <button type="button" (click)="store.fitToView()" title="Fit (Ctrl+0)">Fit</button>
    </div>
  `,
})
export class Toolbar {
  protected readonly store = inject(PlannerStore);

  protected rename(event: Event): void {
    const value = (event.target as HTMLInputElement).value.trim();
    this.store.setName(value || 'Floor plan');
  }
}
