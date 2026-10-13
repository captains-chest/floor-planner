import type { Tool } from '../../models/floor-plan';

/** Tools in the toolbox. Scale is a one-time setup step started from Settings. */
export type ToolbarTool = Exclude<Tool, 'scale'>;

export interface ToolKeyTip {
  /** Keys that can be held together. `Ctrl` or `⌘` means either one. */
  readonly keys: readonly string[];
  readonly text: string;
}

export interface ToolGuide {
  readonly id: ToolbarTool;
  readonly label: string;
  readonly shortcut: string;
  readonly summary: string;
  readonly tips: readonly ToolKeyTip[];
}

export interface ToolGroup {
  readonly name: string;
  readonly tools: readonly ToolGuide[];
}
