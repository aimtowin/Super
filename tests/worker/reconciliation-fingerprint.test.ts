import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LibraryService } from '../../src/worker/library-service';

const fixtures: Array<{ root: string; service: LibraryService }> = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const { root, service } of fixtures.splice(0)) {
    service.closeAll();
    rmSync(root, { recursive: true, force: true });
  }
});

async function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'super-async-fingerprint-'));
  const service = new LibraryService({ observerFactory: () => ({ close() {} }) });
  fixtures.push({ root, service });
  const library = service.createLibrary({ displayName: 'Fingerprint', selectedParentPath: root });
  const source = path.join(root, 'source.txt');
  writeFileSync(source, 'original bytes');
  const result = await service.prepareOrExecuteImportAsync({
    libraryId: library.libraryId, sourceKind: 'files', sourcePaths: [source],
  });
  expect('importedCount' in result && result.importedCount).toBe(1);
  const asset = service.listAssets({ libraryId: library.libraryId, recursive: true })[0]!;
  const file = path.join(library.libraryPath, 'Assets', asset.relativeFilePath);
  return { root, service, library, file, asset };
}

describe('background reconciliation fingerprints', () => {
  it('hashes changed bytes asynchronously and keeps revision fingerprints equivalent', async () => {
    const { service, library, file, asset } = await fixture();
    const syncHash = vi.spyOn(service as unknown as { computeContentFingerprint(path: string): string }, 'computeContentFingerprint');
    writeFileSync(file, 'new complete bytes and size');
    await service.runOpenBackgroundReconciliation(library.libraryId);
    const updated = service.listAssets({ libraryId: library.libraryId, recursive: true })[0]!;
    expect(updated.currentRevisionId).not.toBe(asset.currentRevisionId);
    expect(updated.byteSize).toBe(Buffer.byteLength('new complete bytes and size'));
    const open = (service as unknown as { openById: Map<string, { connection: { prepare(sql: string): { get(...params: string[]): unknown } } }> }).openById.get(library.libraryId)!;
    expect(open.connection.prepare('SELECT content_fingerprint FROM revisions WHERE revision_id = ?').get(updated.currentRevisionId))
      .toEqual({ content_fingerprint: createHash('sha1').update('new complete bytes and size').digest('hex') });
    expect(syncHash).not.toHaveBeenCalled();
  });

  it('preserves revision and metadata after a timestamp-only portable copy', async () => {
    const { service, library, file, asset } = await fixture();
    service.setAssetMetadata({ libraryId: library.libraryId, assetId: asset.assetId, expectedVersion: service.getAssetMetadata({ libraryId: library.libraryId, assetId: asset.assetId }).entityVersion, rating: 4, favorite: true });
    const syncHash = vi.spyOn(service as unknown as { computeContentFingerprint(path: string): string }, 'computeContentFingerprint');
    const future = new Date(Date.now() + 10_000);
    utimesSync(file, future, future);
    await service.runOpenBackgroundReconciliation(library.libraryId);
    const updated = service.listAssets({ libraryId: library.libraryId, recursive: true })[0]!;
    expect(updated).toMatchObject({ currentRevisionId: asset.currentRevisionId, rating: 4, favorite: true, availability: 'available' });
    expect(updated.modifiedAt).toBe(asset.modifiedAt);
    expect(syncHash).not.toHaveBeenCalled();
  });

  it('rejects a prepared hash when the source changes again before the transaction', async () => {
    const { service, library, file, asset } = await fixture();
    writeFileSync(file, 'first edit to be hashed');
    const internal = service as unknown as { prepareReconciliationFingerprints(...args: unknown[]): Promise<void> };
    const original = internal.prepareReconciliationFingerprints.bind(service);
    const prepare = vi.spyOn(internal, 'prepareReconciliationFingerprints').mockImplementation(async (...args) => {
      await original(...args);
      writeFileSync(file, 'second edit which must not receive the previous hash');
    });
    await service.runOpenBackgroundReconciliation(library.libraryId);
    expect(service.listAssets({ libraryId: library.libraryId, recursive: true })[0]?.currentRevisionId).toBe(asset.currentRevisionId);
    prepare.mockRestore();
    await service.runOpenBackgroundReconciliation(library.libraryId);
    const updated = service.listAssets({ libraryId: library.libraryId, recursive: true })[0]!;
    expect(updated.currentRevisionId).not.toBe(asset.currentRevisionId);
    expect(updated.byteSize).toBe(Buffer.byteLength('second edit which must not receive the previous hash'));
  });

  it('keeps old-library NULL-fingerprint timestamp backfill equivalent', async () => {
    const { service, library, file, asset } = await fixture();
    const open = (service as unknown as { openById: Map<string, { connection: { prepare(sql: string): { run(...params: string[]): unknown; get(...params: string[]): unknown } } }> }).openById.get(library.libraryId)!;
    open.connection.prepare('UPDATE revisions SET content_fingerprint = NULL WHERE revision_id = ?').run(asset.currentRevisionId);
    const future = new Date(Date.now() + 20_000);
    utimesSync(file, future, future);
    await service.runOpenBackgroundReconciliation(library.libraryId);
    expect(service.listAssets({ libraryId: library.libraryId, recursive: true })[0]?.currentRevisionId).toBe(asset.currentRevisionId);
    expect(open.connection.prepare('SELECT content_fingerprint FROM revisions WHERE revision_id = ?').get(asset.currentRevisionId))
      .toEqual({ content_fingerprint: createHash('sha1').update('original bytes').digest('hex') });
    const syncHash = vi.spyOn(service as unknown as { computeContentFingerprint(path: string): string }, 'computeContentFingerprint');
    await service.runOpenBackgroundReconciliation(library.libraryId);
    expect(syncHash).not.toHaveBeenCalled();
  });

  it('hashes empty replacements with the same SHA-1 contract', async () => {
    const { service, library, file, asset } = await fixture();
    writeFileSync(file, '');
    await service.runOpenBackgroundReconciliation(library.libraryId);
    const updated = service.listAssets({ libraryId: library.libraryId, recursive: true })[0]!;
    expect(updated.byteSize).toBe(0);
    expect(updated.currentRevisionId).not.toBe(asset.currentRevisionId);
  });

  it('repairs dangling revisions using the asynchronous source hash', async () => {
    const { service, library, asset } = await fixture();
    const open = (service as unknown as { openById: Map<string, { connection: { prepare(sql: string): { run(...params: string[]): unknown } } }> }).openById.get(library.libraryId)!;
    open.connection.prepare('UPDATE assets SET current_revision_id = ? WHERE asset_id = ?').run('missing-revision', asset.assetId);
    const syncHash = vi.spyOn(service as unknown as { computeContentFingerprint(path: string): string }, 'computeContentFingerprint');
    await service.runOpenBackgroundReconciliation(library.libraryId);
    const repaired = service.listAssets({ libraryId: library.libraryId, recursive: true })[0]!;
    expect(repaired.assetId).toBe(asset.assetId);
    expect(repaired.currentRevisionId).not.toBe('missing-revision');
    expect(repaired.byteSize).toBe(Buffer.byteLength('original bytes'));
    expect(syncHash).not.toHaveBeenCalled();
  });

  it('uses the same async path for changed linked sources', async () => {
    const { service, library, root } = await fixture();
    const sourceRoot = path.join(root, 'linked-source');
    mkdirSync(sourceRoot);
    const file = path.join(sourceRoot, 'linked.txt');
    writeFileSync(file, 'initial linked bytes');
    service.importFolderAsLinked({ libraryId: library.libraryId, sourceRootPath: sourceRoot });
    const old = service.listAssets({ libraryId: library.libraryId, recursive: true }).find((item) => item.locationKind === 'linked')!;
    const syncHash = vi.spyOn(service as unknown as { computeContentFingerprint(path: string): string }, 'computeContentFingerprint');
    writeFileSync(file, 'updated linked bytes of another size');
    await service.runOpenBackgroundReconciliation(library.libraryId);
    const updated = service.listAssets({ libraryId: library.libraryId, recursive: true }).find((item) => item.assetId === old.assetId)!;
    expect(updated.currentRevisionId).not.toBe(old.currentRevisionId);
    expect(updated.byteSize).toBe(Buffer.byteLength('updated linked bytes of another size'));
    expect(syncHash).not.toHaveBeenCalled();
  });

  it('defers a source appended during streaming without starving other changed assets', async () => {
    const { service, library, file, asset } = await fixture();
    writeFileSync(file, Buffer.alloc(8 << 20, 42));
    const otherFile = path.join(library.libraryPath, 'Assets', 'other.txt');
    writeFileSync(otherFile, 'another discoverable source');
    const internal = service as unknown as { yieldReconciliation(...args: unknown[]): Promise<void> };
    const original = internal.yieldReconciliation.bind(service);
    const preparation = service as unknown as { prepareReconciliationFingerprints(...args: unknown[]): Promise<void> };
    const originalPrepare = preparation.prepareReconciliationFingerprints.bind(service);
    let hashing = false;
    vi.spyOn(preparation, 'prepareReconciliationFingerprints').mockImplementation(async (...args) => {
      hashing = true;
      try { await originalPrepare(...args); } finally { hashing = false; }
    });
    let modified = false;
    vi.spyOn(internal, 'yieldReconciliation').mockImplementation(async (...args) => {
      if (hashing && !modified) {
        modified = true;
        appendFileSync(file, 'concurrent append');
      }
      await original(...args);
    });
    await service.runOpenBackgroundReconciliation(library.libraryId);
    expect(modified).toBe(true);
    const assets = service.listAssets({ libraryId: library.libraryId, recursive: true });
    expect(assets.find((item) => item.assetId === asset.assetId)?.currentRevisionId).toBe(asset.currentRevisionId);
    expect(assets.some((item) => item.relativeFilePath === 'other.txt')).toBe(true);
    vi.restoreAllMocks();
    await service.runOpenBackgroundReconciliation(library.libraryId);
    expect(service.listAssets({ libraryId: library.libraryId, recursive: true }).find((item) => item.assetId === asset.assetId)?.currentRevisionId)
      .not.toBe(asset.currentRevisionId);
  });

  it('cancels during a large hash before closing the database', async () => {
    const { service, library, file } = await fixture();
    writeFileSync(file, Buffer.alloc(32 << 20, 63));
    const internal = service as unknown as { prepareReconciliationFingerprints(...args: unknown[]): Promise<void> };
    const original = internal.prepareReconciliationFingerprints.bind(service);
    let announce!: () => void;
    const entered = new Promise<void>((resolve) => { announce = resolve; });
    vi.spyOn(internal, 'prepareReconciliationFingerprints').mockImplementation(async (...args) => {
      announce();
      await original(...args);
    });
    const reconciliation = service.runOpenBackgroundReconciliation(library.libraryId);
    await entered;
    await service.closeLibraryAsync(library.libraryId);
    await reconciliation;
    expect(() => service.openLibrary(library.libraryPath)).not.toThrow();
  });

  it('measures large-file responsiveness against the old synchronous hash', async () => {
    const { service, library, file } = await fixture();
    const bytes = 64 << 20;
    writeFileSync(file, Buffer.alloc(bytes, 91));
    const internal = service as unknown as { computeContentFingerprint(path: string): string };
    const started = performance.now();
    const expectedHash = internal.computeContentFingerprint(file);
    const oldSyncHashMs = performance.now() - started;
    const syncHash = vi.spyOn(internal, 'computeContentFingerprint');
    let previous = performance.now();
    const samples: number[] = [];
    const timer = setInterval(() => {
      const now = performance.now();
      samples.push(Math.max(0, now - previous - 5));
      previous = now;
    }, 5);
    const asyncStarted = performance.now();
    try {
      await service.runOpenBackgroundReconciliation(library.libraryId);
    } finally {
      clearInterval(timer);
    }
    const updated = service.listAssets({ libraryId: library.libraryId, recursive: true })[0]!;
    const open = (service as unknown as { openById: Map<string, { connection: { prepare(sql: string): { get(...params: string[]): unknown } } }> }).openById.get(library.libraryId)!;
    expect(open.connection.prepare('SELECT content_fingerprint FROM revisions WHERE revision_id = ?').get(updated.currentRevisionId))
      .toEqual({ content_fingerprint: expectedHash });
    expect(syncHash).not.toHaveBeenCalled();
    expect(samples.length).toBeGreaterThan(2);
    const p95Ms = samples.toSorted((a, b) => a - b)[Math.max(0, Math.ceil(samples.length * 0.95) - 1)] ?? 0;
    console.info(`FINGERPRINT_PERF_JSON ${JSON.stringify({ bytes, oldSyncHashMs: Number(oldSyncHashMs.toFixed(1)), asyncReconciliationMs: Number((performance.now() - asyncStarted).toFixed(1)), eventLoopLagP95Ms: Number(p95Ms.toFixed(1)), eventLoopLagMaxMs: Number(Math.max(...samples, 0).toFixed(1)) })}`);
    expect(p95Ms).toBeLessThan(75);
  }, 120_000);
});
