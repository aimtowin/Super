import { describe, expect, it } from "vitest";
import type { AssetSummary } from "../../src/shared/asset-types";
import { resolvePreviewKeyboardAsset } from "../../src/renderer/preview-keyboard";

const asset = (id: string, extra: Partial<AssetSummary> = {}) => ({
  assetId: id, availability: "available", deletedAt: null, ...extra,
}) as AssetSummary;
describe("preview keyboard card ownership", () => {
  it("opens the focused card while selection has not committed", () => {
    const gif = asset("gif");
    expect(resolvePreviewKeyboardAsset("gif", undefined, [gif])).toBe(gif);
  });
  it("does not open the old selected asset instead of the newly focused card", () => {
    const old = asset("old"), next = asset("next");
    expect(resolvePreviewKeyboardAsset("next", old, [old, next])).toBe(next);
  });
  it("keeps the selected-asset fallback when focus is on the canvas", () => {
    const selected = asset("selected");
    expect(resolvePreviewKeyboardAsset(undefined, selected, [selected])).toBe(selected);
  });
  it("does not fall back to an unrelated selection for a stale focused card", () => {
    expect(resolvePreviewKeyboardAsset("removed", asset("other"), [])).toBeUndefined();
  });
  it("does not open missing or deleted cards", () => {
    const missing = asset("missing", { availability: "missing" });
    const deleted = asset("deleted", { deletedAt: "2026-10-10T00:00:00Z" });
    expect(resolvePreviewKeyboardAsset("missing", undefined, [missing])).toBeUndefined();
    expect(resolvePreviewKeyboardAsset("deleted", undefined, [deleted])).toBeUndefined();
  });
});
