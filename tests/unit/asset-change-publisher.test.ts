import { describe, expect, it, vi } from 'vitest';

import { publishAssetChangeToPorts, type AssetChangePublisherPorts } from '../../src/main/asset-change-publisher';
import type { AssetChangeEvent } from '../../src/shared/protocol/responses';

function portsFixture() {
  const order: string[] = [];
  const ports: AssetChangePublisherPorts = {
    clearSourcePathCache: vi.fn(() => { order.push('source'); }),
    clearArtifactPathCache: vi.fn(() => { order.push('artifact'); }),
    fanOutPluginDomainEvent: vi.fn(() => { order.push('plugin'); }),
    enqueueWatcherAutoAnalysis: vi.fn(() => { order.push('auto-ai'); }),
    sendToRenderer: vi.fn(() => { order.push('renderer'); }),
  };
  return { ports, order };
}
const watcher: AssetChangeEvent = { type: 'asset.changed', libraryId: 'library',
  changedCount: 2, missingCount: 1, source: 'watcher', assetIds: ['asset-a', 'asset-b'] };

describe('Main committed-asset publisher ports', () => {
  it.each([undefined, false, true])('preserves all domain effects and order with notification flag=%s', (flag) => {
    const { ports, order } = portsFixture();
    const event = { ...watcher, ...(flag === undefined ? {} : { suppressWatcherNotification: flag }) };
    publishAssetChangeToPorts(event, ports);
    expect(order).toEqual(['source', 'artifact', 'plugin', 'auto-ai', 'renderer']);
    expect(ports.clearSourcePathCache).toHaveBeenCalledExactlyOnceWith('library');
    expect(ports.clearArtifactPathCache).toHaveBeenCalledExactlyOnceWith('library');
    expect(ports.enqueueWatcherAutoAnalysis).toHaveBeenCalledExactlyOnceWith('library');
    expect(ports.sendToRenderer).toHaveBeenCalledExactlyOnceWith(event);
    expect(ports.fanOutPluginDomainEvent).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      kind: 'asset.changed', libraryId: 'library',
      summary: { changedCount: 2, missingCount: 1, source: 'watcher' },
    }));
  });

  it.each(['client', 'text-save', 'content-replace', undefined] as const)('keeps non-watcher source=%s out of the opt-in watcher AI path', (source) => {
    const { ports, order } = portsFixture();
    const event = { ...watcher, source, suppressWatcherNotification: true };
    publishAssetChangeToPorts(event, ports);
    expect(order).toEqual(['source', 'artifact', 'plugin', 'renderer']);
    expect(ports.enqueueWatcherAutoAnalysis).not.toHaveBeenCalled();
    expect(ports.sendToRenderer).toHaveBeenCalledExactlyOnceWith(event);
    expect(ports.fanOutPluginDomainEvent).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      summary: { changedCount: 2, missingCount: 1, ...(source === undefined ? {} : { source }) },
    }));
  });

  it('does not construct plugin-only data when no coordinator exists, while retaining cache/AI/renderer work', () => {
    const { ports, order } = portsFixture();
    ports.fanOutPluginDomainEvent = undefined;
    // The strict asset event permits this ID; plugin validation has a separate
    // 255-character bound and was previously evaluated only with a coordinator.
    const event = { ...watcher, libraryId: 'x'.repeat(256), suppressWatcherNotification: true };
    expect(() => publishAssetChangeToPorts(event, ports)).not.toThrow();
    expect(order).toEqual(['source', 'artifact', 'auto-ai', 'renderer']);
    expect(ports.sendToRenderer).toHaveBeenCalledExactlyOnceWith(event);
  });

  it('retains non-UI effects when the renderer send port has no live window', () => {
    const { ports, order } = portsFixture();
    ports.sendToRenderer = vi.fn(() => undefined);
    publishAssetChangeToPorts({ ...watcher, suppressWatcherNotification: true }, ports);
    expect(order).toEqual(['source', 'artifact', 'plugin', 'auto-ai']);
    expect(ports.sendToRenderer).toHaveBeenCalledOnce();
  });

  it('rejects invalid/private input before calling any domain port', () => {
    const { ports, order } = portsFixture();
    for (const event of [
      { ...watcher, suppressWatcherNotification: 'true' },
      { ...watcher, sourcePath: '/private/source.png' },
      { ...watcher, changedCount: 0 },
      { ...watcher, assetIds: [] },
    ]) expect(() => publishAssetChangeToPorts(event, ports)).toThrow();
    expect(order).toEqual([]);
    for (const port of Object.values(ports)) expect(port).not.toHaveBeenCalled();
  });

  it('does not swallow existing port failures or reorder later effects past them', () => {
    const { ports, order } = portsFixture();
    const cause = new Error('cache failure');
    ports.clearArtifactPathCache = vi.fn(() => { order.push('artifact'); throw cause; });
    expect(() => publishAssetChangeToPorts(watcher, ports)).toThrow(cause);
    expect(order).toEqual(['source', 'artifact']);
    expect(ports.fanOutPluginDomainEvent).not.toHaveBeenCalled();
    expect(ports.enqueueWatcherAutoAnalysis).not.toHaveBeenCalled();
    expect(ports.sendToRenderer).not.toHaveBeenCalled();
  });
});
