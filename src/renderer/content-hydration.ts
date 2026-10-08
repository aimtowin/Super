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
  /** App combines captured session ownership with its browse generation. */
  isCurrent: () => boolean;
  publish: (update: ContentHydrationUpdate) => void;
};

function start<T>(read: () => Promise<T>): Promise<T> {
  try { return read(); } catch (error) { return Promise.reject(error); }
}

function fulfilledValue<T>(result: PromiseSettledResult<T>): T | undefined {
  return result.status === "fulfilled" ? result.value : undefined;
}

/**
 * Preserve the existing scope/typed-result publication policy while retaining
 * the raw read lease until EVERY dispatched request settles. A fail-fast nested
 * Promise.all would allow the next background batch to overlap surviving reads.
 * Rejected transport is non-critical and publishes nothing, as in App's old
 * catch. A typed per-field failure still allows the other successful fields.
 * Logical owner cancellation suppresses publication, not physical IPC lifetime.
 */
export async function hydrateContent(options: ContentHydrationOptions): Promise<void> {
  const { api, libraryId, scope, includeLibraryCounts, refreshSidebar, trashMode,
    showIgnored, isCurrent, publish } = options;
  if (!isCurrent()) return;
  const libId = { libraryId };
  // Keep these raw promises flat, including each sidebar request. Awaiting an
  // already fail-fast sidebar aggregate would not account for its siblings.
  const pending = [
    includeLibraryCounts && (trashMode || scope !== "all")
      ? start(() => api.searchAssets({ ...libId, query: null, limit: 1, offset: 0, showIgnored }))
      : Promise.resolve(undefined),
    includeLibraryCounts && (trashMode || scope !== "root")
      ? start(() => api.searchAssets({ ...libId, query: null, limit: 1, offset: 0,
          scope: { kind: "folder", folderId: null, recursive: false }, showIgnored }))
      : Promise.resolve(undefined),
    includeLibraryCounts
      ? start(() => api.searchAssets({ ...libId, query: null, limit: 1, offset: 0, scope: { kind: "trash" }, showIgnored }))
      : Promise.resolve(undefined),
    refreshSidebar ? start(() => api.listFolders({ ...libId, showIgnored })) : Promise.resolve(undefined),
    refreshSidebar ? start(() => api.listLinkedFolders({ ...libId, showIgnored })) : Promise.resolve(undefined),
    refreshSidebar ? start(() => api.listTags(libId)) : Promise.resolve(undefined),
    refreshSidebar ? start(() => api.listCollections(libId)) : Promise.resolve(undefined),
    refreshSidebar ? start(() => api.listSmartCollections(libId)) : Promise.resolve(undefined),
    refreshSidebar && trashMode ? start(() => api.listTrashedFolders(libId)) : Promise.resolve(undefined),
  ] as const;
  const results = await Promise.allSettled(pending);
  if (results.some((result) => result.status === "rejected") || !isCurrent()) return;

  const allResult = fulfilledValue(results[0]);
  const rootResult = fulfilledValue(results[1]);
  const trashResult = fulfilledValue(results[2]);
  const folderResult = fulfilledValue(results[3]);
  const linkedResult = fulfilledValue(results[4]);
  const tagResult = fulfilledValue(results[5]);
  const collectionResult = fulfilledValue(results[6]);
  const smartResult = fulfilledValue(results[7]);
  const trashedFoldersResult = fulfilledValue(results[8]);
  const update: ContentHydrationUpdate = {};
  if (allResult?.ok) update.allAssetCount = allResult.value.total;
  if (rootResult?.ok) update.rootAssetCount = rootResult.value.total;
  if (trashResult?.ok) update.trashedAssetCount = trashResult.value.total;
  if (folderResult?.ok) update.folders = folderResult.value;
  if (linkedResult?.ok) update.linkedFolders = linkedResult.value;
  if (tagResult?.ok) update.tags = tagResult.value;
  if (collectionResult?.ok) update.collections = collectionResult.value;
  if (smartResult?.ok) update.smartCollections = smartResult.value;
  if (refreshSidebar && trashMode && trashedFoldersResult?.ok) {
    update.trashedFolders = trashedFoldersResult.value;
  } else if (refreshSidebar && !trashMode) {
    update.trashedFolders = [];
  }
  if (Object.keys(update).length > 0 && isCurrent()) publish(update);
}
