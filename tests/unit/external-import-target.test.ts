import { describe, expect, it } from 'vitest';

import { resolveExternalImportDestination } from '../../src/renderer/use-external-import-handlers';

describe('resolveExternalImportDestination', () => {
  it('imports a collection drop to the managed root instead of a stale folder', () => {
    expect(resolveExternalImportDestination({
      targetFolderId: undefined,
      targetCollectionId: 'collection-1',
      fallbackFolderId: 'previous-folder',
    })).toEqual({
      targetFolderId: undefined,
      targetCollectionId: 'collection-1',
    });
  });

  it('retains an explicit folder target when no collection is targeted', () => {
    expect(resolveExternalImportDestination({
      targetFolderId: 'folder-1',
      targetCollectionId: undefined,
      fallbackFolderId: 'previous-folder',
    })).toEqual({
      targetFolderId: 'folder-1',
      targetCollectionId: undefined,
    });
  });
});
