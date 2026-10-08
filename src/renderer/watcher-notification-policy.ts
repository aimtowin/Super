import type { AssetChangeEvent } from '../shared/protocol/responses';

/**
 * Select presentation only. Domain listeners still process every incoming
 * event, and own their existing scope filtering, timers and refresh lifetime.
 * Keep the existing latest-event policy for all non-suppressed sources.
 */
export function nextAssetNotificationCandidate(
  previous: AssetChangeEvent | undefined,
  incoming: AssetChangeEvent,
): AssetChangeEvent | undefined {
  return incoming.source === 'watcher' && incoming.suppressWatcherNotification === true
    ? previous : incoming;
}
