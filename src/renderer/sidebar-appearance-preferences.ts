import { emojiStorageKey, normalizeEmoji, readEmojiPreferences, type EmojiStorage } from "./sidebar-emoji-preferences";
import { SIDEBAR_APPEARANCE_COLORS, SIDEBAR_ICON_IDS, type SidebarAppearanceColor } from "./sidebar-appearance-catalog";
import type { IconName } from "./Icons";

export type SidebarAppearance = {
  glyph: { kind: "emoji"; value: string } | { kind: "icon"; value: IconName } | null;
  color: SidebarAppearanceColor | null;
};
type StoredPreferences = Record<string, SidebarAppearance | null>;
const safeKey = (key: string) => !["__proto__", "constructor", "prototype"].includes(key);
export const appearanceStorageKey = (libraryId: string) => `superApi.sidebar-appearance.v2:${libraryId}`;

export function normalizeSidebarAppearance(value: unknown): SidebarAppearance | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { glyph, color } = value as Record<string, unknown>;
  if (color !== null && (typeof color !== "string" || !Object.hasOwn(SIDEBAR_APPEARANCE_COLORS, color))) return null;
  if (glyph === null) return { glyph: null, color: color as SidebarAppearanceColor | null };
  if (!glyph || typeof glyph !== "object" || Array.isArray(glyph)) return null;
  const { kind, value: name } = glyph as Record<string, unknown>;
  if (typeof name !== "string") return null;
  if (kind === "emoji" && normalizeEmoji(name) === name) return { glyph: { kind, value: name }, color: color as SidebarAppearanceColor | null };
  if (kind === "icon" && SIDEBAR_ICON_IDS.has(name)) return { glyph: { kind, value: name as IconName }, color: color as SidebarAppearanceColor | null };
  return null;
}

function readStored(raw: string | null): StoredPreferences {
  try {
    const parsed: unknown = JSON.parse(raw ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([key, value]) => safeKey(key) &&
      (value === null || normalizeSidebarAppearance(value) !== null)).map(([key, value]) =>
      [key, value === null ? null : normalizeSidebarAppearance(value)]));
  } catch { return {}; }
}

/** Legacy emoji preferences remain intact; null tombstones prevent reset resurrecting them. */
export function readSidebarAppearances(raw: string | null, legacyRaw: string | null): Record<string, SidebarAppearance> {
  const result: Record<string, SidebarAppearance> = Object.fromEntries(Object.entries(readEmojiPreferences(legacyRaw))
    .map(([key, value]) => [key, { glyph: { kind: "emoji", value }, color: null }]));
  for (const [key, value] of Object.entries(readStored(raw))) {
    if (value === null) delete result[key];
    else Object.defineProperty(result, key, { value, enumerable: true, configurable: true, writable: true });
  }
  return result;
}

export function saveSidebarAppearance(libraryId: string, key: string, value: SidebarAppearance | null, storage: EmojiStorage): void {
  if (!libraryId || !safeKey(key)) throw new Error("Invalid appearance key");
  const normalized = value === null ? null : normalizeSidebarAppearance(value);
  if (value !== null && normalized === null) throw new Error("Invalid appearance");
  const storageKey = appearanceStorageKey(libraryId);
  const next = readStored(storage.getItem(storageKey));
  Object.defineProperty(next, key, { value: normalized, enumerable: true, configurable: true });
  storage.setItem(storageKey, JSON.stringify(next));
}

export function getSidebarAppearanceSnapshot(libraryId: string | undefined, storage: EmojiStorage): string {
  return JSON.stringify(libraryId ? [storage.getItem(appearanceStorageKey(libraryId)), storage.getItem(emojiStorageKey(libraryId))] : [null, null]);
}
