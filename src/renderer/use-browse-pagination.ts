/**
 * Super-ws4k / Super-sa65: virtualized browse/search loading controller.
 *
 * First page paints immediately; a compact full-scope identity/geometry index
 * owns scrollbar layout. Scroll jumps fetch only the contiguous real-summary
 * pages intersecting the viewport. No synthetic AssetSummary cards exist.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import type {
  AssetSummary,
  BrowseLayoutEntry,
  FilterClause,
  SearchQuery,
  SearchScope,
  SortDefinition,
} from "../shared/asset-types";
import type { SuperLibraryApi } from "../shared/library-api";
import {
  browseLoadMoreObserverRoot,
  excludeLocallyDeletedAssets,
} from "./asset-browse-load-more";
import { BROWSE_LAYOUT_CHUNK_SIZE } from "../shared/browse-scope";
import {
  browsePageOffset,
  contiguousBrowsePageRuns,
  mergeLoadedBrowsePage,
} from "./browse-window-slots";

const browseDiagnosticsEnabled = Boolean(
  (globalThis as typeof globalThis & {
    super?: { e2e?: unknown };
  }).super?.e2e,
);

/** Page size for browse/search first load and window fetches. */
export const BROWSE_PAGE_SIZE = 100;

/**
 * The sentinel doubles as progressive layout hydration. Until the complete
 * geometry exists, reaching the current tail asks for the next small layout
 * chunk; once complete, it resumes the normal page-tail fallback.
 */
export function shouldRunBrowseSentinel(options: {
  layoutHydrationComplete: boolean;
  total: number;
}): boolean {
  return options.total > 0;
}

/** Match the observer's 800px root margin with an explicit geometry guard. */
export function isBrowseRootNearTail(
  root: Pick<HTMLElement, "scrollTop" | "clientHeight" | "scrollHeight"> | null,
): boolean {
  if (!root) return true;
  return root.scrollTop + root.clientHeight >= root.scrollHeight - 800;
}

export type BrowsePageDefinition =
  | {
      kind: "search";
      libraryId: string;
      query: SearchQuery | null;
      filters?: FilterClause[] | null;
      scope?: SearchScope | null;
      sort?: SortDefinition | null;
      showIgnored: boolean;
      target: "assets" | "trash";
    }
  | {
      kind: "smart-collection";
      libraryId: string;
      collectionId: string;
      target: "assets";
    };

export type BrowseFirstPage = {
  items: AssetSummary[];
  total: number;
  offset: number;
};

export type BeginBrowsePage = (
  definition: BrowsePageDefinition,
  firstPage: BrowseFirstPage,
) => void;

/**
 * Fetch the full-scope id set for select-all / invert (idsOnly). Pure helper —
 * the hook wraps it in a generation guard so a stale result is never applied.
 */
export async function fetchBrowseScopeIds(options: {
  api: SuperLibraryApi;
  definition: BrowsePageDefinition;
}): Promise<string[] | null> {
  const { api, definition } = options;
  if (definition.kind === "smart-collection") {
    const result = await api.executeSmartCollection({
      libraryId: definition.libraryId,
      collectionId: definition.collectionId,
      idsOnly: true,
    });
    return result.ok ? (result.value.assetIds ?? []) : null;
  }
  const result = await api.searchAssets({
    libraryId: definition.libraryId,
    query: definition.query,
    filters: definition.filters ?? undefined,
    scope: definition.scope ?? undefined,
    sort: definition.sort ?? undefined,
    showIgnored: definition.showIgnored,
    idsOnly: true,
  });
  return result.ok ? (result.value.assetIds ?? []) : null;
}

/** Fetch only the full-scope identity + geometry index used by virtual layout. */
export type BrowseLayoutPage = {
  layout: BrowseLayoutEntry[];
  total: number;
  offset: number;
};

export async function fetchBrowseLayout(options: {
  api: SuperLibraryApi;
  definition: BrowsePageDefinition;
  offset?: number;
  limit?: number;
}): Promise<BrowseLayoutPage | null> {
  const { api, definition } = options;
  const result = definition.kind === "smart-collection"
    ? await api.executeSmartCollection({
        libraryId: definition.libraryId,
        collectionId: definition.collectionId,
        layoutOnly: true,
        offset: options.offset,
        limit: options.limit,
      })
    : await api.searchAssets({
        libraryId: definition.libraryId,
        query: definition.query,
        filters: definition.filters ?? undefined,
        scope: definition.scope ?? undefined,
        sort: definition.sort ?? undefined,
        showIgnored: definition.showIgnored,
        layoutOnly: true,
        offset: options.offset,
        limit: options.limit,
      });
  return result.ok && result.value.layout !== undefined
    ? { layout: result.value.layout, total: result.value.total, offset: result.value.offset }
    : null;
}

/**
 * Guard a scope-id fetch against a superseded browse definition (Super-ws4k
 * review). The captured generation is compared again after the await: switching
 * folder/scope while the ids query is in flight bumps the controller
 * generation, so the stale id set is discarded instead of being applied to the
 * new scope's selection.
 *
 * Returns null both on failure and on staleness. Callers treat null/empty as a
 * no-op — they must not clear an existing selection: the synchronous
 * pre-pagination behavior only reached an empty id set through an empty scope,
 * where the keyboard/menu guards already no-op'd (see
 * dispatchSelectionKeyboardAction / hasBrowseAssets).
 */
export async function fetchBrowseScopeAssetIdsGuarded(options: {
  api: SuperLibraryApi | null;
  definition: BrowsePageDefinition | null;
  currentGeneration: () => number;
  fetch?: (input: {
    api: SuperLibraryApi;
    definition: BrowsePageDefinition;
  }) => Promise<string[] | null>;
}): Promise<string[] | null> {
  const { api, definition, currentGeneration } = options;
  const fetchImpl = options.fetch ?? fetchBrowseScopeIds;
  if (!api || !definition) return null;
  const generation = currentGeneration();
  const ids = await fetchImpl({ api, definition });
  if (generation !== currentGeneration()) return null;
  return ids;
}

export type BrowseSearchPageRegistration = {
  libraryId: string;
  query: SearchQuery | null;
  filters?: FilterClause[] | null;
  scope?: SearchScope | null;
  sort?: SortDefinition | null;
  showIgnored: boolean;
  target?: "assets" | "trash";
  items: AssetSummary[];
  total: number;
  offset: number;
};

/** Shared registration for every search-shaped first page (Super-ws4k). */
export function registerBrowseSearchPage(
  beginPage: BeginBrowsePage,
  input: BrowseSearchPageRegistration,
): void {
  beginPage(
    {
      kind: "search",
      libraryId: input.libraryId,
      query: input.query,
      filters: input.filters ?? null,
      scope: input.scope ?? null,
      sort: input.sort ?? null,
      showIgnored: input.showIgnored,
      target: input.target ?? "assets",
    },
    { items: input.items, total: input.total, offset: input.offset },
  );
}

export type BrowseSmartCollectionPageRegistration = {
  libraryId: string;
  collectionId: string;
  items: AssetSummary[];
  total: number;
  offset: number;
};

/** Shared registration for smart-collection first pages (Super-ws4k). */
export function registerBrowseSmartCollectionPage(
  beginPage: BeginBrowsePage,
  input: BrowseSmartCollectionPageRegistration,
): void {
  beginPage(
    {
      kind: "smart-collection",
      libraryId: input.libraryId,
      collectionId: input.collectionId,
      target: "assets",
    },
    { items: input.items, total: input.total, offset: input.offset },
  );
}

export type UseBrowsePaginationArgs = {
  api: SuperLibraryApi | null;
  setAssets: Dispatch<SetStateAction<AssetSummary[]>>;
  setTrashedAssets: Dispatch<SetStateAction<AssetSummary[]>>;
  setBrowseLayout: Dispatch<SetStateAction<BrowseLayoutEntry[]>>;
  setSearchTotal: Dispatch<SetStateAction<number | null>>;
  setSearchOffset: Dispatch<SetStateAction<number>>;
  setSearchSnippets: Dispatch<SetStateAction<Map<string, string>>>;
  /** Called once when a current-generation page fetch fails (scope deleted mid-scroll). */
  onLoadMoreFailed?: () => void;
};

export type UseBrowsePaginationResult = {
  /** Register a brand-new query/scope and begin its compact layout fetch. */
  beginPage: (definition: BrowsePageDefinition, firstPage: BrowseFirstPage) => void;
  /** Fetch the page covering this index range (scrollbar jumps, not sequential). */
  ensureVisibleRange: (startIndex: number, endIndex: number) => Promise<void>;
  /** Fetch the next unfilled page (scroll sentinel fallback). */
  appendNextPage: () => Promise<void>;
  /** Full-scope asset ids for select-all / invert (idsOnly query). */
  fetchScopeAssetIds: () => Promise<string[] | null>;
  /**
   * Super-关联刷新: fold a local deletion into the pagination bookkeeping so
   * an in-flight/next append cannot resurrect deleted rows and the offset
   * counters stay consistent until the deferred full reconcile re-registers.
   */
  removeLocally: (assetIds: string[], removedCount: number) => void;
  /** Drop the current definition (library close / navigation to non-browse views). */
  reset: () => void;
  /** A successful first page, including an explicitly empty page, owns this generation. */
  firstPageReady: boolean;
  firstPageToken: number;
  firstPageScopeToken: number;
  hasMorePages: boolean;
  loadingMore: boolean;
  sentinelRef: (node: HTMLDivElement | null) => void;
};

/**
 * Worker discards a superseded browse-window search by returning an empty
 * page (`items: []`, `total: 0`) instead of CANCELLED. Do not treat that as
 * an empty library or as a filled offset — especially offset 0, which the
 * older `offset > 0` guard would apply and then refuse to refetch.
 */
export function isDiscardedBrowseWindowPage(
  page: { items: readonly unknown[]; total: number },
  requestOffset: number,
  knownTotal: number,
): boolean {
  return (
    page.items.length === 0 &&
    page.total === 0 &&
    (requestOffset > 0 || knownTotal > 0)
  );
}

export function isIgnorableBrowseWindowFailure(code: string | undefined): boolean {
  return code === "CANCELLED";
}

type BrowseGenerationOwner = {
  generation: number;
  scopeGeneration: number;
  inFlightOffsets: Set<number>;
  layoutInFlight: boolean;
  disposed: boolean;
};

function createBrowseGenerationOwner(generation: number, scopeGeneration = generation): BrowseGenerationOwner {
  return { generation, scopeGeneration, inFlightOffsets: new Set(), layoutInFlight: false, disposed: false };
}

export function useBrowsePagination(
  args: UseBrowsePaginationArgs,
): UseBrowsePaginationResult {
  const {
    api,
    setAssets,
    setTrashedAssets,
    setBrowseLayout,
    setSearchTotal,
    setSearchOffset,
    setSearchSnippets,
    onLoadMoreFailed,
  } = args;

  const definitionRef = useRef<BrowsePageDefinition | null>(null);
  const generationRef = useRef(0);
  // Scope replacement updates this mount's holder. StrictMode effect replay
  // replaces the holder itself so an older cleanup never disposes the new setup.
  const lifetimeRef = useRef({ owner: createBrowseGenerationOwner(0) });
  const totalRef = useRef(0);
  const layoutRef = useRef<BrowseLayoutEntry[]>([]);
  const layoutHydrationCompleteRef = useRef(false);
  const filledOffsetsRef = useRef<Set<number>>(new Set());
  const deletedIdsRef = useRef<Set<string>>(new Set());
  const [hasMorePages, setHasMorePages] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [firstPageOwner, setFirstPageOwner] = useState<BrowseGenerationOwner | null>(null);
  const [sentinelNode, setSentinelNode] = useState<HTMLDivElement | null>(null);
  // Re-arm the IntersectionObserver after the compact layout response settles.
  // The observer must not depend on the large layout array itself.
  const [layoutHydrationVersion, setLayoutHydrationVersion] = useState(0);

  const isCurrentOwner = useCallback((owner: BrowseGenerationOwner) =>
    !owner.disposed && lifetimeRef.current.owner === owner, []);

  const replaceOwner = useCallback((navigation = false) => {
    const lifetime = lifetimeRef.current;
    lifetime.owner.disposed = true;
    const generation = ++generationRef.current;
    const owner = createBrowseGenerationOwner(generation, navigation ? generation : lifetime.owner.scopeGeneration);
    lifetime.owner = owner;
    return owner;
  }, []);

  useEffect(() => {
    if (lifetimeRef.current.owner.disposed) {
      lifetimeRef.current = { owner: createBrowseGenerationOwner(++generationRef.current) };
    }
    const lifetime = lifetimeRef.current;
    return () => { lifetime.owner.disposed = true; };
  }, []);

  const applyTarget = useCallback(
    (definition: BrowsePageDefinition) =>
      definition.target === "trash" ? setTrashedAssets : setAssets,
    [setAssets, setTrashedAssets],
  );

  const refreshHasMore = useCallback((owner: BrowseGenerationOwner, total: number, filled: ReadonlySet<number>) => {
    if (!isCurrentOwner(owner)) return;
    // Summaries can finish before the compact geometry (e.g. 173 assets with
    // a deferred first-page count). Keep the probe until both are complete;
    // otherwise loaded tail summaries have no slots and disappear forever.
    if (total > 0 && !layoutHydrationCompleteRef.current) {
      setHasMorePages(true);
      return;
    }
    for (let offset = 0; offset < total; offset += BROWSE_PAGE_SIZE) {
      if (!filled.has(offset)) {
        setHasMorePages(true);
        return;
      }
    }
    setHasMorePages(false);
  }, [isCurrentOwner]);

  const hydrateNextLayoutChunk = useCallback(
    async (definition: BrowsePageDefinition, owner: BrowseGenerationOwner) => {
      if (!api || !isCurrentOwner(owner)) return;
      const offset = layoutRef.current.length;
      if (offset >= totalRef.current) {
        layoutHydrationCompleteRef.current = true;
        refreshHasMore(owner, totalRef.current, filledOffsetsRef.current);
        setLayoutHydrationVersion((version) => isCurrentOwner(owner) ? version + 1 : version);
        return;
      }
      if (owner.layoutInFlight) return;
      owner.layoutInFlight = true;
      try {
        const page = await fetchBrowseLayout({
          api,
          definition,
          offset,
          limit: Math.min(BROWSE_LAYOUT_CHUNK_SIZE, totalRef.current - offset),
        });
        if (browseDiagnosticsEnabled) window.dispatchEvent(new CustomEvent("super:e2e-browse-layout", {
          detail: { offset, count: page?.layout.length, total: page?.total, generation: owner.generation, currentGeneration: generationRef.current },
        }));
        if (!isCurrentOwner(owner)) return;
        if (!page || (page.layout.length === 0 && page.total > offset)) {
          // Do not strand the current browse scope if a non-critical geometry
          // response fails. The already-painted section still paginates.
          layoutHydrationCompleteRef.current = true;
          refreshHasMore(owner, totalRef.current, filledOffsetsRef.current);
          setLayoutHydrationVersion((version) => isCurrentOwner(owner) ? version + 1 : version);
          return;
        }
        totalRef.current = page.total;
        setSearchTotal(page.total);
        const nextLayout = page.offset === layoutRef.current.length
          ? [...layoutRef.current, ...page.layout]
          : page.offset === 0
            ? page.layout
            : layoutRef.current;
        layoutRef.current = nextLayout;
        layoutHydrationCompleteRef.current =
          nextLayout.length >= page.total || page.layout.length === 0;
        refreshHasMore(owner, page.total, filledOffsetsRef.current);
        setBrowseLayout(nextLayout);
        setLayoutHydrationVersion((version) => isCurrentOwner(owner) ? version + 1 : version);
        applyTarget(definition)((current) =>
          isCurrentOwner(owner)
            ? mergeLoadedBrowsePage({ current, items: [], layout: nextLayout })
            : current,
        );
      } finally {
        owner.layoutInFlight = false;
      }
    },
    [api, applyTarget, isCurrentOwner, refreshHasMore, setBrowseLayout, setSearchTotal],
  );

  const beginPage = useCallback(
    (definition: BrowsePageDefinition, firstPage: BrowseFirstPage) => {
      if (!isCurrentOwner(lifetimeRef.current.owner)) return;
      const owner = replaceOwner();
      definitionRef.current = definition;
      setFirstPageOwner((current) => isCurrentOwner(owner) ? owner : current);
      deletedIdsRef.current = new Set();
      totalRef.current = firstPage.total;
      const initialLayout = firstPage.items.map((asset) => ({
        assetId: asset.assetId,
        width: asset.width,
        height: asset.height,
        previewArtifactId: asset.thumbnailArtifactId,
      }));
      layoutRef.current = initialLayout;
      layoutHydrationCompleteRef.current = firstPage.items.length >= firstPage.total;
      setLayoutHydrationVersion((version) => isCurrentOwner(owner) ? version + 1 : version);
      setBrowseLayout(initialLayout);
      const filled = new Set<number>();
      filled.add(browsePageOffset(firstPage.offset, BROWSE_PAGE_SIZE));
      filledOffsetsRef.current = filled;
      setLoadingMore(false);
      setSearchOffset(firstPage.offset + firstPage.items.length);
      setSearchTotal(firstPage.total);
      refreshHasMore(owner, firstPage.total, filled);
      applyTarget(definition)([...firstPage.items]);
      if (api && !layoutHydrationCompleteRef.current) {
        void hydrateNextLayoutChunk(definition, owner);
      }
    },
    [api, applyTarget, hydrateNextLayoutChunk, isCurrentOwner, refreshHasMore, replaceOwner, setBrowseLayout, setSearchOffset, setSearchTotal],
  );

  const fetchPageAt = useCallback(
    async (offset: number, owner: BrowseGenerationOwner, limit = BROWSE_PAGE_SIZE) => {
      const definition = definitionRef.current;
      if (!definition || !api || !isCurrentOwner(owner)) return;
      const coveredOffsets: number[] = [];
      for (
        let covered = offset;
        covered < Math.min(totalRef.current, offset + limit);
        covered += BROWSE_PAGE_SIZE
      ) {
        coveredOffsets.push(covered);
      }
      if (coveredOffsets.every((covered) => filledOffsetsRef.current.has(covered))) return;
      if (coveredOffsets.some((covered) => owner.inFlightOffsets.has(covered))) return;
      for (const covered of coveredOffsets) owner.inFlightOffsets.add(covered);
      if (browseDiagnosticsEnabled) {
        // Super-9e1d8d: issue-time marker. The existing -result/-page events
        // only fire on resolution/apply, so jump-latency attribution could not
        // separate renderer decision delay from worker query cost.
        window.dispatchEvent(new CustomEvent("super:e2e-browse-request", {
          detail: {
            requestOffset: offset,
            requestLimit: limit,
            requestGeneration: owner.generation,
          },
        }));
      }
      if (!isCurrentOwner(owner)) {
        for (const covered of coveredOffsets) owner.inFlightOffsets.delete(covered);
        return;
      }
      setLoadingMore(true);
      try {
        const result =
          definition.kind === "smart-collection"
            ? await api.executeSmartCollection({
                libraryId: definition.libraryId,
                collectionId: definition.collectionId,
                limit,
                offset,
              })
            : await api.searchAssets({
                libraryId: definition.libraryId,
                query: definition.query,
                filters: definition.filters ?? undefined,
                scope: definition.scope ?? undefined,
                sort: definition.sort ?? undefined,
                showIgnored: definition.showIgnored,
                limit,
                offset,
              });
        if (browseDiagnosticsEnabled) {
          window.dispatchEvent(new CustomEvent("super:e2e-browse-result", {
            detail: {
              requestOffset: offset,
              requestLimit: limit,
              ok: result.ok,
              errorCode: result.ok ? null : result.error.code,
              currentGeneration: generationRef.current,
              requestGeneration: owner.generation,
            },
          }));
        }
        if (!isCurrentOwner(owner)) return;
        if (!result.ok) {
          if (isIgnorableBrowseWindowFailure(result.error.code)) return;
          setHasMorePages(false);
          onLoadMoreFailed?.();
          return;
        }
        const page = result.value as {
          items: AssetSummary[];
          total: number;
          offset: number;
          snippets?: Array<{ assetId: string; text: string }>;
        };
        if (browseDiagnosticsEnabled) {
          window.dispatchEvent(new CustomEvent("super:e2e-browse-page", {
            detail: {
              requestOffset: offset,
              requestLimit: limit,
              resultOffset: page.offset,
              itemCount: page.items.length,
              firstAssetId: page.items[0]?.assetId ?? null,
              lastAssetId: page.items.at(-1)?.assetId ?? null,
            },
          }));
        }
        if (!isCurrentOwner(owner)) return;
        if (isDiscardedBrowseWindowPage(page, offset, totalRef.current)) return;
        const liveItems = excludeLocallyDeletedAssets(
          page.items,
          deletedIdsRef.current,
        );
        if (offset === 0 && page.total > 0) {
          totalRef.current = page.total;
        } else if (page.total > totalRef.current) {
          totalRef.current = page.total;
        }
        for (let index = 0; index < page.items.length; index += BROWSE_PAGE_SIZE) {
          filledOffsetsRef.current.add(offset + index);
        }
        setSearchTotal(totalRef.current);
        setSearchOffset(offset + page.items.length);
        refreshHasMore(owner, totalRef.current, filledOffsetsRef.current);
        const snippets = page.snippets ?? [];
        if (snippets.length > 0) {
          setSearchSnippets((current) => {
            if (!isCurrentOwner(owner)) return current;
            const next = new Map(current);
            for (const snippet of snippets) {
              next.set(snippet.assetId, snippet.text);
            }
            return next;
          });
        }
        applyTarget(definition)((current) =>
          isCurrentOwner(owner)
            ? mergeLoadedBrowsePage({ current, items: liveItems, layout: layoutRef.current })
            : current,
        );
      } finally {
        for (const covered of coveredOffsets) {
          owner.inFlightOffsets.delete(covered);
        }
        if (isCurrentOwner(owner) && owner.inFlightOffsets.size === 0) setLoadingMore(false);
      }
    },
    [
      api,
      applyTarget,
      isCurrentOwner,
      onLoadMoreFailed,
      refreshHasMore,
      setSearchOffset,
      setSearchSnippets,
      setSearchTotal,
    ],
  );

  const ensureVisibleRange = useCallback(
    async (startIndex: number, endIndex: number) => {
      const definition = definitionRef.current;
      const owner = lifetimeRef.current.owner;
      if (!definition || !api || !isCurrentOwner(owner)) return;
      const firstOffset = browsePageOffset(
        Math.max(0, Math.min(startIndex, endIndex)),
        BROWSE_PAGE_SIZE,
      );
      const lastOffset = browsePageOffset(
        Math.min(totalRef.current - 1, Math.max(startIndex, endIndex)),
        BROWSE_PAGE_SIZE,
      );
      const offsets: number[] = [];
      for (let offset = firstOffset; offset <= lastOffset; offset += BROWSE_PAGE_SIZE) {
        if (
          !filledOffsetsRef.current.has(offset)
          && !owner.inFlightOffsets.has(offset)
        ) offsets.push(offset);
      }
      if (offsets.length === 0) return;
      // Do not let an older in-flight page block a new destination. Split the
      // missing pages around in-flight gaps, then request the contiguous run
      // nearest the viewport center. This keeps the latest search lane
      // serialized while still allowing a jump from page A to page B to make
      // progress when A is already being fetched.
      const runs = contiguousBrowsePageRuns(offsets, BROWSE_PAGE_SIZE);
      const center = (startIndex + endIndex) / 2;
      runs.sort((left, right) => {
        const leftCenter = ((left[0] ?? center) + (left.at(-1) ?? center)) / 2;
        const rightCenter = ((right[0] ?? center) + (right.at(-1) ?? center)) / 2;
        return Math.abs(leftCenter - center) - Math.abs(rightCenter - center);
      });
      const selectedRun = runs[0]!;
      const requestOffset = selectedRun[0]!;
      const requestLimit = Math.min(
        500,
        selectedRun.at(-1)! - requestOffset + BROWSE_PAGE_SIZE,
      );
      await fetchPageAt(requestOffset, owner, requestLimit);
    },
    [api, fetchPageAt, isCurrentOwner],
  );

  const appendNextPage = useCallback(async () => {
    const owner = lifetimeRef.current.owner;
    if (!isCurrentOwner(owner)) return;
    const total = totalRef.current;
    if (total <= 0) return;
    if (!layoutHydrationCompleteRef.current) {
      const definition = definitionRef.current;
      if (definition) await hydrateNextLayoutChunk(definition, owner);
      return;
    }
    // The sentinel sits after the last slot. Fill the tail window — never the
    // first unfilled offset — so a jump to the end is not queued behind
    // pages 0, 100, 200…
    const last = Math.max(0, total - 1);
    await ensureVisibleRange(last, last);
  }, [ensureVisibleRange, hydrateNextLayoutChunk, isCurrentOwner]);

  const fetchScopeAssetIds = useCallback(
    async (): Promise<string[] | null> => {
      const owner = lifetimeRef.current.owner;
      if (!isCurrentOwner(owner)) return null;
      const ids = await fetchBrowseScopeAssetIdsGuarded({
        api,
        definition: definitionRef.current,
        currentGeneration: () => generationRef.current,
      });
      return isCurrentOwner(owner) ? ids : null;
    },
    [api, isCurrentOwner],
  );

  const removeLocally = useCallback(
    (assetIds: string[], removedCount: number) => {
      const owner = lifetimeRef.current.owner;
      if (!isCurrentOwner(owner)) return;
      for (const assetId of assetIds) {
        deletedIdsRef.current.add(assetId);
      }
      totalRef.current = Math.max(0, totalRef.current - removedCount);
      const removed = new Set(assetIds);
      layoutRef.current = layoutRef.current.filter(
        (entry) => !removed.has(entry.assetId),
      );
      setBrowseLayout(layoutRef.current);
      refreshHasMore(owner, totalRef.current, filledOffsetsRef.current);
    },
    [isCurrentOwner, refreshHasMore, setBrowseLayout],
  );

  const reset = useCallback(() => {
    if (!isCurrentOwner(lifetimeRef.current.owner)) return;
    const owner = replaceOwner(true);
    definitionRef.current = null;
    setFirstPageOwner((current) => isCurrentOwner(owner) ? null : current);
    totalRef.current = 0;
    layoutRef.current = [];
    layoutHydrationCompleteRef.current = false;
    setLayoutHydrationVersion((version) => isCurrentOwner(owner) ? version + 1 : version);
    setBrowseLayout([]);
    filledOffsetsRef.current = new Set();
    setLoadingMore(false);
    setHasMorePages(false);
  }, [isCurrentOwner, replaceOwner, setBrowseLayout]);

  const sentinelRef = useCallback((node: HTMLDivElement | null) => {
    if (!isCurrentOwner(lifetimeRef.current.owner)) return;
    setSentinelNode(node);
  }, [isCurrentOwner]);

  useEffect(() => {
    const owner = lifetimeRef.current.owner;
    if (!sentinelNode || !isCurrentOwner(owner)) return;
    const root = browseLoadMoreObserverRoot(sentinelNode);
    const observer = new IntersectionObserver(
      (entries) => {
        if (!isCurrentOwner(owner)) return;
        for (const entry of entries) {
          if (browseDiagnosticsEnabled) window.dispatchEvent(new CustomEvent("super:e2e-browse-sentinel", {
            detail: { intersecting: entry.isIntersecting, nearTail: isBrowseRootNearTail(root), inFlight: owner.inFlightOffsets.size, layoutComplete: layoutHydrationCompleteRef.current, total: totalRef.current },
          }));
          if (
            isCurrentOwner(owner)
            && entry.isIntersecting
            && isBrowseRootNearTail(root)
            && shouldRunBrowseSentinel({
              layoutHydrationComplete: layoutHydrationCompleteRef.current,
              total: totalRef.current,
            })
            // A visible-range request is the interactive path. Let it finish
            // before the low-priority tail fallback can start another Worker
            // query for the same scope.
            && owner.inFlightOffsets.size === 0
          ) void appendNextPage();
        }
      },
      { root, rootMargin: "800px 0px" },
    );
    observer.observe(sentinelNode);
    return () => observer.disconnect();
    // IntersectionObserver only reports threshold crossings. A visible probe
    // suppressed by an interactive page request needs another observation
    // once that request settles, even if the scroll position did not change.
  }, [appendNextPage, isCurrentOwner, layoutHydrationVersion, loadingMore, sentinelNode]);

  return {
    beginPage,
    ensureVisibleRange,
    appendNextPage,
    fetchScopeAssetIds,
    removeLocally,
    reset,
    firstPageReady: firstPageOwner !== null && !firstPageOwner.disposed,
    firstPageToken: firstPageOwner?.generation ?? 0,
    firstPageScopeToken: firstPageOwner?.scopeGeneration ?? 0,
    hasMorePages,
    loadingMore,
    sentinelRef,
  };
}
