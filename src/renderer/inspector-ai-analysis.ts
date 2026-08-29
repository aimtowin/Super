import type { AssetSummary } from "../shared/asset-types";

/**
 * Keeps the Inspector action scoped to the asset types the requested control
 * supports.  `aiContentLoaded` prevents a brief false "unanalysed" state
 * while the Inspector is still fetching an existing AI result.
 */
export function shouldShowInspectorAiAnalysis(input: {
  selectedAsset: Pick<AssetSummary, "availability" | "deletedAt" | "mediaType"> | undefined;
  selectionCount: number;
  aiContentLoaded: boolean;
  hasAiContent: boolean;
  canAnalyze: boolean;
}): boolean {
  const { selectedAsset } = input;
  return Boolean(
    input.canAnalyze
      && input.selectionCount === 1
      && input.aiContentLoaded
      && !input.hasAiContent
      && selectedAsset?.mediaType === "image"
      && selectedAsset.availability === "available"
      && selectedAsset.deletedAt === null,
  );
}
