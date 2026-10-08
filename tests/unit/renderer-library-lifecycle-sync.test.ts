import { describe, expect, it } from 'vitest';

import { shouldApplyLibraryLifecycleEvent, shouldUpdateLibrarySummaryEvent } from '../../src/renderer/library-lifecycle-sync';
import type { RendererLifecycleEvent } from '../../src/shared/protocol/responses';

const opened = (
  libraryId: string,
  source?: 'mcp' | 'replacement-restore',
): RendererLifecycleEvent => ({
  type: 'library.opened',
  library: {
    libraryId,
    displayName: libraryId,
    displayPath: `/libraries/${libraryId}`,
  },
  ...(source === undefined ? {} : { source }),
});

describe('renderer library lifecycle synchronization', () => {
  it('updates same-ID MCP rename/show summary without activating another owner', () => {
    expect(shouldUpdateLibrarySummaryEvent({ event: opened('same', 'mcp'), currentLibraryId: 'same' })).toBe(true);
    expect(shouldUpdateLibrarySummaryEvent({ event: opened('other', 'mcp'), currentLibraryId: 'same' })).toBe(false);
    expect(shouldUpdateLibrarySummaryEvent({ event: opened('same'), currentLibraryId: 'same' })).toBe(false);
    expect(shouldUpdateLibrarySummaryEvent({ event: opened('same', 'replacement-restore'), currentLibraryId: 'same' })).toBe(false);
  });

  it('reactivates a replacement-restored handle even when its ID is unchanged', () => {
    expect(shouldApplyLibraryLifecycleEvent({ event: opened('same', 'replacement-restore'), currentLibraryId: 'same', scriptSandboxPreviewOpen: false })).toBe(true);
  });
  it('applies an MCP library switch even when another library is already visible', () => {
    expect(shouldApplyLibraryLifecycleEvent({
      event: opened('meme-library', 'mcp'),
      currentLibraryId: 'reference-library',
      scriptSandboxPreviewOpen: false,
    })).toBe(true);
  });

  it('does not duplicate ordinary renderer open responses', () => {
    expect(shouldApplyLibraryLifecycleEvent({
      event: opened('meme-library'),
      currentLibraryId: 'reference-library',
      scriptSandboxPreviewOpen: false,
    })).toBe(false);
    expect(shouldApplyLibraryLifecycleEvent({
      event: opened('meme-library'),
      currentLibraryId: undefined,
      scriptSandboxPreviewOpen: true,
    })).toBe(true);
  });

  it('ignores an already visible library', () => {
    expect(shouldApplyLibraryLifecycleEvent({
      event: opened('reference-library', 'mcp'),
      currentLibraryId: 'reference-library',
      scriptSandboxPreviewOpen: false,
    })).toBe(false);
  });
});
