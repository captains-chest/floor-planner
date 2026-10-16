import { NgComponentOutlet } from '@angular/common';
import {
  afterNextRender,
  afterRenderEffect,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
  type Type,
} from '@angular/core';
import { MsrArrowSelectorToolIconComponent } from '@captains-chest/material-symbols-rounded-icons/arrow-selector-tool';
import { MsrCircleIconComponent } from '@captains-chest/material-symbols-rounded-icons/circle';
import { MsrPanToolAltIconComponent } from '@captains-chest/material-symbols-rounded-icons/pan-tool-alt';
import { MsrRectangleIconComponent } from '@captains-chest/material-symbols-rounded-icons/rectangle';
import { MsrStadiumIconComponent } from '@captains-chest/material-symbols-rounded-icons/stadium';
import { MsrStraightenIconComponent } from '@captains-chest/material-symbols-rounded-icons/straighten';
import { MsrfArrowSelectorToolIconComponent } from '@captains-chest/material-symbols-rounded-icons-filled/arrow-selector-tool';
import { MsrfCircleIconComponent } from '@captains-chest/material-symbols-rounded-icons-filled/circle';
import { MsrfPanToolAltIconComponent } from '@captains-chest/material-symbols-rounded-icons-filled/pan-tool-alt';
import { MsrfRectangleIconComponent } from '@captains-chest/material-symbols-rounded-icons-filled/rectangle';
import { MsrfStadiumIconComponent } from '@captains-chest/material-symbols-rounded-icons-filled/stadium';
import { MsrfStraightenIconComponent } from '@captains-chest/material-symbols-rounded-icons-filled/straighten';
import { PlannerStore } from '../../core/planner-store';
import {
  TOOL_PREVIEW_CLOSE_DELAY_MS,
  TOOL_PREVIEW_GAP_PX,
  TOOL_PREVIEW_MARGIN_PX,
  TOOL_PREVIEW_OPEN_DELAY_MS,
  TOOL_PREVIEW_WIDTH_PX,
} from './constants';
import { boundsFromRect, placeToolPreview, type ToolPreviewPlacement } from './functions';
import type { ToolbarTool, ToolGuide } from './models';
import { TOOL_GROUPS } from './tool-guides';
import { ToolPreview } from './tool-preview/tool-preview';

const PREVIEW_ID = 'tool-preview';

const TOOL_ICONS = {
  select: {
    icon: MsrArrowSelectorToolIconComponent,
    activeIcon: MsrfArrowSelectorToolIconComponent,
  },
  pan: {
    icon: MsrPanToolAltIconComponent,
    activeIcon: MsrfPanToolAltIconComponent,
  },
  measure: {
    icon: MsrStraightenIconComponent,
    activeIcon: MsrfStraightenIconComponent,
  },
  rect: {
    icon: MsrRectangleIconComponent,
    activeIcon: MsrfRectangleIconComponent,
  },
  circle: {
    icon: MsrCircleIconComponent,
    activeIcon: MsrfCircleIconComponent,
  },
  ellipse: {
    icon: MsrStadiumIconComponent,
    activeIcon: MsrfStadiumIconComponent,
  },
} as const satisfies Record<ToolbarTool, { icon: Type<unknown>; activeIcon: Type<unknown> }>;

@Component({
  selector: 'app-toolbox',
  imports: [NgComponentOutlet, ToolPreview],
  host: {
    role: 'toolbar',
    'aria-label': 'Tools',
    'aria-orientation': 'vertical',
  },
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: 6px 4px;
      background: var(--bg-panel);
      border-right: 1px solid var(--border);
      min-height: 0;
      width: 2.5rem;
      z-index: 2;
    }

    .group {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
    }

    .split {
      width: 1.25rem;
      height: 1px;
      margin: 4px 0;
      background: var(--border);
    }

    button {
      position: relative;
      display: grid;
      place-items: center;
      width: 2rem;
      height: 2rem;
      padding: 0;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: var(--text-dim);
      cursor: pointer;
    }

    button:hover {
      background: var(--bg-panel-2);
      color: var(--text);
    }

    button.active {
      background: color-mix(in srgb, var(--accent) 22%, var(--bg-panel-2));
      color: var(--accent);
    }

    .glyph {
      display: grid;
      place-items: center;
      font-size: 1.25rem;
    }
  `,
  template: `
    @for (group of groups; track group.name; let last = $last) {
      <div class="group" role="group" [attr.aria-label]="group.name">
        @for (tool of group.tools; track tool.id) {
          <button
            type="button"
            [class.active]="store.tool() === tool.id"
            [attr.aria-pressed]="store.tool() === tool.id"
            [attr.aria-label]="tool.label + ' (' + tool.shortcut + ')'"
            [attr.aria-describedby]="openGuide()?.id === tool.id ? previewId : null"
            (click)="store.setTool(tool.id)"
            (pointerenter)="onToolPointerEnter(tool, $event)"
            (pointerleave)="onToolPointerLeave()"
            (focus)="onToolFocus(tool, $event)"
            (blur)="onToolBlur()"
          >
            <span class="glyph" aria-hidden="true">
              <ng-container
                [ngComponentOutlet]="
                  store.tool() === tool.id ? icons[tool.id].activeIcon : icons[tool.id].icon
                "
              />
            </span>
          </button>
        }
      </div>
      @if (!last) {
        <div class="split"></div>
      }
    }
    @if (openGuide(); as guide) {
      <div #preview app-tool-preview [id]="previewId" [guide]="guide" aria-hidden="true"></div>
    }
  `,
})
export class Toolbox {
  protected readonly store = inject(PlannerStore);
  readonly #host = inject(ElementRef<HTMLElement>);
  readonly #destroyRef = inject(DestroyRef);
  // viewChild reads the property by name, so this cannot be a # field.
  private readonly preview = viewChild('preview', { read: ElementRef });

  protected readonly groups = TOOL_GROUPS;
  protected readonly icons = TOOL_ICONS;
  protected readonly previewId = PREVIEW_ID;
  protected readonly openGuide = signal<ToolGuide | null>(null);

  readonly #anchor = signal<HTMLElement | null>(null);
  readonly #layoutTick = signal(0);
  #openTimer: ReturnType<typeof setTimeout> | null = null;
  #closeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    afterRenderEffect({
      earlyRead: () => this.#measurePreview(),
      write: (measured) => {
        const { placement, preview } = measured();
        this.#placePreview(preview, placement);
      },
    });

    afterNextRender(() => {
      const onResize = () => this.#layoutTick.update((tick) => tick + 1);
      window.addEventListener('resize', onResize);
      this.#destroyRef.onDestroy(() => {
        window.removeEventListener('resize', onResize);
        this.#clearTimers();
      });

      const canvas = this.#canvasElement();
      if (!canvas) {
        return;
      }
      const observer = new ResizeObserver(() => this.#layoutTick.update((tick) => tick + 1));
      observer.observe(canvas);
      this.#destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  protected onToolPointerEnter(guide: ToolGuide, event: PointerEvent): void {
    const delay = this.openGuide() ? 0 : TOOL_PREVIEW_OPEN_DELAY_MS;
    this.#scheduleOpen(guide, event.currentTarget as HTMLElement, delay);
  }

  protected onToolFocus(guide: ToolGuide, event: FocusEvent): void {
    const button = event.currentTarget as HTMLElement;
    if (!button.matches(':focus-visible')) {
      return;
    }
    this.#scheduleOpen(guide, button, 0);
  }

  protected onToolPointerLeave(): void {
    this.#scheduleClose();
  }

  protected onToolBlur(): void {
    this.#scheduleClose();
  }

  #scheduleOpen(guide: ToolGuide, anchor: HTMLElement, delayMs: number): void {
    this.#clearClose();
    this.#anchor.set(anchor);
    if (this.openGuide()?.id === guide.id) {
      return;
    }
    this.#clearOpen();
    if (delayMs <= 0) {
      this.openGuide.set(guide);
      return;
    }
    this.#openTimer = setTimeout(() => {
      this.#openTimer = null;
      this.openGuide.set(guide);
    }, delayMs);
  }

  #scheduleClose(): void {
    this.#clearOpen();
    if (this.#closeTimer !== null) {
      return;
    }
    this.#closeTimer = setTimeout(() => {
      this.#closeTimer = null;
      this.openGuide.set(null);
      this.#anchor.set(null);
    }, TOOL_PREVIEW_CLOSE_DELAY_MS);
  }

  #clearOpen(): void {
    if (this.#openTimer !== null) {
      clearTimeout(this.#openTimer);
      this.#openTimer = null;
    }
  }

  #clearClose(): void {
    if (this.#closeTimer !== null) {
      clearTimeout(this.#closeTimer);
      this.#closeTimer = null;
    }
  }

  #clearTimers(): void {
    this.#clearOpen();
    this.#clearClose();
  }

  /** Floor-plan view. The preview has to stay inside this box. */
  #canvasElement(): HTMLElement | null {
    return this.#host.nativeElement.closest('app-planner')?.querySelector('app-canvas') ?? null;
  }

  #measurePreview(): { placement: ToolPreviewPlacement | null; preview: HTMLElement | null } {
    this.#layoutTick();
    const guide = this.openGuide();
    const anchor = this.#anchor();
    const element = this.preview()?.nativeElement;
    const preview = element instanceof HTMLElement ? element : null;
    if (!guide || !anchor || !preview) {
      return { placement: null, preview };
    }
    const canvas = this.#canvasElement();
    if (!canvas) {
      return { placement: null, preview };
    }
    const canvasBox = boundsFromRect(canvas.getBoundingClientRect());
    if (canvasBox.width < 1 || canvasBox.height < 1) {
      return { placement: null, preview };
    }
    const style = getComputedStyle(preview);
    const borderY = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    // The placed height is locked after the first frame. Release it so a shorter
    // tool is measured at its own size, then the write phase locks it again.
    const lockedHeight = preview.style.height;
    preview.style.height = 'auto';
    const height = Math.ceil(preview.scrollHeight + borderY);
    preview.style.height = lockedHeight;
    if (height < 1) {
      return { placement: null, preview };
    }
    return {
      placement: placeToolPreview(
        boundsFromRect(anchor.getBoundingClientRect()),
        canvasBox,
        { width: TOOL_PREVIEW_WIDTH_PX, height },
        TOOL_PREVIEW_GAP_PX,
        TOOL_PREVIEW_MARGIN_PX,
      ),
      preview,
    };
  }

  #placePreview(preview: HTMLElement | null, placement: ToolPreviewPlacement | null): void {
    if (!preview) {
      return;
    }
    if (!placement) {
      preview.classList.remove('placed');
      preview.setAttribute('aria-hidden', 'true');
      return;
    }
    preview.style.left = `${placement.left}px`;
    preview.style.top = `${placement.top}px`;
    preview.style.width = `${placement.width}px`;
    preview.style.height = `${placement.height}px`;
    preview.style.maxHeight = `${placement.maxHeight}px`;
    preview.classList.add('placed');
    preview.removeAttribute('aria-hidden');
  }
}
