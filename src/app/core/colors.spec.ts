import { describe, expect, it } from 'vite-plus/test';
import {
  MEASUREMENT_COLOR,
  measurementColor,
  normalizeColor,
  OBJECT_BORDER_COLOR,
  OBJECT_COLORS,
  objectBorderColor,
  objectFill,
  objectColor,
} from '../models/floor-plan';
import { parseProjectDocument, PROJECT_KIND } from './persistence';

describe('colors', () => {
  it('normalizes hex colors and rejects anything else', () => {
    expect(normalizeColor('#AbC')).toBe('#aabbcc');
    expect(normalizeColor(' #11AA22 ')).toBe('#11aa22');
    expect(normalizeColor('red')).toBeUndefined();
    expect(normalizeColor('#12345')).toBeUndefined();
    expect(normalizeColor(42)).toBeUndefined();
  });

  it('falls back to the default color when none is set', () => {
    expect(objectColor({ kind: 'circle' })).toBe(OBJECT_COLORS.circle);
    expect(objectColor({ kind: 'rect', color: '#123456' })).toBe('#123456');
    expect(measurementColor({})).toBe(MEASUREMENT_COLOR);
    expect(measurementColor({ color: '#654321' })).toBe('#654321');
    expect(objectBorderColor({})).toBe(OBJECT_BORDER_COLOR);
    expect(objectFill({ kind: 'rect' })).toBe(OBJECT_COLORS.rect);
    expect(objectFill({ kind: 'rect', color: 'transparent' })).toBe('transparent');
    expect(objectBorderColor({ borderColor: '#123123' })).toBe('#123123');
  });

  it('round-trips transparent fill, drops transparent/invalid borders, older saves unchanged', () => {
    const parsed = parseProjectDocument({
      kind: PROJECT_KIND,
      formatVersion: 1,
      plan: {
        version: 1,
        name: 'T',
        objects: [
          {
            id: 'a',
            kind: 'rect',
            name: 'A',
            x: 0,
            y: 0,
            width: 1,
            depth: 1,
            rotation: 0,
            groupId: null,
            color: 'transparent',
            borderColor: 'transparent',
          },
        ],
        measurements: [],
        groups: [],
        viewport: { panX: 0, panY: 0, zoom: 40 },
      },
    });
    expect(parsed!.plan.objects[0].color).toBe('transparent');
    expect('borderColor' in parsed!.plan.objects[0]).toBe(false);
  });

  it('keeps a saved border color, drops invalid ones, and older saves have no border', () => {
    const parsed = parseProjectDocument({
      kind: PROJECT_KIND,
      formatVersion: 1,
      plan: {
        version: 1,
        name: 'B',
        objects: [
          {
            id: 'a',
            kind: 'rect',
            name: 'A',
            x: 0,
            y: 0,
            width: 1,
            depth: 1,
            rotation: 0,
            groupId: null,
            borderColor: '#00AAFF',
          },
          {
            id: 'b',
            kind: 'rect',
            name: 'B',
            x: 0,
            y: 0,
            width: 1,
            depth: 1,
            rotation: 0,
            groupId: null,
            borderColor: 'red',
          },
          {
            id: 'c',
            kind: 'rect',
            name: 'C',
            x: 0,
            y: 0,
            width: 1,
            depth: 1,
            rotation: 0,
            groupId: null,
          },
        ],
        measurements: [],
        groups: [],
        viewport: { panX: 0, panY: 0, zoom: 40 },
      },
    });
    expect(parsed!.plan.objects[0].borderColor).toBe('#00aaff');
    expect('borderColor' in parsed!.plan.objects[1]).toBe(false);
    expect('borderColor' in parsed!.plan.objects[2]).toBe(false);
  });

  it('keeps saved colors, drops invalid ones, and loads older saves without colors', () => {
    const parsed = parseProjectDocument({
      kind: PROJECT_KIND,
      formatVersion: 1,
      plan: {
        version: 1,
        name: 'Colors',
        objects: [
          {
            id: 'a',
            kind: 'rect',
            name: 'A',
            x: 0,
            y: 0,
            width: 1,
            depth: 1,
            rotation: 0,
            groupId: null,
            color: '#FF0000',
          },
          {
            id: 'b',
            kind: 'rect',
            name: 'B',
            x: 0,
            y: 0,
            width: 1,
            depth: 1,
            rotation: 0,
            groupId: null,
            color: 'javascript:1',
          },
          {
            id: 'c',
            kind: 'rect',
            name: 'C',
            x: 0,
            y: 0,
            width: 1,
            depth: 1,
            rotation: 0,
            groupId: null,
          },
        ],
        measurements: [
          { id: 'm1', start: { x: 0, y: 0 }, end: { x: 1, y: 0 }, offset: 0, color: '#00ff00' },
          { id: 'm2', start: { x: 0, y: 0 }, end: { x: 1, y: 0 }, offset: 0 },
        ],
        groups: [],
        viewport: { panX: 0, panY: 0, zoom: 40 },
      },
    });
    const objects = parsed!.plan.objects;
    expect(objects[0].color).toBe('#ff0000');
    expect('color' in objects[1]).toBe(false);
    expect('color' in objects[2]).toBe(false);
    expect(parsed!.plan.measurements[0].color).toBe('#00ff00');
    expect('color' in parsed!.plan.measurements[1]).toBe(false);
  });
});
