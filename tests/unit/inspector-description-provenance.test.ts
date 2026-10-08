// @vitest-environment happy-dom
import { act, createElement, useLayoutEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { AssetMetadataResult, AssetSummary } from "../../src/shared/asset-types";
import type { SuperLibraryApi } from "../../src/shared/library-api";
import { LocaleProvider } from "../../src/renderer/i18n";
import { createMetadataReadController } from "../../src/renderer/metadata-read-controller";
import { useInspectorAssetMetadata, type InspectorAiContent } from "../../src/renderer/use-inspector-asset-metadata";
import { useInspectorFieldHandlers } from "../../src/renderer/use-inspector-field-handlers";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const ignore = () => undefined;
const library = { libraryId: "isolated", displayName: "isolated", displayPath: "/isolated" };
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

function metadata(description: string | null = null, entityVersion = 1): AssetMetadataResult {
  return { assetId: "a", description, author: null, sourcePageUrl: null, rating: 0, favorite: false,
    palette: null, automaticPalette: [], effectivePalette: [], paletteSource: null,
    tags: [], entityVersion, updatedAt: "2026-10-08T00:00:00Z" };
}

async function mount(initial = metadata(), immediateAi = false) {
  let stored = initial;
  let aiArrived = immediateAi;
  let resolveAi!: (value: Awaited<ReturnType<SuperLibraryApi["getAiContent"]>>) => void;
  const firstAi = new Promise<Awaited<ReturnType<SuperLibraryApi["getAiContent"]>>>((resolve) => { resolveAi = resolve; });
  const aiValue = () => ({ ok: true as const, value: { assetId: "a", description: "generated-ai-description",
    tags: [], rating: null, modelVersion: "isolated-model", reanalysis: null } });
  const saves: Array<Parameters<SuperLibraryApi["setAssetMetadata"]>[0]> = [];
  const clears: Array<Parameters<SuperLibraryApi["clearAiContent"]>[0]> = [];
  const api: Pick<SuperLibraryApi, "getAssetMetadata" | "getAiContent" | "setAssetMetadata" | "clearAiContent"> = {
    async getAssetMetadata() { return { ok: true as const, value: stored }; },
    async getAiContent() { return aiArrived ? aiValue() : firstAi; },
    async setAssetMetadata(input: Parameters<SuperLibraryApi["setAssetMetadata"]>[0]) {
      saves.push(input);
      stored = { ...stored, description: input.description ?? stored.description, entityVersion: input.expectedVersion + 1 };
      return { ok: true as const, value: stored };
    },
    async clearAiContent(input: Parameters<SuperLibraryApi["clearAiContent"]>[0]) {
      clears.push(input); return { ok: true as const, value: { clearedCount: 1 } };
    },
  };
  const controller = createMetadataReadController(api.getAssetMetadata);
  const owner = controller.activateSession(library);
  const primary = { current: "a" as string | undefined };
  const selection = { current: ["a"] as readonly string[] };
  const aiRef = { current: null as InspectorAiContent | null };
  let snapshot!: { description: string; descriptionIsAi: boolean; hasMetadata: boolean; input: (value: string) => void; save: () => void };
  function Host() {
    const [assetMetadata, setAssetMetadata] = useState<AssetMetadataResult | null>(null);
    const [description, setEditDescription] = useState("");
    const [descriptionIsAi, setDescriptionIsAi] = useState(false);
    const [aiContent, setAiContent] = useState<InspectorAiContent | null>(null);
    aiRef.current = aiContent;
    const result = useInspectorAssetMetadata({
      api: api as SuperLibraryApi, library, metadataController: controller, metadataSession: owner,
      selectedAssetId: "a", selectedAssetIds: selection.current, selectedAssetIdRef: primary, selectedAssetIdsRef: selection,
      assetMetadata, editDescription: description, setAssetMetadata, setVersionConflict: ignore, setEditDescription,
      setEditAuthor: ignore, setEditSourceUrl: ignore, setEditRating: ignore, setEditFavorite: ignore,
      setDescriptionIsAi, aiContentRef: aiRef, setAiContent,
      setAssets: ignore, setTrashedAssets: ignore, setNotice: ignore, setError: ignore,
    });
    const handlers = useInspectorFieldHandlers({
      api: api as SuperLibraryApi, shellApi: null, library, metadataController: controller, metadataSession: owner,
      selectedAssetIdRef: primary, selectedAsset: { assetId: "a" } as AssetSummary, selectedAssetId: "a", selectedAssetIds: ["a"],
      assetMetadata, multiEdit: null, editDescription: description, editFavorite: false, editSourceUrl: "", editAuthor: "",
      descriptionIsAi, aiContent, setEditDescription, setEditRating: ignore, setEditFavorite: ignore,
      setEditSourceUrl: ignore, setEditAuthor: ignore, setDescriptionIsAi, setAiContent,
      saveMetadata: result.saveMetadata, saveMetadataForSelection: async () => undefined,
      batchSetRatingForSelection: async () => undefined, loadMetadata: result.loadMetadata, setNotice: ignore, setError: ignore,
    });
    useLayoutEffect(() => { snapshot = { description, descriptionIsAi, hasMetadata: assetMetadata !== null,
      input(value) { handlers.handleMetadataDescriptionInput({ target: { value } } as unknown as FormEvent<HTMLTextAreaElement>); },
      save: handlers.handleMetadataDescriptionSave,
    }; });
    return null;
  }
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  cleanups.push(async () => {
    await act(async () => root.unmount()); controller.disposeSession(owner);
    resolveAi(aiValue()); await Promise.resolve(); host.remove();
  });
  await act(async () => root.render(createElement(LocaleProvider, { initialPreference: "zh-CN", children: createElement(Host) })));
  return { get snapshot() { return snapshot; }, saves, clears, async finishAi() {
    await act(async () => { aiArrived = true; resolveAi(aiValue()); });
  }, async restoreConfirmedHistory(value: AssetMetadataResult) {
    await act(async () => { stored = value; controller.invalidateAfterHistoryRestore(owner); });
  } };
}

describe("real single Inspector description provenance and field-save routing (A5 review)", () => {
  it("does not relabel a human draft as AI when initial AI hydration arrives late", async () => {
    const f = await mount(); expect(f.snapshot.hasMetadata).toBe(true);
    await act(async () => f.snapshot.input("human draft before AI arrived"));
    await f.finishAi();
    expect(f.snapshot.description).toBe("human draft before AI arrived");
    expect(f.snapshot.descriptionIsAi).toBe(false);
  });

  it("saves that human draft through the ordinary field handler without clearing unrelated AI provenance", async () => {
    const f = await mount();
    await act(async () => f.snapshot.input("human draft before AI arrived"));
    await f.finishAi();
    await act(async () => { f.snapshot.save(); });
    expect(f.saves).toHaveLength(1);
    expect(f.saves[0]).toMatchObject({ description: "human draft before AI arrived", expectedVersion: 1 });
    expect(f.clears).toHaveLength(0);
  });

  it("continues to label an actually adopted, untouched AI description as AI", async () => {
    const f = await mount(); await f.finishAi();
    expect(f.snapshot.description).toBe("generated-ai-description");
    expect(f.snapshot.descriptionIsAi).toBe(true);
  });

  it("retains the original promote semantics when the user edits an actually displayed AI description", async () => {
    const f = await mount(); await f.finishAi();
    await act(async () => f.snapshot.input("edited generated description"));
    expect(f.snapshot.descriptionIsAi).toBe(true);
    await act(async () => { f.snapshot.save(); });
    expect(f.saves[0]).toMatchObject({ description: "edited generated description", expectedVersion: 1 });
    expect(f.clears).toHaveLength(1);
    expect(f.clears[0]?.fields).toEqual(["description"]);
    expect(f.snapshot.descriptionIsAi).toBe(false);
  });

  it("does not relabel a retained human draft even when it coincides with the late AI text", async () => {
    const f = await mount();
    await act(async () => f.snapshot.input("generated-ai-description"));
    await f.finishAi();
    expect(f.snapshot.descriptionIsAi).toBe(false);
    await act(async () => { f.snapshot.save(); });
    expect(f.saves).toHaveLength(1);
    expect(f.clears).toHaveLength(0);
  });

  it("shows a successful history restore when the editor has no unsubmitted draft (hook publication contract)", async () => {
    const f = await mount(metadata("edited", 2));
    expect(f.snapshot.description).toBe("edited");
    await f.restoreConfirmedHistory(metadata("restored", 1));
    expect(f.snapshot.description).toBe("restored");
    expect(f.snapshot.descriptionIsAi).toBe(false);
  });

  it("keeps a clean baseline refreshable when cached AI and metadata hydrate in the same React batch", async () => {
    const f = await mount(metadata("edited", 2), true);
    expect(f.snapshot.description).toBe("edited");
    expect(f.snapshot.descriptionIsAi).toBe(false);
    await f.restoreConfirmedHistory(metadata("restored", 1));
    expect(f.snapshot.description).toBe("restored");
  });
});
