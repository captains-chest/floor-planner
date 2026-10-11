import { Component, inject } from '@angular/core';
import { PlannerStore } from '../../core/planner-store';

@Component({
  selector: 'app-toolbar',
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

    .units {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .units span {
      font-size: 11px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--text-dim);
      margin-right: 2px;
    }

    .units button {
      min-width: 2.4rem;
      padding: 6px 8px;
    }
  `,
  template: `
    <div class="brand">
      <h1>Floor planner</h1>
      <input [value]="store.plan().name" (change)="rename($event)" aria-label="Plan name" />
    </div>

    <div class="split"></div>

    <div class="group">
      <button type="button" (click)="fileInput.click()">Import image</button>
      <input #fileInput type="file" accept="image/*" hidden (change)="onFile($event)" />
      <button
        type="button"
        (click)="exportProject()"
        title="Download the full plan, image, and scale"
      >
        Export
      </button>
      <button
        type="button"
        (click)="projectInput.click()"
        title="Open a previously exported project"
      >
        Import project
      </button>
      <input
        #projectInput
        type="file"
        accept=".json,application/json"
        hidden
        (change)="onProjectFile($event)"
      />
    </div>

    <div class="grow"></div>

    <div class="units" role="group" aria-label="Length unit">
      <span>Units</span>
      <button
        type="button"
        [class.active]="store.lengthUnit() === 'm'"
        [attr.aria-pressed]="store.lengthUnit() === 'm'"
        (click)="store.setLengthUnit('m')"
      >
        m
      </button>
      <button
        type="button"
        [class.active]="store.lengthUnit() === 'cm'"
        [attr.aria-pressed]="store.lengthUnit() === 'cm'"
        (click)="store.setLengthUnit('cm')"
      >
        cm
      </button>
    </div>

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

  protected async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0);
    if (file) {
      try {
        await this.store.importImageFile(file);
      } catch {
        this.store.setStatus('Could not import that image.');
      }
    }
    input.value = '';
  }

  protected exportProject(): void {
    const { filename, json } = this.store.exportProject();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    this.store.setStatus('Project exported.');
  }

  protected async onProjectFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0);
    if (file) {
      try {
        await this.store.importProjectFile(file);
      } catch {
        this.store.setStatus('Could not import that project file.');
      }
    }
    input.value = '';
  }
}
