import {
  existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { assetSummarySchema } from '../../src/shared/asset-types';
import { colorFilterSql } from '../../src/shared/color-filter-presets';
import { detectPbrTextureChannel, pbrTextureDisplayFilter } from '../../src/renderer/pbr-texture-channel';
import { LibraryService } from '../../src/worker/library-service';
import { createLibrarySyncPort } from '../../src/worker/sync/library-port';
import { createEmptyManifest, type SyncManifestEntry } from '../../src/worker/sync/manifest';
import type { RemoteStorageDriver } from '../../src/worker/sync/remote-storage';
import { SyncEngine } from '../../src/worker/sync/sync-engine';
import { planSyncActions } from '../../src/worker/sync/sync-plan';

const require = createRequire(import.meta.url);
const ownedRoots: string[] = [];
const services: LibraryService[] = [];
const initialOiioPath = process.env['SUPER_OIIO_PATH'];

function fixture(options: ConstructorParameters<typeof LibraryService>[0] = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'super-serpent-audit-'));
  ownedRoots.push(root);
  const service = new LibraryService(options);
  services.push(service);
  const library = service.createLibrary({ displayName: 'Audit', selectedParentPath: root });
  return { root, service, library };
}

function importOne(service: LibraryService, libraryId: string, source: string) {
  const outcome = service.prepareOrExecuteImport({
    libraryId, sourceKind: 'files', sourcePaths: [source],
  });
  if ('importId' in outcome) {
    service.resolveImport({ importId: outcome.importId, suspectedDuplicate: 'create-copy', nameConflict: 'keep-both' });
  }
  return service.listAssets({ libraryId, recursive: true })[0]!;
}

afterEach(() => {
  for (const service of services.splice(0)) service.closeAll();
  if (initialOiioPath === undefined) delete process.env['SUPER_OIIO_PATH'];
  else process.env['SUPER_OIIO_PATH'] = initialOiioPath;
  for (const root of ownedRoots.splice(0)) {
    // Only roots returned by our own mkdtemp, outside the repository/library.
    if (path.dirname(root) !== path.resolve(tmpdir()) || !path.basename(root).startsWith('super-serpent-audit-')) {
      throw new Error('Refusing to clean a non-owned audit fixture');
    }
    rmSync(root, { recursive: true, force: true });
  }
});

class MemoryRemote implements RemoteStorageDriver {
  readonly files = new Map<string, Buffer>();
  async list(prefix: string) {
    return [...this.files].filter(([key]) => key.startsWith(prefix)).map(([key, body]) => ({ path: key, isDirectory: false, size: body.length }));
  }
  async read(key: string) {
    const body = this.files.get(key);
    if (!body) throw new Error(`Missing audit remote object: ${key}`);
    return { body };
  }
  async write(key: string, body: Buffer) { this.files.set(key, Buffer.from(body)); return { status: 201 }; }
  async delete(key: string) { this.files.delete(key); }
  async mkdir() {}
  async move(from: string, to: string) { const body = (await this.read(from)).body; this.files.set(to, body); this.files.delete(from); }
  async exists(key: string) { return this.files.has(key); }
  async probe() {
    return { auth: 'none' as const, supportsContentTransfer: true, supportsDepthInfinity: true, supportsEtagIfMatch: true, supportsMove: true, supportsLock: false };
  }
}

describe('Serpent post-0.1.4 audit — desired behaviour, known failures stay red', () => {
  it('U01 linked-folder trash must not move external sources', async () => {
    const calls: string[] = [];
    const { root, service, library } = fixture({ trashItem: async (source) => {
      calls.push(source);
      const recovery = path.join(root, 'fake-os-trash');
      mkdirSync(recovery, { recursive: true });
      const relative = path.relative(root, source);
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Non-owned trash target');
      renameSync(source, path.join(recovery, `${calls.length}-${path.basename(source)}`));
    } });
    const source = path.join(root, 'external');
    mkdirSync(source);
    writeFileSync(path.join(source, 'indexed.txt'), 'keep');
    writeFileSync(path.join(source, '.unindexed-private'), 'keep this too');
    const link = service.importFolderAsLinked({ libraryId: library.libraryId, sourceRootPath: source });
    const result = await service.deleteLinkedFolderSubtree({ libraryId: library.libraryId, linkedFolderId: link.folderId, relativePath: '', deleteFromDisk: false });
    expect(result.failedCount).toBe(0);
    expect({ sourceExists: existsSync(source), sourceTrashCalls: calls.length }).toEqual({ sourceExists: true, sourceTrashCalls: 0 });
  });

  it('control: explicit unlink already leaves external sources untouched', () => {
    const { root, service, library } = fixture();
    const source = path.join(root, 'external');
    mkdirSync(source);
    writeFileSync(path.join(source, 'keep.txt'), 'keep');
    const link = service.importFolderAsLinked({ libraryId: library.libraryId, sourceRootPath: source });
    service.removeLinkedFolder({ libraryId: library.libraryId, folderId: link.folderId });
    expect(existsSync(path.join(source, 'keep.txt'))).toBe(true);
  });

  it('U02 temporary missing local file must not delete a synced remote file', async () => {
    const { root, service, library } = fixture();
    const source = path.join(root, 'source.txt');
    writeFileSync(source, 'cloud backup must survive');
    const asset = importOne(service, library.libraryId, source);
    const driver = new MemoryRemote();
    const engine = new SyncEngine(createLibrarySyncPort(service), { deviceId: 'audit-device' });
    engine.buildDriver = () => driver;
    const config = { id: 'audit', baseUrl: 'https://invalid.example/', directoryName: 'audit' };
    await engine.syncOnce(library.libraryId, config);
    const remotePath = `audit/assets/${asset.relativeFilePath}`;
    expect(driver.files.has(remotePath)).toBe(true);
    const localPath = service.resolveAssetPath(library.libraryId, asset.assetId);
    const parked = path.join(root, 'temporarily-parked.txt');
    renameSync(localPath, parked);
    const second = await engine.syncOnce(library.libraryId, config);
    // Real service -> port -> planner -> runner; only transport is in-memory.
    expect({ remoteSurvives: driver.files.has(remotePath), deletions: second.report.remoteDeletes }).toEqual({ remoteSurvives: true, deletions: 0 });
  });

  it('U03 red hue filter must exclude a zero-saturation gray swatch', () => {
    const Database = require('better-sqlite3') as new (name: string) => {
      exec(sql: string): void;
      prepare(sql: string): { all(...params: number[]): unknown[] };
      close(): void;
    };
    const db = new Database(':memory:');
    try {
      db.exec("CREATE TABLE palette_color(name TEXT, hue REAL, lightness REAL, saturation REAL); INSERT INTO palette_color VALUES ('gray', 0, 0.5, 0), ('red', 0, 0.5, 1)");
      const clause = colorFilterSql('palette_color.hue', ['red'], false)!;
      expect(db.prepare(`SELECT name FROM palette_color WHERE ${clause.sql} ORDER BY name`).all(...clause.params)).toEqual([{ name: 'red' }]);
    } finally { db.close(); }
  });

  it('U04 invalid EXIF dimensions must not poison an asset-list response', async () => {
    process.env['SUPER_OIIO_PATH'] = '/audit/fake-oiiotool';
    // A valid PNG frame header carried as a RAW fixture. Decoder and EXIF
    // parser are controlled; persistence, list projection and schema are real.
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVV8AAAAASUVORK5CYII=', 'base64');
    const { root, service, library } = fixture({
      rawImageMetadataParser: { parse: async () => ({ ExifImageWidth: 1.5, ExifImageHeight: 2.5, Make: 'Audit' }) },
      spawnFn: async (_command, args) => {
        const output = args.at(-1);
        if (output?.endsWith('.png')) { mkdirSync(path.dirname(output), { recursive: true }); writeFileSync(output, png); }
        return { stdout: Buffer.alloc(0), stderr: '', exitCode: 0 };
      },
    });
    const source = path.join(root, 'bad-exif.ARW');
    writeFileSync(source, png);
    const asset = importOne(service, library.libraryId, source);
    await service.generateThumbnail({ libraryId: library.libraryId, assetId: asset.assetId });
    const listed = service.listAssets({ libraryId: library.libraryId, recursive: true });
    expect({ dimensions: [listed[0]!.width, listed[0]!.height], protocolValid: assetSummarySchema.array().safeParse(listed).success }).toEqual({ dimensions: [1, 1], protocolValid: true });
  });

  it('U05 unchanged-hash local rename must produce a remote path action', () => {
    const manifest = createEmptyManifest({ libraryId: 'audit', displayName: 'Audit', directoryName: 'audit' });
    const entry: SyncManifestEntry = { path: 'old.txt', contentHash: 'same', size: 4, version: 1, deviceId: 'audit', modifiedAt: '2026-10-09T00:00:00Z', metadataVersion: 1 };
    manifest.entries['s1'] = entry;
    const actions = planSyncActions({ localAssets: new Map([['s1', { ...entry, path: 'new.txt' }]]), localManifest: manifest, remoteManifest: structuredClone(manifest), remoteTombstones: new Set() });
    expect(actions.length).toBeGreaterThan(0);
  });

  it('U06 GBK Chinese text must render without replacement characters', () => {
    const { root, service, library } = fixture();
    const source = path.join(root, 'gbk.txt');
    writeFileSync(source, Buffer.from([0xd6, 0xd0, 0xce, 0xc4])); // 中文 in GBK
    const asset = importOne(service, library.libraryId, source);
    expect(service.readTextAsset({ libraryId: library.libraryId, assetId: asset.assetId }).content).toBe('中文');
  });

  it('U07 a filename alone must not desaturate an ordinary image preview', () => {
    const inferred = detectPbrTextureChannel('photo_roughness.png');
    expect(inferred ? pbrTextureDisplayFilter(inferred) : 'none').toBe('none');
  });

  it('U08 filesystem reconciliation must not silently merge numbered images', () => {
    const { root, service, library } = fixture();
    const anchorSource = path.join(root, 'anchor.txt');
    writeFileSync(anchorSource, 'anchor');
    const anchor = importOne(service, library.libraryId, anchorSource);
    const managedRoot = path.dirname(service.resolveAssetPath(library.libraryId, anchor.assetId));
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVV8AAAAASUVORK5CYII=', 'base64');
    for (const index of [1, 2, 3]) writeFileSync(path.join(managedRoot, `frame${String(index).padStart(4, '0')}.png`), png);
    service.refreshManagedAssets(library.libraryId);
    const discovered = service.listAssets({ libraryId: library.libraryId, recursive: true });
    expect(discovered.filter((asset) => asset.relativeFilePath.startsWith('frame')).map((asset) => asset.sequence?.frameCount ?? null)).toEqual([null, null, null]);
  });

  it('control: UTF-8 Chinese text remains readable', () => {
    const { root, service, library } = fixture();
    const source = path.join(root, 'utf8.txt');
    writeFileSync(source, '中文', 'utf8');
    const asset = importOne(service, library.libraryId, source);
    expect(service.readTextAsset({ libraryId: library.libraryId, assetId: asset.assetId }).content).toBe('中文');
  });
});
