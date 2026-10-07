import { describe, expect, it } from 'vitest';
import { invalidateChangedAssetArtifacts } from '../../src/renderer/asset-change-cache';

describe('asset change thumbnail invalidation', () => {
  const cache = () => ({ libraryId: 'library', ids: new Map([['a', 'thumb-a'], ['b', 'thumb-b']]) });

  it('keeps unaffected thumbnails and removes only changed IDs', () => {
    const current = cache();
    const result = invalidateChangedAssetArtifacts(current, { libraryId: 'library', assetIds: ['a'] });
    expect([...result.ids]).toEqual([['b', 'thumb-b']]);
    expect([...current.ids]).toHaveLength(2);
  });

  it('keeps state identity for IDs not in the cache or another library', () => {
    const current = cache();
    expect(invalidateChangedAssetArtifacts(current, { libraryId: 'library', assetIds: ['unrelated'] })).toBe(current);
    expect(invalidateChangedAssetArtifacts(current, { libraryId: 'other', assetIds: ['a'] })).toBe(current);
  });

  it('fully invalidates legacy/watcher events without IDs, without no-op rerenders', () => {
    expect(invalidateChangedAssetArtifacts(cache(), { libraryId: 'library' }).ids.size).toBe(0);
    const empty = { libraryId: 'library', ids: new Map<string, string>() };
    expect(invalidateChangedAssetArtifacts(empty, { libraryId: 'library' })).toBe(empty);
    // An empty ID list is not enough information to suppress reconciliation.
    expect(invalidateChangedAssetArtifacts(cache(), { libraryId: 'library', assetIds: [] }).ids.size).toBe(0);
  });
});
