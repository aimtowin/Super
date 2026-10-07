import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { LibraryService } from '../../src/worker/library-service';

interface Connection {
  close(): void;
  exec(sql: string): void;
  prepare(sql: string): { run(...params: unknown[]): { changes: number } };
}
const Database = BetterSqlite3 as new (filename: string) => Connection;

it('keeps browse/sidebar caches through local job progress but refreshes after metadata and external writes', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'super-cache-invalidation-'));
  const service = new LibraryService({ observerFactory: () => ({ close() {} }) });
  let external: Connection | undefined;
  try {
    const library = service.createLibrary({ displayName: 'Cache invariants', selectedParentPath: root });
    const libraryId = library.libraryId;
    const folder = service.createManagedFolder({ libraryId, name: 'folder' });
    const source = path.join(root, 'source.png');
    writeFileSync(source, 'test image source');
    const plan = service.prepareImport({ libraryId, sourceKind: 'files', sourcePaths: [source], targetFolderId: folder.folderId });
    const asset = service.resolveImport({ importId: plan.importId, suspectedDuplicate: 'skip', nameConflict: 'keep-both' }).assets[0]!;
    service.setAssetMetadata({ libraryId, assetId: asset.assetId, expectedVersion: 0, favorite: false });
    const collection = service.createCollection({ libraryId, name: 'Collection' });
    service.addCollectionAssets({ libraryId, collectionId: collection.collectionId, assetIds: [asset.assetId] });
    service.createSmartCollection({ libraryId, name: 'Favorites', queryDefinitionJson: JSON.stringify({ filters: [{ field: 'favorite', values: [], exclude: false }] }) });
    const open = (service as unknown as { openById: Map<string, {
      connection: Connection;
      collectionCountCache?: unknown; smartCollectionCountCache?: unknown;
      folderCountCache?: unknown; browseIndexCache?: unknown;
    }> }).openById.get(libraryId)!;
    open.connection.prepare(`INSERT INTO jobs
      (job_id, library_id, asset_id, revision_id, kind, status, priority, progress, attempt_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'generate_thumbnail', 'queued', 0, 0, 0, ?, ?)`)
      .run(randomUUID(), libraryId, asset.assetId, asset.currentRevisionId, new Date().toISOString(), new Date().toISOString());
    const warm = () => {
      service.listManagedFolders(libraryId);
      service.listCollections(libraryId);
      service.listSmartCollections(libraryId);
      service.searchAssets({ libraryId, layoutOnly: true, limit: 500 });
    };
    warm();
    const caches = [open.folderCountCache, open.collectionCountCache, open.smartCollectionCountCache, open.browseIndexCache];
    expect(caches.every(Boolean)).toBe(true);
    const sequence = service.getChangeSequence(libraryId);
    expect(open.connection.prepare('UPDATE jobs SET progress = 0.5').run().changes).toBeGreaterThan(0);
    expect(service.getChangeSequence(libraryId)).toBeGreaterThan(sequence);
    // Exercise the asynchronous change subscription too; it must keep durable
    // notifications without unconditionally throwing away the browse index.
    await new Promise((resolve) => setTimeout(resolve, 550));
    service.listManagedFolders(libraryId);
    service.listCollections(libraryId);
    service.listSmartCollections(libraryId);
    service.searchAssets({ libraryId, limit: 1 });
    expect([open.folderCountCache, open.collectionCountCache, open.smartCollectionCountCache, open.browseIndexCache]).toEqual(caches);
    for (const [index, cache] of [open.folderCountCache, open.collectionCountCache, open.smartCollectionCountCache, open.browseIndexCache].entries()) expect(cache).toBe(caches[index]);

    service.setAssetMetadata({ libraryId, assetId: asset.assetId, expectedVersion: 1, favorite: true });
    expect(service.listSmartCollections(libraryId)[0]?.assetCount).toBe(1);
    expect(open.smartCollectionCountCache).not.toBe(caches[2]);
    const localCache = open.smartCollectionCountCache;
    // Direct SQL from a second connection simulates a different NAS client,
    // not an application callback that might hide an invalidation gap.
    external = new Database(path.join(library.libraryPath, '.super', 'library.db'));
    external.exec('UPDATE asset_metadata SET favorite = 0');
    expect(service.listSmartCollections(libraryId)[0]?.assetCount).toBe(0);
    expect(open.smartCollectionCountCache).not.toBe(localCache);
    const analyzed = service.createSmartCollection({
      libraryId, name: 'Analyzed', queryDefinitionJson: JSON.stringify({ filters: [{ field: 'analysis_status', values: ['analyzed'], exclude: false }] }),
    });
    expect(service.listSmartCollections(libraryId).find((collection) => collection.collectionId === analyzed.collectionId)?.assetCount).toBe(0);
    // Empty accepted AI results can change analysis status without changing
    // tags/artifacts/search text. Track the state table itself, not inference.
    open.connection.prepare(
      'INSERT INTO asset_ai_analysis_state (asset_id, analyzed_at, model_id, model_version) VALUES (?, ?, ?, ?)',
    ).run(asset.assetId, new Date().toISOString(), 'test-model', '1');
    expect(service.listSmartCollections(libraryId).find((collection) => collection.collectionId === analyzed.collectionId)?.assetCount).toBe(1);
    open.connection.prepare('DELETE FROM asset_ai_analysis_state WHERE asset_id = ?').run(asset.assetId);
    expect(service.listSmartCollections(libraryId).find((collection) => collection.collectionId === analyzed.collectionId)?.assetCount).toBe(0);
  } finally {
    external?.close(); service.closeAll(); rmSync(root, { force: true, recursive: true });
  }
});
