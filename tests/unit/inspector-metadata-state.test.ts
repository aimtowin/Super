// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AssetMetadataResult, AssetSummary } from "../../src/shared/asset-types";
import { InspectorPanel, type InspectorPanelProps } from "../../src/renderer/InspectorPanel";
import { LocaleProvider } from "../../src/renderer/i18n";
import { rebuildMultiEditFromCache } from "../../src/renderer/inspector-multi-edit";

// The real Inspector is mounted; unrelated App startup and card-feel animation
// are not part of this isolated metadata state/UI gate.
vi.mock("../../src/renderer/App", () => ({ formatDuration: () => "" }));
vi.mock("../../src/renderer/InspectorCardFeelProvider", () => ({ useInspectorCardFeel: () => ({ enabled: false }) }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const ignore = () => undefined;
const asset: AssetSummary = {
  assetId: "a", displayName: "a.png", locationKind: "managed", managedFolderId: null,
  relativeFilePath: "a.png", currentRevisionId: "revision-a", byteSize: 10,
  modifiedAt: "2026-10-08T00:00:00Z", availability: "available", rating: 0, favorite: false,
  deletedAt: null, trashedFromPath: null, trashedFromTombstoneId: null, remainingDays: null,
  thumbnailStatus: null, thumbnailArtifactId: null, mediaType: "image", width: 10, height: 10, durationMs: null,
};
const metadata: AssetMetadataResult = {
  assetId: "a", description: "primary-only", rating: 0, favorite: false, palette: null,
  automaticPalette: [], effectivePalette: [], paletteSource: null, sourcePageUrl: null,
  author: null, tags: [{ id: "primary-tag", name: "primary-only-tag", source: "user" }],
  entityVersion: 7, updatedAt: "2026-10-08T00:00:00Z",
};
function props(extra: Partial<InspectorPanelProps> = {}): InspectorPanelProps {
  return { selectedAsset: asset, selectedAssets: [asset], selectedAssetIds: ["a", "b"],
    library: { libraryId: "isolated", displayName: "isolated", displayPath: "/isolated" },
    allAssetCount: 2, folderCount: 0, loadMetadata: ignore, assetMetadata: metadata,
    versionConflict: false, editDescription: "primary-only", editRating: 0, editFavorite: false,
    editSourceUrl: "", editAuthor: "", displayedPalette: [], automaticPaletteRatios: new Map(),
    aiContent: null, handleMetadataDescriptionSave: ignore, handleMetadataDescriptionInput: ignore,
    handleRatingClick: ignore, handleFavoriteToggle: ignore, handleSourceUrlSave: ignore,
    handleSourceUrlInput: ignore, handleAuthorSave: ignore, handleAuthorInput: ignore,
    allTags: [], multiEdit: null, ...extra };
}
const cleanups: Array<() => Promise<void>> = [];
async function mount(initial: InspectorPanelProps) {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const render = async (value: InspectorPanelProps) => act(async () => {
    root.render(createElement(LocaleProvider, { initialPreference: "zh-CN", children: createElement(InspectorPanel, value) }));
  });
  await render(initial);
  cleanups.push(async () => { await act(async () => root.unmount()); host.remove(); });
  return { host, render };
}
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

describe("real Inspector: incomplete complete-selection state (A5)", () => {
  it("shows one version-conflict alert rather than mislabeling a rejected write as a read failure", async () => {
    const reload = vi.fn();
    const f = await mount(props({
      selectedAssetIds: ["a"], selectedAssets: [asset], versionConflict: true,
      metadataReadState: {status: "error", total: 1, ready: 0, failedAssetIds: ["a"]},
      loadMetadata: reload,
    }));
    const alerts = f.host.querySelectorAll('[role="alert"]');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.textContent).toContain("元数据已被其他操作修改");
    expect(f.host.querySelector('[data-metadata-state="error"]')).toBeNull();
    await act(async () => {alerts[0]?.querySelector<HTMLButtonElement>("button")?.click();});
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it("does not render single editor or primary tags while a 1,000-ID selection is pending", async () => {
    const ids = Array.from({ length: 1_000 }, (_, index) => index === 0 ? "a" : `asset-${index}`);
    const f = await mount(props({ selectedAssetIds: ids, metadataReadState: { status: "loading", total: 1_000, ready: 1, failedAssetIds: [] } }));
    expect(f.host.querySelector('[data-metadata-state="loading"]')?.textContent).toContain("1/1000");
    expect(f.host.querySelector(".tag-chip-name")).toBeNull();
    expect(f.host.querySelector(".rating-star")).toBeNull();
    expect(f.host.querySelector("textarea")).toBeNull();
    expect(f.host.querySelector<HTMLButtonElement>('.inspector-tags-header button')?.disabled).toBe(true);
  });

  it("surfaces failed IDs and invokes explicit retry without deriving from primary metadata", async () => {
    const retry = vi.fn();
    const f = await mount(props({ metadataReadState: { status: "error", total: 2, ready: 1, failedAssetIds: ["b"] }, onRetryMetadata: retry }));
    const status = f.host.querySelector('[data-metadata-state="error"]');
    expect(status?.textContent).toContain("1 项元数据读取失败");
    expect(f.host.querySelector(".rating-star")).toBeNull();
    await act(async () => { status?.querySelector<HTMLButtonElement>("button")?.click(); });
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("restores the complete aggregate editor only after both selected IDs are current", async () => {
    const cache = new Map([["a", metadata], ["b", { ...metadata, assetId: "b" }]]);
    const model = rebuildMultiEditFromCache(["a", "b"], cache);
    const f = await mount(props({ multiEdit: model, metadataReadState: { status: "ready", total: 2, ready: 2, failedAssetIds: [] } }));
    expect(f.host.querySelector('[data-metadata-state]')).toBeNull();
    expect(f.host.querySelectorAll(".rating-star")).toHaveLength(5);
    expect(f.host.querySelector(".tag-chip-name")?.textContent).toBe("primary-only-tag");
    expect(f.host.querySelector<HTMLButtonElement>('.inspector-tags-header button')?.disabled).toBe(false);
  });

  it("does not present a retained single-asset AI source flag as provenance for the complete multi-selection human aggregate", async () => {
    const human = { ...metadata, description: null };
    const single = props({
      selectedAssetIds: ["a"], selectedAssets: [asset], assetMetadata: human,
      editDescription: "generated-ai-description", descriptionIsAi: true,
      aiContent: { assetId: "a", description: "generated-ai-description" },
      metadataReadState: { status: "ready", total: 1, ready: 1, failedAssetIds: [] },
    });
    const f = await mount(single);
    expect(f.host.querySelector(".inspector-ai-badge-inline")).not.toBeNull();
    expect(f.host.querySelector("textarea")?.classList.contains("is-ai-sourced")).toBe(true);

    // App keeps the same primary when another ID joins its selection. The
    // single hook's source flag can remain true while the complete model is
    // derived from both assets' HUMAN metadata, not the primary's AI layer.
    const model = rebuildMultiEditFromCache(["a", "b"], new Map([
      ["a", human], ["b", { ...human, assetId: "b" }],
    ]));
    await f.render({ ...single, selectedAssetIds: ["a", "b"], multiEdit: model,
      editDescription: "", metadataReadState: { status: "ready", total: 2, ready: 2, failedAssetIds: [] } });
    expect(f.host.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("");
    expect(f.host.querySelector(".inspector-ai-badge-inline")).toBeNull();
    expect(f.host.querySelector("textarea")?.classList.contains("is-ai-sourced")).toBe(false);
  });
});
