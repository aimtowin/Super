// @vitest-environment happy-dom
import {
  act, createElement, StrictMode, useCallback, useEffect, useState,
  type Dispatch, type SetStateAction,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AssetSummary, BrowseLayoutEntry } from "../../src/shared/asset-types";
import type { SuperLibraryApi } from "../../src/shared/library-api";
import { createPublicError } from "../../src/shared/protocol/errors";
import {
  useBrowsePagination, type BrowsePageDefinition, type UseBrowsePaginationResult,
} from "../../src/renderer/use-browse-pagination";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type SearchInput = Parameters<SuperLibraryApi["searchAssets"]>[0];
type SearchResult = Awaited<ReturnType<SuperLibraryApi["searchAssets"]>>;
type Request = { input: SearchInput; promise: Promise<SearchResult>; resolve: (value: SearchResult) => void; reject: (error: unknown) => void };
const requests: Request[] = [];
const hosts: Array<{ root: Root; container: HTMLDivElement; mounted: boolean }> = [];

function asset(assetId: string): AssetSummary {
  return {
    assetId, locationKind: "managed", managedFolderId: null,
    relativeFilePath: `${assetId}.png`, displayName: `${assetId}.png`,
    currentRevisionId: `${assetId}-rev`, byteSize: 1, modifiedAt: "2026-01-01T00:00:00.000Z",
    availability: "available", rating: 0, favorite: false, deletedAt: null,
    trashedFromPath: null, trashedFromTombstoneId: null, remainingDays: null,
    thumbnailStatus: null, thumbnailArtifactId: null, mediaType: "image",
    width: 1, height: 1, durationMs: null,
  };
}
function items(prefix: string, offset = 0, count = 100) {
  return Array.from({ length: count }, (_value, index) => asset(`${prefix}-${offset + index}`));
}
function definition(libraryId: string, target: "assets" | "trash" = "assets"): BrowsePageDefinition {
  return { kind: "search", libraryId, query: null, showIgnored: false, target };
}
function page(prefix: string, offset = 100, total = 300, count = 100): SearchResult {
  return { ok: true, value: { items: items(prefix, offset, count), total, offset,
    snippets: [{ assetId: `${prefix}-${offset}`, text: `${prefix}-snippet` }] } };
}
function layout(prefix: string, offset = 100, total = 1_200, count = 500): SearchResult {
  return { ok: true, value: { items: [], total, offset,
    layout: items(prefix, offset, count).map(({ assetId, width, height }) => ({ assetId, width, height })) } };
}
const failed = (): SearchResult => ({ ok: false, error: createPublicError("FOLDER_NOT_FOUND") });
const cancelled = (): SearchResult => ({ ok: false, error: createPublicError("CANCELLED") });

function apiFixture(deferLayout = false) {
  const searchAssets = vi.fn((input: SearchInput): Promise<SearchResult> => {
    // A typed geometry failure exercises the existing summary-page fallback,
    // without an unrelated rejected void(beginPage hydration) promise.
    if (input.layoutOnly && !deferLayout) return Promise.resolve(failed());
    let resolve!: (value: SearchResult) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<SearchResult>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise; reject = rejectPromise;
    });
    const request = { input, promise, resolve, reject };
    requests.push(request);
    return promise;
  });
  return { api: { searchAssets, executeSmartCollection: vi.fn() } as unknown as SuperLibraryApi,
    searchAssets, request(kind: "page" | "layout" | "ids", libraryId: string, index = 0) {
      const matches = requests.filter(({ input }) => input.libraryId === libraryId
        && (kind === "layout" ? input.layoutOnly : kind === "ids" ? input.idsOnly : !input.layoutOnly && !input.idsOnly));
      const found = matches[index];
      if (!found) throw new Error(`Missing actual ${kind} request ${libraryId} #${index}.`);
      return found;
    }, count(kind: "page" | "layout" | "ids", libraryId: string) {
      return searchAssets.mock.calls.filter(([input]) => input.libraryId === libraryId
        && (kind === "layout" ? input.layoutOnly : kind === "ids" ? input.idsOnly : !input.layoutOnly && !input.idsOnly)).length;
    } };
}

function useTrackedState<T>(initial: T, name: string, journal: string[]) {
  const [value, setValue] = useState(initial);
  const publish: Dispatch<SetStateAction<T>> = useCallback((next) => {
    journal.push(name); setValue(next);
  }, [journal, name]);
  return [value, publish] as const;
}
type Snapshot = {
  pagination: UseBrowsePaginationResult; assets: AssetSummary[]; trash: AssetSummary[];
  layout: BrowseLayoutEntry[]; total: number | null; offset: number; snippets: Map<string, string>;
};
async function mountHook(api: SuperLibraryApi, options: {
  strict?: boolean;
  sentinel?: boolean;
  onSetup?: (pagination: Pick<UseBrowsePaginationResult, "beginPage" | "ensureVisibleRange">) => void;
} = {}) {
  const journal: string[] = [];
  const onLoadMoreFailed = vi.fn();
  let snapshot!: Snapshot;
  const onSetup = options.onSetup;
  function Host({ nonce }: { nonce: number }) {
    const [assets, setAssets] = useTrackedState<AssetSummary[]>([], "assets", journal);
    const [trash, setTrashedAssets] = useTrackedState<AssetSummary[]>([], "trash", journal);
    const [browseLayout, setBrowseLayout] = useTrackedState<BrowseLayoutEntry[]>([], "layout", journal);
    const [total, setSearchTotal] = useTrackedState<number | null>(null, "total", journal);
    const [offset, setSearchOffset] = useTrackedState(0, "offset", journal);
    const [snippets, setSearchSnippets] = useTrackedState(new Map<string, string>(), "snippets", journal);
    const pagination = useBrowsePagination({ api, setAssets, setTrashedAssets, setBrowseLayout,
      setSearchTotal, setSearchOffset, setSearchSnippets, onLoadMoreFailed });
    const { beginPage, ensureVisibleRange } = pagination;
    useEffect(() => { onSetup?.({ beginPage, ensureVisibleRange }); }, [beginPage, ensureVisibleRange]);
    useEffect(() => {
      snapshot = { pagination, assets, trash, layout: browseLayout, total, offset, snippets };
    }, [pagination, assets, trash, browseLayout, total, offset, snippets]);
    return options.sentinel
      ? createElement("div", { ref: pagination.sentinelRef, "data-nonce": nonce })
      : createElement("span", { "data-nonce": nonce });
  }
  const container = document.createElement("div");
  document.body.append(container);
  const owner = { root: createRoot(container), container, mounted: true };
  hosts.push(owner);
  const render = async (nonce = 0) => {
    await act(async () => {
      const child = createElement(Host, { nonce });
      owner.root.render(options.strict ? createElement(StrictMode, null, child) : child);
    });
  };
  await render();
  return { get: () => snapshot, journal, onLoadMoreFailed, render,
    async unmount() { if (owner.mounted) { await act(async () => owner.root.unmount()); owner.mounted = false; } } };
}
async function begin(host: Awaited<ReturnType<typeof mountHook>>, libraryId: string, prefix = libraryId, total = 300, target: "assets" | "trash" = "assets") {
  await act(async () => host.get().pagination.beginPage(definition(libraryId, target), { items: items(prefix), total, offset: 0 }));
}
async function startPage(host: Awaited<ReturnType<typeof mountHook>>, start = 100, end = 199) {
  let pending!: Promise<void | unknown>;
  await act(async () => { pending = host.get().pagination.ensureVisibleRange(start, end).catch((error: unknown) => error); });
  return { pending };
}

afterEach(async () => {
  for (const owner of hosts.splice(0)) {
    if (owner.mounted) await act(async () => owner.root.unmount());
    owner.container.remove();
  }
  await act(async () => {
    const unfinished = requests.splice(0);
    for (const request of unfinished) request.resolve(cancelled());
    await Promise.allSettled(unfinished.map((request) => request.promise));
  });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("actual browse-pagination generation lifetime", () => {
  it.each(["success", "failure", "rejection"] as const)("keeps B100 reserved/loading when A100 completes with %s after reset", async (completion) => {
    const fixture = apiFixture(); const host = await mountHook(fixture.api);
    await begin(host, "A"); const a = await startPage(host);
    await act(async () => host.get().pagination.reset());
    await begin(host, "B"); const b = await startPage(host);
    expect(host.get().pagination.loadingMore).toBe(true);
    await act(async () => {
      if (completion === "rejection") fixture.request("page", "A").reject(new Error("old transport failure"));
      else fixture.request("page", "A").resolve(completion === "success" ? page("stale-A", 100, 999) : failed());
      await a.pending;
    });
    expect.soft(host.get().pagination.loadingMore).toBe(true);
    expect(host.get().assets.map(({ assetId }) => assetId)).toEqual(items("B").map(({ assetId }) => assetId));
    expect(host.get().total).toBe(300);
    expect(host.get().offset).toBe(100);
    expect(host.get().snippets.size).toBe(0);
    expect(host.onLoadMoreFailed).not.toHaveBeenCalled();
    await startPage(host);
    expect(fixture.count("page", "B")).toBe(1);
    await act(async () => { fixture.request("page", "B").resolve(page("B")); await b.pending; });
    expect(host.get().pagination.loadingMore).toBe(false);
    expect(host.get().assets).toHaveLength(200);
    expect(host.get().snippets.get("B-100")).toBe("B-snippet");
  });

  it.each(["success", "failure"] as const)("does not clear B layout's in-flight lease in A layout's %s finally", async (completion) => {
    const fixture = apiFixture(true); const host = await mountHook(fixture.api);
    await begin(host, "A", "A", 1_200);
    await act(async () => host.get().pagination.reset());
    await begin(host, "B", "B", 1_200);
    expect(fixture.count("layout", "B")).toBe(1);
    await act(async () => fixture.request("layout", "A").resolve(completion === "success" ? layout("stale-A") : failed()));
    expect(host.get().layout.map(({ assetId }) => assetId)).toEqual(items("B").map(({ assetId }) => assetId));
    expect(host.get().total).toBe(1_200);
    await act(async () => { void host.get().pagination.appendNextPage(); });
    expect(fixture.count("layout", "B")).toBe(1);
    await act(async () => fixture.request("layout", "B").resolve(layout("B")));
    expect(host.get().layout).toHaveLength(600);
  });

  it("keeps the replacement StrictMode setup usable while the first setup's page finishes", async () => {
    const fixture = apiFixture();
    let setups = 0;
    const pending: Array<Promise<unknown>> = [];
    const host = await mountHook(fixture.api, { strict: true, onSetup: (pagination) => {
      setups += 1;
      pagination.beginPage(definition("same-library"), { items: items(`setup-${setups}`), total: 300, offset: 0 });
      pending.push(pagination.ensureVisibleRange(100, 199).catch((error: unknown) => error));
    } });
    expect(setups).toBe(2);
    expect(fixture.count("page", "same-library")).toBe(2);
    await act(async () => { fixture.request("page", "same-library", 0).resolve(page("stale-setup")); await pending[0]; });
    expect(host.get().pagination.loadingMore).toBe(true);
    expect(host.get().assets[0]?.assetId).toBe("setup-2-0");
    await startPage(host);
    expect(fixture.count("page", "same-library")).toBe(2);
    await act(async () => { fixture.request("page", "same-library", 1).resolve(page("current-setup")); await pending[1]; });
    expect(host.get().pagination.loadingMore).toBe(false);
    expect(host.get().assets).toHaveLength(200);
  });

  it.each(["success", "failure"] as const)("does not publish a late page/layout or toast after a true unmount (%s)", async (completion) => {
    const fixture = apiFixture(true); const host = await mountHook(fixture.api);
    await begin(host, "A"); const a = await startPage(host);
    await host.unmount(); host.journal.length = 0;
    await act(async () => {
      fixture.request("page", "A").resolve(completion === "success" ? page("late") : failed());
      fixture.request("layout", "A").resolve(layout("late", 100, 300, 200));
      await a.pending;
    });
    expect(host.journal).toEqual([]);
    expect(host.onLoadMoreFailed).not.toHaveBeenCalled();
  });

  it("returns no scope IDs when an ID query finishes after its hook unmounts", async () => {
    const fixture = apiFixture(); const host = await mountHook(fixture.api);
    await begin(host, "A");
    const ids = host.get().pagination.fetchScopeAssetIds();
    await host.unmount();
    fixture.request("ids", "A").resolve({ ok: true, value: { items: [], total: 2, offset: 0, assetIds: ["stale-a", "stale-b"] } });
    expect(await ids).toBeNull();
  });

  it("does not start work or publish through handlers retained after unmount", async () => {
    const fixture = apiFixture(); const host = await mountHook(fixture.api);
    await begin(host, "A"); const retained = host.get().pagination;
    await host.unmount(); host.journal.length = 0;
    const before = fixture.searchAssets.mock.calls.length;
    await act(async () => {
      retained.beginPage(definition("after-unmount"), { items: items("late"), total: 300, offset: 0 });
      retained.removeLocally(["late-0"], 1);
      void retained.ensureVisibleRange(100, 199).catch(() => undefined);
      void retained.fetchScopeAssetIds().catch(() => undefined);
      retained.reset();
    });
    expect(host.journal).toEqual([]);
    expect(fixture.searchAssets).toHaveBeenCalledTimes(before);
  });

  it("allows a real remount of the same library to finish independently of the old instance", async () => {
    const fixture = apiFixture(); const old = await mountHook(fixture.api);
    await begin(old, "same-library", "old"); const oldPage = await startPage(old);
    await old.unmount(); old.journal.length = 0;
    const next = await mountHook(fixture.api);
    await begin(next, "same-library", "new"); const nextPage = await startPage(next);
    await act(async () => { fixture.request("page", "same-library", 0).resolve(page("stale")); await oldPage.pending; });
    expect(old.journal).toEqual([]);
    expect(next.get().pagination.loadingMore).toBe(true);
    await act(async () => { fixture.request("page", "same-library", 1).resolve(page("new")); await nextPage.pending; });
    expect(next.get().pagination.loadingMore).toBe(false);
    expect(next.get().assets).toHaveLength(200);
    expect(next.get().assets[0]?.assetId).toBe("new-0");
  });

  it("retains trash targeting, snippets, and current-generation local deletion filtering", async () => {
    const fixture = apiFixture(); const host = await mountHook(fixture.api);
    await begin(host, "trash-library", "trash", 300, "trash");
    const pending = await startPage(host);
    await act(async () => host.get().pagination.removeLocally(["trash-100"], 1));
    await act(async () => { fixture.request("page", "trash-library").resolve(page("trash")); await pending.pending; });
    expect(host.get().assets).toEqual([]);
    expect(host.get().trash).toHaveLength(199);
    expect(host.get().trash.some(({ assetId }) => assetId === "trash-100")).toBe(false);
    expect(host.get().snippets.get("trash-100")).toBe("trash-snippet");
  });

  it("keeps public controller callbacks stable through an unrelated host render", async () => {
    const fixture = apiFixture(); const host = await mountHook(fixture.api);
    await begin(host, "A"); const previous = host.get().pagination;
    const before = fixture.searchAssets.mock.calls.length;
    await host.render(1);
    expect(host.get().pagination.beginPage).toBe(previous.beginPage);
    expect(host.get().pagination.ensureVisibleRange).toBe(previous.ensureVisibleRange);
    expect(host.get().pagination.appendNextPage).toBe(previous.appendNextPage);
    expect(fixture.searchAssets).toHaveBeenCalledTimes(before);
  });

  it("still fetches a distant destination while a different page is in flight, with the existing 500-row cap", async () => {
    const fixture = apiFixture(); const host = await mountHook(fixture.api);
    await begin(host, "large", "large", 2_000);
    const first = await startPage(host, 100, 199);
    const destination = await startPage(host, 700, 1_299);
    expect(fixture.count("page", "large")).toBe(2);
    expect(fixture.request("page", "large", 1).input).toMatchObject({ offset: 700, limit: 500 });
    await act(async () => {
      fixture.request("page", "large", 1).resolve(page("large", 700, 2_000, 500));
      await destination.pending;
    });
    expect(host.get().pagination.loadingMore).toBe(true);
    expect(host.get().assets).toHaveLength(600);
    expect(host.get().assets.some(({ assetId }) => assetId === "large-1199")).toBe(true);
    await act(async () => { fixture.request("page", "large", 0).resolve(page("large", 100, 2_000)); await first.pending; });
    expect(host.get().pagination.loadingMore).toBe(false);
    expect(host.get().assets).toHaveLength(700);
    expect(host.get().assets.some(({ assetId }) => assetId.startsWith("__pending:"))).toBe(false);
  });

  it("re-arms the actual tail observer after interactive loading but not an unrelated render", async () => {
    const observers: Array<{ callback: IntersectionObserverCallback; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];
    vi.stubGlobal("IntersectionObserver", class {
      observe = vi.fn(); disconnect = vi.fn();
      constructor(callback: IntersectionObserverCallback) {
        observers.push({ callback, observe: this.observe, disconnect: this.disconnect });
      }
    });
    const fixture = apiFixture(); const host = await mountHook(fixture.api, { sentinel: true });
    await begin(host, "observed");
    const beforeRender = observers.length;
    await host.render(1);
    expect(observers).toHaveLength(beforeRender);
    const pending = await startPage(host);
    const inFlightObserver = observers.at(-1)!;
    await act(async () => inFlightObserver.callback(
      [{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver,
    ));
    expect(fixture.count("page", "observed")).toBe(1);
    await act(async () => { fixture.request("page", "observed").resolve(page("observed")); await pending.pending; });
    const settledObserver = observers.at(-1)!;
    expect(settledObserver).not.toBe(inFlightObserver);
    expect(inFlightObserver.disconnect).toHaveBeenCalledTimes(1);
    expect(settledObserver.observe).toHaveBeenCalledTimes(1);
    await act(async () => settledObserver.callback(
      [{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver,
    ));
    expect(fixture.request("page", "observed", 1).input).toMatchObject({ offset: 200, limit: 100 });
    await act(async () => fixture.request("page", "observed", 1).resolve(page("observed", 200)));
    expect(host.get().assets).toHaveLength(300);
    expect(host.get().pagination.loadingMore).toBe(false);
  });
});
