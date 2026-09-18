import { NgComponentOutlet } from '@angular/common';
import { Component, Type, inject } from '@angular/core';
import {
  MsrArrowSelectorToolIconComponent,
  MsrBrickIconComponent,
  MsrCircleIconComponent,
  MsrPanToolAltIconComponent,
  MsrRectangleIconComponent,
  MsrSpaceDashboardIconComponent,
  MsrSquareFootIconComponent,
  MsrStadiumIconComponent,
  MsrStraightenIconComponent,
} from '@captains-chest/material-symbols-rounded-icons';
import {
  MsrfArrowSelectorToolIconComponent,
  MsrfBrickIconComponent,
  MsrfCircleIconComponent,
  MsrfPanToolAltIconComponent,
  MsrfRectangleIconComponent,
  MsrfSpaceDashboardIconComponent,
  MsrfSquareFootIconComponent,
  MsrfStadiumIconComponent,
  MsrfStraightenIconComponent,
} from '@captains-chest/material-symbols-rounded-icons-filled';
import { PlannerStore } from '../../core/planner-store';
import { Tool } from '../../models/floor-plan';

interface ToolButton {
  id: Tool;
  label: string;
  shortcut: string;
  icon: Type<unknown>;
  activeIcon: Type<unknown>;
}

@Component({
  selector: 'app-toolbox',
  imports: [NgComponentOutlet],
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

    .tip {
      position: absolute;
      left: calc(100% + 10px);
      top: 50%;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 8px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--bg-panel-2);
      color: var(--text);
      font-size: 12px;
      line-height: 1;
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      visibility: hidden;
      transform: translateY(-50%);
      box-shadow: 0 8px 24px rgb(0 0 0 / 35%);
      z-index: 3;
      transition:
        opacity 80ms ease,
        visibility 80ms ease;
    }

    button:hover .tip,
    button:focus-visible .tip {
      opacity: 1;
      visibility: visible;
      transition-delay: 180ms;
    }

    kbd {
      padding: 1px 5px;
      border: 1px solid var(--border);
      border-radius: 4px;
      background: var(--bg);
      color: var(--text-dim);
      font-size: 10px;
      font-family: inherit;
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
            (click)="store.setTool(tool.id)"
          >
            <span class="glyph" aria-hidden="true">
              <ng-container
                [ngComponentOutlet]="store.tool() === tool.id ? tool.activeIcon : tool.icon"
              />
            </span>
            <span class="tip" role="tooltip">
              {{ tool.label }}
              <kbd>{{ tool.shortcut }}</kbd>
            </span>
          </button>
        }
      </div>
      @if (!last) {
        <div class="split"></div>
      }
    }
  `,
})
export class Toolbox {
  protected readonly store = inject(PlannerStore);

  protected readonly groups: { name: string; tools: ToolButton[] }[] = [
    {
      name: 'Navigate',
      tools: [
        {
          id: 'select',
          label: 'Select',
          shortcut: 'V',
          icon: MsrArrowSelectorToolIconComponent,
          activeIcon: MsrfArrowSelectorToolIconComponent,
        },
        {
          id: 'pan',
          label: 'Pan',
          shortcut: 'H',
          icon: MsrPanToolAltIconComponent,
          activeIcon: MsrfPanToolAltIconComponent,
        },
      ],
    },
    {
      name: 'Measure',
      tools: [
        {
          id: 'scale',
          label: 'Scale',
          shortcut: 'S',
          icon: MsrSquareFootIconComponent,
          activeIcon: MsrfSquareFootIconComponent,
        },
        {
          id: 'measure',
          label: 'Measure',
          shortcut: 'M',
          icon: MsrStraightenIconComponent,
          activeIcon: MsrfStraightenIconComponent,
        },
      ],
    },
    {
      name: 'Draw',
      tools: [
        {
          id: 'wall',
          label: 'Wall',
          shortcut: 'W',
          icon: MsrBrickIconComponent,
          activeIcon: MsrfBrickIconComponent,
        },
        {
          id: 'room',
          label: 'Room',
          shortcut: 'G',
          icon: MsrSpaceDashboardIconComponent,
          activeIcon: MsrfSpaceDashboardIconComponent,
        },
      ],
    },
    {
      name: 'Objects',
      tools: [
        {
          id: 'rect',
          label: 'Rect',
          shortcut: 'R',
          icon: MsrRectangleIconComponent,
          activeIcon: MsrfRectangleIconComponent,
        },
        {
          id: 'circle',
          label: 'Circle',
          shortcut: 'C',
          icon: MsrCircleIconComponent,
          activeIcon: MsrfCircleIconComponent,
        },
        {
          id: 'ellipse',
          label: 'Ellipse',
          shortcut: 'E',
          icon: MsrStadiumIconComponent,
          activeIcon: MsrfStadiumIconComponent,
        },
      ],
    },
  ];
}
