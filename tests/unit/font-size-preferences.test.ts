import { describe, expect, it } from 'vitest';

import {
  APP_FONT_SIZE_PREFERENCES_KEY,
  DEFAULT_APP_FONT_SIZE_LEVEL,
  appFontScaleForLevel,
  applyAppFontSizeLevel,
  clampAppFontSizeLevel,
  loadAppFontSizePreferences,
  saveAppFontSizeLevel,
} from '../../src/renderer/theme/font-size-preferences';

function memoryStorage(options?: { throwOnWrite?: boolean }) {
  const memory = new Map<string, string>();
  return {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (options?.throwOnWrite) throw new Error('quota');
      memory.set(key, value);
    },
    removeItem: (key: string) => memory.delete(key),
    memory,
  };
}

describe('application font-size preferences', () => {
  it('defines six stable app-only levels with level four as the default', () => {
    expect(DEFAULT_APP_FONT_SIZE_LEVEL).toBe(4);
    expect([
      appFontScaleForLevel(1),
      appFontScaleForLevel(2),
      appFontScaleForLevel(3),
      appFontScaleForLevel(4),
      appFontScaleForLevel(5),
      appFontScaleForLevel(6),
    ]).toEqual([0.9, 1, 1.1, 1.2, 1.3, 1.4]);
    expect(clampAppFontSizeLevel(0)).toBe(4);
    expect(clampAppFontSizeLevel(2.6)).toBe(3);
    expect(clampAppFontSizeLevel(5)).toBe(5);
    expect(clampAppFontSizeLevel(9)).toBe(4);
  });

  it('persists the level independently from system or browser preferences', () => {
    const storage = memoryStorage();
    expect(loadAppFontSizePreferences(storage)).toEqual({ version: 1, level: 4 });
    expect(saveAppFontSizeLevel(6, storage)).toBe(true);
    expect(storage.memory.get(APP_FONT_SIZE_PREFERENCES_KEY)).toBe('{"version":1,"level":6}');
    expect(loadAppFontSizePreferences(storage)).toEqual({ version: 1, level: 6 });
  });

  it('rejects invalid records and treats storage failures as non-fatal', () => {
    const storage = memoryStorage();
    storage.memory.set(APP_FONT_SIZE_PREFERENCES_KEY, '{"version":1,"level":9}');
    expect(loadAppFontSizePreferences(storage)).toEqual({ version: 1, level: 4 });
    expect(saveAppFontSizeLevel(3, memoryStorage({ throwOnWrite: true }))).toBe(false);
  });

  it('writes only the renderer font-scale token', () => {
    const values = new Map<string, string>();
    const previous = (globalThis as { document?: Document }).document;
    (globalThis as { document?: Document }).document = {
      documentElement: {
        style: {
          setProperty: (name: string, value: string) => values.set(name, value),
        },
      },
    } as unknown as Document;

    try {
      applyAppFontSizeLevel(6);
      expect(values).toEqual(new Map([['--app-font-scale', '1.4']]));
    } finally {
      if (previous === undefined) delete (globalThis as { document?: Document }).document;
      else (globalThis as { document?: Document }).document = previous;
    }
  });
});
