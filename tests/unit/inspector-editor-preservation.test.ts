// @vitest-environment happy-dom
import { act, createElement, useLayoutEffect, useState, type SetStateAction } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { AssetMetadataResult, AssetSummary } from "../../src/shared/asset-types";
import type { LibraryApiResult, SuperLibraryApi } from "../../src/shared/library-api";
import { LocaleProvider } from "../../src/renderer/i18n";
import { createMetadataReadController } from "../../src/renderer/metadata-read-controller";
import { useInspectorAssetMetadata, type InspectorAiContent, type UseInspectorAssetMetadataResult } from "../../src/renderer/use-inspector-asset-metadata";
import { useInspectorMultiEdit, type UseInspectorMultiEditResult } from "../../src/renderer/use-inspector-multi-edit";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const ignore = () => undefined;
const library = { libraryId: "isolated", displayName: "isolated", displayPath: "/isolated" };
function metadata(fields: Partial<AssetMetadataResult> = {}): AssetMetadataResult {
  return { assetId: "a", description: "stored-description", author: "stored-author", sourcePageUrl: "https://example.test/stored",
    rating: 0, favorite: false, palette: null, automaticPalette: [], effectivePalette: [], paletteSource: null,
    tags: [], entityVersion: 1, updatedAt: "2026-10-08T00:00:00Z", ...fields };
}
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

async function mount() {
  let finishSave!: (value: LibraryApiResult<AssetMetadataResult>) => void;
  let holdAi = false;
  let finishAi!: (value: Awaited<ReturnType<SuperLibraryApi["getAiContent"]>>) => void;
  const saveInputs: Array<Parameters<SuperLibraryApi["setAssetMetadata"]>[0]> = [];
  const summaryUpdaters: Array<SetStateAction<AssetSummary[]>> = [];
  const bridge: Pick<SuperLibraryApi, "getAssetMetadata" | "setAssetMetadata" | "getAiContent"> = {
    async getAssetMetadata() { return { ok: true as const, value: metadata() }; },
    setAssetMetadata(input: Parameters<SuperLibraryApi["setAssetMetadata"]>[0]) {
      saveInputs.push(input);
      return new Promise<LibraryApiResult<AssetMetadataResult>>((resolve) => { finishSave = resolve; });
    },
    async getAiContent() {
      if (holdAi) return new Promise<Awaited<ReturnType<SuperLibraryApi["getAiContent"]>>>((resolve) => { finishAi = resolve; });
      return { ok: true as const, value: { assetId: "a", description: null, tags: [], rating: null, modelVersion: null, reanalysis: null } };
    },
  };
  const controller = createMetadataReadController(bridge.getAssetMetadata);
  let owner = controller.activateSession(library);
  const primary = { current: "a" as string | undefined };
  const selection = { current: ["a"] as readonly string[] };
  const aiRef = { current: null as InspectorAiContent | null };
  let snapshot!: UseInspectorAssetMetadataResult & {
    description: string; author: string; sourceUrl: string; rating: number;
    editDraft: (fields: { description?: string; author?: string; sourceUrl?: string }) => void;
  };
  function Host() {
    const [assetMetadata, setAssetMetadata] = useState<AssetMetadataResult | null>(null);
    const [description, setEditDescription] = useState("");
    const [author, setEditAuthor] = useState("");
    const [sourceUrl, setEditSourceUrl] = useState("");
    const [rating, setEditRating] = useState(0);
    const [aiContent, setAiContent] = useState<InspectorAiContent | null>(null);
    aiRef.current = aiContent;
    const result = useInspectorAssetMetadata({
      api: bridge as SuperLibraryApi, library, metadataController: controller, metadataSession: owner,
      selectedAssetId: "a", selectedAssetIds: selection.current, selectedAssetIdRef: primary, selectedAssetIdsRef: selection,
      assetMetadata, editDescription: description, setAssetMetadata, setVersionConflict: ignore, setEditDescription, setEditAuthor,
      setEditSourceUrl, setEditRating, setEditFavorite: ignore, setDescriptionIsAi: ignore,
      aiContentRef: aiRef, setAiContent, setAssets: (update) => { summaryUpdaters.push(update); },
      setTrashedAssets: (update) => { summaryUpdaters.push(update); }, setNotice: ignore, setError: ignore,
    });
    useLayoutEffect(() => {
      snapshot = { ...result, description, author, sourceUrl, rating, editDraft(fields) {
        if (fields.description !== undefined) setEditDescription(fields.description);
        if (fields.author !== undefined) setEditAuthor(fields.author);
        if (fields.sourceUrl !== undefined) setEditSourceUrl(fields.sourceUrl);
      } };
    });
    return null;
  }
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  await act(async () => root.render(createElement(LocaleProvider, { initialPreference: "zh-CN", children: createElement(Host) })));
  cleanups.push(async () => { await act(async () => root.unmount()); controller.disposeSession(owner); host.remove(); });
  const renderHost = () => root.render(createElement(LocaleProvider, { initialPreference: "zh-CN", children: createElement(Host) }));
  return { saveInputs, summaryUpdaters, get snapshot() { return snapshot; }, finishSave(fields: Partial<AssetMetadataResult>) {
    finishSave({ ok: true, value: metadata({ entityVersion: 2, ...fields }) });
  }, invalidate() { controller.invalidate(owner, ["a"]); }, holdAi() { holdAi = true; }, finishAi() {
    finishAi({ ok: true, value: { assetId: "a", description: "generated", tags: [], rating: null, modelVersion: "fixture", reanalysis: null } });
  }, replaceOwnerWithoutRendering() { owner = controller.activateSession(library); }, async reopenSameId() {
    await act(async () => { owner = controller.activateSession(library); renderHost(); });
  }, async changeSelection(ids: readonly string[]) {
    await act(async () => { selection.current = ids; renderHost(); });
  } };
}

describe("real single Inspector hook: pending editor drafts survive unrelated durable saves (A5 review)", () => {
  it("keeps unsaved description/author/source drafts when rating is saved", async () => {
    const f = await mount();
    expect(f.snapshot.description).toBe("stored-description");
    await act(async () => f.snapshot.editDraft({ description: "unsaved-description", author: "unsaved-author", sourceUrl: "https://example.test/draft" }));
    let save!: Promise<void>;
    await act(async () => { save = f.snapshot.saveMetadata({ rating: 5 }); });
    expect(f.saveInputs[0]).toMatchObject({ expectedVersion: 1, rating: 5 });
    await act(async () => { f.finishSave({ rating: 5 }); await save; });
    expect(f.snapshot.description).toBe("unsaved-description");
    expect(f.snapshot.author).toBe("unsaved-author");
    expect(f.snapshot.sourceUrl).toBe("https://example.test/draft");
  });

  it("keeps an unsaved source draft when favorite is saved", async () => {
    const f = await mount();
    await act(async () => f.snapshot.editDraft({ sourceUrl: "https://example.test/unsaved" }));
    let save!: Promise<void>;
    await act(async () => { save = f.snapshot.saveMetadata({ favorite: true }); });
    await act(async () => { f.finishSave({ favorite: true }); await save; });
    expect(f.snapshot.sourceUrl).toBe("https://example.test/unsaved");
  });

  it("keeps newer input in the same description field while its earlier save finishes", async () => {
    const f = await mount();
    await act(async () => f.snapshot.editDraft({ description: "submitted" }));
    let save!: Promise<void>;
    await act(async () => { save = f.snapshot.saveMetadata({ description: "submitted" }); });
    await act(async () => f.snapshot.editDraft({ description: "newer-unsaved" }));
    await act(async () => { f.finishSave({ description: "submitted" }); await save; });
    expect(f.snapshot.description).toBe("newer-unsaved");
  });

  it("keeps a description draft against a deferred AI hydration reply", async () => {
    const f = await mount(); f.holdAi();
    let load!: Promise<void>;
    await act(async () => { load = f.snapshot.loadAiContentForAsset("a"); });
    await act(async () => f.snapshot.editDraft({ description: "draft-before-ai-reply" }));
    await act(async () => { f.finishAi(); await load; });
    expect(f.snapshot.description).toBe("draft-before-ai-reply");
  });

  it("hydrates a genuine same-ID replacement instead of retaining the old owner's drafts", async () => {
    const f = await mount();
    await act(async () => f.snapshot.editDraft({ description: "old-owner-draft", author: "old-owner-author" }));
    await f.reopenSameId();
    expect(f.snapshot.description).toBe("stored-description");
    expect(f.snapshot.author).toBe("stored-author");
  });

  it("hydrates single fields again after a real multi/single selection transition with the same primary", async () => {
    const f = await mount();
    await act(async () => f.snapshot.editDraft({ description: "old-single-draft" }));
    await f.changeSelection(["a", "b"]);
    await act(async () => f.snapshot.editDraft({ description: "multi-editor-value" }));
    await f.changeSelection(["a"]);
    expect(f.snapshot.description).toBe("stored-description");
  });

  it("guards the actual dispatched summary-updater callback when it executes after replacement (callback contract, not App lane reproduction)", async () => {
    const f = await mount(); let save!: Promise<void>;
    await act(async () => { save = f.snapshot.saveMetadata({ rating: 5, favorite: true }); });
    await act(async () => { f.finishSave({ rating: 5, favorite: true }); await save; });
    expect(f.summaryUpdaters).toHaveLength(2);
    f.replaceOwnerWithoutRendering();
    const replacementRows = [{ assetId: "a", rating: 1, favorite: false }] as AssetSummary[];
    for (const updater of f.summaryUpdaters) {
      expect(typeof updater).toBe("function");
      if (typeof updater === "function") expect(updater(replacementRows)).toBe(replacementRows);
    }
  });

  it("does not patch a summary from an invalidated save publication when its captured updater executes (callback contract)", async () => {
    const f = await mount(); let save!: Promise<void>;
    await act(async () => { save = f.snapshot.saveMetadata({ rating: 5 }); });
    await act(async () => { f.finishSave({ rating: 5 }); await save; });
    const currentRows = [{ assetId: "a", rating: 4, favorite: false }] as AssetSummary[];
    await act(async () => f.invalidate());
    for (const updater of f.summaryUpdaters) {
      if (typeof updater === "function") expect(updater(currentRows)).toBe(currentRows);
    }
  });
});

describe("real complete multi Inspector hook: drafts are independent of metadata refresh (A5 review)", () => {
  it("keeps unrelated description/author/source drafts after same-version batch rating rehydrates all IDs", async () => {
    const server = new Map(["a", "b"].map((id) => [id, metadata({ assetId: id })]));
    let finishRating!: (value: Awaited<ReturnType<SuperLibraryApi["setAssetsRating"]>>) => void;
    const api: Pick<SuperLibraryApi, "getAssetMetadata" | "setAssetsRating"> = {
      async getAssetMetadata(input: Parameters<SuperLibraryApi["getAssetMetadata"]>[0]) { return { ok: true as const, value: server.get(input.assetId)! }; },
      setAssetsRating(input: Parameters<SuperLibraryApi["setAssetsRating"]>[0]) {
        for (const id of input.assetIds) server.set(id, { ...server.get(id)!, rating: input.rating });
        return new Promise<Awaited<ReturnType<SuperLibraryApi["setAssetsRating"]>>>((resolve) => { finishRating = resolve; });
      },
    };
    const controller = createMetadataReadController(api.getAssetMetadata);
    const owner = controller.activateSession(library);
    const primary = { current: "a" as string | undefined };
    let snapshot!: UseInspectorMultiEditResult & { description: string; author: string; sourceUrl: string; editDraft: () => void };
    function Host() {
      const [description, setEditDescription] = useState("");
      const [author, setEditAuthor] = useState("");
      const [sourceUrl, setEditSourceUrl] = useState("");
      const result = useInspectorMultiEdit({
        api: api as SuperLibraryApi, library, metadataController: controller, metadataSession: owner,
        selectedAssetIds: ["a", "b"], selectedAssetIdRef: primary,
        setEditDescription, setEditAuthor, setEditSourceUrl, setEditRating: ignore, setEditFavorite: ignore,
        setAssets: ignore, setTrashedAssets: ignore, setAssetMetadata: ignore, setNotice: ignore, setError: ignore,
      });
      useLayoutEffect(() => { snapshot = { ...result, description, author, sourceUrl, editDraft() {
        setEditDescription("multi-description-draft"); setEditAuthor("multi-author-draft"); setEditSourceUrl("https://example.test/multi-draft");
      } }; });
      return null;
    }
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    cleanups.push(async () => { await act(async () => root.unmount()); controller.disposeSession(owner); host.remove(); });
    await act(async () => root.render(createElement(LocaleProvider, { initialPreference: "zh-CN", children: createElement(Host) })));
    expect(snapshot.multiEdit?.selectionCount).toBe(2);
    await act(async () => snapshot.editDraft());
    let saving!: Promise<void>;
    await act(async () => { saving = snapshot.batchSetRatingForSelection(5, ["a", "b"]); });
    await act(async () => { finishRating({ ok: true, value: { updatedCount: 2, skipped: [] } }); await saving; });
    expect(snapshot.multiEdit?.rating).toEqual({ kind: "uniform", value: 5 });
    expect(snapshot.multiEdit?.selectionCount).toBe(2);
    expect(snapshot.description).toBe("multi-description-draft");
    expect(snapshot.author).toBe("multi-author-draft");
    expect(snapshot.sourceUrl).toBe("https://example.test/multi-draft");
  });
});
