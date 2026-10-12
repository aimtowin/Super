import { useEffect, useState } from 'react';
import type { FolderBrowseEntry } from '../shared/asset-types';
import type { SuperLibraryApi } from '../shared/library-api';
import type { MetadataSessionOwner } from './metadata-read-controller';

export type FolderBrowseRequest =
  | { kind: 'folder'; libraryId: string; parentFolderId: string | null; showIgnored: boolean }
  | { kind: 'collection'; libraryId: string; collectionId: string; recursive: boolean; parentFolderId: string | null; showIgnored: boolean };

type Snapshot = {
  owner: MetadataSessionOwner;
  key: string;
  page: number;
  refresh: number;
  entries: FolderBrowseEntry[];
  error: string | null;
};
const EMPTY_FOLDER_ENTRIES: FolderBrowseEntry[] = [];

/** Direct cards belong to a canvas page/session, not to global sidebar array identity. */
export function useFolderBrowseEntries(input: {
  api: SuperLibraryApi | null;
  owner: MetadataSessionOwner | null;
  request: FolderBrowseRequest | null;
  firstPageReady: boolean;
  firstPageToken: number;
  scopeToken: number;
  contentLoading: boolean;
  refresh: number;
}) {
  const { api, owner, request, firstPageReady, firstPageToken, scopeToken, contentLoading, refresh } = input;
  const key = request ? JSON.stringify([request, scopeToken]) : null;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const enabled = Boolean(api && owner && request && firstPageReady && !contentLoading);
  useEffect(() => {
    if (!enabled || !api || !owner || !request || !key) return;
    let cancelled = false;
    // Pending is derived from semantic ownership, not an extra effect render.
    // Only same-scope background refreshes may retain already usable cards.
    const read = Promise.resolve().then(() => cancelled ? null : request.kind === 'collection'
      ? api.listCollectionSourceBrowseEntries({
        libraryId: request.libraryId, collectionId: request.collectionId,
        recursive: request.recursive, parentFolderId: request.parentFolderId,
        showIgnored: request.showIgnored,
      })
      : api.listFolderBrowseEntries({
        libraryId: request.libraryId, parentFolderId: request.parentFolderId,
        showIgnored: request.showIgnored,
      }));
    void read.then(result => {
      if (!result) return;
      setSnapshot(current => cancelled ? current : {
        owner, key, page: firstPageToken, refresh,
        entries: result.ok ? result.value : current?.owner === owner && current.key === key ? current.entries : EMPTY_FOLDER_ENTRIES,
        error: result.ok ? null : result.error.message,
      });
    }, reason => {
      setSnapshot(current => cancelled ? current : {
        owner, key, page: firstPageToken, refresh,
        entries: current?.owner === owner && current.key === key ? current.entries : EMPTY_FOLDER_ENTRIES,
        error: reason instanceof Error ? reason.message : String(reason),
      });
    });
    return () => { cancelled = true; };
  }, [api, owner, request, key, enabled, refresh, firstPageToken]);
  const current = firstPageReady && snapshot?.owner === owner && snapshot.key === key ? snapshot : null;
  const loading = Boolean(request && (!current || current.refresh !== refresh || current.page !== firstPageToken || contentLoading));
  return { entries: current?.entries ?? EMPTY_FOLDER_ENTRIES, loading, error: !loading ? current?.error ?? null : null };
}
