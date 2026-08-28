import { describe, expect, it, vi } from 'vitest';

import { createSuperGuestApi } from '../../src/scripting/super-guest-api';

describe('Super Guest API library scopes', () => {
  it('creates an immutable forLibrary scope without changing ambient calls', async () => {
    const executeCommand = vi.fn(async () => ({ items: [] }));
    const superApi = createSuperGuestApi({ executeCommand });

    await superApi.assets!.list!();
    const scoped = superApi.forLibrary('library-2');
    await scoped.assets!.list!();
    await superApi.assets!.list!();

    expect(executeCommand).toHaveBeenNthCalledWith(1, 'asset.list', {}, undefined);
    expect(executeCommand).toHaveBeenNthCalledWith(2, 'asset.list', {}, {
      targetLibraryId: 'library-2',
    });
    expect(executeCommand).toHaveBeenNthCalledWith(3, 'asset.list', {}, undefined);
    expect(() => superApi.forLibrary('../outside')).toThrow('Invalid target library id.');
    expect(() => superApi.forLibrary('library/other')).toThrow('Invalid target library id.');
  });

  it('does not expose a mutable target on the scoped command API', () => {
    const superApi = createSuperGuestApi({ executeCommand: async () => undefined });
    const scoped = superApi.forLibrary('library-2');

    expect(scoped).not.toHaveProperty('forLibrary');
    expect(Object.isFrozen(scoped)).toBe(false);
  });
});
