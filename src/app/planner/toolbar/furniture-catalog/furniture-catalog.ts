import { Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { OBJECT_COLORS } from '../../../models/floor-plan';
import {
  filterFurniture,
  furniturePreview,
  FURNITURE_CATEGORIES,
  type FurnitureItem,
  type FurniturePreview,
} from '../../../core/furniture';
import { formatLength } from '../../../core/units';
import { PlannerStore } from '../../../core/planner-store';

@Component({
  selector: 'app-furniture-catalog',
  styles: `
    .trigger {
      background: var(--bg-panel-2);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 6px 10px;
      font: inherit;
      font-size: 13px;
      cursor: pointer;
    }
    dialog {
      border: 1px solid var(--border);
      border-radius: 16px;
      background: var(--bg-panel);
      color: var(--text);
      padding: 0;
      width: min(720px, calc(100vw - 32px));
      max-height: calc(100vh - 48px);
    }
    dialog::backdrop {
      background: rgb(0 0 0 / 45%);
    }
    .panel {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-height: calc(100vh - 80px);
      box-sizing: border-box;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    h2 {
      margin: 0;
      font-size: 17px;
    }
    .close {
      background: transparent;
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 8px;
      width: 2rem;
      height: 2rem;
      cursor: pointer;
      font: inherit;
    }
    .search {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 12px;
      color: var(--text-dim);
    }
    .search input {
      background: var(--bg);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 8px 10px;
      font: inherit;
      font-size: 13px;
    }
    .grid-wrap {
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    h3 {
      margin: 0 0 8px;
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-dim);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
      gap: 8px;
    }
    .tile {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 8px 6px;
      background: var(--bg-panel-2);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 10px;
      cursor: pointer;
      font: inherit;
    }
    .tile:hover,
    .tile:focus-visible {
      border-color: var(--accent);
      outline: none;
    }
    .tile svg {
      width: 84px;
      height: 56px;
    }
    .name {
      font-size: 12px;
      line-height: 1.25;
      text-align: center;
    }
    .size {
      font-size: 11px;
      color: var(--text-dim);
    }
    .empty {
      color: var(--text-dim);
      font-size: 13px;
      margin: 0;
    }
  `,
  template: `
    <button
      type="button"
      class="trigger"
      aria-haspopup="dialog"
      aria-controls="furniture-catalog"
      [attr.aria-expanded]="opened()"
      (click)="open()"
    >
      Add furniture…
    </button>
    <dialog
      #dialog
      id="furniture-catalog"
      aria-labelledby="furniture-catalog-title"
      (click)="onDialogClick($event)"
      (close)="opened.set(false)"
    >
      <div class="panel">
        <header>
          <h2 id="furniture-catalog-title">Add furniture</h2>
          <button
            type="button"
            class="close"
            aria-label="Close furniture catalog"
            (click)="close()"
          >
            ×
          </button>
        </header>
        <label class="search"
          >Search furniture
          <input
            type="search"
            [value]="query()"
            (input)="query.set(inputValue($event))"
            placeholder="Name or room, e.g. sofa or bathroom"
          />
        </label>
        <div class="grid-wrap">
          @for (category of categories; track category) {
            @if (itemsIn(category).length) {
              <section [attr.aria-label]="category">
                <h3>{{ category }}</h3>
                <div class="grid">
                  @for (item of itemsIn(category); track item.id) {
                    <button
                      type="button"
                      class="tile"
                      [attr.aria-label]="
                        'Add ' + item.name + ', ' + size(item.width) + ' by ' + size(item.depth)
                      "
                      (click)="add(item)"
                    >
                      <svg viewBox="0 0 100 70" aria-hidden="true" focusable="false">
                        @let pv = preview(item);
                        @if (item.kind === 'circle') {
                          <ellipse
                            [attr.cx]="pv.body.x + pv.body.w / 2"
                            [attr.cy]="pv.body.y + pv.body.h / 2"
                            [attr.rx]="pv.body.rx"
                            [attr.ry]="pv.body.ry"
                            [attr.fill]="fill(item)"
                            fill-opacity="0.82"
                            stroke="#0d1117"
                          />
                        } @else {
                          <rect
                            [attr.x]="pv.body.x"
                            [attr.y]="pv.body.y"
                            [attr.width]="pv.body.w"
                            [attr.height]="pv.body.h"
                            [attr.fill]="fill(item)"
                            fill-opacity="0.82"
                            stroke="#0d1117"
                          />
                        }
                        @if (pv.door; as door) {
                          <line
                            [attr.x1]="door.frontStart.x"
                            [attr.y1]="door.frontStart.y"
                            [attr.x2]="door.frontEnd.x"
                            [attr.y2]="door.frontEnd.y"
                            stroke="#f5f7fa"
                            stroke-width="1.6"
                          />
                          <line
                            [attr.x1]="door.hinge.x"
                            [attr.y1]="door.hinge.y"
                            [attr.x2]="door.leafEnd.x"
                            [attr.y2]="door.leafEnd.y"
                            stroke="#f5f7fa"
                            stroke-width="1.6"
                          />
                          <path
                            [attr.d]="door.arcPath"
                            fill="none"
                            stroke="#f5f7fa"
                            stroke-width="1.4"
                          />
                        }
                      </svg>
                      <span class="name">{{ item.name }}</span>
                      <span class="size">{{ size(item.width) }} × {{ size(item.depth) }}</span>
                    </button>
                  }
                </div>
              </section>
            }
          }
          @if (!filtered().length) {
            <p class="empty">No furniture matches that search.</p>
          }
        </div>
      </div>
    </dialog>
  `,
})
export class FurnitureCatalog {
  protected readonly store = inject(PlannerStore);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  protected readonly opened = signal(false);
  protected readonly query = signal('');
  protected readonly categories = FURNITURE_CATEGORIES;
  protected readonly filtered = computed(() => filterFurniture(this.query()));

  protected itemsIn(category: string): FurnitureItem[] {
    return this.filtered().filter((item) => item.category === category);
  }
  protected fill(item: FurnitureItem): string {
    return OBJECT_COLORS[item.kind];
  }
  protected size(meters: number): string {
    return formatLength(meters, this.store.lengthUnit());
  }
  protected preview(item: FurnitureItem): FurniturePreview {
    return furniturePreview(item);
  }
  protected open(): void {
    const d = this.dialog().nativeElement;
    if (!d.open) {
      this.opened.set(true);
      d.showModal();
    }
  }
  protected close(): void {
    const d = this.dialog().nativeElement;
    if (d.open) d.close();
    this.opened.set(false);
  }
  protected onDialogClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }
  protected add(item: FurnitureItem): void {
    this.store.addFurniture(item.id);
    this.close();
  }
  protected inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
