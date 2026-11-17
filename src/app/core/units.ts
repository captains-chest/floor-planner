export type LengthUnit = 'm' | 'cm';

export function isLengthUnit(value: unknown): value is LengthUnit {
  return value === 'm' || value === 'cm';
}

export function metersToDisplay(meters: number, unit: LengthUnit): number {
  return unit === 'cm' ? meters * 100 : meters;
}

export function displayToMeters(display: number, unit: LengthUnit): number {
  return unit === 'cm' ? display / 100 : display;
}

export function formatLength(meters: number, unit: LengthUnit): string {
  if (!Number.isFinite(meters)) {
    return '—';
  }
  if (unit === 'cm') {
    const cm = Math.round(meters * 1000) / 10;
    return Number.isInteger(cm) ? `${cm.toFixed(0)} cm` : `${cm.toFixed(1)} cm`;
  }
  const rounded = Math.round(meters * 1000) / 1000;
  return `${rounded.toFixed(2)} m`;
}

export function formatDisplayNumber(meters: number, unit: LengthUnit): string {
  const value = metersToDisplay(meters, unit);
  if (unit === 'cm') {
    return String(Math.round(value * 10) / 10);
  }
  return String(Math.round(value * 1000) / 1000);
}

/** Round to the precision `formatDisplayNumber` shows: 0.1 cm or 0.001 m. */
export function roundMetersForDisplay(meters: number, unit: LengthUnit): number {
  if (!Number.isFinite(meters)) {
    return meters;
  }
  const display = metersToDisplay(meters, unit);
  const factor = unit === 'cm' ? 10 : 1000;
  const rounded = Math.round(display * factor) / factor;
  return displayToMeters(rounded, unit);
}

export function inputStep(unit: LengthUnit): number {
  return unit === 'cm' ? 1 : 0.01;
}

export function inputMin(unit: LengthUnit): number {
  // A number input uses its minimum as the step base: with min 0.1 and step 1 in cm,
  // the spinner would land on 0.1, 1.1, … 22.1 instead of whole centimetres.
  // Keeping the minimum on the step series makes stepping stay on whole cm.
  return inputStep(unit);
}

export function parseLengthToMeters(raw: string, defaultUnit: LengthUnit = 'm'): number | null {
  const value = raw.trim().toLowerCase().replace(',', '.');
  if (!value) {
    return null;
  }
  const match = value.match(/^([+-]?\d*\.?\d+)\s*(mm|cm|m)?$/);
  if (!match) {
    return null;
  }
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  const unit = match[2] ?? defaultUnit;
  if (unit === 'mm') {
    return amount / 1000;
  }
  if (unit === 'cm') {
    return amount / 100;
  }
  return amount;
}
