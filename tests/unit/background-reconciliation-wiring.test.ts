// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AssetSummary } from "../../src/shared/asset-types";
import type { SuperLibraryApi } from "../../src/shared/library-api";
import type { RendererLibrarySummary } from "../../src/shared/protocol/responses";
import { assetSupportsThumbnail } from "../../src/shared/thumbnail-support";
import { hasConfiguredSmartCollectionQuery, hasMeaningfulSmartCollectionCondition } from "../../src/shared/smart-collection-query";
import { invalidateChangedAssetArtifacts } from "../../src/renderer/asset-change-cache";
import { decrementScopeCount, removeAssetIdsLocally } from "../../src/renderer/asset-local-refresh";
import { createCoalescedRefresh } from "../../src/renderer/coalesced-refresh";
import { hydrateContent } from "../../src/renderer/content-hydration";
import { LibraryOperationError, toMessage } from "../../src/renderer/error-utils";
import { folderBrowseScope } from "../../src/renderer/folder-browse-scope";
import { shouldRefreshContentForLibraryChange } from "../../src/renderer/library-change-refresh";
import { createMetadataReadController, type MetadataSessionOwner } from "../../src/renderer/metadata-read-controller";
import { nextAssetNotificationCandidate } from "../../src/renderer/watcher-notification-policy";
import { BROWSE_PAGE_SIZE, registerBrowseSearchPage } from "../../src/renderer/use-browse-pagination";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Execute only selected trusted App functions / one actual effect AND its
 * actual dependency array. The App component and its transitive UI tree are
 * never mounted. Explicit API/state ports control transport and publications;
 * no substitute navigation, hydration or reconciliation implementation exists.
 * This is a Renderer function/effect boundary, not full Electron/Main fanout.
 */
function compileActual<T>(name: string, bindings: Record<string, unknown>): T {
  const path = resolve(process.cwd(), "src/renderer/App.tsx");
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.ES2023, true, ts.ScriptKind.TSX);
  const matches: string[] = [];
  function find(node: ts.Node): void {
    if (name === "asset-reconciliation-effect" || name === "background-content-ports-effect") {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "useEffect"
        && node.arguments[0] && ts.isArrowFunction(node.arguments[0])
        && node.arguments[0].getText(source).includes(name === "asset-reconciliation-effect"
          ? "api.onAssetsChanged(" : "backgroundContentPortsRef.current =")) {
        matches.push(`() => ${node.getText(source)}`);
      }
    } else if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      matches.push(node.getText(source));
    } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
      const call = node.initializer;
      if (!call || !ts.isCallExpression(call) || !call.arguments[0] || !ts.isArrowFunction(call.arguments[0])) {
        throw new Error(`Source fixture lost actual ${name} arrow boundary.`);
      }
      matches.push(call.arguments[0].getText(source));
    }
    ts.forEachChild(node, find);
  }
  find(source);
  if (matches.length !== 1) throw new Error(`Expected one actual ${name} boundary, got ${matches.length}.`);
  const emitted = ts.transpileModule(`const __subject = ${matches[0]!};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext }, reportDiagnostics: true,
  });
  if (emitted.diagnostics?.some(({ category }) => category === ts.DiagnosticCategory.Error)) {
    throw new Error(`Could not transpile actual ${name} source fixture.`);
  }
  const js = ts.createSourceFile("trusted-boundary.js", emitted.outputText, ts.ScriptTarget.ES2023, true, ts.ScriptKind.JS);
  const declared = new Set([...Object.keys(bindings), "undefined", "Boolean", "Promise", "Map", "Set", "Date"]);
  function add(name: ts.BindingName): void {
    if (ts.isIdentifier(name)) declared.add(name.text);
    else for (const element of name.elements) if (ts.isBindingElement(element)) add(element.name);
  }
  function declarations(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) || ts.isParameter(node)) add(node.name);
    if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) && node.name) declared.add(node.name.text);
    ts.forEachChild(node, declarations);
  }
  declarations(js);
  const unexpected = new Set<string>();
  function references(node: ts.Node): void {
    if (ts.isIdentifier(node)) {
      const parent = node.parent;
      const key = (ts.isPropertyAccessExpression(parent) && parent.name === node)
        || (ts.isPropertyAssignment(parent) && parent.name === node)
        || (ts.isBindingElement(parent) && parent.propertyName === node);
      if (!key && !declared.has(node.text)) unexpected.add(node.text);
    }
    ts.forEachChild(node, references);
  }
  references(js);
  if (unexpected.size) throw new Error(`Actual ${name} fixture needs explicit ports: ${[...unexpected].sort().join(", ")}`);
  // Fixed repository source only; no user/library/API data enters compilation.
  return new Function(...Object.keys(bindings), `"use strict";\n${emitted.outputText}\nreturn __subject;`)(...Object.values(bindings)) as T;
}

function card(assetId: string): AssetSummary {
  return { assetId, locationKind: "managed", managedFolderId: null, relativeFilePath: `${assetId}.png`, displayName: `${assetId}.png`,
    currentRevisionId: `${assetId}-revision`, byteSize: 1, modifiedAt: "2026-01-01T00:00:00.000Z", availability: "available",
    rating: 0, favorite: false, deletedAt: null, trashedFromPath: null, trashedFromTombstoneId: null, remainingDays: null,
    thumbnailStatus: null, thumbnailArtifactId: null, mediaType: "image", width: 1, height: 1, durationMs: null };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((finish, fail) => { resolve = finish; reject = fail; });
  return { promise, resolve, reject };
}
type Request = { kind: string; promise: Promise<unknown>; resolve: (replacement?: unknown) => void; reject: (error: unknown) => void };
type LoadOptions = { awaitHydration?: boolean };
type Load = (library: RendererLibrarySummary, scope: string, options?: LoadOptions) => Promise<AssetSummary[] | undefined>;
type BackgroundEntry = {
  owner: MetadataSessionOwner;
  request: (ids?: readonly string[], options?: { reportError?: boolean }) => Promise<void> | undefined;
};
const closeFixtures: Array<() => Promise<void>> = [];

function fixture(primaryDeferred = false) {
  const journal: string[] = [];
  const states = new Map<string, unknown>();
  const bindings: Record<string, unknown> = {};
  const initial: Record<string, unknown> = {
    setAssets: [], setTrashedAssets: [], setFolders: [], setLinkedFolders: [], setTags: [], setCollections: [], setSmartCollections: [], setTrashedFolders: [],
    setAllAssetCount: 0, setRootAssetCount: 0, setTrashedAssetCount: 0, setSearchTotal: null, setSearchOffset: 0,
    setSearchSnippets: new Map(), setThumbnailFailures: new Map(), setContentLoading: false,
    setLayoutThumbnailArtifacts: { libraryId: "library", ids: new Map() }, setUiState: "ready",
    setShowTrash: false, setShowTagManagement: false, setActivePluginSidebarViewId: null, setActiveTagId: null,
    setActiveCollectionId: null, setActiveSmartCollectionId: null, setSidebarFolderScope: "all", setAssetScope: "all",
    setTagFilter: "", setTagFilterMatch: "any", setCollectionSourceFolderId: null,
  };
  for (const [name, value] of Object.entries(initial)) {
    states.set(name, value);
    bindings[name] = (next: unknown) => {
      journal.push(name);
      states.set(name, typeof next === "function" ? (next as (previous: unknown) => unknown)(states.get(name)) : next);
    };
  }
  const library: RendererLibrarySummary = { libraryId: "library", displayName: "Initial summary", displayPath: "isolated-port-only" };
  const metadataController = createMetadataReadController(async () => { throw new Error("Boundary must not read selected metadata."); });
  const metadataSessionRef = { current: metadataController.activateSession(library) };
  const contentLoadGenerationRef = { current: 0 };
  const backgroundContentRefreshRef = { current: null as BackgroundEntry | null };
  const raw: Request[] = [];
  const subjects: Promise<unknown>[] = [];
  let active = 0;
  let maxActive = 0;
  let firstPages = 0;
  function request(kind: string, value: unknown): Promise<unknown> {
    const task = deferred<unknown>(); active += 1; maxActive = Math.max(maxActive, active);
    void task.promise.then(() => { active -= 1; }, () => { active -= 1; });
    raw.push({ kind, promise: task.promise, resolve: (replacement = value) => task.resolve(replacement), reject: task.reject });
    return task.promise;
  }
  const assetListeners = new Set<(event: unknown) => void>();
  const libraryListeners = new Set<(event: unknown) => void>();
  const api = {
    searchAssets: vi.fn((input: Parameters<SuperLibraryApi["searchAssets"]>[0]) => {
      if (input.limit === 1) return request("count", { ok: true, value: { items: [], total: 901, offset: 0 } });
      firstPages += 1;
      const value = { ok: true, value: { items: [card(firstPages === 1 ? "old-page" : "new-page")], total: 1, offset: 0 } };
      return primaryDeferred && firstPages === 1 ? request("old-primary", value) : Promise.resolve(value);
    }),
    ...Object.fromEntries(["listFolders", "listLinkedFolders", "listTags", "listCollections", "listSmartCollections", "listTrashedFolders"]
      .map((name) => [name, vi.fn(() => request(name, { ok: true, value: [] }))])),
    setActiveContext: vi.fn(),
    onAssetsChanged: vi.fn((listener: (event: unknown) => void) => { assetListeners.add(listener); return () => assetListeners.delete(listener); }),
    onLibraryChanged: vi.fn((listener: (event: unknown) => void) => { libraryListeners.add(listener); return () => libraryListeners.delete(listener); }),
  } as unknown as SuperLibraryApi;
  const beginBrowsePage = vi.fn((_definition: unknown, firstPage: { items: AssetSummary[] }) => {
    void _definition; (bindings.setAssets as (value: unknown) => void)(firstPage.items);
  });
  const errors = vi.fn(); const notice = vi.fn();
  Object.assign(bindings, {
    api, library, metadataController, metadataSession: metadataSessionRef.current, metadataSessionRef,
    contentLoadGenerationRef, searchRequestGenerationRef: { current: 0 }, backgroundContentRefreshRef,
    folderRecursiveRef: { current: false }, folderBrowseScope, BROWSE_PAGE_SIZE, LibraryOperationError, assetSupportsThumbnail,
    registerBrowseSearchPage, beginBrowsePage, hydrateContent, showIgnoredItems: false,
    activeSmartCollectionId: null, smartCollections: [], hasConfiguredSmartCollectionQuery, hasMeaningfulSmartCollectionCondition,
    currentSearchScope: () => undefined, currentQueryDefinition: () => ({ search: null }),
    pendingRevealRef: { current: null }, tagFilter: "", tags: [{ tagId: "tag", name: "Tag", assetCount: 1 }],
    clearAssetSelection: vi.fn(), clearDiscoveryControls: vi.fn(), closeAssetPreview: vi.fn(async () => undefined),
    closeContextMenu: vi.fn(), recordNavigation: vi.fn(), resetBrowsePagination: vi.fn(),
    workspaceCanvasRef: { current: null }, managedImportTargetFolderIdRef: { current: undefined }, collectionRecursive: false,
    setError: errors, setNotice: notice, toMessage, t: (key: string) => key, locale: "zh-CN",
    showTrash: false, activeTagId: null, assetScope: "all", refreshSmartCollectionResults: vi.fn(async () => undefined),
    useEffect, createCoalescedRefresh, nextAssetNotificationCandidate, invalidateChangedAssetArtifacts, shouldRefreshContentForLibraryChange,
    window,
    selectedAssetIdRef: { current: undefined }, uiStateRef: { current: "ready" }, importProgressRef: { current: null },
    NETWORK_LIBRARY_RELOAD_INTERVAL_MS: 750, refreshOperationHistory: vi.fn(async () => undefined),
  });
  bindings.backgroundLibraryId = library.libraryId;
  bindings.backgroundContentPortsRef = { current: {
    locale: bindings.locale, t: bindings.t, setError: errors, setNotice: notice, networkStorage: library.networkStorage,
  } };
  bindings.applySearchResult = compileActual("applySearchResult", bindings);
  const load = compileActual<Load>("loadContent", bindings);
  bindings.loadContent = load;
  const reloadCurrentContentRef = { current: compileActual<(options?: LoadOptions) => Promise<void>>("reloadCurrentContent", bindings) };
  bindings.reloadCurrentContentRef = reloadCurrentContentRef;
  function track<T>(task: Promise<T>): Promise<T> { subjects.push(task); void task.catch(() => undefined); return task; }
  closeFixtures.push(async () => {
    metadataController.disposeSession(metadataSessionRef.current);
    contentLoadGenerationRef.current += 1;
    for (const item of raw) item.resolve();
    await Promise.allSettled(subjects);
    await Promise.allSettled(raw.map(({ promise }) => promise));
  });
  return { bindings, library, metadataController, load, api, states, journal, raw, errors, notice, track,
    backgroundContentRefreshRef, reloadCurrentContentRef, metadataSessionRef,
    get active() { return active; }, get maxActive() { return maxActive; },
  };
}

afterEach(async () => {
  for (const close of closeFixtures.splice(0).reverse()) await close();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("actual App navigation invalidates old background publication", () => {
  it.each(["executeSearchDefinition", "chooseTag", "chooseCollection", "handleSearchTagsFromManagement"])("%s prevents a late old primary from replacing the new page", async (name) => {
    const host = fixture(true);
    const old = host.track(host.load(host.library, "all", { awaitHydration: true }));
    const navigate = compileActual<(...args: unknown[]) => Promise<unknown>>(name, host.bindings);
    await navigate(...(name === "executeSearchDefinition" ? [{ search: null }]
      : name === "handleSearchTagsFromManagement" ? [["Tag"], "all"] : [name === "chooseTag" ? "tag" : "collection"]));
    expect((host.states.get("setAssets") as AssetSummary[]).map(({ assetId }) => assetId)).toEqual(["new-page"]);
    host.raw.find(({ kind }) => kind === "old-primary")!.resolve();
    // The old source may dispatch hydration on late completion. Drain it so a
    // red assertion is about publication, never a hanging fixture teardown.
    await act(async () => undefined);
    for (const item of host.raw) item.resolve();
    await old;
    expect((host.states.get("setAssets") as AssetSummary[]).map(({ assetId }) => assetId)).toEqual(["new-page"]);
    expect(host.states.get("setContentLoading")).toBe(false);
    expect(host.errors).not.toHaveBeenCalled();
  });

  it.each(["executeSearchDefinition", "chooseTag", "chooseCollection", "handleSearchTagsFromManagement"])("%s prevents late old hydration from publishing over the new view", async (name) => {
    const host = fixture();
    const old = host.track(host.load(host.library, "all", { awaitHydration: true }));
    await act(async () => undefined);
    expect(host.active).toBe(7);
    const navigate = compileActual<(...args: unknown[]) => Promise<unknown>>(name, host.bindings);
    await navigate(...(name === "executeSearchDefinition" ? [{ search: null }]
      : name === "handleSearchTagsFromManagement" ? [["Tag"], "all"] : [name === "chooseTag" ? "tag" : "collection"]));
    const before = [...host.journal];
    for (const item of host.raw) item.resolve(); await old;
    expect(host.journal).toEqual(before);
    expect((host.states.get("setAssets") as AssetSummary[]).map(({ assetId }) => assetId)).toEqual(["new-page"]);
    expect(host.states.get("setRootAssetCount")).toBe(0);
    expect(host.states.get("setTrashedAssetCount")).toBe(0);
    expect(host.errors).not.toHaveBeenCalled();
  });
});

const navigationNames = ["executeSearchDefinition", "chooseTag", "chooseCollection", "handleSearchTagsFromManagement"] as const;
function navigationArgs(name: typeof navigationNames[number]): unknown[] {
  return name === "executeSearchDefinition" ? [{ search: null }]
    : name === "handleSearchTagsFromManagement" ? [["Tag"], "all"] : [name === "chooseTag" ? "tag" : "collection"];
}

describe("actual direct query publication owns its session and generation", () => {
  it.each(navigationNames)("%s cannot publish after a newer same-owner browse load", async (name) => {
    const host = fixture(true);
    const navigate = compileActual<(...args: unknown[]) => Promise<unknown>>(name, host.bindings);
    const old = host.track(navigate(...navigationArgs(name)));
    await act(async () => undefined);
    expect(host.raw.some(({ kind }) => kind === "old-primary")).toBe(true);
    await host.load(host.library, "all");
    const before = [...host.journal];
    host.raw.find(({ kind }) => kind === "old-primary")!.resolve();
    await old;
    expect(host.journal).toEqual(before);
    expect((host.states.get("setAssets") as AssetSummary[]).map(({ assetId }) => assetId)).toEqual(["new-page"]);
    expect(host.errors).not.toHaveBeenCalled();
  });

  it.each(navigationNames.flatMap((name) => ["success", "failure"].map((outcome) => ({ name, outcome }))))(
    "$name ignores old-owner $outcome after the same library ID is reopened", async ({ name, outcome }) => {
      const host = fixture(true);
      const navigate = compileActual<(...args: unknown[]) => Promise<unknown>>(name, host.bindings);
      const old = host.track(navigate(...navigationArgs(name)));
      await act(async () => undefined);
      const previousOwner = host.metadataSessionRef.current;
      host.metadataSessionRef.current = host.metadataController.activateSession(host.library);
      expect(host.metadataSessionRef.current).not.toBe(previousOwner);
      // loadContent reads the real controller/ref owner. A same-ID reopen is
      // not modeled as a generation bump or merely a different library ID.
      await host.load(host.library, "all");
      const before = [...host.journal];
      const primary = host.raw.find(({ kind }) => kind === "old-primary")!;
      if (outcome === "failure") primary.reject(new Error("late old-owner transport failure"));
      else primary.resolve();
      await old;
      expect(host.journal).toEqual(before);
      expect((host.states.get("setAssets") as AssetSummary[]).map(({ assetId }) => assetId)).toEqual(["new-page"]);
      expect(host.errors).not.toHaveBeenCalled();
    },
  );

  it("queued search total/offset/snippets updates recheck ownership when React applies them", () => {
    const host = fixture();
    const queued: Array<() => void> = [];
    const ports = { ...host.bindings };
    for (const name of ["setSearchTotal", "setSearchOffset", "setSearchSnippets"]) {
      ports[name] = (value: unknown) => queued.push(() => (host.bindings[name] as (value: unknown) => void)(value));
    }
    const apply = compileActual<(result: { items: AssetSummary[]; total: number; offset: number }, current: () => boolean) => void>("applySearchResult", ports);
    let current = true;
    apply({ items: [card("old-query")], total: 17, offset: 10 }, () => current);
    current = false;
    for (const publish of queued) publish();
    expect(host.states.get("setSearchTotal")).toBeNull();
    expect(host.states.get("setSearchOffset")).toBe(0);
    expect(host.states.get("setSearchSnippets")).toEqual(new Map());
  });

  it.each(["same-owner-generation", "same-id-reopen"])("actual runSearch drops a late error/notice for %s", async (change) => {
    const host = fixture(true);
    host.bindings.executeSearchDefinition = compileActual("executeSearchDefinition", host.bindings);
    const runSearch = compileActual<() => Promise<void>>("runSearch", host.bindings);
    const old = host.track(runSearch());
    await act(async () => undefined);
    if (change === "same-id-reopen") host.metadataSessionRef.current = host.metadataController.activateSession(host.library);
    await host.load(host.library, "all");
    host.raw.find(({ kind }) => kind === "old-primary")!.reject(new Error("old discovery error"));
    await old;
    expect(host.errors).not.toHaveBeenCalled();
    expect(host.notice).not.toHaveBeenCalled();
    expect((host.states.get("setAssets") as AssetSummary[]).map(({ assetId }) => assetId)).toEqual(["new-page"]);
  });
});

async function mountReconciliation(host: ReturnType<typeof fixture>) {
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  function Host({ summary, locale, notice }: { summary: RendererLibrarySummary; locale: string; notice?: (message: string) => void }) {
    const bindings = { ...host.bindings, library: summary, locale, backgroundLibraryId: summary.libraryId,
      setNotice: notice ?? host.notice, t: (key: string) => `${locale}:${key}` };
    const useActualPortsEffect = compileActual<() => void>("background-content-ports-effect", bindings);
    const useActualEffect = compileActual<() => void>("asset-reconciliation-effect", bindings);
    const reload = compileActual<(options?: LoadOptions) => Promise<void>>("reloadCurrentContent", bindings);
    host.reloadCurrentContentRef.current = (options) => host.track(reload(options));
    useActualPortsEffect();
    useActualEffect();
    return null;
  }
  closeFixtures.push(async () => { await act(async () => root.unmount()); container.remove(); });
  async function render(summary = host.library, locale = "zh-CN", notice?: (message: string) => void) {
    await act(async () => root.render(createElement(Host, { summary, locale, notice })));
  }
  await render();
  return { render };
}

describe("actual asset reconciliation effect dependency lifetime", () => {
  it.each(["summary", "locale"] as const)("same-owner %s render keeps one raw lease and one trailing reconciliation", async (change) => {
    const host = fixture();
    const mounted = await mountReconciliation(host);
    const initialEntry = host.backgroundContentRefreshRef.current;
    expect(initialEntry).not.toBeNull();
    await act(async () => { initialEntry!.request(["changed"]); });
    expect(host.active).toBe(7);
    await mounted.render(change === "summary" ? { ...host.library, displayName: "Updated summary" } : host.library,
      change === "locale" ? "en" : "zh-CN");
    await act(async () => { host.backgroundContentRefreshRef.current!.request(["changed-again"]); });
    expect.soft(host.backgroundContentRefreshRef.current).toBe(initialEntry);
    expect.soft(vi.mocked(host.api.onAssetsChanged)).toHaveBeenCalledOnce();
    expect.soft(host.active).toBe(7);
    expect.soft(host.maxActive).toBe(7);
    await act(async () => { for (const request of host.raw.slice(0, 7)) request.resolve(); });
    expect(host.raw).toHaveLength(14);
    await act(async () => { for (const request of host.raw) request.resolve(); });
    expect(host.active).toBe(0);
    expect.soft(host.maxActive).toBe(7);
    expect(host.errors).not.toHaveBeenCalled();
  });

  it("same-owner locale and notification-port updates apply to a pending candidate without rotating the lease", async () => {
    const host = fixture();
    const mounted = await mountReconciliation(host);
    const entry = host.backgroundContentRefreshRef.current;
    // Invoke the actual registered listener; the reconciliation that starts
    // from the AI entry must still carry the independent watcher candidate.
    const listener = vi.mocked(host.api.onAssetsChanged).mock.calls[0]![0];
    await act(async () => {
      listener({ type: "asset.changed", libraryId: host.library.libraryId, assetIds: ["changed"], source: "watcher", changedCount: 37, missingCount: 0 });
      entry!.request(["changed"]);
    });
    const latestNotice = vi.fn();
    await mounted.render(host.library, "en", latestNotice);
    expect(host.backgroundContentRefreshRef.current).toBe(entry);
    await act(async () => { for (const request of host.raw) request.resolve(); });
    expect(latestNotice).toHaveBeenCalledWith("en:toast.diskSyncedAuto");
    expect(host.notice).not.toHaveBeenCalled();
  });

  it("100 requests observe one terminal error from the actual owner drain", async () => {
    const host = fixture(true);
    await mountReconciliation(host);
    const entry = host.backgroundContentRefreshRef.current;
    await act(async () => { entry!.request(["first"]); });
    expect(host.raw.filter(({ kind }) => kind === "old-primary")).toHaveLength(1);
    await act(async () => { for (let index = 0; index < 100; index += 1) entry!.request([`changed-${index}`]); });
    // Both the active and its one dirty trailing read fail. The coalescer
    // still observes only its one shared terminal promise, not 100 catches.
    vi.mocked(host.api.searchAssets).mockRejectedValue(new Error("trailing read failed"));
    await act(async () => { host.raw.find(({ kind }) => kind === "old-primary")!.reject(new Error("active read failed")); });
    expect(host.errors).toHaveBeenCalledOnce();
    expect(vi.mocked(host.api.searchAssets)).toHaveBeenCalledTimes(2);
    expect(host.active).toBe(0);
  });

  it("a same-owner network-storage summary update changes library-signal policy without resubscribing", async () => {
    vi.useFakeTimers();
    const host = fixture();
    const mounted = await mountReconciliation(host);
    const entry = host.backgroundContentRefreshRef.current;
    const listener = vi.mocked(host.api.onLibraryChanged).mock.calls[0]![0];
    await act(async () => {
      listener({ type: "library.changed", libraryId: host.library.libraryId, changeSequence: 1 });
      await vi.advanceTimersByTimeAsync(120);
    });
    expect(host.raw).toHaveLength(0);
    await mounted.render({ ...host.library, networkStorage: true });
    expect(host.backgroundContentRefreshRef.current).toBe(entry);
    expect(vi.mocked(host.api.onLibraryChanged)).toHaveBeenCalledOnce();
    await act(async () => {
      listener({ type: "library.changed", libraryId: host.library.libraryId, changeSequence: 2 });
      await vi.advanceTimersByTimeAsync(120);
    });
    expect(host.raw).toHaveLength(7);
    await act(async () => { for (const request of host.raw) request.resolve(); });
    expect(host.active).toBe(0);
    expect(host.notice).not.toHaveBeenCalled();
  });
});

function actualLocalRemoval(host: ReturnType<typeof fixture>) {
  const timer = { current: undefined as number | undefined };
  Object.assign(host.bindings, {
    Math, decrementScopeCount, removeAssetIdsLocally, removeLocallyFromBrowse: vi.fn(), deferredReconcileTimerRef: timer,
  });
  closeFixtures.push(async () => { if (timer.current !== undefined) window.clearTimeout(timer.current); });
  return compileActual<(ids: string[], options?: { removedCount?: number }) => void>("applyLocalAssetRemoval", host.bindings);
}

describe("actual local-removal reconciliation", () => {
  it("the original 1500ms timer joins a blocked seven-raw lease instead of dispatching seven more", async () => {
    vi.useFakeTimers();
    const host = fixture();
    await mountReconciliation(host);
    await act(async () => { host.backgroundContentRefreshRef.current!.request(["changed"]); });
    expect(host.active).toBe(7);
    const remove = actualLocalRemoval(host);
    remove(["old-page"]);
    expect(host.states.get("setAssets")).toEqual([]);
    await act(async () => { await vi.advanceTimersByTimeAsync(1499); });
    expect(host.raw).toHaveLength(7);
    expect(vi.mocked(host.api.searchAssets)).toHaveBeenCalledTimes(3);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect.soft(host.raw).toHaveLength(7);
    expect.soft(host.active).toBe(7);
    expect.soft(host.maxActive).toBe(7);
    await act(async () => { for (const request of host.raw.slice(0, 7)) request.resolve(); });
    expect(host.raw).toHaveLength(14);
    await act(async () => { for (const request of host.raw) request.resolve(); });
    expect(host.active).toBe(0);
    expect.soft(host.maxActive).toBe(7);
    expect(host.errors).not.toHaveBeenCalled();
    expect(host.notice).not.toHaveBeenCalled();
  });

  it("the entry exposes the same existing promise for shared callers, not wrappers or void", async () => {
    const host = fixture();
    await mountReconciliation(host);
    const entry = host.backgroundContentRefreshRef.current!;
    const first = entry.request(["changed"]);
    const second = entry.request(["changed-again"]);
    expect(first).toBeInstanceOf(Promise);
    expect(second).toBe(first);
  });

  it("scroll restoration stays in reconciliation finally, after the timed read settles", async () => {
    vi.useFakeTimers();
    const host = fixture(true);
    await mountReconciliation(host);
    const canvas = { scrollTop: 64, scrollTo: vi.fn() };
    host.bindings.workspaceCanvasRef = { current: canvas };
    const remove = actualLocalRemoval(host);
    remove(["old-page"]);
    await act(async () => { await vi.advanceTimersByTimeAsync(1499); });
    expect(vi.mocked(host.api.searchAssets)).not.toHaveBeenCalled();
    expect(canvas.scrollTo).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(vi.mocked(host.api.searchAssets)).toHaveBeenCalledOnce();
    canvas.scrollTop = 192; // A first-page replacement would shift the canvas.
    expect(canvas.scrollTo).not.toHaveBeenCalled();
    await act(async () => { host.raw.find(({ kind }) => kind === "old-primary")!.resolve(); });
    await act(async () => { for (const request of host.raw) request.resolve(); });
    expect(canvas.scrollTo).toHaveBeenCalledOnce();
    expect(canvas.scrollTo).toHaveBeenCalledWith({ top: 64 });
  });

  it("a same-ID reopened owner is never queried by an old local-removal timer", async () => {
    vi.useFakeTimers();
    const host = fixture();
    await mountReconciliation(host);
    const remove = actualLocalRemoval(host);
    remove(["old-page"]);
    host.metadataSessionRef.current = host.metadataController.activateSession(host.library);
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(vi.mocked(host.api.searchAssets)).not.toHaveBeenCalled();
    expect(host.raw).toHaveLength(0);
  });

  it("an old-owner read finally cannot restore scroll on a replacement canvas", async () => {
    vi.useFakeTimers();
    const host = fixture(true);
    await mountReconciliation(host);
    const originalCanvas = { scrollTop: 64, scrollTo: vi.fn() };
    const canvasRef = { current: originalCanvas };
    host.bindings.workspaceCanvasRef = canvasRef;
    const remove = actualLocalRemoval(host);
    remove(["old-page"]);
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    host.metadataSessionRef.current = host.metadataController.activateSession(host.library);
    const replacement = { scrollTop: 320, scrollTo: vi.fn() };
    canvasRef.current = replacement;
    await act(async () => { host.raw.find(({ kind }) => kind === "old-primary")!.resolve(); });
    expect(replacement.scrollTo).not.toHaveBeenCalled();
    expect(originalCanvas.scrollTo).not.toHaveBeenCalled();
  });

  it("a local-only failed reconciliation remains silent and does not retry without new work", async () => {
    vi.useFakeTimers();
    const host = fixture(true);
    await mountReconciliation(host);
    const remove = actualLocalRemoval(host);
    remove(["old-page"]);
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    await act(async () => { host.raw.find(({ kind }) => kind === "old-primary")!.reject(new Error("local reconcile failure")); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(vi.mocked(host.api.searchAssets)).toHaveBeenCalledOnce();
    expect(host.errors).not.toHaveBeenCalled();
    expect(host.notice).not.toHaveBeenCalled();
  });
});
