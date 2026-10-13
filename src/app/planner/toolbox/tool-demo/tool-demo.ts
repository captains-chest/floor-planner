import { Component, input } from '@angular/core';
import type { Tool } from '../../../models/floor-plan';

@Component({
  selector: 'div[app-tool-demo]',
  templateUrl: './tool-demo.html',
  styleUrl: './tool-demo.css',
  host: {
    'aria-hidden': 'true',
    '[attr.data-tool]': 'tool()',
  },
})
export class ToolDemo {
  readonly tool = input.required<Tool>();
}
