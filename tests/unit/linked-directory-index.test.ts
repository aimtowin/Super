import { describe, expect, it } from 'vitest';

import { buildLinkedDirectoryIndex } from '../../src/shared/linked-folder-tree';

describe('buildLinkedDirectoryIndex', () => {
  it('aggregates nested linked assets without repeated full-path scans', () => {
    const index = buildLinkedDirectoryIndex([
      'hdri/day/studio.hdr',
      'hdri/night/city.hdr',
      'materials/metal/albedo.png',
      'materials/metal/normal.png',
      'root-preview.png',
    ]);

    expect(index.childrenOf('').map((entry) => ({
      path: entry.relativePath,
      assets: entry.assetCount,
      direct: entry.directAssetCount,
      children: entry.childFolderCount,
    }))).toEqual([
      { path: 'hdri', assets: 2, direct: 0, children: 2 },
      { path: 'materials', assets: 2, direct: 0, children: 1 },
    ]);
    expect(index.childrenOf('materials')).toEqual([
      {
        relativePath: 'materials/metal',
        assetCount: 2,
        directAssetCount: 2,
        childFolderCount: 0,
      },
    ]);
  });

  it('retains explicitly discovered empty directories', () => {
    const index = buildLinkedDirectoryIndex([], ['empty', 'empty/nested']);
    expect(index.childrenOf('')).toEqual([
      {
        relativePath: 'empty',
        assetCount: 0,
        directAssetCount: 0,
        childFolderCount: 1,
      },
    ]);
  });

  it('keeps a 40,008-asset linked root as a complete recursive scope', () => {
    const paths = Array.from(
      { length: 40_008 },
      (_, index) => `textures/set-${index % 8}/asset-${index}.png`,
    );
    const children = buildLinkedDirectoryIndex(paths).childrenOf('');
    expect(children).toHaveLength(1);
    expect(children[0]).toMatchObject({
      relativePath: 'textures',
      assetCount: 40_008,
      directAssetCount: 0,
      childFolderCount: 8,
    });
  });
});
