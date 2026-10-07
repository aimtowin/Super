/** Super-sa65: page math and real-summary merging for virtualized browse. */

import type { AssetSummary, BrowseLayoutEntry } from "../shared/asset-types";

export function browsePageOffset(
  index: number,
  pageSize: number,
): number {
  if (index <= 0 || pageSize <= 0) return 0;
  return Math.floor(index / pageSize) * pageSize;
}

/** Group missing page offsets into runs that can be fetched in one request. */
export function contiguousBrowsePageRuns(
  offsets: readonly number[],
  pageSize: number,
): number[][] {
  const step = Math.max(1, Math.trunc(pageSize));
  const sorted = [...new Set(offsets)].sort((left, right) => left - right);
  const runs: number[][] = [];
  for (const offset of sorted) {
    const previous = runs.at(-1)?.at(-1);
    if (previous === undefined || offset !== previous + step) {
      runs.push([offset]);
    } else {
      runs.at(-1)!.push(offset);
    }
  }
  return runs;
}

/**
 * Page offsets that cover the visible index range plus one page of overscan
 * on each side. The primary (midpoint) page is first so a scrollbar jump
 * paints the destination before neighbours.
 */
export function browsePageOffsetsForRange(input: {
  startIndex: number;
  endIndex: number;
  total: number;
  pageSize: number;
}): number[] {
  const pageSize = Math.max(1, input.pageSize);
  const total = Math.max(0, input.total);
  if (total === 0) return [];
  const lo = Math.max(0, Math.min(input.startIndex, input.endIndex) - pageSize);
  const hi = Math.min(
    total - 1,
    Math.max(input.startIndex, input.endIndex) + pageSize,
  );
  const first = browsePageOffset(lo, pageSize);
  const last = browsePageOffset(hi, pageSize);
  const offsets: number[] = [];
  for (let offset = first; offset <= last; offset += pageSize) {
    offsets.push(offset);
  }
  const primary = browsePageOffset(
    Math.floor((input.startIndex + input.endIndex) / 2),
    pageSize,
  );
  if (!offsets.includes(primary)) return offsets;
  return [primary, ...offsets.filter((offset) => offset !== primary)];
}

/**
 * Merge real summaries only. The compact layout index owns full-scope order
 * and scrollbar geometry; unloaded assets never become fake AssetSummary
 * cards and therefore cannot flash `__pending:` placeholders.
 */
export function mergeLoadedBrowsePage(input: {
  current: readonly AssetSummary[];
  items: readonly AssetSummary[];
  layout: readonly BrowseLayoutEntry[];
}): AssetSummary[] {
  const byId = new Map<string, AssetSummary>();
  for (const asset of input.current) byId.set(asset.assetId, asset);
  for (const asset of input.items) byId.set(asset.assetId, asset);
  // Only loaded summaries participate in this merge. Do not allocate a full
  // scope-sized map plus an intermediate array of [id, rank] tuples for each
  // 100-item page (or each geometry chunk). Keep summaries/selection intact.
  const rank = new Map<string, number>();
  for (let index = 0; index < input.layout.length; index += 1) {
    const id = input.layout[index]!.assetId;
    if (byId.has(id)) rank.set(id, index);
  }
  return [...byId.values()].sort((left, right) => {
    const leftRank = rank.get(left.assetId);
    const rightRank = rank.get(right.assetId);
    if (leftRank === undefined && rightRank === undefined) return 0;
    if (leftRank === undefined) return 1;
    if (rightRank === undefined) return -1;
    return leftRank - rightRank;
  });
}

/** First-paint Inspector/card copy from the compact layout index (Super-l2at / Super-joz6). */
export function assetSummaryFromLayoutEntry(
  entry: BrowseLayoutEntry,
): AssetSummary | undefined {
  const displayName = entry.displayName?.trim();
  if (!displayName) return undefined;
  const relativeFilePath = entry.relativeFilePath?.trim() || displayName;
  return {
    assetId: entry.assetId,
    locationKind: "managed",
    managedFolderId: null,
    relativeFilePath,
    displayName,
    currentRevisionId: `layout:${entry.assetId}`,
    byteSize: entry.byteSize ?? 0,
    modifiedAt: entry.modifiedAt ?? new Date(0).toISOString(),
    availability: "available",
    rating: entry.rating ?? 0,
    favorite: false,
    deletedAt: null,
    trashedFromPath: null,
    trashedFromTombstoneId: null,
    remainingDays: null,
    thumbnailStatus: entry.previewArtifactId ? "ready" : "pending",
    thumbnailArtifactId: entry.previewArtifactId ?? null,
    mediaType: "other",
    width: entry.width,
    height: entry.height,
    durationMs: null,
  };
}
