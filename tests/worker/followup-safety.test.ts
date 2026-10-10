import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { LibraryService } from '../../src/worker/library-service';
import { colorFilterSql } from '../../src/shared/color-filter-presets';
import { createLibrarySyncPort } from '../../src/worker/sync/library-port';
import { parseManifest } from '../../src/worker/sync/manifest';
import { DriverUnsupportedError, RemoteStorageError, type RemoteStorageDriver, type RemoteWriteOptions } from '../../src/worker/sync/remote-storage';
import { SyncEngine } from '../../src/worker/sync/sync-engine';

const Sqlite = Database as new (filename: string) => {
  exec(sql: string): void;
  prepare(sql: string): { all(...params: number[]): unknown[] };
  close(): void;
};

const roots: string[] = [];
const services: LibraryService[] = [];
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'super-followup-safety-'));
  roots.push(root);
  const service = new LibraryService(); services.push(service);
  const library = service.createLibrary({ displayName: 'Safety', selectedParentPath: root });
  return { root, service, library, libraryId: library.libraryId };
}
function importFile(f: ReturnType<typeof fixture>, name = 'source.txt', bytes: string | Buffer = 'keep me') {
  const source = path.join(f.root, name); writeFileSync(source, bytes);
  const result = f.service.prepareOrExecuteImport({ libraryId: f.libraryId, sourceKind: 'files', sourcePaths: [source], expandImageSequences: true });
  if ('importId' in result) f.service.resolveImport({ importId: result.importId, suspectedDuplicate: 'create-copy', nameConflict: 'keep-both' });
  return f.service.listAssets({ libraryId: f.libraryId, recursive: true }).find((asset) => asset.relativeFilePath === name)!;
}
afterEach(() => {
  for (const service of services.splice(0)) service.closeAll();
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== path.resolve(tmpdir()) || !path.basename(root).startsWith('super-followup-safety-')) throw new Error('Not an owned fixture');
    rmSync(root, { recursive: true, force: true });
  }
});

class MemoryRemote implements RemoteStorageDriver {
  readonly files = new Map<string, Buffer>();
  readonly deleted: string[] = [];
  moveSupported = true;
  readFailure: Error | null = null;
  etag(bytes: Buffer) { return createHash('sha256').update(bytes).digest('hex'); }
  async list(prefix: string) { return [...this.files].filter(([key]) => key.startsWith(prefix)).map(([key, bytes]) => ({ path: key, isDirectory: false, size: bytes.length })); }
  async read(key: string) {
    if (this.readFailure) throw this.readFailure;
    const body = this.files.get(key); if (!body) throw new RemoteStorageError('NOT_FOUND', 'missing');
    return { body, etag: this.etag(body) };
  }
  async write(key: string, body: Buffer, options: RemoteWriteOptions = {}) {
    const current = this.files.get(key);
    if (options.overwrite === false && current) throw new RemoteStorageError('PRECONDITION_FAILED', 'occupied');
    if (options.ifMatch && current && this.etag(current) !== options.ifMatch) throw new RemoteStorageError('PRECONDITION_FAILED', 'changed');
    this.files.set(key, Buffer.from(body)); return { status: 201, etag: this.etag(body) };
  }
  async delete(key: string) { this.deleted.push(key); this.files.delete(key); }
  async mkdir() {}
  async move(from: string, to: string, options: { ifMatch?: string } = {}) {
    if (!this.moveSupported) throw new DriverUnsupportedError('MOVE unavailable');
    const read = await this.read(from);
    if (options.ifMatch && options.ifMatch !== read.etag) throw new RemoteStorageError('PRECONDITION_FAILED', 'changed');
    if (this.files.has(to)) throw new RemoteStorageError('CONFLICT', 'occupied');
    this.files.set(to, read.body); this.files.delete(from);
  }
  async exists(key: string) { return this.files.has(key); }
  async probe() { return { auth: 'none' as const, supportsContentTransfer: true, supportsDepthInfinity: true,
    supportsEtagIfMatch: true, supportsMove: this.moveSupported, supportsLock: false }; }
  manifest() { return parseManifest(this.files.get('audit/manifest.json')!.toString('utf8')); }
}
const config = { id: 'fixture', baseUrl: 'https://invalid.example/', directoryName: 'audit' };
function engineFor(f: ReturnType<typeof fixture>, remote = new MemoryRemote()) {
  const engine = new SyncEngine(createLibrarySyncPort(f.service), { deviceId: 'fixture' });
  engine.buildDriver = () => remote;
  return { engine, remote, sync: () => engine.syncOnce(f.libraryId, config) };
}

describe('explicit deletion vs index loss', () => {
  it('seeds deletion intent for an already-trashed synced asset during the v49 to v50 upgrade', () => {
    const f = fixture(); const asset = importFile(f);
    const syncId = f.service.syncSnapshot(f.libraryId).assets[0]!.syncId;
    f.service.trashAssets({ libraryId: f.libraryId, assetIds: [asset.assetId] }); f.service.closeAll();
    const db = new Sqlite(path.join(f.library.libraryPath, '.super', 'library.db'));
    try {
      db.exec(`DROP TABLE revision_generation_info;
        DELETE FROM schema_migrations WHERE version = 51;
        DROP TRIGGER sync_asset_trashed; DROP TRIGGER sync_asset_restored;
        DROP TABLE sync_deleted_assets; DROP TABLE sync_restored_assets;
        DELETE FROM schema_migrations WHERE version = 50; PRAGMA user_version = 49;`);
    } finally { db.close(); }
    f.service.openLibrary(f.library.libraryPath);
    expect(f.service.syncSnapshot(f.libraryId).deletedSyncIds).toContain(syncId);
    expect(f.service.listTrash(f.libraryId)[0]!.assetId).toBe(asset.assetId);
  });

  it('protects the remote even after reconciliation purges a missing index row', async () => {
    const f = fixture(); const asset = importFile(f); const s = engineFor(f);
    await s.sync(); const syncId = f.service.syncSnapshot(f.libraryId).assets[0]!.syncId;
    renameSync(f.service.resolveAssetPath(f.libraryId, asset.assetId), path.join(f.root, 'parked.txt'));
    f.service.refreshManagedAssets(f.libraryId);
    expect(f.service.listAssets({ libraryId: f.libraryId, recursive: true })).toHaveLength(0);
    await s.sync();
    expect(s.remote.files.has('audit/assets/source.txt')).toBe(true);
    expect(s.remote.files.has(`audit/trash/${syncId}.json`)).toBe(false);
    expect(s.remote.manifest().entries[syncId]).toBeDefined();
  });
  it.each(['trash', 'disk', 'disk-async', 'trash-purge'] as const)('propagates explicit %s, persists after reopen, never on mere absence', async (operation) => {
    const f = fixture(); const asset = importFile(f); const s = engineFor(f); await s.sync();
    const syncId = f.service.syncSnapshot(f.libraryId).assets[0]!.syncId;
    if (operation === 'disk') f.service.deleteAssetsFromDisk({ libraryId: f.libraryId, assetIds: [asset.assetId] });
    else if (operation === 'disk-async') await f.service.deleteAssetsFromDiskAsync({ libraryId: f.libraryId, assetIds: [asset.assetId] });
    else {
      f.service.trashAssets({ libraryId: f.libraryId, assetIds: [asset.assetId] });
      if (operation === 'trash-purge') f.service.deleteAssetsPermanent({ libraryId: f.libraryId, assetIds: [asset.assetId] });
    }
    f.service.closeAll(); f.service.openLibrary(f.library.libraryPath);
    expect(f.service.syncSnapshot(f.libraryId).deletedSyncIds).toContain(syncId);
    const result = await s.sync();
    expect(result.report.remoteDeletes).toBe(1);
    expect(s.remote.files.has(`audit/trash/${syncId}.json`)).toBe(true);
    expect(s.remote.files.has('audit/assets/source.txt')).toBe(false);
  });
  it('restoring after synced deletion clears the tombstone without losing identity', async () => {
    const f = fixture(); const asset = importFile(f); const s = engineFor(f); await s.sync();
    const syncId = f.service.syncSnapshot(f.libraryId).assets[0]!.syncId;
    f.service.trashAssets({ libraryId: f.libraryId, assetIds: [asset.assetId] }); await s.sync();
    f.service.restoreAssets({ libraryId: f.libraryId, assetIds: [asset.assetId] });
    expect(f.service.syncSnapshot(f.libraryId).deletedSyncIds).not.toContain(syncId);
    await s.sync();
    expect(s.remote.files.has('audit/assets/source.txt')).toBe(true);
    expect(s.remote.files.has(`audit/trash/${syncId}.json`)).toBe(false);
    expect(f.service.syncSnapshot(f.libraryId).assets[0]!.syncId).toBe(syncId);
  });
  it('an offline linked root never deletes remote bytes or a newer remote manifest entry', async () => {
    const f = fixture(); const source = path.join(f.root, 'external'); mkdirSync(source);
    writeFileSync(path.join(source, 'source.txt'), 'keep external');
    f.service.importFolderAsLinked({ libraryId: f.libraryId, sourceRootPath: source });
    const s = engineFor(f); await s.sync();
    const syncId = f.service.syncSnapshot(f.libraryId).assets[0]!.syncId;
    renameSync(source, path.join(f.root, 'external-offline')); f.service.refreshManagedAssets(f.libraryId);
    const manifest = s.remote.manifest(); manifest.entries[syncId]!.version = 9;
    s.remote.files.set('audit/manifest.json', Buffer.from(JSON.stringify(manifest)));
    await s.sync();
    expect(s.remote.manifest().entries[syncId]!.version).toBe(9);
    expect(s.remote.files.has('audit/assets/source.txt')).toBe(true);
  });
  it.each(['AUTH_FAILED', 'PERMISSION_DENIED', 'NETWORK_ERROR'])('does not initialize over an unreadable remote: %s', async (code) => {
    const f = fixture(); importFile(f); const s = engineFor(f); await s.sync();
    const before = s.remote.files.get('audit/manifest.json');
    s.remote.readFailure = new RemoteStorageError(code, code);
    await expect(s.sync()).rejects.toThrow(code);
    expect(s.remote.files.get('audit/manifest.json')).toEqual(before);
    expect(s.remote.deleted).toEqual([]);
  });
});

describe('linked subtree safety', () => {
  it('unlinks a child without moving indexed or unindexed bytes, stays excluded on refresh', async () => {
    const f = fixture(); const source = path.join(f.root, 'external'); mkdirSync(path.join(source, 'child'), { recursive: true });
    writeFileSync(path.join(source, 'child', 'keep.txt'), 'keep');
    writeFileSync(path.join(source, 'child', 'desktop.ini'), 'unindexed');
    const link = f.service.importFolderAsLinked({ libraryId: f.libraryId, sourceRootPath: source });
    await f.service.deleteLinkedFolderSubtree({ libraryId: f.libraryId, linkedFolderId: link.folderId, relativePath: 'child', deleteFromDisk: false });
    f.service.refreshManagedAssets(f.libraryId);
    expect(f.service.listAssets({ libraryId: f.libraryId, recursive: true })).toHaveLength(0);
    expect(readFileSync(path.join(source, 'child', 'keep.txt'), 'utf8')).toBe('keep');
    expect(readFileSync(path.join(source, 'child', 'desktop.ini'), 'utf8')).toBe('unindexed');
    expect(f.service.listFolderBrowseEntries({ libraryId: f.libraryId, parentFolderId: link.folderId })).toHaveLength(0);
    f.service.setIgnore({ libraryId: f.libraryId, locationKind: 'linked', linkedFolderId: link.folderId, relativePath: 'child', pathKind: 'folder', ignored: false });
    f.service.refreshManagedAssets(f.libraryId);
    expect(f.service.listAssets({ libraryId: f.libraryId, recursive: true })).toHaveLength(1);
    expect(f.service.listFolderBrowseEntries({ libraryId: f.libraryId, parentFolderId: link.folderId })).toHaveLength(1);
  });
  it('allows only explicitly requested hard-delete of an owned test subtree', async () => {
    const f = fixture(); const source = path.join(f.root, 'external'); mkdirSync(path.join(source, 'child'), { recursive: true });
    writeFileSync(path.join(source, 'child', 'discard.txt'), 'fixture only');
    const link = f.service.importFolderAsLinked({ libraryId: f.libraryId, sourceRootPath: source });
    await f.service.deleteLinkedFolderSubtree({ libraryId: f.libraryId, linkedFolderId: link.folderId, relativePath: 'child', deleteFromDisk: true });
    expect(existsSync(source)).toBe(true); expect(existsSync(path.join(source, 'child'))).toBe(false);
  });
});

describe('path synchronization through the production port', () => {
  it.each([true, false])('propagates local rename with MOVE support=%s and no lost identity', async (supported) => {
    const f = fixture(); const asset = importFile(f); const s = engineFor(f); s.remote.moveSupported = supported;
    await s.sync(); const before = f.service.syncSnapshot(f.libraryId).assets[0]!;
    f.service.renameAssetFile({ libraryId: f.libraryId, assetId: asset.assetId, newFileName: 'new.txt' });
    const preview = await s.engine.previewSync(f.libraryId, config);
    expect(preview).toMatchObject({ remoteMoves: 1, localMoves: 0, uploads: 0, downloads: 0 });
    expect((await s.sync()).report.remoteMoves).toBe(1);
    expect(s.remote.files.has('audit/assets/source.txt')).toBe(false);
    expect(s.remote.files.get('audit/assets/new.txt')?.toString()).toBe('keep me');
    expect(s.remote.manifest().entries[before.syncId]!.path).toBe('new.txt');
    expect(f.service.syncSnapshot(f.libraryId).assets[0]!.syncId).toBe(before.syncId);
    await s.sync(); // not a repeated MOVE nor stale source ETag
  });
  it('applies a remote nested rename with stable asset/revision/sync IDs and keeps source bytes', async () => {
    const f = fixture(); const asset = importFile(f); const s = engineFor(f); await s.sync();
    const syncId = f.service.syncSnapshot(f.libraryId).assets[0]!.syncId;
    const manifest = s.remote.manifest(); const entry = manifest.entries[syncId]!;
    await s.remote.move('audit/assets/source.txt', 'audit/assets/nested/new.txt');
    entry.path = 'nested/new.txt'; entry.version++;
    s.remote.files.set('audit/manifest.json', Buffer.from(JSON.stringify(manifest)));
    expect((await s.sync()).report.localMoves).toBe(1);
    const result = f.service.listAssets({ libraryId: f.libraryId, recursive: true })[0]!;
    expect(result).toMatchObject({ assetId: asset.assetId, currentRevisionId: asset.currentRevisionId, relativeFilePath: 'nested/new.txt' });
    expect(readFileSync(f.service.resolveAssetPath(f.libraryId, asset.assetId), 'utf8')).toBe('keep me');
    await s.sync();
  });
  it('uploads both changed content and path, deleting old bytes only after new upload succeeds', async () => {
    const f = fixture(); const asset = importFile(f); const s = engineFor(f); await s.sync();
    f.service.renameAssetFile({ libraryId: f.libraryId, assetId: asset.assetId, newFileName: 'changed.txt' });
    writeFileSync(f.service.resolveAssetPath(f.libraryId, asset.assetId), 'new content'); f.service.refreshManagedAssets(f.libraryId);
    await s.sync();
    expect(s.remote.files.get('audit/assets/changed.txt')?.toString()).toBe('new content');
    expect(s.remote.files.has('audit/assets/source.txt')).toBe(false);
  });
  it('does not overwrite a remote occupied destination or delete the old object', async () => {
    const f = fixture(); const asset = importFile(f); const s = engineFor(f); await s.sync();
    f.service.renameAssetFile({ libraryId: f.libraryId, assetId: asset.assetId, newFileName: 'occupied.txt' });
    s.remote.files.set('audit/assets/occupied.txt', Buffer.from('other user data'));
    await expect(s.sync()).rejects.toThrow(/占用/);
    expect(s.remote.files.get('audit/assets/source.txt')?.toString()).toBe('keep me');
    expect(s.remote.files.get('audit/assets/occupied.txt')?.toString()).toBe('other user data');
  });
  it('does not overwrite an occupied local path on a remote rename', () => {
    const f = fixture(); const asset = importFile(f); const syncId = f.service.syncSnapshot(f.libraryId).assets[0]!.syncId;
    const original = f.service.resolveAssetPath(f.libraryId, asset.assetId);
    const occupied = path.join(path.dirname(original), 'occupied.txt'); writeFileSync(occupied, 'other user data');
    expect(() => f.service.applySyncRelocate(f.libraryId, syncId, 'occupied.txt')).toThrow();
    expect(readFileSync(original, 'utf8')).toBe('keep me'); expect(readFileSync(occupied, 'utf8')).toBe('other user data');
  });
  it('imports nested remote-only assets at the exact requested path', () => {
    const f = fixture();
    const result = f.service.applySyncContentUpdate(f.libraryId, 'remote-fixture', 'a/b/new.txt', Buffer.from('nested download'));
    expect(f.service.listAssets({ libraryId: f.libraryId, recursive: true })[0]).toMatchObject({ assetId: result.assetId, relativeFilePath: 'a/b/new.txt' });
    expect(f.service.syncSnapshot(f.libraryId).assets[0]!.syncId).toBe('remote-fixture');
  });
  it('does not manufacture a sequence from independent remote identities', () => {
    const f = fixture();
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVV8AAAAASUVORK5CYII=', 'base64');
    for (const index of [1, 2, 3]) f.service.applySyncContentUpdate(f.libraryId, `remote-${index}`, `frame${index}.png`, png);
    const assets = f.service.listAssets({ libraryId: f.libraryId, recursive: true });
    expect(assets).toHaveLength(3);
    expect(assets.every((asset) => !asset.sequence)).toBe(true);
    expect(f.service.syncSnapshot(f.libraryId).assets.map((asset) => asset.syncId).sort()).toEqual(['remote-1', 'remote-2', 'remote-3']);
    f.service.trashAssets({ libraryId: f.libraryId, assetIds: assets.map((asset) => asset.assetId) });
    f.service.restoreAssets({ libraryId: f.libraryId, assetIds: assets.map((asset) => asset.assetId) });
    const restored = f.service.listAssets({ libraryId: f.libraryId, recursive: true });
    expect(restored).toHaveLength(3); expect(restored.every((asset) => !asset.sequence)).toBe(true);
  });
  it('updates content and remote location together without leaving the old local file', () => {
    const f = fixture(); const asset = importFile(f); const syncId = f.service.syncSnapshot(f.libraryId).assets[0]!.syncId;
    const old = f.service.resolveAssetPath(f.libraryId, asset.assetId);
    f.service.applySyncContentUpdate(f.libraryId, syncId, 'a/new.txt', Buffer.from('new bytes'));
    expect(existsSync(old)).toBe(false);
    expect(readFileSync(f.service.resolveAssetPath(f.libraryId, asset.assetId), 'utf8')).toBe('new bytes');
  });
});

describe('text and colour safety', () => {
  it('retains a UTF-8 BOM on save rather than silently removing it', () => {
    const f = fixture(); const asset = importFile(f, 'bom.txt', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('old')]));
    f.service.saveTextAsset({ libraryId: f.libraryId, assetId: asset.assetId, content: 'new' });
    expect(readFileSync(f.service.resolveAssetPath(f.libraryId, asset.assetId))).toEqual(Buffer.from([0xef, 0xbb, 0xbf, 0x6e, 0x65, 0x77]));
  });
  it('previews GBK read-only and rejects save without touching source bytes', () => {
    const f = fixture(); const original = Buffer.from([0xd6, 0xd0, 0xce, 0xc4]); const asset = importFile(f, 'gbk.txt', original);
    expect(f.service.readTextAsset({ libraryId: f.libraryId, assetId: asset.assetId })).toMatchObject({ content: '中文', encoding: 'gb18030', editable: false });
    expect(() => f.service.saveTextAsset({ libraryId: f.libraryId, assetId: asset.assetId, content: 'changed' })).toThrow();
    expect(readFileSync(f.service.resolveAssetPath(f.libraryId, asset.assetId))).toEqual(original);
  });
  it('keeps full UTF-8 editable, truncated preview read-only, and cached encoding available', () => {
    const f = fixture(); const asset = importFile(f, 'utf8.txt', '中文 test');
    const input = { libraryId: f.libraryId, assetId: asset.assetId };
    expect(f.service.readTextAsset(input)).toMatchObject({ encoding: 'utf-8', editable: true });
    expect(f.service.readTextAsset(input)).toMatchObject({ encoding: 'utf-8' });
    expect(f.service.readTextAsset({ ...input, maxBytes: 4 })).toMatchObject({ content: '中', truncated: true, editable: false });
    f.service.saveTextAsset({ ...input, content: '新内容', expectedRevisionId: asset.currentRevisionId });
    expect(f.service.readTextAsset(input).content).toBe('新内容');
  });
  it('excludes gray/black/white from red and preserves them when red is excluded', () => {
    const db = new Sqlite(':memory:');
    try {
      db.exec("CREATE TABLE p(name TEXT, h REAL, s REAL, l REAL); INSERT INTO p VALUES ('red',0,1,.5),('gray',0,0,.5),('black',0,1,.1),('white',0,1,.9),('low',0,.1,.5)");
      for (const [id, names] of [['red', ['red']], ['gray', ['gray', 'low']], ['black', ['black']], ['white', ['white']]] as const) {
        const clause = colorFilterSql('h', [id], false, 'l', 's')!;
        expect(db.prepare(`SELECT name FROM p WHERE ${clause.sql} ORDER BY name`).all(...clause.params)).toEqual(names.map((name) => ({ name })));
      }
      const exclude = colorFilterSql('h', ['red'], true, 'l', 's')!;
      expect(db.prepare(`SELECT name FROM p WHERE ${exclude.sql} ORDER BY name`).all(...exclude.params)).toEqual(['black', 'gray', 'low', 'white'].map((name) => ({ name })));
    } finally { db.close(); }
  });
});
