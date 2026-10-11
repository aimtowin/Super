// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, createElement, type Dispatch, type SetStateAction } from "react";
import { createRoot, type Root } from "react-dom/client";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AssetSummary, BrowseLayoutEntry, FilterClause, SearchQuery, SearchScope } from "../../src/shared/asset-types";
import type { SuperLibraryApi } from "../../src/shared/library-api";
import type { RendererLibrarySummary } from "../../src/shared/protocol/responses";
import { createPublicError } from "../../src/shared/protocol/errors";
import { parseSearchExpression } from "../../src/shared/search-expression";
import { assetSupportsThumbnail } from "../../src/shared/thumbnail-support";
import { createCoalescedRefresh } from "../../src/renderer/coalesced-refresh";
import { hydrateContent, type ContentHydrationUpdate } from "../../src/renderer/content-hydration";
import { LibraryOperationError } from "../../src/renderer/error-utils";
import { folderBrowseScope } from "../../src/renderer/folder-browse-scope";
import { createMetadataReadController } from "../../src/renderer/metadata-read-controller";
import {
  BROWSE_PAGE_SIZE, registerBrowseSearchPage, useBrowsePagination,
  type BeginBrowsePage, type UseBrowsePaginationResult,
} from "../../src/renderer/use-browse-pagination";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * This boundary test executes the actual trusted repository arrow, not a
 * parallel loadContent implementation or a full App mock host. First-page
 * registration uses the real pagination hook. Count/sidebar transport alone is
 * controlled, so this proves the loadContent lease boundary, not Electron IPC
 * fanout or a complete UI event/preview regression.
 *
 * Unknown external bindings are a fixture error. Future helpers must be bound
 * explicitly after they exist; a missing future module is never business red.
 */
const bindingNames = [
  "api", "showIgnoredItems", "folderRecursiveRef", "folderBrowseScope",
  "contentLoadGenerationRef", "setContentLoading", "BROWSE_PAGE_SIZE",
  "LibraryOperationError", "setThumbnailFailures", "assetSupportsThumbnail",
  "setAllAssetCount", "setRootAssetCount", "setSearchTotal", "setSearchOffset",
  "setSearchSnippets", "registerBrowseSearchPage", "beginBrowsePage",
  "setTrashedAssetCount", "setFolders", "setLinkedFolders", "setTags",
  "setCollections", "setSmartCollections", "setTrashedFolders",
  "metadataController", "metadataSessionRef", "hydrateContent",
  "sidebarLoadGenerationRef", "libraryCountLoadGenerationRef",
] as const;
type BindingName = typeof bindingNames[number];
type LoadOptions = {
  trashMode?: boolean; searchScope?: SearchScope; showIgnored?: boolean;
  discovery?: { search?: SearchQuery; filters?: FilterClause[] };
  refreshSidebar?: boolean; awaitHydration?: boolean;
};
type LoadContent = (
  library: RendererLibrarySummary, scope: string, options?: LoadOptions,
) => Promise<AssetSummary[] | undefined>;

function addBindingNames(name: ts.BindingName, into: Set<string>): void {
  if (ts.isIdentifier(name)) into.add(name.text);
  else for (const element of name.elements) {
    if (ts.isBindingElement(element)) addBindingNames(element.name, into);
  }
}

function assertExplicitBindings(compiled: string): void {
  const source = ts.createSourceFile("trusted-load-content.js", compiled, ts.ScriptTarget.ES2023, true, ts.ScriptKind.JS);
  const declared = new Set<string>([...bindingNames, "Promise", "Map", "undefined"]);
  function declarations(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) || ts.isParameter(node)) addBindingNames(node.name, declared);
    ts.forEachChild(node, declarations);
  }
  declarations(source);
  const unexpected = new Set<string>();
  function references(node: ts.Node): void {
    if (ts.isIdentifier(node)) {
      const parent = node.parent;
      const propertyName = (ts.isPropertyAccessExpression(parent) && parent.name === node)
        || (ts.isPropertyAssignment(parent) && parent.name === node)
        || (ts.isBindingElement(parent) && parent.propertyName === node);
      if (!propertyName && !declared.has(node.text)) unexpected.add(node.text);
    }
    ts.forEachChild(node, references);
  }
  references(source);
  if (unexpected.size) throw new Error(`Source-extraction fixture needs explicit ports: ${[...unexpected].sort().join(", ")}`);
}

function actualLoadContent(bindings: Record<BindingName, unknown>): LoadContent {
  // Vitest's browser environment may expose an HTTP import.meta.url. The root
  // runner fixes cwd to this checkout; only that trusted source file is read.
  const sourcePath = resolve(process.cwd(), "src/renderer/App.tsx");
  const source = ts.createSourceFile(sourcePath, readFileSync(sourcePath, "utf8"), ts.ScriptTarget.ES2023, true, ts.ScriptKind.TSX);
  const matches: ts.ArrowFunction[] = [];
  function find(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "loadContent") {
      const call = node.initializer;
      if (!call || !ts.isCallExpression(call) || !ts.isIdentifier(call.expression)
        || call.expression.text !== "useCallback" || !call.arguments[0] || !ts.isArrowFunction(call.arguments[0])) {
        throw new Error("Actual App loadContent no longer has the expected useCallback arrow boundary.");
      }
      matches.push(call.arguments[0]);
    }
    ts.forEachChild(node, find);
  }
  find(source);
  if (matches.length !== 1) throw new Error(`Expected exactly one actual App loadContent, got ${matches.length}.`);
  const emitted = ts.transpileModule(`const __loadContent = ${matches[0]!.getText(source)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
    reportDiagnostics: true,
  });
  const failures = (emitted.diagnostics ?? []).filter(({ category }) => category === ts.DiagnosticCategory.Error);
  if (failures.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(failures, {
    getCanonicalFileName: (name) => name, getCurrentDirectory: () => "", getNewLine: () => "\n",
  }));
  assertExplicitBindings(emitted.outputText);
  // Only the fixed, trusted App source above is evaluated. No asset, attachment,
  // response or user-supplied text can enter this test-only compilation path.
  const factory = new Function(...bindingNames, `"use strict";\n${emitted.outputText}\nreturn __loadContent;`);
  return factory(...bindingNames.map((name) => bindings[name])) as LoadContent;
}

function asset(): AssetSummary {
  return {
    assetId: "first-card", locationKind: "managed", managedFolderId: null,
    relativeFilePath: "first-card.png", displayName: "first-card.png",
    currentRevisionId: "first-card-revision", byteSize: 1, modifiedAt: "2026-01-01T00:00:00.000Z",
    availability: "available", rating: 0, favorite: false, deletedAt: null,
    trashedFromPath: null, trashedFromTombstoneId: null, remainingDays: null,
    thumbnailStatus: "ready", thumbnailArtifactId: "first-card-thumbnail", mediaType: "image",
    width: 1, height: 1, durationMs: null,
  };
}

type SearchInput = Parameters<SuperLibraryApi["searchAssets"]>[0];
type RawRequest = {
  group: number; kind: string; promise: Promise<unknown>; settled: boolean;
  resolve: (replacement?: unknown) => void; reject: (error: unknown) => void;
};
function apiFixture(deferFirstPage = false) {
  const requests: RawRequest[] = [];
  let pageCalls = 0;
  let active = 0;
  let maxActive = 0;
  function raw(kind: string, value: unknown): Promise<unknown> {
    let resolvePromise!: (value: unknown) => void;
    let rejectPromise!: (error: unknown) => void;
    const promise = new Promise<unknown>((resolve, reject) => {
      resolvePromise = resolve; rejectPromise = reject;
    });
    const request: RawRequest = {
      group: pageCalls, kind, promise, settled: false,
      resolve(replacement = value) { if (!request.settled) { request.settled = true; resolvePromise(replacement); } },
      reject(error) { if (!request.settled) { request.settled = true; rejectPromise(error); } },
    };
    active += 1; maxActive = Math.max(maxActive, active);
    // Observe the original promise in both directions without changing the
    // actual promise delivered to loadContent or hiding its failed transport.
    void promise.then(() => { active -= 1; }, () => { active -= 1; });
    requests.push(request);
    return promise;
  }
  const searchAssets = vi.fn((input: SearchInput) => {
    if (input.layoutOnly || input.idsOnly) throw new Error("Fixture must not dispatch pagination geometry/IDs for its complete one-card page.");
    if (input.limit === BROWSE_PAGE_SIZE && input.offset === 0) {
      pageCalls += 1;
      if (deferFirstPage && pageCalls === 1) return raw("primary", { ok: true, value: { items: [asset()], total: 1, offset: 0 } });
      return Promise.resolve({ ok: true, value: { items: [asset()], total: 1, offset: 0 } });
    }
    if (input.limit !== 1) throw new Error(`Unexpected real source search limit: ${input.limit}.`);
    const kind = input.scope?.kind === "trash" ? "trash-count" : input.scope?.kind === "folder" ? "root-count" : "all-count";
    return raw(kind, { ok: true, value: { items: [], total: 10, offset: 0 } });
  });
  const lists = Object.fromEntries([
    "listFolders", "listLinkedFolders", "listTags", "listCollections", "listSmartCollections", "listTrashedFolders",
  ].map((name) => [name, vi.fn((input: unknown) => { void input; return raw(name, { ok: true, value: [] }); })]));
  return {
    api: { searchAssets, ...lists } as unknown as SuperLibraryApi,
    requests,
    get pageCalls() { return pageCalls; },
    get active() { return active; },
    get maxActive() { return maxActive; },
    group(group: number) { return requests.filter((request) => request.group === group); },
    release(group?: number) {
      for (const request of requests) if (group === undefined || request.group === group) request.resolve();
    },
  };
}

function cell<T>(initial: T, label: string, journal: string[]) {
  const state = { current: initial };
  const set: Dispatch<SetStateAction<T>> = (next) => {
    journal.push(label);
    state.current = typeof next === "function"
      ? (next as (previous: T) => T)(state.current) : next;
  };
  return { state, set };
}
const library: RendererLibrarySummary = {
  libraryId: "isolated-test-library", displayName: "Isolated test library", displayPath: "fixture-only-not-opened",
};
type OwnedHost = { root: Root; container: HTMLDivElement; mounted: boolean };
const cleanup: Array<() => Promise<void>> = [];

async function mountBoundary(deferFirstPage = false, queueHydrationUpdates = false) {
  const api = apiFixture(deferFirstPage);
  const journal: string[] = [];
  const assets = cell<AssetSummary[]>([], "assets", journal);
  const trash = cell<AssetSummary[]>([], "trash", journal);
  const layout = cell<BrowseLayoutEntry[]>([], "layout", journal);
  const total = cell<number | null>(null, "total", journal);
  const offset = cell(0, "offset", journal);
  const snippets = cell(new Map<string, string>(), "snippets", journal);
  const loading = cell(false, "loading", journal);
  const failures = cell(new Map([ ["first-card", "previous-failure"] ]), "thumbnail-failures", journal);
  const counts = {
    all: cell(0, "all-count", journal), root: cell(0, "root-count", journal), trash: cell(0, "trash-count", journal),
  };
  const sidebar = {
    folders: cell<unknown[]>([], "folders", journal), linked: cell<unknown[]>([], "linked", journal),
    tags: cell<unknown[]>([], "tags", journal), collections: cell<unknown[]>([], "collections", journal),
    smart: cell<unknown[]>([], "smart", journal), trashed: cell<unknown[]>([], "trashed-folders", journal),
  };
  let pagination!: UseBrowsePaginationResult;
  const onLoadMoreFailed = vi.fn();
  function Host() {
    pagination = useBrowsePagination({ api: api.api, setAssets: assets.set, setTrashedAssets: trash.set,
      setBrowseLayout: layout.set, setSearchTotal: total.set, setSearchOffset: offset.set,
      setSearchSnippets: snippets.set, onLoadMoreFailed });
    return null;
  }
  const container = document.createElement("div"); document.body.append(container);
  const owner: OwnedHost = { root: createRoot(container), container, mounted: true };
  const generation = { current: 0 };
  const metadataController = createMetadataReadController(async () => { throw new Error("Hydration fixture must not read asset metadata."); });
  const metadataSessionRef = { current: metadataController.activateSession(library) };
  const subjects: Promise<unknown>[] = [];
  const drains: Array<ReturnType<typeof createCoalescedRefresh>> = [];
  function track<T>(promise: Promise<T>) {
    const outcome: { settled: boolean; value?: T; error?: unknown } = { settled: false };
    void promise.then((value) => { outcome.settled = true; outcome.value = value; }, (error: unknown) => {
      outcome.settled = true; outcome.error = error;
    });
    subjects.push(promise);
    return { promise, outcome };
  }
  cleanup.push(async () => {
    for (const drain of drains) drain.dispose();
    generation.current += 1;
    metadataController.disposeSession(metadataSessionRef.current);
    await act(async () => {
      api.release();
      await Promise.allSettled(subjects);
      await Promise.allSettled(api.requests.map(({ promise }) => promise));
      if (owner.mounted) { owner.root.unmount(); owner.mounted = false; }
    });
    container.remove();
  });
  await act(async () => owner.root.render(createElement(Host)));
  const beginBrowsePage = vi.fn<BeginBrowsePage>((definition, firstPage) => pagination.beginPage(definition, firstPage));
  const bindings: Record<BindingName, unknown> = {
    api: api.api, showIgnoredItems: false, folderRecursiveRef: { current: false }, folderBrowseScope,
    contentLoadGenerationRef: generation, setContentLoading: loading.set, BROWSE_PAGE_SIZE,
    sidebarLoadGenerationRef: { current: 0 }, libraryCountLoadGenerationRef: { current: 0 },
    LibraryOperationError, setThumbnailFailures: failures.set, assetSupportsThumbnail,
    setAllAssetCount: counts.all.set, setRootAssetCount: counts.root.set,
    setSearchTotal: total.set, setSearchOffset: offset.set, setSearchSnippets: snippets.set,
    registerBrowseSearchPage, beginBrowsePage, setTrashedAssetCount: counts.trash.set,
    setFolders: sidebar.folders.set, setLinkedFolders: sidebar.linked.set, setTags: sidebar.tags.set,
    setCollections: sidebar.collections.set, setSmartCollections: sidebar.smart.set, setTrashedFolders: sidebar.trashed.set,
    metadataController, metadataSessionRef, hydrateContent,
  };
  const queuedUpdates: Array<() => void> = [];
  if (queueHydrationUpdates) {
    for (const name of ["setAllAssetCount", "setRootAssetCount", "setTrashedAssetCount", "setFolders", "setLinkedFolders", "setTags", "setCollections", "setSmartCollections", "setTrashedFolders"] as const) {
      const original = bindings[name] as (next: unknown) => void;
      bindings[name] = (next: unknown) => queuedUpdates.push(() => original(next));
    }
  }
  const load = actualLoadContent(bindings);
  return { api, load, track, drains, assets, loading, counts, sidebar, failures, journal, beginBrowsePage, onLoadMoreFailed,
    flushQueuedUpdates() { for (const update of queuedUpdates.splice(0)) update(); },
    reopenSameLibrary() { metadataSessionRef.current = metadataController.activateSession(library); },
    nextGeneration() { generation.current += 1; },
  };
}

afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
  vi.restoreAllMocks();
});

// These tests are the newly extracted production helper's contract (new TDD),
// not additional claimed reproductions against the previous App source.
describe("actual non-critical content hydration helper", () => {
  const ordinarySidebar = ["listCollections", "listSmartCollections", "listTags", "listFolders", "listLinkedFolders"];
  function helperFixture(options: {
    scope?: string; trashMode?: boolean; refreshSidebar?: boolean;
    includeLibraryCounts?: boolean; showIgnored?: boolean;
  } = {}) {
    const api = apiFixture();
    const publish = vi.fn<(update: ContentHydrationUpdate) => void>();
    let session = Symbol("session");
    let generation = 1;
    const capturedSession = session;
    const capturedGeneration = generation;
    let settled = false;
    const task = hydrateContent({ api: api.api, libraryId: library.libraryId,
      scope: options.scope ?? "all", trashMode: options.trashMode ?? false,
      refreshSidebar: options.refreshSidebar ?? true, includeLibraryCounts: options.includeLibraryCounts ?? true,
      showIgnored: options.showIgnored ?? false,
      isCurrent: () => session === capturedSession && generation === capturedGeneration, publish,
    });
    void task.then(() => { settled = true; });
    cleanup.push(async () => { api.release(); await task; });
    return { api, task, publish, get settled() { return settled; },
      reopenSameLibrary() { session = Symbol("replacement-session-for-same-library"); },
      nextGeneration() { generation += 1; },
    };
  }

  it("publishes ready folders without waiting for a slow unrelated root count", async () => {
    const fixture = helperFixture();
    const folders = [{ folderId: "ready-folder", name: "Ready folder" }];
    await act(async () => fixture.api.requests.find(request => request.kind === "listFolders")!
      .resolve({ ok: true, value: folders }));
    expect(fixture.publish.mock.calls.map(([update]) => update.folders).filter(Boolean)).toEqual([folders]);
    expect(fixture.settled).toBe(false);
    expect(fixture.api.active).toBe(6);
  });

  it("publishes ready collections even when a count transport fails", async () => {
    const fixture = helperFixture();
    const collections = [{ collectionId: "ready-collection", name: "Ready collection" }];
    await act(async () => {
      fixture.api.requests.find(request => request.kind === "root-count")!.reject(new Error("count unavailable"));
      fixture.api.requests.find(request => request.kind === "listCollections")!.resolve({ ok: true, value: collections });
    });
    expect(fixture.publish.mock.calls.map(([update]) => update.collections).filter(Boolean)).toEqual([collections]);
    expect(fixture.settled).toBe(false);
  });

  it.each([
    { scope: "all", trashMode: false, counts: ["root-count", "trash-count"] },
    { scope: "root", trashMode: false, counts: ["all-count", "trash-count"] },
    { scope: "managed-folder-id", trashMode: false, counts: ["all-count", "root-count", "trash-count"] },
    { scope: "all", trashMode: true, counts: ["all-count", "root-count", "trash-count"] },
  ])("keeps the exact raw call matrix for scope=$scope trashMode=$trashMode", async ({ scope, trashMode, counts }) => {
    const fixture = helperFixture({ scope, trashMode });
    expect(fixture.api.requests.map(({ kind }) => kind)).toEqual([
      ...ordinarySidebar, ...(trashMode ? ["listTrashedFolders"] : []), ...counts,
    ]);
    expect(fixture.publish).not.toHaveBeenCalled();
    fixture.api.release(); await fixture.task;
    expect(fixture.api.active).toBe(0);
    expect(fixture.publish).toHaveBeenCalledTimes(counts.length + ordinarySidebar.length + (trashMode ? 1 : 0));
    const update = Object.assign({}, ...fixture.publish.mock.calls.map(([value]) => value));
    expect(update.allAssetCount).toBe(counts.includes("all-count") ? 10 : undefined);
    expect(update.rootAssetCount).toBe(counts.includes("root-count") ? 10 : undefined);
    expect(update.trashedAssetCount).toBe(10);
    expect(update).toMatchObject({ folders: [], linkedFolders: [], tags: [], collections: [], smartCollections: [], trashedFolders: [] });
    for (const [input] of vi.mocked(fixture.api.api.searchAssets).mock.calls) {
      expect(input).toMatchObject({ libraryId: library.libraryId, query: null, limit: 1, offset: 0 });
    }
  });

  it.each([
    { scope: "all", trashMode: false, includeLibraryCounts: true, counts: ["root-count", "trash-count"] },
    { scope: "root", trashMode: false, includeLibraryCounts: true, counts: ["all-count", "trash-count"] },
    { scope: "folder-id", trashMode: false, includeLibraryCounts: false, counts: [] },
    { scope: "all", trashMode: true, includeLibraryCounts: true, counts: ["all-count", "root-count", "trash-count"] },
  ])("does not touch sidebar on navigation scope=$scope trashMode=$trashMode", async ({ scope, trashMode, includeLibraryCounts, counts }) => {
    const fixture = helperFixture({ scope, trashMode, includeLibraryCounts, refreshSidebar: false });
    expect(fixture.api.requests.map(({ kind }) => kind)).toEqual(counts);
    fixture.api.release(); await fixture.task;
    if (counts.length === 0) expect(fixture.publish).not.toHaveBeenCalled();
    else {
      expect(fixture.publish).toHaveBeenCalledTimes(counts.length);
      expect(fixture.publish.mock.calls.every(([value]) => Object.keys(value).every(name => name.endsWith("AssetCount")))).toBe(true);
    }
  });

  it.each([false, true])("preserves showIgnored=%s only on counts and the two folder lists", async (showIgnored) => {
    const fixture = helperFixture({ scope: "folder-id", showIgnored });
    for (const [input] of vi.mocked(fixture.api.api.searchAssets).mock.calls) {
      expect(input.showIgnored).toBe(showIgnored);
    }
    for (const name of ["listFolders", "listLinkedFolders"] as const) {
      expect(vi.mocked(fixture.api.api[name])).toHaveBeenCalledWith({ libraryId: library.libraryId, showIgnored });
    }
    for (const name of ["listTags", "listCollections", "listSmartCollections"] as const) {
      expect(vi.mocked(fixture.api.api[name])).toHaveBeenCalledWith({ libraryId: library.libraryId });
    }
    fixture.api.release(); await fixture.task;
  });

  it("allows successful fields when another returns a typed per-field failure", async () => {
    const fixture = helperFixture();
    for (const kind of ["root-count", "listTags"]) {
      fixture.api.requests.find((request) => request.kind === kind)!.resolve({ ok: false, error: createPublicError("CANCELLED") });
    }
    fixture.api.release(); await fixture.task;
    expect(fixture.publish).toHaveBeenCalledTimes(5);
    expect(Object.assign({}, ...fixture.publish.mock.calls.map(([value]) => value))).toEqual({
      trashedAssetCount: 10, folders: [], linkedFolders: [], collections: [], smartCollections: [], trashedFolders: [],
    });
  });

  it.each(["root-count", "listTags"])("drains every raw sibling after rejected %s and publishes the successful siblings", async (kind) => {
    const fixture = helperFixture();
    await act(async () => fixture.api.requests.find((request) => request.kind === kind)!.reject(new Error("controlled transport failure")));
    expect(fixture.api.active).toBe(6);
    expect(fixture.settled).toBe(false);
    expect(fixture.publish).not.toHaveBeenCalled();
    fixture.api.release(); await fixture.task;
    expect(fixture.settled).toBe(true);
    expect(fixture.api.active).toBe(0);
    expect(fixture.publish).toHaveBeenCalledTimes(6);
  });

  it.each(["session", "generation"] as const)("logical %s invalidation does not release raw IPC or publish late fields", async (kind) => {
    const fixture = helperFixture();
    if (kind === "session") fixture.reopenSameLibrary(); else fixture.nextGeneration();
    await act(async () => fixture.api.requests[0]!.resolve());
    expect(fixture.api.active).toBe(6);
    expect(fixture.settled).toBe(false);
    expect(fixture.publish).not.toHaveBeenCalled();
    fixture.api.release(); await fixture.task;
    expect(fixture.api.active).toBe(0);
    expect(fixture.publish).not.toHaveBeenCalled();
  });

  it("does not dispatch new work for an already stale owner", async () => {
    const api = apiFixture(); const publish = vi.fn();
    await hydrateContent({ api: api.api, libraryId: library.libraryId, scope: "all",
      includeLibraryCounts: true, refreshSidebar: true, trashMode: false, showIgnored: false,
      isCurrent: () => false, publish });
    expect(api.requests).toHaveLength(0);
    expect(vi.mocked(api.api.searchAssets)).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("drains already started requests even if a later bridge call throws synchronously", async () => {
    const api = apiFixture(); const publish = vi.fn();
    vi.spyOn(api.api, "listTags").mockImplementation(() => { throw new Error("synchronous bridge failure"); });
    let settled = false;
    const task = hydrateContent({ api: api.api, libraryId: library.libraryId, scope: "all",
      includeLibraryCounts: true, refreshSidebar: true, trashMode: false, showIgnored: false,
      isCurrent: () => true, publish });
    void task.then(() => { settled = true; });
    cleanup.push(async () => { api.release(); await task; });
    await act(async () => undefined);
    expect(api.active).toBe(6);
    expect(settled).toBe(false);
    api.release(); await task;
    expect(api.active).toBe(0);
    expect(publish).toHaveBeenCalledTimes(6);
  });
});

describe("actual App loadContent hydration lease boundary", () => {
  it.each(["session", "refresh"] as const)("queued category state updaters recheck ownership after %s replacement", async replacement => {
    const host = await mountBoundary(false, true);
    await act(async () => { host.track(host.load(library, "all", { awaitHydration: true })); });
    await act(async () => {
      host.api.group(1).find(request => request.kind === "listFolders")!.resolve({ ok: true, value: [{ folderId: "old-queued-folder" }] });
      host.api.release(1);
    });
    if (replacement === "session") host.reopenSameLibrary();
    else await act(async () => { host.track(host.load(library, "all", { awaitHydration: true })); });
    host.flushQueuedUpdates();
    expect(host.sidebar.folders.state.current).toEqual([]);
    expect(host.counts.root.state.current).toBe(0);
    expect(host.counts.trash.state.current).toBe(0);
    expect(host.counts.all.state.current).toBe(replacement === "session" ? 0 : 1);
  });
  it("finishes startup sidebar even if foreground search supersedes the initial primary before it resolves", async () => {
    const host = await mountBoundary(true);
    let result!: ReturnType<typeof host.track<AssetSummary[] | undefined>>;
    await act(async () => { result = host.track(host.load(library, "all", { awaitHydration: true })); });
    host.nextGeneration();
    await act(async () => host.api.requests.find(request => request.kind === "primary")!.resolve());
    expect(host.assets.state.current).toEqual([]);
    expect(host.beginBrowsePage).not.toHaveBeenCalled();
    expect(host.api.active).toBe(8);
    const collections = [{ collectionId: "startup-collection", name: "Startup collection" }];
    await act(async () => {
      host.api.requests.find(request => request.kind === "listCollections")!.resolve({ ok: true, value: collections });
      host.api.release(); await result.promise;
    });
    expect(host.sidebar.collections.state.current).toEqual(collections);
    expect(host.counts.all.state.current).toBe(10);
    expect(host.assets.state.current).toEqual([]);
  });

  it.each([false, true])("a newer full refresh supersedes old category results (showIgnored=%s)", async showIgnored => {
    const host = await mountBoundary();
    await act(async () => { host.track(host.load(library, "all", { awaitHydration: true })); });
    await act(async () => { host.track(host.load(library, "all", { awaitHydration: true, showIgnored })); });
    const newer = [{ folderId: "new-folder", name: "New folder" }];
    await act(async () => {
      host.api.group(2).find(request => request.kind === "listFolders")!.resolve({ ok: true, value: newer });
      host.api.release(2);
    });
    await act(async () => {
      host.api.group(1).find(request => request.kind === "listFolders")!.resolve({ ok: true, value: [{ folderId: "old-folder" }] });
      host.api.release(1);
    });
    expect(host.sidebar.folders.state.current).toEqual(newer);
    expect(vi.mocked(host.api.api.listFolders).mock.calls[1]![0].showIgnored).toBe(showIgnored);
  });

  it("count-only navigation does not cancel pending folder and collection hydration", async () => {
    const host = await mountBoundary();
    await act(async () => { host.track(host.load(library, "all", { awaitHydration: true })); });
    await act(async () => { host.track(host.load(library, "root", { refreshSidebar: false, awaitHydration: true })); });
    const folders = [{ folderId: "pending-folder", name: "Pending folder" }];
    await act(async () => {
      host.api.group(1).find(request => request.kind === "listFolders")!.resolve({ ok: true, value: folders });
      host.api.release(1); host.api.release(2);
    });
    expect(host.sidebar.folders.state.current).toEqual(folders);
    expect(host.counts.root.state.current).toBe(1);
    expect(host.counts.all.state.current).toBe(10);
  });

  it.each([
    { discovery: { search: parseSearchExpression("needle") } },
    { discovery: { filters: [{ field: "favorite", values: ["true"], exclude: false }] as FilterClause[] } },
    { searchScope: { kind: "collection", collectionId: "subset", recursive: false } as SearchScope },
  ])("does not replace a library count with a filtered or alternate-scope page total: %j", async options => {
    const host = await mountBoundary();
    await act(async () => { host.track(host.load(library, "all", { ...options, awaitHydration: true })); });
    expect(host.counts.all.state.current).toBe(0);
    expect(host.api.group(1).some(request => request.kind === "all-count")).toBe(true);
    await act(async () => host.api.release());
    expect(host.counts.all.state.current).toBe(10);
    expect(host.assets.state.current).toHaveLength(1);
  });

  it("keeps library organization publishable when restored sorting starts another foreground search", async () => {
    const host = await mountBoundary();
    await act(async () => { host.track(host.load(library, "all", { awaitHydration: true })); });
    host.nextGeneration();
    const folders = [{ folderId: "restored-folder", name: "Restored folder" }];
    await act(async () => {
      host.api.group(1).find(request => request.kind === "listFolders")!.resolve({ ok: true, value: folders });
      host.api.release();
    });
    expect(host.sidebar.folders.state.current).toEqual(folders);
    expect(host.counts.root.state.current).toBe(10);
    expect(host.assets.state.current.map(({ assetId }) => assetId)).toEqual(["first-card"]);
  });
  it("preserves default foreground completion and usable first cards before count/sidebar settles", async () => {
    const host = await mountBoundary();
    let result!: ReturnType<typeof host.track<AssetSummary[] | undefined>>;
    await act(async () => { result = host.track(host.load(library, "all")); });
    expect(result.outcome.error).toBeUndefined();
    expect(result.outcome.settled).toBe(true);
    expect(result.outcome.value?.map(({ assetId }) => assetId)).toEqual(["first-card"]);
    expect(host.assets.state.current.map(({ assetId }) => assetId)).toEqual(["first-card"]);
    expect(host.loading.state.current).toBe(false);
    expect(host.beginBrowsePage).toHaveBeenCalledOnce();
    expect(host.failures.state.current.size).toBe(0);
    expect(host.api.pageCalls).toBe(1);
    expect(host.api.group(1).map(({ kind }) => kind)).toEqual([
      "listCollections", "listSmartCollections", "listTags", "listFolders", "listLinkedFolders", "root-count", "trash-count",
    ]);
    expect(host.api.active).toBe(7);
    await act(async () => host.api.release());
    expect(host.counts.root.state.current).toBe(10);
    expect(host.counts.trash.state.current).toBe(10);
    expect(host.onLoadMoreFailed).not.toHaveBeenCalled();
  });

  it("awaitHydration holds the same raw lease while first cards and foreground loading have already finished", async () => {
    const host = await mountBoundary();
    let result!: ReturnType<typeof host.track<AssetSummary[] | undefined>>;
    await act(async () => { result = host.track(host.load(library, "all", { awaitHydration: true })); });
    expect(host.assets.state.current.map(({ assetId }) => assetId)).toEqual(["first-card"]);
    expect(host.loading.state.current).toBe(false);
    expect(host.api.active).toBe(7);
    expect.soft(result.outcome.settled).toBe(false);
    await act(async () => { host.api.release(); await result.promise; });
    expect(result.outcome.error).toBeUndefined();
    expect(result.outcome.settled).toBe(true);
    expect(host.api.active).toBe(0);
  });

  it("100 events share one actual count/sidebar lease then exactly one trailing read without raw overlap", async () => {
    const host = await mountBoundary();
    const drain = createCoalescedRefresh(async () => { await host.load(library, "all", { awaitHydration: true }); });
    host.drains.push(drain);
    let first!: ReturnType<typeof host.track<void>>;
    await act(async () => { first = host.track(drain.refresh()); });
    expect(host.api.pageCalls).toBe(1);
    expect(host.api.active).toBe(7);
    const burst: Promise<void>[] = [];
    await act(async () => {
      for (let index = 0; index < 100; index += 1) {
        const promise = drain.refresh();
        burst.push(promise); host.track(promise);
      }
    });
    expect.soft(burst.every((promise) => promise === first.promise)).toBe(true);
    expect.soft(first.outcome.settled).toBe(false);
    expect.soft(host.api.pageCalls).toBe(1);
    expect.soft(host.api.active).toBe(7);
    expect.soft(host.api.maxActive).toBe(7);
    await act(async () => host.api.release(1));
    expect(host.api.pageCalls).toBe(2);
    expect(host.api.group(2)).toHaveLength(7);
    await act(async () => { host.api.release(2); await Promise.all([first.promise, ...burst]); });
    expect(host.api.pageCalls).toBe(2);
    expect.soft(host.api.maxActive).toBe(7);
    expect(host.api.active).toBe(0);
    expect(host.assets.state.current.map(({ assetId }) => assetId)).toEqual(["first-card"]);
    expect(host.onLoadMoreFailed).not.toHaveBeenCalled();
  });

  it.each(["root-count", "listTags"])("does not release a background lease on failed %s while other dispatched hydration is pending", async (kind) => {
    const host = await mountBoundary();
    let result!: ReturnType<typeof host.track<AssetSummary[] | undefined>>;
    await act(async () => { result = host.track(host.load(library, "all", { awaitHydration: true })); });
    const failed = host.api.group(1).find((request) => request.kind === kind);
    expect(failed).toBeDefined();
    await act(async () => failed!.reject(new Error("controlled raw transport failure")));
    expect(host.api.active).toBe(6);
    expect.soft(result.outcome.settled).toBe(false);
    expect(host.loading.state.current).toBe(false);
    expect(host.assets.state.current.map(({ assetId }) => assetId)).toEqual(["first-card"]);
    await act(async () => { host.api.release(); await result.promise; });
    expect(result.outcome.error).toBeUndefined();
    expect(result.outcome.value?.map(({ assetId }) => assetId)).toEqual(["first-card"]);
    expect(host.api.active).toBe(0);
    expect(host.counts.root.state.current).toBe(kind === "root-count" ? 0 : 10);
    expect(host.counts.trash.state.current).toBe(10);
    expect(host.journal).toContain("folders");
    expect(host.onLoadMoreFailed).not.toHaveBeenCalled();
  });

  it("holds old raw work but suppresses actual App hydration publication after session replacement", async () => {
    const host = await mountBoundary();
    let result!: ReturnType<typeof host.track<AssetSummary[] | undefined>>;
    await act(async () => { result = host.track(host.load(library, "all", { awaitHydration: true })); });
    host.reopenSameLibrary();
    const before = [...host.journal];
    expect(result.outcome.settled).toBe(false);
    expect(host.api.active).toBe(7);
    await act(async () => { host.api.release(); await result.promise; });
    expect(host.journal).toEqual(before);
    expect(host.counts.root.state.current).toBe(0);
    expect(host.counts.trash.state.current).toBe(0);
    expect(host.loading.state.current).toBe(false);
    expect(host.assets.state.current.map(({ assetId }) => assetId)).toEqual(["first-card"]);
  });
});
