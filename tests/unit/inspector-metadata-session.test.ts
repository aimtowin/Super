// @vitest-environment happy-dom
import { act, createElement, StrictMode, useLayoutEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import type { AssetMetadataResult } from "../../src/shared/asset-types";
import type { LibraryApiResult, SuperLibraryApi } from "../../src/shared/library-api";
import { createPublicError } from "../../src/shared/protocol/errors";
import type { RendererLibrarySummary } from "../../src/shared/protocol/responses";
import { LocaleProvider } from "../../src/renderer/i18n";
import { createMetadataReadController } from "../../src/renderer/metadata-read-controller";
import {
  useInspectorAssetMetadata,
  type UseInspectorAssetMetadataResult,
} from "../../src/renderer/use-inspector-asset-metadata";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const ignore = () => undefined;

type ReadInput = Parameters<SuperLibraryApi["getAssetMetadata"]>[0];
type SaveInput = Parameters<SuperLibraryApi["setAssetMetadata"]>[0];
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
    sourcePageUrl: null, author: null, tags: [], entityVersion: 1,
    updatedAt: "2026-10-08T00:00:00.000Z", ...overrides,
  };
}

function summary(libraryId = "library-a"): RendererLibrarySummary {
  return { libraryId, displayName: libraryId, displayPath: `/isolated/${libraryId}` };
}

/** The count belongs to raw API promises, not the hook's cancelled consumers. */
function createApiProbe() {
  const reads: Array<{ input: ReadInput; result: ReturnType<typeof deferred<MetadataResult>> }> = [];
  const saves: Array<{ input: SaveInput; result: ReturnType<typeof deferred<MetadataResult>> }> = [];
  let activeRawReads = 0;
  let maximumRawReads = 0;
  const api: Pick<SuperLibraryApi, "getAssetMetadata" | "setAssetMetadata" | "getAiContent"> = {
    getAssetMetadata(input: ReadInput): Promise<MetadataResult> {
      const result = deferred<MetadataResult>();
      reads.push({ input, result });
      activeRawReads++;
      maximumRawReads = Math.max(maximumRawReads, activeRawReads);
      return result.promise.finally(() => { activeRawReads--; });
    },
    setAssetMetadata(input: SaveInput): Promise<MetadataResult> {
      const result = deferred<MetadataResult>();
      saves.push({ input, result });
      return result.promise;
    },
    async getAiContent(input: ReadInput) {
      return { ok: true as const, value: {
        assetId: input.assetId, description: null, tags: [], rating: null,
        modelVersion: null, reanalysis: null,
      } };
    },
  };
  return {
    api: api as SuperLibraryApi, reads, saves,
    get activeRawReads() { return activeRawReads; },
    get maximumRawReads() { return maximumRawReads; },
    settlePending() {
      for (const read of reads) {
        read.result.resolve({ ok: true, value: metadata(read.input.assetId) });
      }
      for (const save of saves) {
        save.result.resolve({ ok: true, value: metadata(save.input.assetId, {
          entityVersion: save.input.expectedVersion + 1,
        }) });
      }
    },
  };
}

type Snapshot = UseInspectorAssetMetadataResult & {
  metadata: AssetMetadataResult | null;
  resetUi: () => void;
};
const cleanups: Array<() => Promise<void>> = [];

async function mountInspector(initialSummary = summary(), strict = false) {
  const probe = createApiProbe();
  // Same ref objects as App; a session transition must not let an old closure
  // write through .current into the replacement session.
  const controller = createMetadataReadController((input) => probe.api.getAssetMetadata(input));
  let owner = controller.activateSession(initialSummary);
  const cacheRef = { get current() { return controller.currentCache(owner); } };
  const conflictsRef = { get current() { return controller.conflictIds(owner); } };
  const primaryRef = { current: "same-asset" as string | undefined };
  const selectedRef = { current: ["same-asset"] as readonly string[] };
  const aiContentRef = { current: null };
  const notices: Array<{ message: string | null; historyEntryId?: string }> = [];
  const errors: Array<string | null> = [];
  const reportNotice = (message: string | null, historyEntryId?: string) => { notices.push({ message, historyEntryId }); };
  const reportError = (message: string | null) => { errors.push(message); };
  let snapshot!: Snapshot;

  function Host({ library }: { library: RendererLibrarySummary }) {
    const [assetMetadata, setAssetMetadata] = useState<AssetMetadataResult | null>(null);
    const result = useInspectorAssetMetadata({
      api: probe.api, library, selectedAssetId: primaryRef.current, selectedAssetIds: selectedRef.current,
      selectedAssetIdRef: primaryRef, selectedAssetIdsRef: selectedRef,
      metadataController: controller, metadataSession: owner,
      assetMetadata, editDescription: "", editRating: 0, editFavorite: false, editSourceUrl: "", editAuthor: "", setAssetMetadata,
      setVersionConflict: ignore, setEditDescription: ignore,
      setEditRating: ignore, setEditFavorite: ignore,
      setEditSourceUrl: ignore, setEditAuthor: ignore,
      setDescriptionIsAi: ignore, aiContentRef,
      setAiContent: ignore, setAssets: ignore,
      setTrashedAssets: ignore,
      setNotice: reportNotice,
      setError: reportError,
    });
    useLayoutEffect(() => {
      snapshot = { ...result, metadata: assetMetadata, resetUi: () => setAssetMetadata(null) };
    });
    return null;
  }

  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const tree = (library: RendererLibrarySummary) => {
    const child = createElement(LocaleProvider, {
      initialPreference: "zh-CN", children: createElement(Host, { library }),
    });
    return strict ? createElement(StrictMode, null, child) : child;
  };
  await act(async () => { root.render(tree(initialSummary)); });
  cleanups.push(async () => {
    await act(async () => { root.unmount(); });
    // Only finish isolated deferred API promises; no real Worker, DB or IPC.
    for (let round = 0; round < 4; round++) {
      await act(async () => { probe.settlePending(); });
    }
    host.remove();
  });
  return {
    probe, cacheRef, conflictsRef, notices, errors,
    seedCurrent(value: AssetMetadataResult) {
      controller.commitMutation(controller.beginMutation(owner, [value.assetId]), [value]);
    },
    get snapshot() { return snapshot; },
    async reopen(library: RendererLibrarySummary) {
      await act(async () => {
        owner = controller.activateSession(library); snapshot.resetUi();
        root.render(tree(library));
      });
    },
    async updateSummary(library: RendererLibrarySummary) {
      await act(async () => { controller.updateSessionSummary(owner, library); root.render(tree(library)); });
    },
  };
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("actual single Inspector hook: metadata session lifecycle (A5)", () => {
  it("rereads the same asset after the same library is reopened", async () => {
    const fixture = await mountInspector();
    expect(fixture.probe.reads).toHaveLength(1);
    await fixture.reopen({ ...summary() });
    // A real replacement session can retain both libraryId and selectedId.
    expect(fixture.probe.reads).toHaveLength(2);
  });

  it("does not treat a rename summary update as a replacement session", async () => {
    const fixture = await mountInspector();
    await fixture.updateSummary({ ...summary(), displayName: "renamed" });
    expect(fixture.probe.reads).toHaveLength(1);
    await act(async () => {
      fixture.probe.reads[0]!.result.resolve({ ok: true, value: metadata("same-asset", { description: "still-current" }) });
    });
    expect(fixture.snapshot.metadata?.description).toBe("still-current");
  });

  it("does not publish a late old-library read into replacement cache or UI", async () => {
    const fixture = await mountInspector();
    const oldRead = fixture.probe.reads[0]!;
    await fixture.reopen(summary("library-b"));
    await act(async () => {
      oldRead.result.resolve({ ok: true, value: metadata("same-asset", { description: "old-library" }) });
    });
    expect(fixture.cacheRef.current.has("same-asset")).toBe(false);
    expect(fixture.snapshot.metadata).toBeNull();
  });

  it("keeps a successful versioned save when a pre-save refresh returns late", async () => {
    const fixture = await mountInspector();
    await act(async () => {
      fixture.probe.reads[0]!.result.resolve({ ok: true, value: metadata("same-asset") });
    });
    let refresh!: Promise<void>;
    await act(async () => { refresh = fixture.snapshot.loadMetadata(); });
    const oldRefresh = fixture.probe.reads.at(-1)!;
    let save!: Promise<void>;
    await act(async () => { save = fixture.snapshot.saveMetadata({ rating: 5 }); });
    expect(fixture.probe.saves[0]!.input.expectedVersion).toBe(1);
    await act(async () => {
      fixture.probe.saves[0]!.result.resolve({ ok: true, value: metadata("same-asset", { rating: 5, entityVersion: 2 }) });
      await save;
    });
    await act(async () => {
      oldRefresh.result.resolve({ ok: true, value: metadata("same-asset", { rating: 0, entityVersion: 1 }) });
      await refresh;
    });
    expect(fixture.cacheRef.current.get("same-asset")).toMatchObject({ rating: 5, entityVersion: 2 });
    expect(fixture.snapshot.metadata).toMatchObject({ rating: 5, entityVersion: 2 });
  });

  it("keeps conflict protection until a refresh confirms the server conflict version", async () => {
    const fixture = await mountInspector();
    await act(async () => {
      fixture.probe.reads[0]!.result.resolve({ ok: true, value: metadata("same-asset") });
    });
    let save!: Promise<void>;
    await act(async () => { save = fixture.snapshot.saveMetadata({ favorite: true }); });
    await act(async () => {
      fixture.probe.saves[0]!.result.resolve({ ok: false, error: createPublicError("VERSION_CONFLICT", undefined, 7) });
      await save;
    });
    expect(fixture.conflictsRef.current.has("same-asset")).toBe(true);
    let refresh!: Promise<void>;
    await act(async () => { refresh = fixture.snapshot.loadMetadata(); });
    await act(async () => {
      fixture.probe.reads.at(-1)!.result.resolve({ ok: true, value: metadata("same-asset", { entityVersion: 4 }) });
      await refresh;
    });
    expect(fixture.conflictsRef.current.has("same-asset")).toBe(true);
  });

  it("allows dispatched durable save to finish without replacement publication or queued old save", async () => {
    const fixture = await mountInspector();
    await act(async () => {
      fixture.probe.reads[0]!.result.resolve({ ok: true, value: metadata("same-asset") });
    });
    let firstSave!: Promise<void>;
    let queuedSave!: Promise<void>;
    await act(async () => { firstSave = fixture.snapshot.saveMetadata({ favorite: true }); });
    await act(async () => { queuedSave = fixture.snapshot.saveMetadata({ author: "queued-old" }); });
    expect(fixture.probe.saves).toHaveLength(1);
    await fixture.reopen(summary("library-b"));
    await act(async () => { fixture.seedCurrent(metadata("same-asset", { description: "replacement", entityVersion: 9 })); });
    await act(async () => {
      fixture.probe.saves[0]!.result.resolve({ ok: true, value: metadata("same-asset", { description: "old-save", favorite: true, entityVersion: 2 }) });
      await firstSave;
    });
    expect(fixture.probe.saves).toHaveLength(1);
    await queuedSave;
    expect(fixture.cacheRef.current.get("same-asset")).toMatchObject({ description: "replacement", entityVersion: 9 });
    expect(fixture.notices).toEqual([]);
    expect(fixture.snapshot.metadata?.description).toBe("replacement");
  });

  it("does not dispatch abandoned StrictMode setup after its cleanup", async () => {
    const fixture = await mountInspector(summary(), true);
    expect(fixture.probe.reads).toHaveLength(1);
    expect(fixture.probe.activeRawReads).toBe(1);
  });
});
