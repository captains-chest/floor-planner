import type { Tool } from '../../models/floor-plan';

export interface ToolKeyTip {
  /** Keys that can be held together. `Ctrl` or `⌘` means either one. */
  readonly keys: readonly string[];
  readonly text: string;
}

export interface ToolGuide {
  readonly id: Tool;
  readonly label: string;
  readonly shortcut: string;
  readonly summary: string;
  readonly tips: readonly ToolKeyTip[];
}

export interface ToolGroup {
  readonly name: string;
  readonly tools: readonly ToolGuide[];
}
