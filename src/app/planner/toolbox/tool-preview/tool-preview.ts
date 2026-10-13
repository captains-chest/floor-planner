import { Component, input } from '@angular/core';
import { TOOL_PREVIEW_WIDTH_PX } from '../constants';
import type { ToolGuide } from '../models';
import { ToolDemo } from '../tool-demo/tool-demo';

@Component({
  selector: 'div[app-tool-preview]',
  imports: [ToolDemo],
  templateUrl: './tool-preview.html',
  styleUrl: './tool-preview.css',
  host: {
    role: 'tooltip',
    '[style.--preview-width]': 'previewWidth',
  },
})
export class ToolPreview {
  readonly guide = input.required<ToolGuide>();

  protected readonly previewWidth = `${TOOL_PREVIEW_WIDTH_PX}px`;
}
