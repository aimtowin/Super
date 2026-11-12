import { describe, expect, it } from "vitest";

import { isInteractiveBrowseCommand } from "../../src/worker/interactive-browse-commands";

describe("interactive browse command classification", () => {
  it.each([
    "asset.search",
    "asset.list",
    "folder.browse-entries",
    "collection.assets.list",
    "collection.source-browse-entries",
    "smart-collection.execute",
  ])("treats %s as a foreground browse boundary", (commandType) => {
    expect(isInteractiveBrowseCommand(commandType)).toBe(true);
  });

  it.each([
    "media.list-jobs",
    "media.get-asset-drag-infos",
    "sync.run",
    "asset.import.start",
    "library.open",
    "asset.thumbnail.visible-window",
  ])("does not treat %s as a foreground browse boundary", (commandType) => {
    expect(isInteractiveBrowseCommand(commandType)).toBe(false);
  });
});