import { createPluginDomainEvent, type PluginDomainEvent } from '../plugins/plugin-domain-events';
import { parseAssetChangeEvent, type AssetChangeEvent } from '../shared/protocol/responses';

export type AssetChangePublisherPorts = {
  clearSourcePathCache: (libraryId: string) => void;
  clearArtifactPathCache: (libraryId: string) => void;
  fanOutPluginDomainEvent?: (event: PluginDomainEvent) => void;
  enqueueWatcherAutoAnalysis: (libraryId: string) => void;
  sendToRenderer: (event: AssetChangeEvent) => void;
};

/** Presentation hints never suppress committed-domain cache/plugin/AI effects. */
export function publishAssetChangeToPorts(input: unknown, ports: AssetChangePublisherPorts): void {
  const parsed = parseAssetChangeEvent(input);
  // Keep the previous Main fanout order. The separate library.changed channel
  // still handles artifact-only changes without evicting the viewer hot path.
  ports.clearSourcePathCache(parsed.libraryId);
  ports.clearArtifactPathCache(parsed.libraryId);
  if (ports.fanOutPluginDomainEvent) {
    ports.fanOutPluginDomainEvent(createPluginDomainEvent({
      kind: 'asset.changed',
      libraryId: parsed.libraryId,
      summary: {
        changedCount: parsed.changedCount,
        missingCount: parsed.missingCount,
        ...(parsed.source === undefined ? {} : { source: parsed.source }),
      },
    }));
  }
  // The injected Main operation retains its existing opt-in setting and
  // durable queue deduplication; a quiet watcher change still needs that work.
  if (parsed.source === 'watcher') ports.enqueueWatcherAutoAnalysis(parsed.libraryId);
  ports.sendToRenderer(parsed);
}
