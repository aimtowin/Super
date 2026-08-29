import { z } from 'zod';

// ---------------------------------------------------------------------------
// Per-folder "include subfolders" preference (REQ-FOLDER-009)
//
// Which managed/linked folders recurse into descendants is remembered across
// restarts, keyed by library id + folder id. Values preserve an explicit
// opt-out too: linked roots can default to recursive on first open without
// re-enabling themselves after the user turns the switch off.
// ---------------------------------------------------------------------------

export interface FolderRecursivePreferences {
  readonly version: 2;
  readonly byLibrary: Readonly<
    Record<string, Readonly<Record<string, boolean>>>
  >;
}

export interface FolderRecursivePreferencesStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const FOLDER_RECURSIVE_PREF_KEY = 'superApi.folder-recursive.v1';

export const DEFAULT_FOLDER_RECURSIVE_PREFERENCES: FolderRecursivePreferences = {
  version: 2,
  byLibrary: {},
};

const folderRecursivePreferencesV1Schema = z.object({
  version: z.literal(1),
  byLibrary: z.record(z.string(), z.record(z.string(), z.literal(true))),
});

const folderRecursivePreferencesV2Schema = z.object({
  version: z.literal(2),
  byLibrary: z.record(z.string(), z.record(z.string(), z.boolean())),
});

function resolveStorage(
  storage?: FolderRecursivePreferencesStorage,
): FolderRecursivePreferencesStorage {
  if (storage) return storage;
  const ls = (globalThis as { localStorage?: FolderRecursivePreferencesStorage })
    .localStorage;
  if (!ls) {
    throw new Error(
      'FolderRecursivePreferences: no storage provided and globalThis.localStorage is not available.',
    );
  }
  return ls;
}

export function loadFolderRecursivePreferences(
  storage?: FolderRecursivePreferencesStorage,
): FolderRecursivePreferences {
  const s = resolveStorage(storage);
  const raw = s.getItem(FOLDER_RECURSIVE_PREF_KEY);
  if (raw === null) return DEFAULT_FOLDER_RECURSIVE_PREFERENCES;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_FOLDER_RECURSIVE_PREFERENCES;
  }
  const v2 = folderRecursivePreferencesV2Schema.safeParse(parsed);
  if (v2.success) return v2.data;
  const v1 = folderRecursivePreferencesV1Schema.safeParse(parsed);
  if (!v1.success) return DEFAULT_FOLDER_RECURSIVE_PREFERENCES;
  return {
    version: 2,
    byLibrary: v1.data.byLibrary,
  };
}

/** Undefined means this folder has never been configured by the user. */
export function folderRecursivePreference(
  prefs: FolderRecursivePreferences,
  libraryId: string,
  folderId: string,
): boolean | undefined {
  return prefs.byLibrary[libraryId]?.[folderId];
}

export function isFolderRecursiveEnabled(
  prefs: FolderRecursivePreferences,
  libraryId: string,
  folderId: string,
): boolean {
  return folderRecursivePreference(prefs, libraryId, folderId) === true;
}

/**
 * Returns a new preferences object with the user's explicit setting.
 */
export function withFolderRecursiveEnabled(
  prefs: FolderRecursivePreferences,
  libraryId: string,
  folderId: string,
  enabled: boolean,
): FolderRecursivePreferences {
  const libraryMap = { ...(prefs.byLibrary[libraryId] ?? {}) };
  libraryMap[folderId] = enabled;
  const byLibrary = { ...prefs.byLibrary };
  if (Object.keys(libraryMap).length === 0) {
    delete byLibrary[libraryId];
  } else {
    byLibrary[libraryId] = libraryMap;
  }
  return { version: 2, byLibrary };
}

export function saveFolderRecursivePreferences(
  prefs: FolderRecursivePreferences,
  storage?: FolderRecursivePreferencesStorage,
): void {
  const s = resolveStorage(storage);
  const cleaned: FolderRecursivePreferences = {
    version: 2,
    byLibrary: prefs.byLibrary,
  };
  s.setItem(FOLDER_RECURSIVE_PREF_KEY, JSON.stringify(cleaned));
}
