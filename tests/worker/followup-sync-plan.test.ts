import { describe, expect, it } from 'vitest';
import { createEmptyManifest, parseManifest, type SyncManifestEntry } from '../../src/worker/sync/manifest';
import { planSyncActions, type PlanSyncInput } from '../../src/worker/sync/sync-plan';

function facts(): PlanSyncInput {
  const localManifest = createEmptyManifest({ libraryId: 'fixture', displayName: 'Fixture', directoryName: 'fixture' });
  const initial: SyncManifestEntry = { path: 'old.txt', contentHash: 'same', size: 4, version: 1,
    deviceId: 'a', metadataVersion: 1, modifiedAt: '2026-10-09T00:00:00Z' };
  localManifest.entries['s1'] = initial;
  return { localManifest, remoteManifest: structuredClone(localManifest), localAssets: new Map([['s1', { ...initial }]]),
    remoteTombstones: new Set(), localDeleted: new Set(), localRestored: new Set(), localMissing: new Set() };
}

describe('follow-up sync planning', () => {
  it('absence alone, including an old cache entry, never authorizes DELETE/tombstones', () => {
    const input = facts(); input.localAssets.clear();
    expect(planSyncActions(input)).toEqual([]);
    input.localMissing!.add('s1'); expect(planSyncActions(input)).toEqual([]);
    input.remoteManifest.entries['s1']!.contentHash = 'new-remote'; expect(planSyncActions(input)).toEqual([]);
  });
  it('does not resurrect a remotely deleted file solely because the cache is missing', () => {
    const input = facts(); input.remoteTombstones.add('s1'); input.localManifest.entries = {};
    expect(planSyncActions(input)).toEqual([{ type: 'delete-local', assetId: 's1' }]);
    input.localRestored!.add('s1');
    expect(planSyncActions(input).map((action) => action.type)).toEqual(['upload', 'clear-tombstone']);
  });
  it('explicit restore can override an existing cache tombstone, not just a missing cache', () => {
    const input = facts(); input.remoteTombstones.add('s1'); input.localRestored!.add('s1');
    expect(planSyncActions(input).map((action) => action.type)).toEqual(['upload', 'clear-tombstone']);
  });
  it('plans MOVE for a local path-only change and relocation for a remote one', () => {
    const local = facts(); local.localAssets.get('s1')!.path = 'local.txt';
    expect(planSyncActions(local)).toEqual([expect.objectContaining({ type: 'move-remote', previousPath: 'old.txt', entry: expect.objectContaining({ path: 'local.txt', version: 2 }) })]);
    const remote = facts(); remote.remoteManifest.entries['s1']!.path = 'remote.txt';
    expect(planSyncActions(remote)).toEqual([expect.objectContaining({ type: 'relocate-local', entry: expect.objectContaining({ path: 'remote.txt' }) })]);
  });
  it('resolves concurrent path-only edits deterministically to the committed remote path', () => {
    const input = facts(); input.localAssets.get('s1')!.path = 'local.txt'; input.remoteManifest.entries['s1']!.path = 'remote.txt';
    expect(planSyncActions(input)).toEqual([expect.objectContaining({ type: 'relocate-local', entry: expect.objectContaining({ path: 'remote.txt' }) })]);
  });
  it('combines a local content edit with a remote rename', () => {
    const input = facts(); input.localAssets.get('s1')!.contentHash = 'local-new'; input.remoteManifest.entries['s1']!.path = 'remote.txt';
    expect(planSyncActions(input)).toEqual([
      expect.objectContaining({ type: 'relocate-local', entry: expect.objectContaining({ path: 'remote.txt' }) }),
      expect.objectContaining({ type: 'upload', entry: expect.objectContaining({ path: 'remote.txt', contentHash: 'local-new' }) }),
    ]);
  });
  it('combines a local rename with a remote content edit', () => {
    const input = facts(); input.localAssets.get('s1')!.path = 'local.txt'; input.remoteManifest.entries['s1']!.contentHash = 'remote-new';
    expect(planSyncActions(input)).toEqual([
      expect.objectContaining({ type: 'move-remote', entry: expect.objectContaining({ path: 'local.txt', contentHash: 'remote-new' }) }),
      expect.objectContaining({ type: 'download', entry: expect.objectContaining({ path: 'local.txt', contentHash: 'remote-new' }) }),
    ]);
  });
  it('keeps local target path on content-and-path upload and protects both content edits as a conflict', () => {
    const input = facts(); input.localAssets.get('s1')!.path = 'new.txt'; input.localAssets.get('s1')!.contentHash = 'local-new';
    expect(planSyncActions(input)).toEqual([expect.objectContaining({ type: 'upload', previousPath: 'old.txt', entry: expect.objectContaining({ path: 'new.txt' }) })]);
    input.remoteManifest.entries['s1']!.contentHash = 'remote-new';
    expect(planSyncActions(input)).toEqual([expect.objectContaining({ type: 'conflict', local: expect.objectContaining({ path: 'new.txt' }) })]);
  });
  it.each(['../outside.txt', '/absolute.txt', 'C:/drive.txt', 'a\\b.txt', 'a/./b.txt', 'a//b.txt'])('rejects unsafe remote entry path %s', (unsafe) => {
    const manifest = facts().remoteManifest; manifest.entries['s1']!.path = unsafe;
    expect(() => parseManifest(JSON.stringify(manifest))).toThrow();
  });
  it.each(['../outside', '__proto__', 'constructor'])('rejects unsafe remote identity %s', (unsafe) => {
    const manifest = facts().remoteManifest;
    manifest.entries = Object.fromEntries([[unsafe, manifest.entries['s1']!]]);
    expect(() => parseManifest(JSON.stringify(manifest))).toThrow();
  });
});
