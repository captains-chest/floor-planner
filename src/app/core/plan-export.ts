import { borderPaint, fillPaint, FloorPlan, PlacedObject } from '../models/floor-plan';
import { contentBBox, dimensionView, type BoundingBox } from './geometry';
import { formatLength, type LengthUnit } from './units';

/** Light print colors: dark ink on white so exports and printouts read well on paper. */
const INK = '#1a1d23';
const MEASURE = '#0f7a68';
const MARGIN_METERS = 0.5;
const HEADER_PX = 44;
const FOOTER_PX = 40;

export interface PlanImageSource {
  plan: FloorPlan;
  imageDataUrl: string | null;
  lengthUnit: LengthUnit;
}

export interface RenderedPlan {
  svg: string;
  /** Output size in CSS pixels. */
  width: number;
  height: number;
}

/**
 * Renders the floor plan (background, objects with names, measurements) as a standalone SVG
 * that fits all content, with the plan name on top and a scale bar below. Pure: no DOM, so the
 * same markup feeds PNG export and printing.
 */
export function renderPlanSvg(
  source: PlanImageSource,
  options: { longSidePx?: number } = {},
): RenderedPlan {
  const { plan, imageDataUrl, lengthUnit } = source;
  const background = plan.background;
  const imageSize =
    imageDataUrl && background
      ? {
          width: background.widthPx * background.metersPerPixel,
          height: background.heightPx * background.metersPerPixel,
        }
      : null;
  const content = contentBBox(plan, imageSize);
  const box: BoundingBox = {
    x: content.x - MARGIN_METERS,
    y: content.y - MARGIN_METERS,
    width: content.width + MARGIN_METERS * 2,
    depth: content.depth + MARGIN_METERS * 2,
  };
  const longSidePx = options.longSidePx ?? 2000;
  const pxPerMeter = longSidePx / Math.max(box.width, box.depth);
  const drawWidth = Math.round(box.width * pxPerMeter);
  const drawHeight = Math.round(box.depth * pxPerMeter);
  const width = drawWidth;
  const height = drawHeight + HEADER_PX + FOOTER_PX;
  const m = (px: number) => px / pxPerMeter;
  const label = m(18);

  const parts: string[] = [];
  if (imageSize && imageDataUrl) {
    parts.push(
      `<image href="${esc(imageDataUrl)}" x="0" y="0" width="${n(imageSize.width)}" height="${n(imageSize.height)}" preserveAspectRatio="none"/>`,
    );
  }
  for (const obj of plan.objects) {
    parts.push(objectSvg(obj, m(1), label));
  }
  for (const measurement of plan.measurements) {
    const view = dimensionView(
      measurement.start,
      measurement.end,
      m(6),
      lengthUnit,
      measurement.offset ?? 0,
    );
    // Custom colors print as chosen; the default uses a darker teal that reads on white paper.
    const color = measurement.color ?? MEASURE;
    const stroke = `stroke="${color}" stroke-width="${n(m(2))}"`;
    parts.push(
      `<g class="measurement">` +
        line(view.originStart, view.start, `stroke="${color}" stroke-width="${n(m(1))}"`) +
        line(view.originEnd, view.end, `stroke="${color}" stroke-width="${n(m(1))}"`) +
        line(view.start, view.end, stroke) +
        line(
          { x: view.start.x - view.tickDx, y: view.start.y - view.tickDy },
          { x: view.start.x + view.tickDx, y: view.start.y + view.tickDy },
          stroke,
        ) +
        line(
          { x: view.end.x - view.tickDx, y: view.end.y - view.tickDy },
          { x: view.end.x + view.tickDx, y: view.end.y + view.tickDy },
          stroke,
        ) +
        `<text x="${n(view.mid.x)}" y="${n(view.mid.y - label * 0.6)}" text-anchor="middle" font-size="${n(label)}" font-weight="600" fill="${color}" paint-order="stroke" stroke="#fff" stroke-width="${n(m(3))}">${esc(view.lengthLabel)}</text>` +
        `</g>`,
    );
  }

  const bar = scaleBar(box.width, lengthUnit);
  const barPx = bar.meters * pxPerMeter;
  const footerY = HEADER_PX + drawHeight + 24;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif">` +
    `<title>${esc(plan.name)}</title>` +
    `<rect width="100%" height="100%" fill="#ffffff"/>` +
    `<text x="16" y="29" font-size="24" font-weight="700" fill="${INK}">${esc(plan.name)}</text>` +
    `<svg x="0" y="${HEADER_PX}" width="${drawWidth}" height="${drawHeight}" viewBox="${n(box.x)} ${n(box.y)} ${n(box.width)} ${n(box.depth)}">${parts.join('')}</svg>` +
    `<g class="scale-bar" fill="${INK}" stroke="${INK}">` +
    `<line x1="16" y1="${footerY}" x2="${n(16 + barPx)}" y2="${footerY}" stroke-width="3"/>` +
    `<line x1="16" y1="${footerY - 6}" x2="16" y2="${footerY + 6}" stroke-width="2"/>` +
    `<line x1="${n(16 + barPx)}" y1="${footerY - 6}" x2="${n(16 + barPx)}" y2="${footerY + 6}" stroke-width="2"/>` +
    `<text x="${n(24 + barPx)}" y="${footerY + 5}" font-size="16" stroke="none">${esc(bar.label)}</text>` +
    `</g></svg>`;
  return { svg, width, height };
}

/** A round scale-bar length near a fifth of the drawing width (1, 2 or 5 × 10ⁿ meters). */
export function scaleBar(widthMeters: number, unit: LengthUnit): { meters: number; label: string } {
  const target = Math.max(widthMeters / 5, 0.01);
  const power = 10 ** Math.floor(Math.log10(target));
  const step = [5, 2, 1].map((f) => f * power).find((v) => v <= target) ?? power;
  return { meters: step, label: formatLength(step, unit) };
}

export function exportFilename(planName: string, extension: string): string {
  const slug = planName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'floor-plan'}.${extension}`;
}

function objectSvg(obj: PlacedObject, hairline: number, label: number): string {
  const cx = obj.x + obj.width / 2;
  const cy = obj.y + obj.depth / 2;
  const fill = fillPaint(obj);
  const border = borderPaint(obj);
  const fillAttr =
    fill.fill === 'none' ? 'fill="none"' : `fill="${fill.fill}" fill-opacity="${n(fill.opacity)}"`;
  const paint = border
    ? `${fillAttr} stroke="${border.stroke}" stroke-opacity="${n(border.opacity)}" stroke-width="${n(hairline * 3)}"`
    : `${fillAttr} stroke="none"`;
  const shape =
    obj.kind === 'rect'
      ? `<rect x="${n(obj.x)}" y="${n(obj.y)}" width="${n(obj.width)}" height="${n(obj.depth)}" ${paint}/>`
      : `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(obj.width / 2)}" ry="${n(obj.depth / 2)}" ${paint}/>`;
  // Same rule as the canvas: only label objects big enough to hold the text.
  const fits = obj.name && obj.width > label * 2.5 && obj.depth > label * 1.3;
  const text = fits
    ? `<text x="${n(cx)}" y="${n(cy)}" text-anchor="middle" dominant-baseline="middle" font-size="${n(label)}" font-weight="600" fill="${INK}">${esc(obj.name)}</text>`
    : '';
  return `<g transform="rotate(${n(obj.rotation ?? 0)} ${n(cx)} ${n(cy)})">${shape}${text}</g>`;
}

function line(a: { x: number; y: number }, b: { x: number; y: number }, attrs: string): string {
  return `<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" ${attrs}/>`;
}

const n = (value: number): string => String(Math.round(value * 10000) / 10000);

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
