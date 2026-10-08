// @vitest-environment happy-dom
import { act, createElement, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import type { AssetMetadataResult } from "../../src/shared/asset-types";
import type { LibraryApiResult, SuperLibraryApi } from "../../src/shared/library-api";
import { createPublicError } from "../../src/shared/protocol/errors";
import type { RendererLibrarySummary } from "../../src/shared/protocol/responses";
import { LocaleProvider } from "../../src/renderer/i18n";
import { createMetadataReadController } from "../../src/renderer/metadata-read-controller";
import { useBatchActions, type UseBatchActionsResult } from "../../src/renderer/useBatchActions";
import {
  useInspectorMultiEdit,
  type UseInspectorMultiEditResult,
} from "../../src/renderer/use-inspector-multi-edit";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const ignore = () => undefined;

type ReadInput = Parameters<SuperLibraryApi["getAssetMetadata"]>[0];
type RatingInput = Parameters<SuperLibraryApi["setAssetsRating"]>[0];
type MetadataResult = LibraryApiResult<AssetMetadataResult>;

function deferred<T>() {
  let resolvePromise!: (value: T) => void;
  let settled = false;
  const promise = new Promise<T>((resolve) => { resolvePromise = resolve; });
  return {
    promise,
    get settled() { return settled; },
    resolve(value: T) {
      if (settled) return;
      settled = true;
      resolvePromise(value);
    },
  };
}

function metadata(assetId: string, overrides: Partial<AssetMetadataResult> = {}): AssetMetadataResult {
  return {
    assetId, description: null, rating: 0, favorite: false, palette: null,
    automaticPalette: [], effectivePalette: [], paletteSource: null,
    sourcePageUrl: null, author: null, tags: [], entityVersion: 7,
    updatedAt: "2026-10-08T00:00:00.000Z", ...overrides,
  };
}

function summary(libraryId = "library-a"): RendererLibrarySummary {
  return { libraryId, displayName: libraryId, displayPath: `/isolated/${libraryId}` };
}

/** Snapshot at dispatch, matching an old Worker read that arrives after a write. */
function createApiProbe() {
  const server = new Map<string, AssetMetadataResult>();
  const reads: Array<{
    input: ReadInput;
    snapshot: AssetMetadataResult;
    result: ReturnType<typeof deferred<MetadataResult>>;
  }> = [];
  const ratings: RatingInput[] = [];
  const saves: Array<Parameters<SuperLibraryApi["setAssetMetadata"]>[0]> = [];
  let tagGate: ReturnType<typeof deferred<void>> | undefined;
  let listTagsCalls = 0;
  let activeRawReads = 0;
  let maximumRawReads = 0;
  const key = (libraryId: string, assetId: string) => `${libraryId}\0${assetId}`;
  const api: Pick<SuperLibraryApi, "getAssetMetadata" | "setAssetsRating" | "assignTags" | "listTags" | "setAssetMetadata"> = {
    getAssetMetadata(input: ReadInput): Promise<MetadataResult> {
      const result = deferred<MetadataResult>();
      reads.push({ input, snapshot: server.get(key(input.libraryId, input.assetId)) ?? metadata(input.assetId), result });
      activeRawReads++;
      maximumRawReads = Math.max(maximumRawReads, activeRawReads);
      return result.promise.finally(() => { activeRawReads--; });
    },
    async setAssetsRating(input: RatingInput) {
      ratings.push(input);
      for (const assetId of input.assetIds) {
        const current = server.get(key(input.libraryId, assetId)) ?? metadata(assetId);
        // Production batch rating intentionally leaves entityVersion unchanged.
        server.set(key(input.libraryId, assetId), { ...current, rating: input.rating });
      }
      return { ok: true as const, value: { updatedCount: input.assetIds.length, skipped: [], historyEntryId: "isolated-rating-history" } };
    },
    async assignTags(input: Parameters<SuperLibraryApi["assignTags"]>[0]) {
      if (tagGate) await tagGate.promise;
      for (const assetId of input.assetIds) {
        const current = server.get(key(input.libraryId, assetId)) ?? metadata(assetId);
        server.set(key(input.libraryId, assetId), { ...current, tags: [{ id: input.tagIds[0]!, name: "fresh-tag", source: "user" }] });
      }
      return { ok: true as const, value: { assignedCount: input.assetIds.length, skipped: [], historyEntryId: "isolated-tag-history" } };
    },
    async listTags() { listTagsCalls++; return { ok: true as const, value: [] }; },
    async setAssetMetadata(input: Parameters<SuperLibraryApi["setAssetMetadata"]>[0]) {
      saves.push(input);
      const current = server.get(key(input.libraryId, input.assetId)) ?? metadata(input.assetId);
      const next: AssetMetadataResult = {
        ...current,
        description: input.description === undefined ? current.description : input.description.trim() || null,
        author: input.author === undefined ? current.author : input.author.trim() || null,
        sourcePageUrl: input.sourcePageUrl === undefined ? current.sourcePageUrl : input.sourcePageUrl.trim() || null,
        rating: input.rating ?? current.rating,
        favorite: input.favorite ?? current.favorite,
        // The real Service retains this legacy column and ignores manual
        // palette input; do not spread a write DTO's string[] into stored data.
        palette: current.palette,
        entityVersion: input.expectedVersion + 1,
      };
      server.set(key(input.libraryId, input.assetId), next);
      return { ok: true as const, value: { ...next, historyEntryId: `history-${input.assetId}` } };
    },
  };
  return {
    api: api as SuperLibraryApi, reads, ratings, saves,
    holdTag() { tagGate = deferred<void>(); return tagGate; },
    get activeRawReads() { return activeRawReads; },
    get maximumRawReads() { return maximumRawReads; },
    get listTagsCalls() { return listTagsCalls; },
    mutateServer(assetId: string, fields: Partial<AssetMetadataResult>, libraryId = "library-a") {
      const current = server.get(key(libraryId, assetId)) ?? metadata(assetId);
      server.set(key(libraryId, assetId), { ...current, ...fields });
    },
    settlePending(libraryId?: string) {
      for (const read of reads) {
        if (libraryId && read.input.libraryId !== libraryId) continue;
        read.result.resolve({ ok: true, value: read.snapshot });
      }
    },
  };
}

const cleanups: Array<() => Promise<void>> = [];

async function mountInspector(initialIds: readonly string[], initialSummary = summary()) {
  const probe = createApiProbe();
  const controller = createMetadataReadController((input) => probe.api.getAssetMetadata(input));
  let owner = controller.activateSession(initialSummary);
  const cacheRef = { get current() { return controller.currentCache(owner); } };
  const conflictsRef = { get current() { return controller.conflictIds(owner); } };
  const primaryRef = { current: initialIds[0] };
  const errors: Array<string | null> = [];
  const notices: Array<{ message: string | null; historyEntryId?: string }> = [];
  const uiStates: string[] = [];
  const tagLists: unknown[] = [];
  const reportNotice = (message: string | null, historyEntryId?: string) => { notices.push({ message, historyEntryId }); };
  const reportError = (message: string | null) => { errors.push(message); };
  let snapshot!: UseInspectorMultiEditResult;
  let batch!: UseBatchActionsResult;

  function Host({ ids, library }: { ids: readonly string[]; library: RendererLibrarySummary }) {
    const result = useInspectorMultiEdit({
      api: probe.api, library, selectedAssetIds: ids, selectedAssetIdRef: primaryRef,
      metadataController: controller, metadataSession: owner,
      setEditDescription: ignore, setEditRating: ignore,
      setEditFavorite: ignore, setEditSourceUrl: ignore,
      setEditAuthor: ignore, setAssetMetadata: ignore,
      setAssets: ignore, setTrashedAssets: ignore,
      setNotice: reportNotice, setError: reportError,
    });
    const batchResult = useBatchActions({
      api: probe.api, library, metadataController: controller, metadataSession: owner,
      setUiState: (state) => { uiStates.push(state); }, setTags: (tags) => { tagLists.push(tags); }, setCollections: ignore, setNotice: reportNotice,
      setError: reportError, reloadCurrentContent: async () => undefined,
      applyLocalAssetRemoval: ignore, chooseTag: async () => undefined,
      chooseCollection: async () => undefined, clearAssetSelection: ignore,
      activeTagId: null, activeCollectionId: null,
    });
    useLayoutEffect(() => { snapshot = result; batch = batchResult; });
    return null;
  }

  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const tree = (ids: readonly string[], library: RendererLibrarySummary) => createElement(LocaleProvider, {
    initialPreference: "zh-CN", children: createElement(Host, { ids, library }),
  });
  await act(async () => { root.render(tree(initialIds, initialSummary)); });
  cleanups.push(async () => {
    await act(async () => { root.unmount(); });
    await act(async () => { probe.settlePending(); });
    host.remove();
  });
  return {
    probe, cacheRef, conflictsRef, errors, controller, notices, uiStates, tagLists,
    invalidate(assetIds: readonly string[]) { controller.invalidate(owner, assetIds); },
    get snapshot() { return snapshot; },
    get batch() { return batch; },
    async rerender(ids: readonly string[], library = initialSummary, replacement = false) {
      await act(async () => {
        primaryRef.current = ids[0];
        if (replacement) owner = controller.activateSession(library);
        else controller.updateSessionSummary(owner, library);
        root.render(tree(ids, library));
      });
    },
  };
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("actual multi Inspector hook: complete reads and lifecycle (A5)", () => {
  it("preserves per-target expectedVersion, complete writes and the last durable history notice", async () => {
    const fixture = await mountInspector(["a", "b", "c"]);
    await act(async () => { fixture.probe.settlePending(); });
    await act(async () => { await fixture.snapshot.saveMetadataForSelection(["a", "b", "c"], { author: "complete-author" }); });
    expect(fixture.probe.saves.map((save) => [save.assetId, save.expectedVersion])).toEqual([["a", 7], ["b", 7], ["c", 7]]);
    expect(fixture.snapshot.multiEdit?.author).toEqual({ kind: "uniform", value: "complete-author" });
    expect(fixture.snapshot.multiEdit?.selectionCount).toBe(3);
    expect(fixture.notices.at(-1)?.historyEntryId).toBe("history-c");
  });

  it("lets an already-dispatched tag mutation finish but drops old-session tags/notice/UI publication", async () => {
    const fixture = await mountInspector(["a", "b"]);
    const gate = fixture.probe.holdTag(); let mutation!: Promise<void>;
    await act(async () => { mutation = fixture.batch.batchAssignTagToSelection("tag", ["a", "b"]); });
    await fixture.rerender(["a", "b"], summary("library-b"), true);
    await act(async () => { gate.resolve(undefined); await mutation; });
    expect(fixture.probe.listTagsCalls).toBe(0);
    expect(fixture.tagLists).toEqual([]); expect(fixture.notices).toEqual([]);
    expect(fixture.uiStates).toEqual(["loading"]);
    expect(fixture.cacheRef.current.size).toBe(0);
  });

  it("refreshes both blocked selected IDs after the actual batch-tag helper succeeds, with listTags once", async () => {
    const fixture = await mountInspector(["a", "b"]);
    await act(async () => { await fixture.batch.batchAssignTagToSelection("tag", ["a", "b"]); });
    expect(fixture.probe.listTagsCalls).toBe(1);
    for (let round = 0; round < 4; round++) await act(async () => { fixture.probe.settlePending(); });
    expect(fixture.snapshot.multiEdit?.selectionCount).toBe(2);
    expect(fixture.snapshot.multiEdit?.tags.map((tag) => tag.name)).toEqual(["fresh-tag"]);
    expect(fixture.cacheRef.current.get("a")?.tags[0]?.name).toBe("fresh-tag");
    expect(fixture.cacheRef.current.get("b")?.tags[0]?.name).toBe("fresh-tag");
  });

  it("keeps unchanged full selection current after a non-primary AI invalidation", async () => {
    const fixture = await mountInspector(["a", "b"]);
    fixture.probe.mutateServer("b", { rating: 5, entityVersion: 8 });
    await act(async () => { fixture.invalidate(["b"]); });
    for (let round = 0; round < 4; round++) await act(async () => { fixture.probe.settlePending(); });
    expect(fixture.snapshot.multiEdit?.selectionCount).toBe(2);
    expect(fixture.snapshot.multiEdit?.rating).toEqual({ kind: "mixed" });
    expect(fixture.cacheRef.current.get("b")?.rating).toBe(5);
  });

  it("dispatches at most three raw bulk reads for a cold 1,000-ID selection", async () => {
    const ids = Array.from({ length: 1_000 }, (_, index) => `asset-${index}`);
    const fixture = await mountInspector(ids);
    expect(fixture.snapshot.multiEdit).toBeNull();
    expect(fixture.probe.maximumRawReads).toBeLessThanOrEqual(3);
    expect(fixture.probe.activeRawReads).toBeLessThanOrEqual(3);
  });

  it("shares the same raw read for repeated IDs without dropping distinct IDs", async () => {
    const fixture = await mountInspector(["a", "a", "b"]);
    expect(fixture.probe.reads.filter((read) => read.input.assetId === "a")).toHaveLength(1);
    expect(fixture.probe.reads.filter((read) => read.input.assetId === "b")).toHaveLength(1);
  });

  it("does not let cancelled old-library bulk responses fill replacement cache", async () => {
    const fixture = await mountInspector(["a", "b"]);
    await fixture.rerender(["a", "b"], summary("library-b"), true);
    await act(async () => { fixture.probe.settlePending("library-a"); });
    // Replacement requests remain genuinely unresolved; old writes are forbidden.
    expect(fixture.probe.reads.some((read) => read.input.libraryId === "library-b")).toBe(true);
    expect(fixture.cacheRef.current.size).toBe(0);
    expect(fixture.snapshot.multiEdit).toBeNull();
  });

  it("rereads unchanged selected IDs when the same library is reopened", async () => {
    const fixture = await mountInspector(["a", "b"]);
    await act(async () => { fixture.probe.settlePending(); });
    expect(fixture.snapshot.multiEdit?.selectionCount).toBe(2);
    await fixture.rerender(["a", "b"], { ...summary() }, true);
    expect(fixture.probe.reads).toHaveLength(4);
    expect(fixture.snapshot.multiEdit).toBeNull();
  });

  it("keeps current reads and the complete model through a rename summary update", async () => {
    const fixture = await mountInspector(["a", "b"]);
    await fixture.rerender(["a", "b"], { ...summary(), displayName: "renamed" });
    expect(fixture.probe.reads).toHaveLength(2);
    await act(async () => { fixture.probe.settlePending(); });
    expect(fixture.snapshot.multiEdit?.selectionCount).toBe(2);
  });

  it("does not derive an aggregate from the successful subset of a failed selection", async () => {
    const fixture = await mountInspector(["a", "b"]);
    await act(async () => {
      fixture.probe.reads.find((read) => read.input.assetId === "a")!.result.resolve({ ok: true, value: metadata("a", { rating: 5 }) });
      fixture.probe.reads.find((read) => read.input.assetId === "b")!.result.resolve({ ok: false, error: createPublicError("ASSET_NOT_FOUND") });
    });
    expect(fixture.snapshot.multiEdit).toBeNull();
    // Non-ok API results currently disappear silently. The failure must be
    // surfaced; controller-only green tests cannot substitute for this hook.
    expect(fixture.errors.some((message) => Boolean(message))).toBe(true);
  });

  it("invalidates pre-mutation reads after same-version batch rating with unchanged selection", async () => {
    const ids = ["a", "b"];
    const fixture = await mountInspector(ids);
    // Both real hook reads are blocked at v7/rating0. The real hook's batch
    // write now succeeds at v7/rating5; no selection change triggers a reload.
    await act(async () => { await fixture.snapshot.batchSetRatingForSelection(5, ids); });
    expect(fixture.probe.ratings).toHaveLength(1);
    // Drain new epoch reads too if the implementation schedules them. Captures
    // from before the mutation stay rating0, while new dispatches read rating5.
    for (let round = 0; round < 4; round++) {
      await act(async () => { fixture.probe.settlePending(); });
    }
    expect(fixture.snapshot.multiEdit?.selectionCount).toBe(2);
    expect(fixture.snapshot.multiEdit?.rating).toEqual({ kind: "uniform", value: 5 });
    expect(fixture.cacheRef.current.get("a")).toMatchObject({ entityVersion: 7, rating: 5 });
    expect(fixture.cacheRef.current.get("b")).toMatchObject({ entityVersion: 7, rating: 5 });
  });

  it("preserves every selected ID in a complete aggregate", async () => {
    const ids = Array.from({ length: 1_000 }, (_, index) => `asset-${index}`);
    const fixture = await mountInspector(ids);
    // This is the behavior-preservation gate: bounded dispatch may take many
    // rounds, but a controller must neither truncate nor use a success subset.
    for (let round = 0; round <= ids.length; round++) {
      await act(async () => { fixture.probe.settlePending(); });
      if (fixture.snapshot.multiEdit?.selectionCount === ids.length) break;
    }
    expect(fixture.snapshot.multiEdit?.selectionCount).toBe(ids.length);
    expect(fixture.cacheRef.current.size).toBe(ids.length);
    expect(fixture.probe.maximumRawReads).toBeLessThanOrEqual(3);
  });
});
