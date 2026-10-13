import { describe, expect, it } from 'vitest';
import type { ToolbarTool } from './models';
import { TOOL_GROUPS, TOOL_GUIDES, toolForShortcut } from './tool-guides';

const tools = TOOL_GROUPS.flatMap((group) => group.tools);

describe('tool guides', () => {
  it('shows every tool once, with a summary and a unique shortcut', () => {
    const ids = tools.map((tool) => tool.id);
    expect(ids).toEqual(Object.keys(TOOL_GUIDES));
    expect(new Set(ids).size).toBe(ids.length);

    const shortcuts = tools.map((tool) => tool.shortcut);
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
    for (const tool of tools) {
      expect(tool.summary.trim().length).toBeGreaterThan(0);
      expect(tool.label.trim().length).toBeGreaterThan(0);
      expect(tool.shortcut).toMatch(/^[A-Z]$/);
    }
  });

  it('uses the same shortcut the keyboard uses to pick the tool', () => {
    const keys: Record<ToolbarTool, string> = {
      select: 'v',
      pan: 'h',
      measure: 'm',
      rect: 'r',
      circle: 'c',
      ellipse: 'e',
    };
    for (const id of Object.keys(keys) as ToolbarTool[]) {
      expect(toolForShortcut(keys[id])).toBe(id);
      expect(toolForShortcut(keys[id].toUpperCase())).toBe(id);
    }
    expect(toolForShortcut('x')).toBeNull();
    // Scale moved to Settings: it is a one-time step, not a toolbox tool.
    expect(toolForShortcut('s')).toBeNull();
    expect(toolForShortcut('')).toBeNull();
  });
});
