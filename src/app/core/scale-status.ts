import type { Background } from '../models/floor-plan';
import { formatLength, type LengthUnit } from './units';

/** Plain-language state of the scale for the Settings dialog. */
export function scaleStatus(background: Background | null, unit: LengthUnit): string {
  if (!background) {
    return 'Import an image first. Then mark a length you know on it to set the scale.';
  }
  if (!background.calibrated) {
    return 'Not set yet. Mark a length you know on the image so sizes are real.';
  }
  const width = formatLength(background.widthPx * background.metersPerPixel, unit);
  return `Set. The image is ${width} wide. Set it again if sizes look wrong.`;
}
