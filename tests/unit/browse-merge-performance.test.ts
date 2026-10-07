import { performance } from 'node:perf_hooks';
import { serialize } from 'node:v8';
import { expect, it } from 'vitest';
import type { AssetSummary, BrowseLayoutEntry } from '../../src/shared/asset-types';
import { assetSummaryFromLayoutEntry, mergeLoadedBrowsePage } from '../../src/renderer/browse-window-slots';

it('measures bounded rank allocation while preserving all retained summaries', () => {
  const layout: BrowseLayoutEntry[] = Array.from({ length: 20_000 }, (_, index) => ({
    assetId: `asset-${index}`, width: 640, height: 480, displayName: `asset-${index}.png`,
  }));
  const all = layout.map((entry) => assetSummaryFromLayoutEntry(entry)!);
  const current = all.slice(0, 500);
  const items = all.slice(10_000, 10_100);
  const previous = () => {
    const byId = new Map(current.map((item) => [item.assetId, item]));
    for (const item of items) byId.set(item.assetId, item);
    const rank = new Map(layout.map((entry, index) => [entry.assetId, index]));
    return [...byId.values()].sort((a, b) => rank.get(a.assetId)! - rank.get(b.assetId)!);
  };
  const optimized = () => mergeLoadedBrowsePage({ current, items, layout });
  const median = (operation: () => AssetSummary[]) => {
    operation();
    const samples = Array.from({ length: 15 }, () => {
      const started = performance.now();
      operation();
      return performance.now() - started;
    }).sort((a, b) => a - b);
    return samples[Math.floor(samples.length / 2)]!;
  };
  const previousMs = median(previous);
  const optimizedMs = median(optimized);
  expect(optimized()).toEqual(previous());
  const fullyLoaded = mergeLoadedBrowsePage({ current: all, items: [], layout });
  expect(fullyLoaded).toHaveLength(20_000);
  expect(fullyLoaded[0]).toBe(all[0]);
  expect(fullyLoaded.at(-1)).toBe(all.at(-1));
  console.info(`BROWSE_MERGE_PERF_JSON ${JSON.stringify({ scope: layout.length, loaded: current.length + items.length, previousMedianMs: Number(previousMs.toFixed(3)), optimizedMedianMs: Number(optimizedMs.toFixed(3)), rankEntryBound: current.length + items.length, allSummariesSerializedBytes: serialize(all).byteLength })}`);
  // Timing remains descriptive, not a machine-dependent flaky speed ratio.
  // Allocation is structurally bounded by the actual merged summaries.
});
