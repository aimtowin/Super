import { describe, expect, it } from "vitest";

import { shouldClearFolderScopeFromToolbarDoubleClick } from "../../src/renderer/toolbar-root-scope";

describe("shouldClearFolderScopeFromToolbarDoubleClick", () => {
  it("treats a passive toolbar surface as a double-click request to leave the selected folder", () => {
    const surface = {
      closest: () => null,
    } as unknown as EventTarget;
    expect(shouldClearFolderScopeFromToolbarDoubleClick(surface)).toBe(true);
  });

  it("keeps toolbar controls on their existing paths", () => {
    const search = {
      closest: () => ({}) as Element,
    } as unknown as EventTarget;
    const command = {
      closest: () => ({}) as Element,
    } as unknown as EventTarget;

    expect(shouldClearFolderScopeFromToolbarDoubleClick(search)).toBe(false);
    expect(shouldClearFolderScopeFromToolbarDoubleClick(command)).toBe(false);
  });

  it("does not act on a non-element target", () => {
    expect(shouldClearFolderScopeFromToolbarDoubleClick(null)).toBe(false);
  });
});
