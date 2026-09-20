import { describe, expect, it } from 'vitest';

import {
  APP_FONT_COLOR_PREFERENCES_KEY,
  applyAppFontColor,
  loadAppFontColorPreferences,
  saveAppFontColorId,
} from '../../src/renderer/theme/font-color-preferences';

function memoryStorage() {
  const memory = new Map<string, string>();
  return {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => memory.set(key, value),
    removeItem: (key: string) => memory.delete(key),
    memory,
  };
}

const base = { primary: '#1c1e1c', secondary: '#5a5f5a', tertiary: '#8a8f8a' };

describe('application font colour preferences', () => {
  it('defaults to the active theme and persists a palette choice', () => {
    const storage = memoryStorage();
    expect(loadAppFontColorPreferences(storage)).toEqual({ version: 1, colorId: 'auto' });
    expect(saveAppFontColorId('violet', storage)).toBe(true);
    expect(JSON.parse(storage.memory.get(APP_FONT_COLOR_PREFERENCES_KEY)!)).toEqual({ version: 1, colorId: 'violet' });
    expect(loadAppFontColorPreferences(storage)).toEqual({ version: 1, colorId: 'violet' });
  });

  it('uses adaptive colour mixes and restores resolved theme ink for auto', () => {
    const values = new Map<string, string>();
    const previous = (globalThis as { document?: Document }).document;
    (globalThis as { document?: Document }).document = {
      documentElement: { style: { setProperty: (name: string, value: string) => values.set(name, value) } },
    } as unknown as Document;
    try {
      applyAppFontColor('yellow', 'light', base);
      expect(values.get('--ui-content-primary')).toContain('#D9D936 36%');
      applyAppFontColor('auto', 'light', base);
      expect(values.get('--ui-content-primary')).toBe(base.primary);
    } finally {
      if (previous === undefined) delete (globalThis as { document?: Document }).document;
      else (globalThis as { document?: Document }).document = previous;
    }
  });
});
