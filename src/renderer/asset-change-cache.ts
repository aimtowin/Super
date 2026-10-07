type ArtifactCache = { libraryId: string; ids: Map<string, string> };

/** Unknown/legacy changes retain full invalidation; known IDs keep other covers. */
export function invalidateChangedAssetArtifacts(
  current: ArtifactCache,
  event: { libraryId: string; assetIds?: readonly string[] },
): ArtifactCache {
  if (current.libraryId !== event.libraryId || current.ids.size === 0) return current;
  if (!event.assetIds?.length) return { libraryId: current.libraryId, ids: new Map() };
  if (!event.assetIds.some((id) => current.ids.has(id))) return current;
  const ids = new Map(current.ids);
  for (const id of event.assetIds) ids.delete(id);
  return { libraryId: current.libraryId, ids };
}
