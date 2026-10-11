import { describe, expect, it, vi } from 'vitest';
import type { SuperLibraryApi } from '../../src/shared/library-api';
import { parseRendererRequest, parseWorkerRequest } from '../../src/shared/protocol/requests';
import { withLinkedVisibility } from '../../src/renderer/linked-visibility';

describe('global missing linked display preference', () => {
  it('retains the 16 user-filter budget and keeps paging/layout/selection on the same query', async () => {
    const searchAssets = vi.fn(async input => input), original = { searchAssets } as unknown as SuperLibraryApi;
    const api = withLinkedVisibility(original, true)!;
    const input = { libraryId: 'library', filters: Array.from({ length: 16 }, () => ({ field: 'tag' as const, values: ['tag'], exclude: false })), idsOnly: true };
    await api.searchAssets(input);
    const request = { ...searchAssets.mock.calls[0]![0], query: null, type: 'asset.search.request' };
    expect(parseRendererRequest(request).type).toBe('asset.search.request');
    expect(parseWorkerRequest({ requestId: 'request', command: { ...request, type: 'asset.search' } }).command.type).toBe('asset.search');
    expect(searchAssets.mock.calls[0]![0].filters).toHaveLength(17);
    expect(input.filters).toHaveLength(16);
    expect(() => parseRendererRequest({ ...request, filters: [...input.filters, input.filters[0]] })).toThrow();
  });
  it('does not affect the trash or persist display clauses into smart-collection input', async () => {
    const searchAssets = vi.fn(async input => input), original = { searchAssets } as unknown as SuperLibraryApi;
    expect(withLinkedVisibility(original, false)).toBe(original);
    const api = withLinkedVisibility(original, true)!, input = { libraryId: 'library', scope: { kind: 'trash' as const } };
    await api.searchAssets(input); expect(searchAssets.mock.calls[0]![0]).toBe(input);
  });
});
