import { emptySyncMetadata, mergeSyncMetadata, metadataFingerprint, type SyncMetadata } from '../../src/worker/sync/sync-metadata';
import { describe, expect, it } from 'vitest';

import type {
  DriverCapabilities,
  RemoteEntry,
  RemoteReadResult,
  RemoteStorageDriver,
  RemoteWriteOptions,
  RemoteWriteResult,
} from '../../src/worker/sync/remote-storage';
import { SyncEngine, type SyncLibraryPort, type SyncRootConfig } from '../../src/worker/sync/sync-engine';

class MemoryDriver implements RemoteStorageDriver {
  readonly files = new Map<string, Buffer>();
  private readonly etags = new Map<string, string>();
  private sequence = 0;
  contentTransfer = true;

  async list(path: string): Promise<RemoteEntry[]> {
    const prefix = path.endsWith('/') ? path : `${path}/`;
    return [...this.files.keys()]
      .filter((key) => key.startsWith(prefix))
      .map((key) => ({ path: key, isDirectory: false, size: this.files.get(key)!.length, etag: this.etags.get(key) }));
  }

  async read(path: string): Promise<RemoteReadResult> {
    const body = this.files.get(path);
    if (!body) throw new Error(`missing ${path}`);
    return { body, etag: this.etags.get(path) };
  }

  async write(path: string, body: Buffer, options: RemoteWriteOptions = {}): Promise<RemoteWriteResult> {
    if (options.ifMatch && this.etags.get(path) && options.ifMatch !== this.etags.get(path)) {
      throw new Error('precondition');
    }
    this.files.set(path, body);
    this.sequence += 1;
    const etag = `"etag-${this.sequence}"`;
    this.etags.set(path, etag);
    return { etag, status: 201 };
  }

  async delete(path: string): Promise<void> {
    this.files.delete(path);
    this.etags.delete(path);
  }

  async mkdir(): Promise<void> {}

  async move(): Promise<void> {}

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  async probe(): Promise<DriverCapabilities> {
    return {
      auth: 'none',
      supportsContentTransfer: this.contentTransfer,
      supportsDepthInfinity: true,
      supportsEtagIfMatch: true,
      supportsMove: true,
      supportsLock: false,
    };
  }
}

interface FakeAsset {
  syncId: string;
  relativePath: string;
  body: Buffer;
}

class FakeLibrary implements SyncLibraryPort {
  assets = new Map<string, FakeAsset>();
  deletedSyncIds: string[] = [];
  private cache = new Map<string, string>();
  calls: string[] = [];
  conflictCopies: Array<{ syncId: string; name: string }> = [];

  constructor(private readonly displayName = '参考库') {}

  async syncSnapshot(libraryId: string) {
    const assets = [...this.assets.values()].map((asset) => ({
      syncId: asset.syncId,
      assetId: asset.syncId,
      relativePath: asset.relativePath,
      contentHash: `hash-${Buffer.from(asset.body).toString('hex').slice(0, 8)}`,
      size: asset.body.length,
      modifiedAt: '2026-08-15T10:00:00Z',
    }));
    return { library: { libraryId, displayName: this.displayName }, assets, deletedSyncIds: this.deletedSyncIds };
  }

  async applySyncContentUpdate(libraryId: string, syncId: string, relativePath: string, body: Buffer) {
    this.calls.push(`update:${syncId}:${relativePath}`);
    const existing = this.assets.get(syncId);
    if (existing) {
      existing.body = body;
      existing.relativePath = relativePath;
      return { assetId: syncId, created: false };
    }
    this.assets.set(syncId, { syncId, relativePath, body });
    return { assetId: syncId, created: true };
  }

  async applySyncRecycle(_libraryId: string, syncId: string) {
    this.calls.push(`recycle:${syncId}`);
    this.assets.delete(syncId);
  }

  async applySyncConflictCopy(_libraryId: string, _relativePath: string, _body: Buffer, conflictName: string) {
    const syncId = `copy-${conflictName}`;
    this.conflictCopies.push({ syncId, name: conflictName });
    return { syncId, contentHash: `hash-copy-${conflictName}`, size: _body.length };
  }

  async readSyncManifestCache(libraryId: string) {
    return this.cache.get(libraryId) ?? null;
  }

  async writeSyncManifestCache(libraryId: string, manifestJson: string) {
    this.cache.set(libraryId, manifestJson);
  }

  async readLocalAssetContent(_libraryId: string, syncId: string) {
    const asset = this.assets.get(syncId);
    if (!asset) throw new Error(`missing local ${syncId}`);
    return asset.body;
  }
}

const root: SyncRootConfig = { id: 'root-1', baseUrl: 'https://mock/' };

describe('SyncEngine end-to-end (Super-xffq)', () => {
  it('performs a first full upload and persists the manifest', async () => {
    const driver = new MemoryDriver();
    const library = new FakeLibrary();
    library.assets.set('s1', { syncId: 's1', relativePath: 'dir/a.png', body: Buffer.from('aaa') });
    library.assets.set('s2', { syncId: 's2', relativePath: 'b.png', body: Buffer.from('bbb') });
    const engine = new SyncEngine(library, { deviceId: 'dev-a' });
    engine.buildDriver = () => driver;

    const outcome = await engine.syncOnce('lib-1', root);
    expect(outcome.report.uploads).toBe(2);
    expect(driver.files.get('参考库/assets/dir/a.png')?.toString()).toBe('aaa');
    expect(driver.files.get('参考库/manifest.json')).toBeTruthy();
    expect(await library.readSyncManifestCache('lib-1')).toBeTruthy();
    expect(outcome.conflicts).toEqual([]);
  });

  it('downloads remote assets onto a fresh device', async () => {
    const driver = new MemoryDriver();
    driver.files.set('参考库/assets/a.png', Buffer.from('remote-content'));
    driver.files.set('参考库/manifest.json', Buffer.from(JSON.stringify({
      formatVersion: 1,
      libraryId: 'lib-1',
      displayName: '参考库',
      directoryName: '参考库',
      entries: {
        r1: {
          path: 'a.png', contentHash: 'hash-remote', size: 14, version: 1,
          deviceId: 'dev-b', modifiedAt: '2026-08-15T10:00:00Z', metadataVersion: 1,
        },
      },
    })));
    const library = new FakeLibrary();
    const engine = new SyncEngine(library, { deviceId: 'dev-a' });
    engine.buildDriver = () => driver;

    const outcome = await engine.syncOnce('lib-1', root);
    expect(outcome.report.downloads).toBe(1);
    expect(library.assets.get('r1')?.body.toString()).toBe('remote-content');
  });

  it('detects conflicts and stores both copies', async () => {
    const driver = new MemoryDriver();
    // 远端版本与本地不同。
    driver.files.set('参考库/assets/a.png', Buffer.from('remote-version'));
    driver.files.set('参考库/manifest.json', Buffer.from(JSON.stringify({
      formatVersion: 1,
      libraryId: 'lib-1',
      displayName: '参考库',
      directoryName: '参考库',
      entries: {
        s1: {
          path: 'a.png', contentHash: 'hash-remote', size: 10, version: 2,
          deviceId: 'dev-b', modifiedAt: '2026-08-15T12:00:00Z', metadataVersion: 1,
        },
      },
    })));
    const library = new FakeLibrary();
    library.assets.set('s1', { syncId: 's1', relativePath: 'a.png', body: Buffer.from('local-new') });
    // 本地缓存：与本地内容一致（未变），但远端也变了。
    await library.writeSyncManifestCache('lib-1', JSON.stringify({
      formatVersion: 1,
      libraryId: 'lib-1',
      displayName: '参考库',
      directoryName: '参考库',
      entries: {
        s1: {
          path: 'a.png', contentHash: 'hash-1', size: 10, version: 1,
          deviceId: 'dev-a', modifiedAt: '2026-08-15T10:00:00Z', metadataVersion: 1,
        },
      },
    }));
    const engine = new SyncEngine(library, { deviceId: 'dev-a' });
    engine.buildDriver = () => driver;

    const outcome = await engine.syncOnce('lib-1', root);
    expect(outcome.report.conflicts).toBe(1);
    expect(outcome.conflicts).toHaveLength(1);
    expect(library.conflictCopies).toHaveLength(1);
  });

  it('rejects servers without content transfer', async () => {
    const driver = new MemoryDriver();
    driver.contentTransfer = false;
    const library = new FakeLibrary();
    const engine = new SyncEngine(library, { deviceId: 'dev-a' });
    engine.buildDriver = () => driver;
    await expect(engine.syncOnce('lib-1', root)).rejects.toThrow(/无法用于同步/);
  });

  it('propagates local deletion as remote delete + tombstone', async () => {
    const driver = new MemoryDriver();
    driver.files.set('参考库/assets/a.png', Buffer.from('x'));
    driver.files.set('参考库/manifest.json', Buffer.from(JSON.stringify({
      formatVersion: 1,
      libraryId: 'lib-1',
      displayName: '参考库',
      directoryName: '参考库',
      entries: {
        s1: {
          path: 'a.png', contentHash: 'hash-x', size: 1, version: 1,
          deviceId: 'dev-a', modifiedAt: '2026-08-15T10:00:00Z', metadataVersion: 1,
        },
      },
    })));
    const library = new FakeLibrary();
    library.deletedSyncIds = ['s1']; // Explicit user intent, not mere absence.
    await library.writeSyncManifestCache('lib-1', JSON.stringify({
      formatVersion: 1,
      libraryId: 'lib-1',
      displayName: '参考库',
      directoryName: '参考库',
      entries: {
        s1: {
          path: 'a.png', contentHash: 'hash-x', size: 1, version: 1,
          deviceId: 'dev-a', modifiedAt: '2026-08-15T10:00:00Z', metadataVersion: 1,
        },
      },
    }));
    const engine = new SyncEngine(library, { deviceId: 'dev-a' });
    engine.buildDriver = () => driver;

    const outcome = await engine.syncOnce('lib-1', root);
    expect(outcome.report.remoteDeletes).toBe(1);
    expect(driver.files.has('参考库/assets/a.png')).toBe(false);
    expect(driver.files.has('参考库/trash/s1.json')).toBe(true);
  });

  it('preview does not write anything', async () => {
    const driver = new MemoryDriver();
    const library = new FakeLibrary();
    library.assets.set('s1', { syncId: 's1', relativePath: 'a.png', body: Buffer.from('a') });
    const engine = new SyncEngine(library, { deviceId: 'dev-a' });
    engine.buildDriver = () => driver;

    const report = await engine.previewSync('lib-1', root);
    expect(report.uploads).toBe(1);
    expect(driver.files.size).toBe(0);
  });

  it('pollRemoteChange reports no change when remote matches the local cache (auto-sync)', async () => {
    const driver = new MemoryDriver();
    driver.files.set('参考库/manifest.json', Buffer.from(JSON.stringify({
      formatVersion: 1,
      libraryId: 'lib-1',
      displayName: '参考库',
      directoryName: '参考库',
      entries: {
        s1: {
          path: 'a.png', contentHash: 'hash-x', size: 1, version: 2,
          deviceId: 'dev-b', modifiedAt: '2026-08-15T12:00:00Z', metadataVersion: 1,
        },
      },
    })));
    const library = new FakeLibrary();
    // 本地缓存与远端一致 → 无需同步。
    await library.writeSyncManifestCache('lib-1', JSON.stringify({
      formatVersion: 1,
      libraryId: 'lib-1',
      displayName: '参考库',
      directoryName: '参考库',
      entries: {
        s1: {
          path: 'a.png', contentHash: 'hash-x', size: 1, version: 2,
          deviceId: 'dev-b', modifiedAt: '2026-08-15T12:00:00Z', metadataVersion: 1,
        },
      },
    }));
    const engine = new SyncEngine(library, { deviceId: 'dev-a' });
    engine.buildDriver = () => driver;
    const pollRoot: SyncRootConfig = { id: 'root-1', baseUrl: 'https://mock/', directoryName: '参考库' };

    await expect(engine.pollRemoteChange('lib-1', pollRoot)).resolves.toBe(false);
  });

  it('pollRemoteChange reports change when remote advanced or local cache is missing (auto-sync)', async () => {
    const driver = new MemoryDriver();
    driver.files.set('参考库/manifest.json', Buffer.from(JSON.stringify({
      formatVersion: 1,
      libraryId: 'lib-1',
      displayName: '参考库',
      directoryName: '参考库',
      entries: {
        s1: {
          path: 'a.png', contentHash: 'hash-new', size: 2, version: 3,
          deviceId: 'dev-b', modifiedAt: '2026-08-15T13:00:00Z', metadataVersion: 1,
        },
      },
    })));
    const library = new FakeLibrary();
    // 本地缓存仍是旧版本 → 需要同步。
    await library.writeSyncManifestCache('lib-1', JSON.stringify({
      formatVersion: 1,
      libraryId: 'lib-1',
      displayName: '参考库',
      directoryName: '参考库',
      entries: {
        s1: {
          path: 'a.png', contentHash: 'hash-x', size: 1, version: 2,
          deviceId: 'dev-b', modifiedAt: '2026-08-15T12:00:00Z', metadataVersion: 1,
        },
      },
    }));
    const engine = new SyncEngine(library, { deviceId: 'dev-a' });
    engine.buildDriver = () => driver;
    const pollRoot: SyncRootConfig = { id: 'root-1', baseUrl: 'https://mock/', directoryName: '参考库' };
    await expect(engine.pollRemoteChange('lib-1', pollRoot)).resolves.toBe(true);

    // 无本地缓存 → 需要同步。
    const fresh = new FakeLibrary();
    const freshEngine = new SyncEngine(fresh, { deviceId: 'dev-a' });
    freshEngine.buildDriver = () => driver;
    await expect(freshEngine.pollRemoteChange('lib-1', pollRoot)).resolves.toBe(true);

    // 远端无 manifest → 需要同步（首次初始化）。
    const emptyDriver = new MemoryDriver();
    const emptyLibrary = new FakeLibrary();
    const emptyEngine = new SyncEngine(emptyLibrary, { deviceId: 'dev-a' });
    emptyEngine.buildDriver = () => emptyDriver;
    await expect(emptyEngine.pollRemoteChange('lib-1', root)).resolves.toBe(true);
  });

  it('reports byte progress for uploads and downloads (Super-bfsb 后续)', async () => {
    const driver = new MemoryDriver();
    const library = new FakeLibrary();
    library.assets.set('s1', { syncId: 's1', relativePath: 'a.png', body: Buffer.from('aaaa') });
    const progress: Array<{ done: number; total: number; bytesDone: number; bytesTotal: number }> = [];
    const engine = new SyncEngine(library, {
      deviceId: 'dev-a',
      onProgress: (done, total, bytesDone, bytesTotal) => {
        progress.push({ done, total, bytesDone, bytesTotal });
      },
    });
    engine.buildDriver = () => driver;

    await engine.syncOnce('lib-1', root);
    expect(progress.length).toBeGreaterThan(0);
    const last = progress.at(-1)!;
    expect(last.done).toBe(last.total);
    // 上传 4 字节（1 个文件）。
    expect(last.bytesDone).toBe(4);
    expect(last.bytesTotal).toBe(4);
  });
});

class MetadataLibrary extends FakeLibrary {
  metadata = new Map<string,SyncMetadata>();
  override async applySyncConflictCopy(libraryId: string, relativePath: string, body: Buffer, name: string) {
    const copy = await super.applySyncConflictCopy(libraryId, relativePath, body, name);
    this.assets.set(copy.syncId, {syncId: copy.syncId, relativePath: name, body});
    return copy;
  }
  async readSyncMetadata(_libraryId:string,id:string) {return this.assets.has(id) ? structuredClone(this.metadata.get(id) ?? emptySyncMetadata()) : null;}
  async applySyncMetadata(libraryId:string,id:string,expected:string,value:SyncMetadata) {
    const before = await this.readSyncMetadata(libraryId,id);
    if (!before || metadataFingerprint(before) !== expected) throw Error('Stale metadata');
    this.metadata.set(id,structuredClone(value));
  }
}
describe('metadata sync boundaries', () => {
  it('retains losing content metadata and AI provenance on the conflict copy', async () => {
    const driver = new MemoryDriver(), a = new MetadataLibrary(), b = new MetadataLibrary();
    a.assets.set('s1', {syncId:'s1', relativePath:'a.txt', body:Buffer.from('initial')});
    const original = emptySyncMetadata(); original.user.description = 'Manual original';
    original.ai = [{fieldName:'description', value:'AI provenance', modelId:'model-x', modelVersion:'1', generatedAt:'2026-10-10'}];
    a.metadata.set('s1', original);
    const engineA = new SyncEngine(a,{deviceId:'a', now:()=>'2026-10-10T01:00:00Z'}), engineB = new SyncEngine(b,{deviceId:'b', now:()=>'2026-10-10T02:00:00Z'});
    engineA.buildDriver=()=>driver; engineB.buildDriver=()=>driver;
    await engineA.syncOnce('lib-1',root); await engineB.syncOnce('lib-1',root);
    a.assets.get('s1')!.body=Buffer.from('remote-new'); b.assets.get('s1')!.body=Buffer.from('local-new');
    await engineA.syncOnce('lib-1',root);
    const result = await engineB.syncOnce('lib-1',root);
    expect(result.conflicts).toHaveLength(1);
    const copy = b.conflictCopies[0]!;
    expect(b.metadata.get(copy.syncId)).toEqual(original);
    expect(result.manifest.entries[copy.syncId]!.metadata).toEqual(original);
  });
  it('merges independent manual edits and never lets AI overwrite manual fields', () => {
    const base = emptySyncMetadata(), local = structuredClone(base), remote = structuredClone(base);
    local.user.description = 'Manual'; remote.user.rating = 4;
    remote.ai = [{fieldName:'description',value:'Generated',modelId:'model',modelVersion:'1',generatedAt:'2026-10-10'}];
    const merged = mergeSyncMetadata(base,local,remote);
    expect(merged.user).toMatchObject({description:'Manual',rating:4});
    expect(merged.ai[0]?.value).toBe('Generated');
    remote.user.description = 'Other manual';
    expect(() => mergeSyncMetadata(base,local,remote)).toThrow(/description/);
  });
  it('canonicalizes tag order/casing and preserves three-way removals', () => {
    const base=emptySyncMetadata(); base.humanTags=['A','Keep'];
    const local=structuredClone(base); local.humanTags=['Keep','Local'];
    const remote=structuredClone(base); remote.humanTags=['A','Keep','Remote'];
    expect(mergeSyncMetadata(base,local,remote).humanTags).toEqual(['Keep','Local','Remote']);
    expect(metadataFingerprint({...base,humanTags:['Keep','A']})).toBe(metadataFingerprint({...base,humanTags:['a','keep']}));
  });
  it('syncs metadata-only changes independently of content versions and stops concurrent manual conflicts', async () => {
    const driver = new MemoryDriver(), a = new MetadataLibrary(), b = new MetadataLibrary();
    a.assets.set('s1',{syncId:'s1',relativePath:'a.txt',body:Buffer.from('same')});
    const initial=emptySyncMetadata(); initial.user.description='Initial'; a.metadata.set('s1',initial);
    const engineA=new SyncEngine(a,{deviceId:'a'}),engineB=new SyncEngine(b,{deviceId:'b'});
    engineA.buildDriver=()=>driver;engineB.buildDriver=()=>driver;
    const first=await engineA.syncOnce('lib-1',root);
    await engineB.syncOnce('lib-1',root); expect(b.metadata.get('s1')?.user.description).toBe('Initial');
    a.metadata.get('s1')!.user.rating=4;
    const changed=await engineA.syncOnce('lib-1',root);
    expect(changed.report.uploads).toBe(0);
    expect(changed.manifest.entries.s1!.version).toBe(first.manifest.entries.s1!.version);
    expect(changed.manifest.entries.s1!.metadataVersion).toBe(first.manifest.entries.s1!.metadataVersion+1);
    await engineB.syncOnce('lib-1',root); expect(b.metadata.get('s1')?.user.rating).toBe(4);
    const unchanged=await engineB.syncOnce('lib-1',root);
    expect(unchanged.manifest.entries.s1!.metadataVersion).toBe(changed.manifest.entries.s1!.metadataVersion);
    a.metadata.get('s1')!.user.description='A'; b.metadata.get('s1')!.user.description='B';
    await engineA.syncOnce('lib-1',root);
    const snapshot=Buffer.from(driver.files.get('参考库/manifest.json')!);
    await expect(engineB.syncOnce('lib-1',root)).rejects.toMatchObject({code:'METADATA_CONFLICT'});
    expect(driver.files.get('参考库/manifest.json')).toEqual(snapshot); expect(b.metadata.get('s1')?.user.description).toBe('B');
  });
  it('does not publish or apply a cancelled metadata pass', async () => {
    const driver=new MemoryDriver(), a=new MetadataLibrary();
    a.assets.set('s1',{syncId:'s1',relativePath:'a.txt',body:Buffer.from('same')});
    const engine=new SyncEngine(a,{deviceId:'a',isCancelled:()=>true}); engine.buildDriver=()=>driver;
    await expect(engine.syncOnce('lib-1',root)).rejects.toMatchObject({code:'CANCELLED'});
    expect(driver.files.size).toBe(0);expect(a.metadata.size).toBe(0);
  });
});
