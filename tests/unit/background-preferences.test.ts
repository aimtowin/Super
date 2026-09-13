import { describe, expect, it } from 'vitest';

import {
  BACKGROUND_PREFERENCES_KEY,
  BACKGROUND_PREFERENCES_LEGACY_KEYS,
  DEFAULT_BACKGROUND_IMAGE_URL,
  DEFAULT_BACKGROUND_PREFERENCES,
  MAX_BACKGROUND_IMAGE_DATA_URL_BYTES,
  applyBackgroundPreferences,
  backgroundPreferencesSchema,
  clearBackgroundPreferences,
  isSafeBackgroundImageDataUrl,
  loadBackgroundPreferences,
  normalizeBackgroundPreferences,
  parseBackgroundPreferences,
  saveBackgroundPreferences,
  validateBackgroundPreferences,
} from '../../src/renderer/theme/background-preferences';

function memoryStorage(options?: { quota?: boolean; throwingRead?: boolean }) {
  const memory = new Map<string, string>();
  return {
    getItem: (key: string) => {
      if (options?.throwingRead) throw new Error('storage unavailable');
      return memory.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (options?.quota) throw new DOMException('quota', 'QuotaExceededError');
      memory.set(key, value);
    },
    removeItem: (key: string) => memory.delete(key),
    memory,
  };
}

const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgo=';
const IMAGE_SOURCE = {
  fileName: 'wallpaper.png',
  width: 2560,
  height: 1440,
  originalBytes: 8_000_000,
  encodedBytes: 1_200_000,
};

const customPreferences = {
  version: 4 as const,
  imageKind: 'custom' as const,
  imageDataUrl: PNG_DATA_URL,
  imageSource: IMAGE_SOURCE,
  mode: 'tile' as const,
  imageOpacity: 0.65,
};

describe('background preferences contract v4', () => {
  it('defaults new installations to the bundled wallpaper', () => {
    expect(DEFAULT_BACKGROUND_PREFERENCES).toEqual({
      version: 4,
      imageKind: 'default',
      imageDataUrl: null,
      imageSource: null,
      mode: 'cover',
      imageOpacity: 0.32,
    });
    expect(DEFAULT_BACKGROUND_IMAGE_URL).toContain('default-wallpaper.png');
    expect(BACKGROUND_PREFERENCES_KEY).toBe('superApi.background-preferences.v4');
    expect(BACKGROUND_PREFERENCES_LEGACY_KEYS).toEqual([
      'superApi.background-preferences.v3',
      'superApi.background-preferences.v2',
      'superApi.background-preferences.v1',
    ]);
    expect(validateBackgroundPreferences(DEFAULT_BACKGROUND_PREFERENCES)).toBe(true);
  });

  it('preserves v3 custom wallpapers and explicit no-image state during migration', () => {
    const custom = normalizeBackgroundPreferences({
      version: 3,
      imageDataUrl: PNG_DATA_URL,
      imageSource: IMAGE_SOURCE,
      mode: 'fill',
      imageOpacity: 0.8,
    });
    expect(custom).toMatchObject({ version: 4, imageKind: 'custom', imageDataUrl: PNG_DATA_URL });

    const none = normalizeBackgroundPreferences({
      version: 3,
      imageDataUrl: null,
      imageSource: null,
      mode: 'cover',
      imageOpacity: 0.8,
    });
    expect(none).toMatchObject({ version: 4, imageKind: 'none', imageDataUrl: null });
  });

  it('normalizes invalid custom state to none and clears non-custom payloads', () => {
    expect(normalizeBackgroundPreferences({ imageKind: 'custom' })).toMatchObject({
      imageKind: 'none', imageDataUrl: null, imageSource: null,
    });
    expect(normalizeBackgroundPreferences({
      imageKind: 'default', imageDataUrl: PNG_DATA_URL, imageSource: IMAGE_SOURCE,
    })).toMatchObject({ imageKind: 'default', imageDataUrl: null, imageSource: null });
  });

  it('keeps the existing mode and opacity migration rules', () => {
    expect(normalizeBackgroundPreferences({ mode: 'contain' }).mode).toBe('cover');
    expect(normalizeBackgroundPreferences({ mode: 'fill' }).mode).toBe('fill');
    expect(normalizeBackgroundPreferences({ version: 2, overlayOpacity: 0.25 }).imageOpacity).toBe(0.75);
  });

  it('accepts only bounded base64 raster data URLs', () => {
    expect(isSafeBackgroundImageDataUrl(PNG_DATA_URL)).toBe(true);
    expect(isSafeBackgroundImageDataUrl('data:image/svg+xml,<svg/>')).toBe(false);
    expect(isSafeBackgroundImageDataUrl('https://example.invalid/background.png')).toBe(false);
    const oversized = `data:image/png;base64,${'A'.repeat(MAX_BACKGROUND_IMAGE_DATA_URL_BYTES)}`;
    expect(isSafeBackgroundImageDataUrl(oversized)).toBe(false);
  });

  it('round-trips custom and disabled preferences through storage', () => {
    const storage = memoryStorage();
    expect(saveBackgroundPreferences(customPreferences, storage)).toBe(true);
    expect(loadBackgroundPreferences(storage)).toEqual(customPreferences);

    const disabled = { ...DEFAULT_BACKGROUND_PREFERENCES, imageKind: 'none' as const };
    expect(saveBackgroundPreferences(disabled, storage)).toBe(true);
    expect(loadBackgroundPreferences(storage)).toEqual(disabled);
  });

  it('migrates a v3 record into the v4 storage key', () => {
    const storage = memoryStorage();
    storage.memory.set(BACKGROUND_PREFERENCES_LEGACY_KEYS[0]!, JSON.stringify({
      version: 3,
      imageDataUrl: PNG_DATA_URL,
      imageSource: IMAGE_SOURCE,
      mode: 'cover',
      imageOpacity: 0.6,
    }));
    expect(loadBackgroundPreferences(storage)).toMatchObject({
      version: 4, imageKind: 'custom', imageDataUrl: PNG_DATA_URL, imageOpacity: 0.6,
    });
    expect(storage.memory.has(BACKGROUND_PREFERENCES_KEY)).toBe(true);
    expect(storage.memory.has(BACKGROUND_PREFERENCES_LEGACY_KEYS[0]!)).toBe(false);
  });

  it('uses the bundled default only when no prior preference exists', () => {
    expect(loadBackgroundPreferences(memoryStorage())).toEqual(DEFAULT_BACKGROUND_PREFERENCES);
    expect(loadBackgroundPreferences(memoryStorage({ throwingRead: true }))).toEqual(
      DEFAULT_BACKGROUND_PREFERENCES,
    );
  });

  it('reports strict validation failures without throwing', () => {
    expect(backgroundPreferencesSchema.parse(customPreferences)).toEqual(customPreferences);
    expect(validateBackgroundPreferences({ ...DEFAULT_BACKGROUND_PREFERENCES, mode: 'stretch' })).toBe(false);
    expect(validateBackgroundPreferences({ ...DEFAULT_BACKGROUND_PREFERENCES, imageOpacity: 1.1 })).toBe(false);
    expect(validateBackgroundPreferences({ ...DEFAULT_BACKGROUND_PREFERENCES, imageKind: 'unknown' })).toBe(false);
    expect(parseBackgroundPreferences({ ...DEFAULT_BACKGROUND_PREFERENCES, color: '#fff' }).success).toBe(false);
  });

  it('handles storage quota errors and clear requests safely', () => {
    expect(saveBackgroundPreferences(DEFAULT_BACKGROUND_PREFERENCES, memoryStorage({ quota: true }))).toBe(false);
    const storage = memoryStorage();
    expect(saveBackgroundPreferences(DEFAULT_BACKGROUND_PREFERENCES, storage)).toBe(true);
    expect(clearBackgroundPreferences(storage)).toBe(true);
    expect(storage.memory.has(BACKGROUND_PREFERENCES_KEY)).toBe(false);
  });

  it('applies built-in, custom, and disabled wallpaper tokens safely', () => {
    const values = new Map<string, string>();
    const previous = (globalThis as { document?: Document }).document;
    (globalThis as { document?: Document }).document = {
      documentElement: {
        style: {
          setProperty: (name: string, value: string) => values.set(name, value),
          removeProperty: () => undefined,
        },
      },
    } as unknown as Document;

    try {
      applyBackgroundPreferences(DEFAULT_BACKGROUND_PREFERENCES);
      expect(values.get('--ui-background-image')).toBe(`url(${DEFAULT_BACKGROUND_IMAGE_URL})`);
      expect(values.get('--ui-background-position')).toBe('center 38%');
      expect(values.get('--ui-background-surface-opacity')).toBe('0%');

      values.clear();
      applyBackgroundPreferences(customPreferences);
      expect(values.get('--ui-background-image')).toBe(`url(${PNG_DATA_URL})`);
      expect(values.get('--ui-background-size')).toBe('auto');
      expect(values.get('--ui-background-repeat')).toBe('repeat');
      expect(values.get('--ui-background-position')).toBe('center');

      values.clear();
      applyBackgroundPreferences({ ...DEFAULT_BACKGROUND_PREFERENCES, imageKind: 'none' });
      expect(values.get('--ui-background-image')).toBe('none');
      expect(values.get('--ui-background-surface-opacity')).toBe('100%');
    } finally {
      if (previous === undefined) delete (globalThis as { document?: Document }).document;
      else (globalThis as { document?: Document }).document = previous;
    }
  });
});
