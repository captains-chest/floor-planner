import type { ToolbarTool, ToolGroup, ToolGuide } from './models';

const guide = (id: ToolbarTool, body: Omit<ToolGuide, 'id'>): ToolGuide => ({ id, ...body });

/** Shown text and the key that selects the tool. Planner key handling reads this same list. */
export const TOOL_GUIDES = {
  select: guide('select', {
    label: 'Select',
    shortcut: 'V',
    summary: 'Click to pick. Drag right for inside, left for touched.',
    tips: [
      { keys: ['Shift'], text: 'adds to the selection' },
      { keys: ['Ctrl', '⌘'], text: 'snaps to corners' },
      { keys: ['Alt', '⌥'], text: '90° move, 45° turn' },
    ],
  }),
  pan: guide('pan', {
    label: 'Pan',
    shortcut: 'H',
    summary: 'Drag the plan. Scroll to zoom.',
    tips: [{ keys: ['Space'], text: 'pans from any tool' }],
  }),
  measure: guide('measure', {
    label: 'Measure',
    shortcut: 'M',
    summary: 'Click start, end, then the dimension. Snaps to corners.',
    tips: [
      { keys: ['Alt', '⌥'], text: 'locks to 90°' },
      { keys: ['Shift'], text: 'turns snap off' },
    ],
  }),
  rect: guide('rect', {
    label: 'Rectangle',
    shortcut: 'R',
    summary: 'Drag to draw a rectangle.',
    tips: [],
  }),
  circle: guide('circle', {
    label: 'Circle',
    shortcut: 'C',
    summary: 'Drag to draw a circle.',
    tips: [],
  }),
  ellipse: guide('ellipse', {
    label: 'Ellipse',
    shortcut: 'E',
    summary: 'Drag to draw an ellipse.',
    tips: [],
  }),
  wall: guide('wall', {
    label: 'Wall',
    shortcut: 'W',
    summary: 'Click the start, then the end, for one straight wall. Snaps to other walls.',
    tips: [
      { keys: ['Alt', '⌥'], text: 'locks to 90°' },
      { keys: ['Shift'], text: 'turns snap off' },
      { keys: ['Enter'], text: 'stops placing walls' },
    ],
  }),
  door: guide('door', {
    label: 'Door',
    shortcut: 'D',
    summary: 'Click to place a door. Snaps to walls and edges.',
    tips: [{ keys: ['Shift'], text: 'turns snap off' }],
  }),
  window: guide('window', {
    label: 'Window',
    shortcut: 'N',
    summary: 'Click to place a window. Snaps to walls and edges.',
    tips: [{ keys: ['Shift'], text: 'turns snap off' }],
  }),
} as const satisfies Record<ToolbarTool, ToolGuide>;

export const TOOL_GROUPS: readonly ToolGroup[] = [
  { name: 'Navigate', tools: [TOOL_GUIDES.select, TOOL_GUIDES.pan] },
  { name: 'Measure', tools: [TOOL_GUIDES.measure] },
  { name: 'Objects', tools: [TOOL_GUIDES.rect, TOOL_GUIDES.circle, TOOL_GUIDES.ellipse] },
  { name: 'Structure', tools: [TOOL_GUIDES.wall, TOOL_GUIDES.door, TOOL_GUIDES.window] },
];

const TOOL_GUIDE_LIST: readonly ToolGuide[] = Object.values(TOOL_GUIDES);

export function toolForShortcut(key: string): ToolbarTool | null {
  const normalized = key.toLowerCase();
  return TOOL_GUIDE_LIST.find((item) => item.shortcut.toLowerCase() === normalized)?.id ?? null;
}
