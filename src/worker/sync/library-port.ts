/**
 * LibraryService → SyncLibraryPort 适配（Super-xffq）。
 *
 * SyncEngine 依赖的窄端口由这里绑定到真实 LibraryService 的方法，
 * 使同步编排层保持可单测而生产实现复用既有导入/修订/回收站管线。
 */

import type { LibraryService } from '../library-service';
import type { SyncLibraryPort } from './sync-engine';

export function createLibrarySyncPort(libraryService: LibraryService): SyncLibraryPort {
  return {
    async readSyncMetadata(libraryId,syncId) { return libraryService.readSyncMetadata(libraryId,syncId); },
    async applySyncMetadata(libraryId,syncId,expectedFingerprint,value) { libraryService.applySyncMetadata(libraryId,syncId,expectedFingerprint,value); },
    async syncSnapshot(libraryId) {
      const snapshot = libraryService.syncSnapshot(libraryId);
      return {
        library: snapshot.library,
        missingSyncIds: snapshot.missingSyncIds,
        deletedSyncIds: snapshot.deletedSyncIds,
        restoredSyncIds: snapshot.restoredSyncIds,
        assets: snapshot.assets.map((asset) => ({
          syncId: asset.syncId,
          assetId: asset.assetId,
          relativePath: asset.relativePath,
          contentHash: asset.contentHash,
          size: asset.size,
          modifiedAt: asset.modifiedAt,
        })),
      };
    },
    async applySyncContentUpdate(libraryId, syncId, relativePath, body) {
      return libraryService.applySyncContentUpdate(libraryId, syncId, relativePath, body);
    },
    async applySyncRecycle(libraryId, syncId) {
      libraryService.applySyncRecycle(libraryId, syncId);
    },
    async applySyncRelocate(libraryId, syncId, relativePath) {
      libraryService.applySyncRelocate(libraryId, syncId, relativePath);
    },
    async acknowledgeSyncRestores(libraryId, syncIds) {
      libraryService.acknowledgeSyncRestores(libraryId, syncIds);
    },
    async applySyncConflictCopy(libraryId, relativePath, body, conflictName) {
      return libraryService.applySyncConflictCopy(libraryId, relativePath, body, conflictName);
    },
    async readSyncManifestCache(libraryId) {
      return libraryService.readSyncManifestCache(libraryId);
    },
    async writeSyncManifestCache(libraryId, manifestJson) {
      libraryService.writeSyncManifestCache(libraryId, manifestJson);
    },
    async readLocalAssetContent(libraryId, syncId) {
      const content = libraryService.readSyncAssetContent(libraryId, syncId);
      if (!content) throw new Error(`Missing local sync asset: ${syncId}`);
      return content;
    },
  };
}
