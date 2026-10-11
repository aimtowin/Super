import type {
  CollectionSummary, LinkedFolderSummary, ManagedFolderSummary,
  SmartCollectionSummary, TagSummary, TrashedFolderSummary,
} from "../shared/asset-types";
import type { SuperLibraryApi } from "../shared/library-api";

/** Non-critical counts/sidebar only. First-page publication remains in App. */
export type ContentHydrationUpdate = {
  allAssetCount?: number;
  rootAssetCount?: number;
  trashedAssetCount?: number;
  folders?: ManagedFolderSummary[];
  linkedFolders?: LinkedFolderSummary[];
  tags?: TagSummary[];
  collections?: CollectionSummary[];
  smartCollections?: SmartCollectionSummary[];
  trashedFolders?: TrashedFolderSummary[];
};

export type ContentHydrationOptions = {
  api: Pick<SuperLibraryApi, "searchAssets" | "listFolders" | "listLinkedFolders"
    | "listTags" | "listCollections" | "listSmartCollections" | "listTrashedFolders">;
  libraryId: string;
  scope: string;
  includeLibraryCounts: boolean;
  refreshSidebar: boolean;
  trashMode: boolean;
  showIgnored: boolean;
  /** Only an unfiltered, exact primary total can replace its scope counter. */
  scopeTotalAvailable?: boolean;
  /** Captured library ownership, independent of foreground search/sort. */
  isCurrent: () => boolean;
  publish: (update: ContentHydrationUpdate) => void;
};

function start<T>(read: () => Promise<T>): Promise<T> {
  try { return read(); } catch (error) { return Promise.reject(error); }
}

/**
 * Publish independent successful fields as soon as they arrive. A slow count
 * or failed transport must not hold ready folders/collections hostage. Retain
 * the physical lease until EVERY dispatched request settles so a background
 * burst cannot overlap surviving reads. Logical cancellation still suppresses
 * publications, not physical IPC lifetime.
 */
export async function hydrateContent(options: ContentHydrationOptions): Promise<void> {
  const { api, libraryId, scope, includeLibraryCounts, refreshSidebar, trashMode,
    showIgnored, scopeTotalAvailable = true, isCurrent, publish } = options;
  if (!isCurrent()) return;
  const libId = { libraryId };
  function read<T>(enabled: boolean, request: () => Promise<T>, update: (result: T) => ContentHydrationUpdate | undefined): Promise<void> {
    if (!enabled) return Promise.resolve();
    return start(request).then(result => {
      if (!isCurrent()) return;
      const next = update(result);
      if (next) publish(next);
    });
  }
  // Keep reads flat; allSettled includes publication handlers as well as raw
  // failures. A rejected sibling does not erase already successful fields.
  // The Worker owns synchronous SQLite: post usable navigation before counts
  // so an expensive COUNT cannot occupy the queue ahead of the entire sidebar.
  const pending = [
    read(refreshSidebar, () => api.listCollections(libId), result => result.ok ? { collections: result.value } : undefined),
    read(refreshSidebar, () => api.listSmartCollections(libId), result => result.ok ? { smartCollections: result.value } : undefined),
    read(refreshSidebar, () => api.listTags(libId), result => result.ok ? { tags: result.value } : undefined),
    read(refreshSidebar, () => api.listFolders({ ...libId, showIgnored }),
      result => result.ok ? { folders: result.value, ...(!trashMode ? { trashedFolders: [] } : {}) } : undefined),
    read(refreshSidebar, () => api.listLinkedFolders({ ...libId, showIgnored }),
      result => result.ok ? { linkedFolders: result.value } : undefined),
    read(refreshSidebar && trashMode, () => api.listTrashedFolders(libId),
      result => result.ok ? { trashedFolders: result.value } : undefined),
    read(includeLibraryCounts && (!scopeTotalAvailable || trashMode || scope !== "all"),
      () => api.searchAssets({ ...libId, query: null, limit: 1, offset: 0, showIgnored }),
      result => result.ok ? { allAssetCount: result.value.total } : undefined),
    read(includeLibraryCounts && (!scopeTotalAvailable || trashMode || scope !== "root"),
      () => api.searchAssets({ ...libId, query: null, limit: 1, offset: 0,
        scope: { kind: "folder", folderId: null, recursive: false }, showIgnored }),
      result => result.ok ? { rootAssetCount: result.value.total } : undefined),
    read(includeLibraryCounts,
      () => api.searchAssets({ ...libId, query: null, limit: 1, offset: 0, scope: { kind: "trash" }, showIgnored }),
      result => result.ok ? { trashedAssetCount: result.value.total } : undefined),
  ];
  await Promise.allSettled(pending);
}
