import { z } from 'zod';

import type { ThemePreferencesStorage } from './theme-preferences';

export const APP_FONT_SIZE_LEVELS = [1, 2, 3, 4] as const;
export type AppFontSizeLevel = (typeof APP_FONT_SIZE_LEVELS)[number];

export const APP_FONT_SIZE_PREFERENCES_KEY = 'superApi.font-size.v1';
export const DEFAULT_APP_FONT_SIZE_LEVEL: AppFontSizeLevel = 2;

const appFontSizePreferencesSchema = z.object({
  version: z.literal(1),
  level: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
  ]),
});

export type AppFontSizePreferences = z.infer<typeof appFontSizePreferencesSchema>;

const SCALE_BY_LEVEL: Readonly<Record<AppFontSizeLevel, number>> = {
  1: 0.9,
  2: 1,
  3: 1.1,
  4: 1.2,
};

export function clampAppFontSizeLevel(value: number): AppFontSizeLevel {
  const rounded = Math.round(value);
  return APP_FONT_SIZE_LEVELS.includes(rounded as AppFontSizeLevel)
    ? (rounded as AppFontSizeLevel)
    : DEFAULT_APP_FONT_SIZE_LEVEL;
}

export function appFontScaleForLevel(level: AppFontSizeLevel): number {
  return SCALE_BY_LEVEL[level];
}

function resolveStorage(
  storage?: ThemePreferencesStorage,
): ThemePreferencesStorage {
  if (storage) return storage;
  const localStorage = (globalThis as {
    localStorage?: ThemePreferencesStorage;
  }).localStorage;
  if (!localStorage) {
    throw new Error('AppFontSizePreferences: localStorage is unavailable.');
  }
  return localStorage;
}

export function loadAppFontSizePreferences(
  storage?: ThemePreferencesStorage,
): AppFontSizePreferences {
  try {
    const raw = resolveStorage(storage).getItem(APP_FONT_SIZE_PREFERENCES_KEY);
    if (!raw) return { version: 1, level: DEFAULT_APP_FONT_SIZE_LEVEL };
    const parsed = appFontSizePreferencesSchema.safeParse(JSON.parse(raw));
    return parsed.success
      ? parsed.data
      : { version: 1, level: DEFAULT_APP_FONT_SIZE_LEVEL };
  } catch {
    return { version: 1, level: DEFAULT_APP_FONT_SIZE_LEVEL };
  }
}

export function saveAppFontSizeLevel(
  level: AppFontSizeLevel,
  storage?: ThemePreferencesStorage,
): boolean {
  try {
    resolveStorage(storage).setItem(
      APP_FONT_SIZE_PREFERENCES_KEY,
      JSON.stringify({ version: 1, level }),
    );
    return true;
  } catch {
    return false;
  }
}

/** Applies only a renderer CSS variable; it never changes system/browser zoom. */
export function applyAppFontSizeLevel(level: AppFontSizeLevel): void {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty(
    '--app-font-scale',
    String(appFontScaleForLevel(level)),
  );
}
