import { describe, expect, it } from 'vite-plus/test';
import { createDefaultPlan, FloorPlan } from '../models/floor-plan';
import { exportFilename, renderPlanSvg, scaleBar } from './plan-export';

const plan = (patch: Partial<FloorPlan> = {}): FloorPlan => ({
  ...createDefaultPlan(),
  name: 'Flat <2nd> & "loft"',
  objects: [
    {
      id: 'a',
      kind: 'rect',
      name: 'Double bed',
      x: 0,
      y: 0,
      width: 1.6,
      depth: 2,
      rotation: 90,
      groupId: null,
    },
    {
      id: 'b',
      kind: 'circle',
      name: 'Round table',
      x: 3,
      y: 1,
      width: 1.1,
      depth: 1.1,
      rotation: 0,
      groupId: null,
    },
  ],
  measurements: [{ id: 'm', start: { x: 0, y: 3 }, end: { x: 4, y: 3 }, offset: 0.2 }],
  ...patch,
});

describe('renderPlanSvg', () => {
  it('draws every object with its name, rotation and measurement labels', () => {
    const { svg } = renderPlanSvg({ plan: plan(), imageDataUrl: null, lengthUnit: 'm' });
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('>Double bed</text>');
    expect(svg).toContain('>Round table</text>');
    expect(svg).toContain('rotate(90 0.8 1)');
    expect(svg).toContain('<ellipse');
    expect(svg).toContain('>4.00 m</text>');
  });

  it('uses custom object and measurement colors, defaults otherwise', () => {
    const base = plan();
    const colored = plan({
      objects: [{ ...base.objects[0], color: '#ff0000' }, base.objects[1]],
      measurements: [{ ...base.measurements[0], color: '#0000ff' }],
    });
    const { svg } = renderPlanSvg({ plan: colored, imageDataUrl: null, lengthUnit: 'm' });
    expect(svg).toContain('fill="#ff0000"');
    expect(svg).toContain('fill="#ffb07e"');
    expect(svg).toContain('stroke="#0000ff"');
    expect(svg).not.toContain('stroke="#0f7a68"');
    const plain = renderPlanSvg({ plan: base, imageDataUrl: null, lengthUnit: 'm' }).svg;
    expect(plain).toContain('stroke="#0f7a68"');
  });

  it('uses a custom object border in export, subtle hairline otherwise', () => {
    const base = plan();
    const bordered = plan({
      objects: [{ ...base.objects[0], borderColor: '#ff00aa' }, base.objects[1]],
    });
    const svg = renderPlanSvg({ plan: bordered, imageDataUrl: null, lengthUnit: 'm' }).svg;
    expect(svg).toContain('stroke="#ff00aa"');
    const plain = renderPlanSvg({ plan: base, imageDataUrl: null, lengthUnit: 'm' }).svg;
    expect(plain).not.toContain('stroke="#ff00aa"');
    expect(plain).toContain('stroke="none"');
  });

  it('exports transparent fill as no fill and no border stroke by default', () => {
    const base = plan();
    const clear = plan({
      objects: [{ ...base.objects[0], color: 'transparent' }, base.objects[1]],
    });
    const svg = renderPlanSvg({ plan: clear, imageDataUrl: null, lengthUnit: 'm' }).svg;
    expect(svg).toContain('fill="none"');
    expect(svg).toContain('stroke="none"');
  });

  it('exports partial opacity as alpha on fill and border', () => {
    const base = plan();
    const faded = plan({
      objects: [
        { ...base.objects[0], color: '#ff000080', borderColor: '#0000ff40' },
        base.objects[1],
      ],
    });
    const svg = renderPlanSvg({ plan: faded, imageDataUrl: null, lengthUnit: 'm' }).svg;
    expect(svg).toContain('fill="#ff0000" fill-opacity="0.4116"');
    expect(svg).toContain('stroke="#0000ff" stroke-opacity="0.251"');
  });

  it('draws walls as thick round-joined polylines', () => {
    const svg = renderPlanSvg({
      plan: plan({
        walls: [
          {
            id: 'w',
            points: [
              { x: 0, y: 0 },
              { x: 4, y: 0 },
              { x: 4, y: 2 },
            ],
            thickness: 0.24,
          },
        ],
      }),
      imageDataUrl: null,
      lengthUnit: 'm',
    }).svg;
    expect(svg).toContain('<line x1="0" y1="0" x2="4" y2="0"');
    expect(svg).toContain('stroke-width="0.24"');
    expect(svg).toContain('stroke-linecap="round"');
  });
  it('escapes the plan name in the title and header', () => {
    const { svg } = renderPlanSvg({ plan: plan(), imageDataUrl: null, lengthUnit: 'm' });
    expect(svg).toContain('<title>Flat &lt;2nd&gt; &amp; &quot;loft&quot;</title>');
    expect(svg).not.toContain('<2nd>');
  });

  it('fits the content plus a margin, longest side at the requested pixel size', () => {
    const { width, height, svg } = renderPlanSvg(
      { plan: plan(), imageDataUrl: null, lengthUnit: 'm' },
      { longSidePx: 1000 },
    );
    // Content spans x -0.2..4.1 (the rotated bed starts at -0.2), y from 0.2; 0.5 m margin each side.
    expect(width).toBe(1000);
    expect(height).toBeGreaterThan(0);
    expect(height).toBeLessThan(1000 + 100);
    expect(svg).toMatch(/viewBox="-0\.7 -0\.3 /);
  });

  it('includes the calibrated background image at its real size', () => {
    const { svg } = renderPlanSvg({
      plan: plan({
        background: { widthPx: 1000, heightPx: 500, metersPerPixel: 0.01, calibrated: true },
      }),
      imageDataUrl: 'data:image/png;base64,AAAA',
      lengthUnit: 'cm',
    });
    expect(svg).toContain(
      '<image href="data:image/png;base64,AAAA" x="0" y="0" width="10" height="5"',
    );
    expect(svg).toContain('>400 cm</text>');
  });

  it('skips labels that would not fit inside small objects', () => {
    const tiny = plan({
      objects: [
        {
          id: 't',
          kind: 'rect',
          name: 'Stool',
          x: 0,
          y: 0,
          width: 0.05,
          depth: 0.05,
          rotation: 0,
          groupId: null,
        },
        {
          id: 'big',
          kind: 'rect',
          name: 'Room',
          x: 0,
          y: 0,
          width: 10,
          depth: 8,
          rotation: 0,
          groupId: null,
        },
      ],
      measurements: [],
    });
    const { svg } = renderPlanSvg({ plan: tiny, imageDataUrl: null, lengthUnit: 'm' });
    expect(svg).not.toContain('>Stool</text>');
    expect(svg).toContain('>Room</text>');
  });
});

describe('scaleBar', () => {
  it('picks a round 1/2/5 length near a fifth of the width', () => {
    expect(scaleBar(10, 'm').meters).toBe(2);
    expect(scaleBar(30, 'm').meters).toBe(5);
    expect(scaleBar(4, 'm').meters).toBeCloseTo(0.5);
    expect(scaleBar(4, 'cm').label).toBe('50 cm');
  });
});

describe('exportFilename', () => {
  it('slugs the plan name', () => {
    expect(exportFilename('My Flat 2', 'png')).toBe('my-flat-2.png');
    expect(exportFilename('  ', 'png')).toBe('floor-plan.png');
  });
});
