import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { afterEach, describe, expect, it } from "vitest";

import { LibraryService } from "../../src/worker/library-service";
import { BROWSE_LAYOUT_CHUNK_SIZE } from "../../src/shared/browse-scope";

interface TestDatabase {
  close(): void;
  exec(sql: string): void;
  prepare(sql: string): {
    run(...parameters: unknown[]): { changes: number };
  };
}

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3") as new (filename: string) => TestDatabase;

const temporaryRoots: string[] = [];
const services: LibraryService[] = [];
const ASSET_COUNT = 20_000;
const CHILD_COLLECTION_COUNT = 10;

function newService(onDbStatement?: (sql: string) => void): LibraryService {
  const service = new LibraryService({
    observerFactory: () => ({ close() {} }),
    onDbStatement,
  });
  services.push(service);
  return service;
}

function benchmark(operation: () => unknown): number {
  operation();
  const samples = Array.from({ length: 5 }, () => {
    const startedAt = performance.now();
    operation();
    return performance.now() - startedAt;
  });
  samples.sort((left, right) => left - right);
  return samples[Math.floor(samples.length / 2)]!;
}

function captureCollectionScopeQueries<T>(
  statements: string[],
  label: string,
  operation: () => T,
): T {
  statements.length = 0;
  const result = operation();
  const scopeQueries = statements.filter((sql) => sql.includes("collection_scope AS"));
  expect(scopeQueries, `${label} should use the collection scope for COUNT and data`).toHaveLength(2);
  expect(
    scopeQueries.every((sql) =>
      sql.includes("JOIN collection_scope ON collection_scope.asset_id = a.asset_id"),
    ),
  ).toBe(true);
  expect(scopeQueries.some((sql) => sql.includes("SELECT COUNT(*) AS total"))).toBe(true);
  expect(scopeQueries.some((sql) => sql.includes("ORDER BY collection_scope.collection_position"))).toBe(true);
  return result;
}

function createLargeCollectionFixture(onDbStatement?: (sql: string) => void): {
  root: string;
  libraryId: string;
  folderId: string;
  rootCollectionId: string;
  directCollectionId: string;
  statements: string[];
} {
  const root = mkdtempSync(path.join(tmpdir(), "super-collection-switch-"));
  temporaryRoots.push(root);
  const statements: string[] = [];
  const service = newService((sql) => {
    statements.push(sql);
    onDbStatement?.(sql);
  });
  const library = service.createLibrary({
    displayName: "Collection switch performance",
    selectedParentPath: root,
  });
  const managedFolder = service.createManagedFolder({
    libraryId: library.libraryId,
    name: "Large folder",
  });
  service.closeAll();

  const database = new Database(path.join(library.libraryPath, ".super", "library.db"));
  const now = "2026-08-20T00:00:00.000Z";
  const rootCollectionId = "collection-root";
  const directCollectionId = "collection-direct";
  const childCollectionIds = Array.from(
    { length: CHILD_COLLECTION_COUNT },
    (_, index) => `collection-child-${index}`,
  );
  try {
    database.exec("PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE;");
    const insertCollection = database.prepare(
      `INSERT INTO collections
         (collection_id, library_id, parent_id, name, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    insertCollection.run(rootCollectionId, library.libraryId, null, "Root", 0, now, now);
    insertCollection.run(directCollectionId, library.libraryId, null, "Direct", 1, now, now);
    for (const [index, collectionId] of childCollectionIds.entries()) {
      insertCollection.run(
        collectionId,
        library.libraryId,
        rootCollectionId,
        `Child ${index}`,
        index,
        now,
        now,
      );
    }

    const insertAsset = database.prepare(
      `INSERT INTO assets
         (asset_id, location_kind, managed_folder_id, linked_folder_id,
          relative_file_path, current_revision_id, availability, path_identity,
          created_at, updated_at)
       VALUES (?, 'managed', ?, NULL, ?, ?, 'available', ?, ?, ?)`,
    );
    const insertRevision = database.prepare(
      `INSERT INTO revisions
         (revision_id, asset_id, parent_revision_id, byte_size, modified_at,
          original_filename, origin, accepted_at)
       VALUES (?, ?, NULL, 1, ?, ?, 'import', ?)`,
    );
    const insertMembership = database.prepare(
      "INSERT INTO collection_assets (collection_id, asset_id, position) VALUES (?, ?, ?)",
    );
    for (let index = 0; index < ASSET_COUNT; index += 1) {
      const assetId = `asset-${index}`;
      const revisionId = `revision-${index}`;
      const relativePath = `asset-${index}.png`;
      insertAsset.run(
        assetId,
        managedFolder.folderId,
        relativePath,
        revisionId,
        relativePath,
        now,
        now,
      );
      insertRevision.run(revisionId, assetId, now, relativePath, now);

      const childCollectionId = childCollectionIds[index % childCollectionIds.length]!;
      insertMembership.run(childCollectionId, assetId, index);
      // Exercise the recursive-scope union path: some assets are assigned to
      // both the parent and a child and must still appear only once.
      if (index % 5 === 0) insertMembership.run(rootCollectionId, assetId, index);
      if (index < 100) insertMembership.run(directCollectionId, assetId, index);
    }
    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  } finally {
    database.close();
  }

  service.openLibrary(library.libraryPath);
  statements.length = 0;
  return {
    root,
    libraryId: library.libraryId,
    folderId: managedFolder.folderId,
    rootCollectionId,
    directCollectionId,
    statements,
  };
}

afterEach(() => {
  for (const service of services.splice(0)) service.closeAll();
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe("collection switch performance", () => {
  it('profiles sidebar reuse during job progress on 20k assets', () => {
    const fixture = createLargeCollectionFixture();
    const service = services.at(-1)!;
    const libraryId = fixture.libraryId;
    service.createSmartCollection({ libraryId, name: 'PNG', queryDefinitionJson: JSON.stringify({ filters: [{ field: 'format', values: ['png'], exclude: false }] }) });
    const open = (service as unknown as { openById: Map<string, {
      connection: TestDatabase;
      folderCountCache?: unknown; collectionCountCache?: unknown; smartCollectionCountCache?: unknown;
    }> }).openById.get(libraryId)!;
    const now = new Date().toISOString();
    open.connection.prepare(`INSERT INTO jobs
      (job_id, library_id, asset_id, revision_id, kind, status, priority, progress, attempt_count, created_at, updated_at)
      VALUES ('cache-perf-job', ?, 'asset-0', 'revision-0', 'generate_thumbnail', 'queued', 0, 0, 0, ?, ?)`)
      .run(libraryId, now, now);
    const hydrate = () => {
      service.listManagedFolders(libraryId);
      service.listCollections(libraryId);
      return service.listSmartCollections(libraryId);
    };
    expect(hydrate()[0]?.assetCount).toBe(ASSET_COUNT);
    const caches = [open.folderCountCache, open.collectionCountCache, open.smartCollectionCountCache];
    fixture.statements.length = 0;
    open.connection.prepare("UPDATE jobs SET progress = 0.5 WHERE job_id = 'cache-perf-job'").run();
    expect(hydrate()[0]?.assetCount).toBe(ASSET_COUNT);
    expect(fixture.statements.some((sql) => sql.includes('SELECT COUNT(*) AS total') || sql.includes('WITH RECURSIVE collection_tree'))).toBe(false);
    for (const [index, cache] of [open.folderCountCache, open.collectionCountCache, open.smartCollectionCountCache].entries()) expect(cache).toBe(caches[index]);
    const reuseMs = benchmark(hydrate);
    // Compare the same queries with the previous invalidation policy, not
    // unrelated startup/import work or a different fixture.
    const invalidatedMs = benchmark(() => {
      open.folderCountCache = undefined;
      open.collectionCountCache = undefined;
      open.smartCollectionCountCache = undefined;
      return hydrate();
    });
    console.info('[sidebar-cache-performance]', JSON.stringify({ assets: ASSET_COUNT, reuseMedianMs: Number(reuseMs.toFixed(2)), invalidatedMedianMs: Number(invalidatedMs.toFixed(2)) }));
  });

  it("profiles one-asset import completion against the previous full-library result pipeline", () => {
    let resultQueryStartedAt: number | undefined;
    const fixture = createLargeCollectionFixture((sql) => {
      if (resultQueryStartedAt === undefined && sql.includes('AS thumbnail_status') && sql.includes('a.asset_id IN (')) {
        resultQueryStartedAt = performance.now();
      }
    });
    const service = services.at(-1)!;
    const source = path.join(fixture.root, 'one-new-import.txt');
    writeFileSync(source, 'a unique new asset in a twenty-thousand-row library');
    const plan = service.prepareImport({ libraryId: fixture.libraryId, sourceKind: 'files', sourcePaths: [source] });
    fixture.statements.length = 0;
    const startedAt = performance.now();
    const completion = service.resolveImport({ importId: plan.importId, suspectedDuplicate: 'create-copy', nameConflict: 'keep-both' });
    const completeImportMs = performance.now() - startedAt;
    expect(resultQueryStartedAt).toBeDefined();
    // Start at the SQL trace and include summary enrichment and final logical
    // counters. Do not mistake whole-import time (filesystem/commit included)
    // for just the result hydration cost targeted by this optimization.
    const scopedResultAndFinalCountersMs = performance.now() - resultQueryStartedAt!;
    const resultQueries = fixture.statements.filter((sql) => sql.includes('AS thumbnail_status') && sql.includes('ORDER BY a.relative_file_path'));
    expect(resultQueries).toHaveLength(1);
    expect(resultQueries[0]).toContain('a.asset_id IN (');
    expect(completion.assets).toHaveLength(1);
    const ids = new Set(completion.assets.map((asset) => asset.assetId));
    const oldResultPipeline = () => service.listAssets({ libraryId: fixture.libraryId, recursive: true })
      .filter((asset) => ids.has(asset.assetId));
    const fullLibraryResultMs = benchmark(oldResultPipeline);
    expect(completion.assets).toEqual(oldResultPipeline());
    console.info('[import-completion-performance]', JSON.stringify({
      libraryAssets: ASSET_COUNT + 1,
      affectedAssets: 1,
      completeImportMs: Number(completeImportMs.toFixed(1)),
      scopedResultAndFinalCountersMs: Number(scopedResultAndFinalCountersMs.toFixed(1)),
      previousFullLibraryResultMedianMs: Number(fullLibraryResultMs.toFixed(1)),
    }));
  });

  it("profiles first-page switching and verifies complete paged layouts on 20k assets", () => {
    const fixture = createLargeCollectionFixture();
    const service = services.at(-1)!;

    const allMs = benchmark(() => service.searchAssets({
      libraryId: fixture.libraryId,
      limit: 100,
      offset: 0,
    }));
    const folderMs = benchmark(() => service.searchAssets({
      libraryId: fixture.libraryId,
      scope: { kind: "folder", folderId: fixture.folderId, recursive: false },
      limit: 100,
      offset: 0,
    }));
    const directMs = benchmark(() => service.searchAssets({
      libraryId: fixture.libraryId,
      scope: { kind: "collection", collectionId: fixture.directCollectionId, recursive: false },
      limit: 100,
      offset: 0,
    }));
    const recursiveMs = benchmark(() => service.searchAssets({
      libraryId: fixture.libraryId,
      scope: { kind: "collection", collectionId: fixture.rootCollectionId, recursive: true },
      limit: 100,
      offset: 0,
    }));
    const recursiveLayoutChunkMs = benchmark(() => service.searchAssets({
      libraryId: fixture.libraryId,
      scope: { kind: "collection", collectionId: fixture.rootCollectionId, recursive: true },
      layoutOnly: true,
    }));

    const recursivePage = captureCollectionScopeQueries(
      fixture.statements,
      "first-page browse",
      () => service.searchAssets({
        libraryId: fixture.libraryId,
        scope: { kind: "collection", collectionId: fixture.rootCollectionId, recursive: true },
        limit: 100,
        offset: 0,
      }),
    );
    const recursiveLayout = captureCollectionScopeQueries(
      fixture.statements,
      "layout browse",
      () => service.searchAssets({
        libraryId: fixture.libraryId,
        scope: { kind: "collection", collectionId: fixture.rootCollectionId, recursive: true },
        layoutOnly: true,
      }),
    );
    const recursiveIds = captureCollectionScopeQueries(
      fixture.statements,
      "ids-only browse",
      () => service.searchAssets({
        libraryId: fixture.libraryId,
        scope: { kind: "collection", collectionId: fixture.rootCollectionId, recursive: true },
        idsOnly: true,
      }),
    );
    const folderPage = service.searchAssets({
      libraryId: fixture.libraryId,
      scope: { kind: "folder", folderId: fixture.folderId, recursive: false },
      limit: 100,
      offset: 0,
    });

    console.info("[collection-switch-performance]", JSON.stringify({
      assets: ASSET_COUNT,
      allMs: Number(allMs.toFixed(1)),
      folderMs: Number(folderMs.toFixed(1)),
      directMs: Number(directMs.toFixed(1)),
      recursiveMs: Number(recursiveMs.toFixed(1)),
      recursiveLayoutChunkMs: Number(recursiveLayoutChunkMs.toFixed(1)),
    }));
    expect(folderPage.total).toBe(ASSET_COUNT);
    expect(folderPage.items).toHaveLength(100);
    expect(recursivePage.total).toBe(ASSET_COUNT);
    expect(recursivePage.items).toHaveLength(100);
    expect(recursiveLayout.total).toBe(ASSET_COUNT);
    expect(recursiveLayout.layout).toHaveLength(BROWSE_LAYOUT_CHUNK_SIZE);
    expect(recursiveIds.assetIds).toHaveLength(ASSET_COUNT);
    const layoutIds = recursiveLayout.layout!.map((entry) => entry.assetId);
    for (let offset = layoutIds.length; offset < ASSET_COUNT; offset += BROWSE_LAYOUT_CHUNK_SIZE) {
      const chunk = service.searchAssets({
        libraryId: fixture.libraryId,
        scope: { kind: "collection", collectionId: fixture.rootCollectionId, recursive: true },
        layoutOnly: true,
        offset,
        limit: BROWSE_LAYOUT_CHUNK_SIZE,
      });
      expect(chunk.total).toBe(ASSET_COUNT);
      expect(chunk.offset).toBe(offset);
      expect(chunk.layout).toHaveLength(Math.min(BROWSE_LAYOUT_CHUNK_SIZE, ASSET_COUNT - offset));
      layoutIds.push(...chunk.layout!.map((entry) => entry.assetId));
    }
    expect(new Set(layoutIds).size).toBe(ASSET_COUNT);
    expect(layoutIds).toEqual(recursiveIds.assetIds);
    expect(recursiveMs).toBeLessThan(500);
  });
});
