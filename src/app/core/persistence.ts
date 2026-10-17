import { Service } from '@angular/core';
import {
  createDefaultPlan,
  FloorPlan,
  Measurement,
  ObjectGroup,
  PlacedObject,
  normalizeColor,
} from '../models/floor-plan';
import { normalizeHelperSpacing } from './helper-grid';
import { isLengthUnit, type LengthUnit } from './units';

export interface PersistedState {
  plan: FloorPlan;
  imageDataUrl: string | null;
  lengthUnit: LengthUnit;
  /** Space between background helper lines, in meters. */
  gridSpacingMeters: number;
}

const DB_NAME = 'floor-planner';
const DB_VERSION = 1;
const STORE_NAME = 'state';
const STATE_KEY = 'current';

@Service()
export class Persistence {
  private dbPromise: Promise<IDBDatabase> | null = null;

  async load(): Promise<PersistedState | null> {
    try {
      const db = await this.open();
      const raw = await this.withStore<unknown>(db, 'readonly', (store) => store.get(STATE_KEY));
      if (!raw || typeof raw !== 'object') {
        return null;
      }
      return normalizeState(raw);
    } catch (error) {
      console.warn('Failed to load floor plan', error);
      return null;
    }
  }

  async save(state: PersistedState): Promise<void> {
    try {
      const db = await this.open();
      await this.withStore(db, 'readwrite', (store) => store.put(state, STATE_KEY));
    } catch (error) {
      console.warn('Failed to save floor plan', error);
    }
  }

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    });

    return this.dbPromise;
  }

  private withStore<T>(
    db: IDBDatabase,
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const request = fn(tx.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
    });
  }
}

export const PROJECT_KIND = 'floor-planner-project';

export interface ProjectDocument extends PersistedState {
  kind: typeof PROJECT_KIND;
  formatVersion: 1;
  exportedAt: string;
}

export function serializeProject(state: PersistedState): ProjectDocument {
  return {
    kind: PROJECT_KIND,
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    plan: state.plan,
    imageDataUrl: state.imageDataUrl,
    lengthUnit: state.lengthUnit,
    gridSpacingMeters: state.gridSpacingMeters,
  };
}

export function parseProjectDocument(raw: unknown): PersistedState | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const record = raw as { kind?: unknown; plan?: unknown };
  if (record.kind != null && record.kind !== PROJECT_KIND) {
    return null;
  }
  if (record.plan == null || typeof record.plan !== 'object') {
    return null;
  }
  return normalizeState(raw);
}

function normalizeState(raw: unknown): PersistedState | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const record = raw as {
    plan?: unknown;
    imageDataUrl?: unknown;
    lengthUnit?: unknown;
    gridSpacingMeters?: unknown;
  };
  const plan = normalizePlan(record.plan);
  const imageDataUrl = typeof record.imageDataUrl === 'string' ? record.imageDataUrl : null;
  const lengthUnit: LengthUnit = isLengthUnit(record.lengthUnit) ? record.lengthUnit : 'm';
  return {
    plan,
    imageDataUrl,
    lengthUnit,
    gridSpacingMeters: normalizeHelperSpacing(record.gridSpacingMeters),
  };
}

function normalizePlan(raw: unknown): FloorPlan {
  const fallback = createDefaultPlan();
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }
  const value = raw as Partial<FloorPlan>;

  return {
    version: 1,
    name: typeof value.name === 'string' && value.name.trim() ? value.name : fallback.name,
    background: normalizeBackground(value.background),
    objects: Array.isArray(value.objects)
      ? value.objects.map(normalizeObject).filter((obj): obj is PlacedObject => obj !== null)
      : [],
    measurements: Array.isArray(value.measurements)
      ? value.measurements
          .map(normalizeMeasurement)
          .filter((item): item is Measurement => item !== null)
      : [],
    groups: Array.isArray(value.groups)
      ? value.groups.map(normalizeGroup).filter((item): item is ObjectGroup => item !== null)
      : [],
    viewport: {
      panX: num(value.viewport?.panX, fallback.viewport.panX),
      panY: num(value.viewport?.panY, fallback.viewport.panY),
      zoom: num(value.viewport?.zoom, fallback.viewport.zoom),
    },
  };
}

function normalizeBackground(raw: FloorPlan['background'] | undefined): FloorPlan['background'] {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const widthPx = num(raw.widthPx, 0);
  const heightPx = num(raw.heightPx, 0);
  const metersPerPixel = num(raw.metersPerPixel, 0);
  if (widthPx <= 0 || heightPx <= 0 || metersPerPixel <= 0) {
    return null;
  }
  return {
    widthPx,
    heightPx,
    metersPerPixel,
    calibrated: Boolean(raw.calibrated),
  };
}

function normalizeGroup(raw: unknown): ObjectGroup | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const value = raw as Partial<ObjectGroup>;
  if (typeof value.id !== 'string' || typeof value.name !== 'string') {
    return null;
  }
  return { id: value.id, name: value.name };
}

function normalizeMeasurement(raw: unknown): Measurement | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const value = raw as Partial<Measurement>;
  if (typeof value.id !== 'string') {
    return null;
  }
  const start = normalizePoint(value.start);
  const end = normalizePoint(value.end);
  if (!start || !end) {
    return null;
  }
  const color = normalizeColor(value.color);
  return { id: value.id, start, end, offset: num(value.offset, 0), ...(color ? { color } : {}) };
}

function normalizeObject(raw: unknown): PlacedObject | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const value = raw as Partial<PlacedObject>;
  if (typeof value.id !== 'string') {
    return null;
  }
  const color = normalizeColor(value.color);
  const kind =
    value.kind === 'circle' || value.kind === 'ellipse' || value.kind === 'rect'
      ? value.kind
      : 'rect';
  return {
    id: value.id,
    kind,
    name: typeof value.name === 'string' ? value.name : 'Object',
    x: num(value.x, 0),
    y: num(value.y, 0),
    width: Math.max(0.01, num(value.width, 0.8)),
    depth: Math.max(0.01, num(value.depth, 0.8)),
    rotation: num(value.rotation, 0),
    groupId: typeof value.groupId === 'string' ? value.groupId : null,
    ...(value.color === 'transparent' ? { color: 'transparent' } : color ? { color } : {}),
    ...(normalizeColor(value.borderColor)
      ? { borderColor: normalizeColor(value.borderColor) }
      : {}),
  };
}

function normalizePoint(raw: unknown): { x: number; y: number } | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const value = raw as { x?: unknown; y?: unknown };
  if (typeof value.x !== 'number' || typeof value.y !== 'number') {
    return null;
  }
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) {
    return null;
  }
  return { x: value.x, y: value.y };
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
