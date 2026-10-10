import { isFolderDescendantOf } from "./folder-drag-drop";

export interface CollectionDragFact { collectionId: string; parentId: string | null; }
export function resolveCollectionDrop(collections: readonly CollectionDragFact[], sourceId: string, targetId: string | null):
  | { kind: "move"; parentId: string | null }
  | { kind: "reorder"; targetId: string }
  | { kind: "reject" } {
  const source = collections.find(item => item.collectionId === sourceId);
  const target = collections.find(item => item.collectionId === targetId);
  if (!source || sourceId === targetId || (targetId !== null && !target)) return { kind: "reject" };
  const facts = collections.map(item => ({ folderId: item.collectionId, parentFolderId: item.parentId }));
  if (targetId !== null && isFolderDescendantOf(facts, sourceId, targetId)) return { kind: "reject" };
  if (target && source.parentId === target.parentId) return { kind: "reorder", targetId: target.collectionId };
  const parentId = target && source.parentId === target.collectionId ? target.parentId : targetId;
  if (source.parentId === parentId || parentId === sourceId || (parentId !== null && isFolderDescendantOf(facts, sourceId, parentId))) return { kind: "reject" };
  return { kind: "move", parentId };
}
