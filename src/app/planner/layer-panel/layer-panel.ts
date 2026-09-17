import { Component, inject, signal } from '@angular/core';
import { PlannerStore } from '../../core/planner-store';

@Component({
  selector: 'app-layer-panel',
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      background: var(--bg-panel);
      border-right: 1px solid var(--border);
      min-width: 220px;
      min-height: 0;
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
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

    .list {
      overflow: auto;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .layer {
      display: grid;
      grid-template-columns: auto auto 1fr auto;
      gap: 4px;
      align-items: center;
      padding: 6px;
      border-radius: 8px;
      border: 1px solid transparent;
    }

    .layer.active {
      background: var(--bg-panel-2);
      border-color: var(--border);
    }

    .name {
      border: none;
      background: transparent;
      color: var(--text);
      font: inherit;
      font-size: 13px;
      min-width: 0;
      text-align: left;
      cursor: pointer;
    }

    .name.editing {
      background: var(--bg);
      border: 1px solid var(--accent);
      border-radius: 4px;
      padding: 2px 6px;
      cursor: text;
    }

    button.icon {
      width: 28px;
      height: 28px;
      padding: 0;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: var(--bg-panel-2);
      color: var(--text);
      cursor: pointer;
    }

    button.icon.off {
      color: var(--text-dim);
      opacity: 0.55;
    }

    .ops {
      display: flex;
      gap: 2px;
    }

    .hint {
      padding: 8px 12px 12px;
      color: var(--text-dim);
      font-size: 12px;
      line-height: 1.4;
    }
  `,
  template: `
    <header>
      <h2>Layers</h2>
      <button class="icon" type="button" title="Add layer" (click)="store.addLayer()">+</button>
    </header>
    <div class="list">
      @for (layer of store.plan().layers; track layer.id; let i = $index) {
        <div class="layer" [class.active]="store.plan().activeLayerId === layer.id">
          <button
            class="icon"
            [class.off]="!layer.visible"
            type="button"
            [attr.aria-label]="layer.visible ? 'Hide layer' : 'Show layer'"
            (click)="store.patchLayer(layer.id, { visible: !layer.visible })"
          >
            {{ layer.visible ? '●' : '○' }}
          </button>
          <button
            class="icon"
            [class.off]="!layer.locked"
            type="button"
            [attr.aria-label]="layer.locked ? 'Unlock layer' : 'Lock layer'"
            (click)="store.patchLayer(layer.id, { locked: !layer.locked })"
          >
            {{ layer.locked ? '■' : '□' }}
          </button>
          @if (editingId() === layer.id) {
            <input
              class="name editing"
              [value]="layer.name"
              (blur)="commitName(layer.id, $event)"
              (keydown.enter)="commitName(layer.id, $event)"
              (keydown.escape)="editingId.set(null)"
            />
          } @else {
            <button
              class="name"
              type="button"
              (click)="store.setActiveLayer(layer.id)"
              (dblclick)="editingId.set(layer.id)"
            >
              {{ layer.name }}
            </button>
          }
          <span class="ops">
            <button class="icon" type="button" title="Move up in list" [disabled]="i === 0" (click)="store.moveLayer(layer.id, -1)">
              ↑
            </button>
            <button
              class="icon"
              type="button"
              title="Move down in list"
              [disabled]="i === store.plan().layers.length - 1"
              (click)="store.moveLayer(layer.id, 1)"
            >
              ↓
            </button>
            <button
              class="icon"
              type="button"
              title="Delete layer"
              [disabled]="store.plan().layers.length <= 1"
              (click)="store.removeLayer(layer.id)"
            >
              ×
            </button>
          </span>
        </div>
      }
    </div>
    <p class="hint">
      New walls and objects go on the active layer. Bottom of the list is drawn on top.
    </p>
  `,
})
export class LayerPanel {
  protected readonly store = inject(PlannerStore);
  protected readonly editingId = signal<string | null>(null);

  protected commitName(id: string, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.store.renameLayer(id, value);
    this.editingId.set(null);
  }
}
