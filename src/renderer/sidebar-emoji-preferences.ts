/** Local appearance only; library metadata and physical folder names stay untouched. */
export type EmojiItemKind = "folder" | "collection" | "smart-collection";
export type EmojiPreferences = Readonly<Record<string, string>>;
export interface EmojiStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

// Supported by the shipped Electron runtime. String-property matching preserves
// whole ZWJ sequences, flags and skin tones rather than slicing UTF-16 characters.
const emojiPattern = new RegExp("^\\p{RGI_Emoji}$", "v");
export function normalizeEmoji(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length <= 64 && !/^\p{Emoji_Modifier}$/u.test(trimmed) && emojiPattern.test(trimmed) ? trimmed : null;
}

export function emojiKey(kind: EmojiItemKind, id: string): string {
  return JSON.stringify([kind, id]);
}

export function emojiStorageKey(libraryId: string): string {
  return `superApi.sidebar-emoji.v1:${libraryId}`;
}

export function readEmojiPreferences(raw: string | null): EmojiPreferences {
  try {
    const value: unknown = JSON.parse(raw ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([key, emoji]) =>
      !["__proto__", "constructor", "prototype"].includes(key) &&
      typeof emoji === "string" && normalizeEmoji(emoji) === emoji,
    ));
  } catch {
    return {};
  }
}

export function saveEmojiPreference(
  libraryId: string, key: string, value: string | null, storage: EmojiStorage,
): void {
  const normalized = value === null ? null : normalizeEmoji(value);
  if (value !== null && normalized === null) throw new Error("Invalid emoji");
  const storageKey = emojiStorageKey(libraryId);
  const next = { ...readEmojiPreferences(storage.getItem(storageKey)) };
  if (normalized === null) delete next[key];
  else Object.defineProperty(next, key, { value: normalized, enumerable: true, configurable: true });
  storage.setItem(storageKey, JSON.stringify(next));
}
