import { describe, expect, it } from "vitest";
import { emojiKey, normalizeEmoji, readEmojiPreferences, saveEmojiPreference, emojiStorageKey } from "../../src/renderer/sidebar-emoji-preferences";

function storage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
}

describe("sidebar emoji preferences", () => {
  it.each(["📁", "👩🏽‍💻", "🇨🇳", "1️⃣", "❤️", "👨‍👩‍👧‍👦"])("accepts one complete emoji: %s", value => {
    expect(normalizeEmoji(` ${value} `)).toBe(value);
  });
  it.each(["", "abc", "1", "📁🌟", "<img>", "🇨", "🏽", "📁\u200dX"])("rejects non-emoji or multiple emoji: %s", value => {
    expect(normalizeEmoji(value)).toBeNull();
  });
  it("isolates libraries and item types, preserves siblings, resets one item", () => {
    const store = storage();
    const folder = emojiKey("folder", "one");
    const collection = emojiKey("collection", "one");
    saveEmojiPreference("a", folder, "📁", store);
    saveEmojiPreference("a", collection, "🌟", store);
    saveEmojiPreference("b", folder, "🎵", store);
    expect(readEmojiPreferences(store.getItem(emojiStorageKey("a")))).toEqual({ [folder]: "📁", [collection]: "🌟" });
    saveEmojiPreference("a", folder, null, store);
    expect(readEmojiPreferences(store.getItem(emojiStorageKey("a")))).toEqual({ [collection]: "🌟" });
    expect(readEmojiPreferences(store.getItem(emojiStorageKey("b")))).toEqual({ [folder]: "🎵" });
  });
  it("ignores corrupt data and invalid entries", () => {
    expect(readEmojiPreferences("broken")).toEqual({});
    expect(readEmojiPreferences("[]")).toEqual({});
    expect(readEmojiPreferences('{"a":"📁","b":"not emoji","__proto__":"🌟"}')).toEqual({ a: "📁" });
  });
  it("rejects invalid writes and exposes storage failures", () => {
    expect(() => saveEmojiPreference("a", "b", "abc", storage())).toThrow();
    expect(() => saveEmojiPreference("a", "b", "📁", { getItem: () => null, setItem: () => { throw new Error("full"); } })).toThrow("full");
  });
});
