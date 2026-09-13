/** Named hue and neutral buckets for palette-based discovery filtering. */

export const COLOR_PRESET_IDS = [
  'red', 'scarlet', 'orange', 'amber', 'yellow', 'chartreuse',
  'lime', 'green', 'spring', 'teal', 'cyan', 'sky', 'blue',
  'indigo', 'violet', 'purple', 'magenta', 'pink',
  'black', 'gray', 'white',
] as const;

export type ColorPresetId = typeof COLOR_PRESET_IDS[number];
export type HueSpan = { min: number; max: number };

export type ColorPreset =
  | {
      id: Exclude<ColorPresetId, 'black' | 'gray' | 'white'>;
      swatch: string;
      kind: 'hue';
      /** Half-open hue intervals in [0, 360). Red wraps across 0. */
      hues: HueSpan[];
    }
  | {
      id: 'black' | 'white';
      swatch: string;
      kind: 'neutral';
      /** Lightness interval on [0, 1]. */
      lightness: { min: number; max: number };
    }
  | {
      id: 'gray';
      swatch: string;
      kind: 'neutral';
      lightness: { min: number; max: number };
      /** Low saturation separates gray from dark or bright coloured assets. */
      saturation: { min: number; max: number };
    };

/**
 * Eighteen evenly-spaced hue families make the compact filter a real palette,
 * while the ids remain stable enough to be stored in saved filter state.
 */
export const COLOR_PRESETS: readonly ColorPreset[] = [
  { id: 'red', swatch: '#E5383B', kind: 'hue', hues: [{ min: 350, max: 360 }, { min: 0, max: 10 }] },
  { id: 'scarlet', swatch: '#F0523E', kind: 'hue', hues: [{ min: 10, max: 30 }] },
  { id: 'orange', swatch: '#F97316', kind: 'hue', hues: [{ min: 30, max: 50 }] },
  { id: 'amber', swatch: '#EFAF25', kind: 'hue', hues: [{ min: 50, max: 70 }] },
  { id: 'yellow', swatch: '#D9D936', kind: 'hue', hues: [{ min: 70, max: 90 }] },
  { id: 'chartreuse', swatch: '#A8D646', kind: 'hue', hues: [{ min: 90, max: 110 }] },
  { id: 'lime', swatch: '#5FC84B', kind: 'hue', hues: [{ min: 110, max: 130 }] },
  { id: 'green', swatch: '#22B96B', kind: 'hue', hues: [{ min: 130, max: 150 }] },
  { id: 'spring', swatch: '#18B98A', kind: 'hue', hues: [{ min: 150, max: 170 }] },
  { id: 'teal', swatch: '#17AFA5', kind: 'hue', hues: [{ min: 170, max: 190 }] },
  { id: 'cyan', swatch: '#19B6D2', kind: 'hue', hues: [{ min: 190, max: 210 }] },
  { id: 'sky', swatch: '#2C9EEB', kind: 'hue', hues: [{ min: 210, max: 230 }] },
  { id: 'blue', swatch: '#3675E8', kind: 'hue', hues: [{ min: 230, max: 250 }] },
  { id: 'indigo', swatch: '#5857D9', kind: 'hue', hues: [{ min: 250, max: 270 }] },
  { id: 'violet', swatch: '#834DE5', kind: 'hue', hues: [{ min: 270, max: 290 }] },
  { id: 'purple', swatch: '#A54DE4', kind: 'hue', hues: [{ min: 290, max: 310 }] },
  { id: 'magenta', swatch: '#D443B7', kind: 'hue', hues: [{ min: 310, max: 330 }] },
  { id: 'pink', swatch: '#E74686', kind: 'hue', hues: [{ min: 330, max: 350 }] },
  { id: 'black', swatch: '#111318', kind: 'neutral', lightness: { min: 0, max: 0.18 } },
  {
    id: 'gray', swatch: '#8C929C', kind: 'neutral',
    lightness: { min: 0.18, max: 0.82 }, saturation: { min: 0, max: 0.16 },
  },
  { id: 'white', swatch: '#F4F6FA', kind: 'neutral', lightness: { min: 0.82, max: 1.01 } },
];

export function colorPresetById(id: string): ColorPreset | undefined {
  return COLOR_PRESETS.find((preset) => preset.id === id);
}

export function parseColorFilterIds(raw: string): ColorPresetId[] {
  const allowed = new Set<string>(COLOR_PRESET_IDS);
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value): value is ColorPresetId => allowed.has(value));
}

/**
 * Build SQL matching any selected bucket against an indexed representative
 * colour. Callers put this inside EXISTS so one non-dominant palette colour
 * can make an asset match.
 */
export function colorFilterSql(
  hueColumn: string,
  ids: readonly ColorPresetId[],
  exclude: boolean,
  lightnessColumn = 'palette_color.lightness',
  saturationColumn = 'palette_color.saturation',
): { sql: string; params: number[] } | null {
  const clauses: string[] = [];
  const params: number[] = [];

  for (const id of ids) {
    const preset = colorPresetById(id);
    if (!preset) continue;
    if (preset.kind === 'hue') {
      const spans = preset.hues.map(() => `(${hueColumn} >= ? AND ${hueColumn} < ?)`);
      clauses.push(`(${hueColumn} IS NOT NULL AND (${spans.join(' OR ')}))`);
      for (const span of preset.hues) params.push(span.min, span.max);
      continue;
    }
    const saturation = 'saturation' in preset
      ? ` AND ${saturationColumn} IS NOT NULL AND ${saturationColumn} >= ? AND ${saturationColumn} < ?`
      : '';
    clauses.push(
      `(${lightnessColumn} IS NOT NULL AND ${lightnessColumn} >= ? AND ${lightnessColumn} < ?${saturation})`,
    );
    params.push(preset.lightness.min, preset.lightness.max);
    if ('saturation' in preset) params.push(preset.saturation.min, preset.saturation.max);
  }

  if (clauses.length === 0) return null;
  const matchAny = clauses.length === 1 ? clauses[0]! : `(${clauses.join(' OR ')})`;
  return exclude
    ? { sql: `NOT ${matchAny}`, params }
    : { sql: matchAny, params };
}
