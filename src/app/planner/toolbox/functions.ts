import { clamp } from '../../core/geometry';

export interface Bounds {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface ToolPreviewSize {
  readonly width: number;
  readonly height: number;
}

export interface ToolPreviewPlacement {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  /** Largest height that still ends inside the canvas inset at this top. */
  readonly maxHeight: number;
}

/**
 * Places a tool preview inside the canvas.
 * It prefers to sit just to the right of the anchor, centered on it,
 * then shifts until the whole box lies in the canvas inset.
 */
export function placeToolPreview(
  anchor: Bounds,
  canvas: Bounds,
  preview: ToolPreviewSize,
  gapPx: number,
  marginPx: number,
): ToolPreviewPlacement {
  const marginX = Math.min(marginPx, Math.max(0, canvas.width) / 2);
  const marginY = Math.min(marginPx, Math.max(0, canvas.height) / 2);
  const maxWidth = Math.max(0, canvas.width - marginX * 2);
  const availableHeight = Math.max(0, canvas.height - marginY * 2);
  const width = Math.min(Math.max(0, preview.width), maxWidth);
  const height = Math.min(Math.max(0, preview.height), availableHeight);

  const minLeft = canvas.left + marginX;
  const minTop = canvas.top + marginY;
  const maxLeft = minLeft + Math.max(0, maxWidth - width);
  const maxTop = minTop + Math.max(0, availableHeight - height);

  const preferredLeft = anchor.left + anchor.width + gapPx;
  const preferredTop = anchor.top + anchor.height / 2 - height / 2;
  const top = clamp(preferredTop, minTop, maxTop);

  return {
    left: clamp(preferredLeft, minLeft, maxLeft),
    top,
    width,
    height,
    maxHeight: minTop + availableHeight - top,
  };
}

export function boundsFromRect(rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>): Bounds {
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}
