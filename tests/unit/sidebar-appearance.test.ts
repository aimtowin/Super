import { describe, expect, it } from "vitest";
import { SIDEBAR_EMOJI_GROUPS, SIDEBAR_ICON_IDS } from "../../src/renderer/sidebar-appearance-catalog";
import { appearanceStorageKey, normalizeSidebarAppearance, readSidebarAppearances, saveSidebarAppearance } from "../../src/renderer/sidebar-appearance-preferences";
import { emojiKey, emojiStorageKey, normalizeEmoji } from "../../src/renderer/sidebar-emoji-preferences";

describe("sidebar appearance preferences", () => {
  it("offers valid full emoji from every upstream category", () => {
    expect(SIDEBAR_EMOJI_GROUPS).toHaveLength(11);
    for (const group of SIDEBAR_EMOJI_GROUPS) for (const emoji of group.items) expect(normalizeEmoji(emoji)).toBe(emoji);
    expect(SIDEBAR_ICON_IDS.size).toBeGreaterThan(20);
  });
  it("reads v1 without rewriting it and resets without resurrecting the legacy emoji", () => {
    const key = emojiKey("folder", "a");
    const map = new Map([[emojiStorageKey("lib"), JSON.stringify({ [key]: "👩🏽‍💻" })]]);
    const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); } };
    const legacy = storage.getItem(emojiStorageKey("lib"));
    expect(readSidebarAppearances(null, legacy)[key]?.glyph?.value).toBe("👩🏽‍💻");
    saveSidebarAppearance("lib", key, { glyph: { kind: "icon", value: "star" }, color: "pink" }, storage);
    expect(readSidebarAppearances(storage.getItem(appearanceStorageKey("lib")), legacy)[key]?.color).toBe("pink");
    saveSidebarAppearance("lib", key, null, storage);
    expect(readSidebarAppearances(storage.getItem(appearanceStorageKey("lib")), legacy)[key]).toBeUndefined();
    expect(storage.getItem(emojiStorageKey("lib"))).toBe(legacy);
    expect(storage.getItem(appearanceStorageKey("other"))).toBeNull();
  });
  it("rejects untrusted glyphs, css colors, malformed storage and prototype keys", () => {
    expect(normalizeSidebarAppearance({ glyph: { kind: "icon", value: "<svg>" }, color: null })).toBeNull();
    expect(normalizeSidebarAppearance({ glyph: null, color: "url(https://evil)" })).toBeNull();
    expect(readSidebarAppearances('{"__proto__":null,"constructor":null}', null)).toEqual({});
    expect(readSidebarAppearances("bad", null)).toEqual({});
    expect(readSidebarAppearances('[null]', null)).toEqual({});
    expect(normalizeSidebarAppearance({ glyph: null, color: "green" })).toEqual({ glyph: null, color: "green" });
  });
  it("keeps sibling preferences and reports storage write failures", () => {
    let raw: string | null = null;
    const storage = { getItem: () => raw, setItem: (_k: string, v: string) => { raw = v; } };
    for (const key of ["a", "b"]) saveSidebarAppearance("lib", key, { glyph: { kind: "emoji", value: "🚀" }, color: null }, storage);
    expect(Object.keys(readSidebarAppearances(raw, null))).toEqual(["a", "b"]);
    expect(() => saveSidebarAppearance("lib", "a", null, { ...storage, setItem: () => { throw Error("Quota"); } })).toThrow("Quota");
  });
});
