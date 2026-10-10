import type { AssetSummary } from "../shared/asset-types";

/** A focused card owns Enter/Space even before its click selection commits. */
export function resolvePreviewKeyboardAsset(
  focusedAssetId: string | undefined,
  selectedAsset: AssetSummary | undefined,
  visibleAssets: readonly AssetSummary[],
): AssetSummary | undefined {
  const asset = focusedAssetId === undefined ? selectedAsset
    : visibleAssets.find(candidate => candidate.assetId === focusedAssetId);
  return asset?.availability === "available" && !asset.deletedAt ? asset : undefined;
}
