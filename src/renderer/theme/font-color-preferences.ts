import { z } from 'zod';

import {
  COLOR_PRESET_IDS,
  colorPresetById,
  type ColorPresetId,
} from '../../shared/color-filter-presets';
import type { ThemePreferencesStorage } from './theme-preferences';

/** Palette selection for application text. `auto` leaves the active theme intact. */
export const APP_FONT_COLOR_IDS = ['auto', ...COLOR_PRESET_IDS] as const;
export type AppFontColorId = 'auto' | ColorPresetId;

export const APP_FONT_COLOR_PREFERENCES_KEY = 'superApi.font-color.v1';
export const DEFAULT_APP_FONT_COLOR_ID: AppFontColorId = 'auto';

const appFontColorIdSchema = z.enum(
  APP_FONT_COLOR_IDS as unknown as [AppFontColorId, ...AppFontColorId[]],
);
const appFontColorPreferencesSchema = z.strictObject({
  version: z.literal(1),
  colorId: appFontColorIdSchema,
});

export type AppFontColorPreferences = z.infer<typeof appFontColorPreferencesSchema>;

type ContentColors = {
  readonly primary: string;
  readonly secondary: string;
  readonly tertiary: string;
};

function resolveStorage(storage?: ThemePreferencesStorage): ThemePreferencesStorage {
  if (storage) return storage;
  const localStorage = (globalThis as { localStorage?: ThemePreferencesStorage }).localStorage;
  if (!localStorage) throw new Error('AppFontColorPreferences: localStorage is unavailable.');
  return localStorage;
}

export function loadAppFontColorPreferences(
  storage?: ThemePreferencesStorage,
): AppFontColorPreferences {
  try {
    const raw = resolveStorage(storage).getItem(APP_FONT_COLOR_PREFERENCES_KEY);
    if (!raw) return { version: 1, colorId: DEFAULT_APP_FONT_COLOR_ID };
    const parsed = appFontColorPreferencesSchema.safeParse(JSON.parse(raw));
    return parsed.success
      ? parsed.data
      : { version: 1, colorId: DEFAULT_APP_FONT_COLOR_ID };
  } catch {
    return { version: 1, colorId: DEFAULT_APP_FONT_COLOR_ID };
  }
}

export function saveAppFontColorId(
  colorId: AppFontColorId,
  storage?: ThemePreferencesStorage,
): boolean {
  try {
    resolveStorage(storage).setItem(
      APP_FONT_COLOR_PREFERENCES_KEY,
      JSON.stringify({ version: 1, colorId }),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Keep every palette choice readable on both theme tones. The hue remains
 * recognisable, while mixing it with the resolved theme ink protects contrast
 * for white/yellow in light mode and black in dark mode.
 */
export function applyAppFontColor(
  colorId: AppFontColorId,
  resolved: 'light' | 'dark',
  base: ContentColors,
): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const preset = colorId === 'auto' ? undefined : colorPresetById(colorId);
  const primary = !preset
    ? base.primary
    : `color-mix(in srgb, ${preset.swatch} ${resolved === 'dark' ? 64 : 36}%, ${base.primary})`;
  const secondary = !preset
    ? base.secondary
    : `color-mix(in srgb, ${primary} 62%, ${base.secondary})`;
  const tertiary = !preset
    ? base.tertiary
    : `color-mix(in srgb, ${primary} 42%, ${base.tertiary})`;

  root.style.setProperty('--ui-content-primary', primary);
  root.style.setProperty('--ui-content-secondary', secondary);
  root.style.setProperty('--ui-content-tertiary', tertiary);
  root.style.setProperty(
    '--ui-content-disabled',
    `color-mix(in srgb, ${tertiary} ${resolved === 'dark' ? 62 : 64}%, transparent)`,
  );
}
