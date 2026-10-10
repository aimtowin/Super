import { describe, expect, it } from "vitest";

import {
  isFolderDescendantOf,
  resolveDraggedFolderIds,
  resolveDraggedFolderIdsForTrash,
  resolveFolderOntoFolderDrop,
} from "../../src/renderer/folder-drag-drop";

const folders = [
  { folderId: "root-child", parentFolderId: null },
  { folderId: "a", parentFolderId: "root-child" },
  { folderId: "b", parentFolderId: "a" },
  { folderId: "c", parentFolderId: "b" },
] as const;

describe("resolveDraggedFolderIds (Super-nno6)", () => {
  it("drags the full folder selection when the handle is selected", () => {
    expect(resolveDraggedFolderIds("a", ["a", "b"])).toEqual(["a", "b"]);
  });

  it("drags only the handle when it is not in the selection", () => {
    expect(resolveDraggedFolderIds("c", ["a"])).toEqual(["c"]);
  });
});

describe("resolveDraggedFolderIdsForTrash", () => {
  it("trashes a selected parent once instead of retrying its descendants", () => {
    expect(
      resolveDraggedFolderIdsForTrash(["a", "b", "c", "b"], folders),
    ).toEqual(["a"]);
  });

  it("deduplicates an ancestor selection", () => {
    expect(
      resolveDraggedFolderIdsForTrash(["root-child", "a"], folders),
    ).toEqual(["root-child"]);
  });
});

describe("resolveFolderOntoFolderDrop", () => {
  it("promotes direct children only for sidebar parent drops", () => {
    for (const [source, target, expected] of [["a", "root-child", null], ["b", "a", "root-child"], ["c", "b", "a"]] as const) {
      expect(resolveFolderOntoFolderDrop({ targetFolderId: target, draggedFolderIds: [source], folders, promoteOnParentDrop: true }))
        .toEqual({ kind: "move", folderIds: [source], targetParentFolderId: expected });
    }
    expect(resolveFolderOntoFolderDrop({ targetFolderId: null, draggedFolderIds: ["root-child"], folders, promoteOnParentDrop: true }))
      .toEqual({ kind: "reject", reason: "same-parent" });
  });
  it("never promotes a partial mixed-parent selection and rejects stale IDs", () => {
    expect(resolveFolderOntoFolderDrop({ targetFolderId: "root-child", draggedFolderIds: ["a", "c"], folders, promoteOnParentDrop: true }))
      .toEqual({ kind: "move", folderIds: ["a", "c"], targetParentFolderId: "root-child" });
    expect(resolveFolderOntoFolderDrop({ targetFolderId: "gone", draggedFolderIds: ["a"], folders }))
      .toEqual({ kind: "reject", reason: "unknown-folder" });
    expect(resolveFolderOntoFolderDrop({ targetFolderId: null, draggedFolderIds: ["gone"], folders }))
      .toEqual({ kind: "reject", reason: "unknown-folder" });
  });
  it("rejects moving into the same parent", () => {
    expect(
      resolveFolderOntoFolderDrop({
        targetFolderId: "root-child",
        draggedFolderIds: ["a"],
        folders,
      }),
    ).toEqual({ kind: "reject", reason: "same-parent" });
  });

  it("rejects moving into self or descendants", () => {
    expect(
      resolveFolderOntoFolderDrop({
        targetFolderId: "a",
        draggedFolderIds: ["a"],
        folders,
      }),
    ).toEqual({ kind: "reject", reason: "into-self" });

    expect(
      resolveFolderOntoFolderDrop({
        targetFolderId: "c",
        draggedFolderIds: ["a"],
        folders,
      }),
    ).toEqual({ kind: "reject", reason: "into-descendant" });
  });

  it("accepts a valid reparent", () => {
    expect(
      resolveFolderOntoFolderDrop({
        targetFolderId: "root-child",
        draggedFolderIds: ["c"],
        folders,
      }),
    ).toEqual({
      kind: "move",
      folderIds: ["c"],
      targetParentFolderId: "root-child",
    });
  });
});

describe("isFolderDescendantOf", () => {
  it("terminates on corrupt cycles", () => {
    expect(isFolderDescendantOf([{ folderId: "x", parentFolderId: "y" }, { folderId: "y", parentFolderId: "x" }], "absent", "x")).toBe(false);
  });
  it("detects ancestor relationships", () => {
    expect(isFolderDescendantOf(folders, "a", "c")).toBe(true);
    expect(isFolderDescendantOf(folders, "c", "a")).toBe(false);
  });
});
