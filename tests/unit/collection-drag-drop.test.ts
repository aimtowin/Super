import { describe, expect, it } from "vitest";
import { resolveCollectionDrop } from "../../src/renderer/collection-drag-drop";
const items = [
  { collectionId: "p", parentId: null }, { collectionId: "q", parentId: null },
  { collectionId: "c", parentId: "p" }, { collectionId: "d", parentId: "c" },
];
describe("sidebar collection hierarchy", () => {
  it("promotes a direct child alongside its parent", () => {
    expect(resolveCollectionDrop(items, "c", "p")).toEqual({ kind: "move", parentId: null });
    expect(resolveCollectionDrop(items, "d", "c")).toEqual({ kind: "move", parentId: "p" });
  });
  it("moves to root or another branch but retains same-level ordering", () => {
    expect(resolveCollectionDrop(items, "d", null)).toEqual({ kind: "move", parentId: null });
    expect(resolveCollectionDrop(items, "c", "q")).toEqual({ kind: "move", parentId: "q" });
    expect(resolveCollectionDrop(items, "p", "q")).toEqual({ kind: "reorder", targetId: "q" });
  });
  it("rejects missing, same-place, self and descendant targets", () => {
    for (const [source, target] of [["p", null], ["p", "d"], ["p", "p"], ["missing", "p"], ["c", "missing"]]) {
      expect(resolveCollectionDrop(items, source!, target!)).toEqual({ kind: "reject" });
    }
  });
});
