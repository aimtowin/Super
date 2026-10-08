import type { RendererLifecycleEvent } from '../shared/protocol/responses';

export function shouldApplyLibraryLifecycleEvent(input: {
  event: RendererLifecycleEvent;
  currentLibraryId?: string;
  scriptSandboxPreviewOpen: boolean;
}): boolean {
  if (input.event.type !== 'library.opened') return false;
  if (input.event.source === 'replacement-restore') return true;
  if (input.event.library.libraryId === input.currentLibraryId) return false;
  return input.event.source === 'mcp'
    || (input.scriptSandboxPreviewOpen && input.currentLibraryId === undefined);
}

/** Main also uses same-ID MCP `opened` for rename/show-in-desktop, not reopen. */
export function shouldUpdateLibrarySummaryEvent(input: {
  event: RendererLifecycleEvent;
  currentLibraryId?: string;
}): boolean {
  return input.event.type === 'library.opened' && input.event.source === 'mcp'
    && input.event.library.libraryId === input.currentLibraryId;
}

/**
 * Opening/inspecting Eagle or Billfish detaches the previous library before
 * conversion. Ordinary
 * create/open/recent-switch also emit `library.closed` for the previous
 * handle *after* the replacement is already open — that event must not
 * clear the renderer, or the no-library create dialog replaces the
 * library that was just switched to.
 */
export function shouldDetachLibraryOnOpening(
  event: RendererLifecycleEvent,
): boolean {
  return event.type === 'library.opening'
    && (event.operation === 'open-eagle' || event.operation === 'open-billfish');
}
