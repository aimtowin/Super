// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  NavigationSidebar,
  type NavigationSidebarProps,
} from "../../src/renderer/NavigationSidebar";
import { LocaleProvider } from "../../src/renderer/i18n";
import type { ContextMenuDescriptor } from "../../src/renderer/context-menu";
import { emojiKey, emojiStorageKey } from "../../src/renderer/sidebar-emoji-preferences";
import * as emojiPreferences from "../../src/renderer/sidebar-emoji-preferences";

function createNavigationProps(
  overrides: Partial<NavigationSidebarProps> = {},
): NavigationSidebarProps {
  const noop = vi.fn();
  return {
    library: {
      libraryId: "library-1",
      displayName: "Demo",
      displayPath: "/temporary/demo",
    },
    assetScope: "root",
    showTrash: false,
    showTagManagement: false,
    activeTagId: null,
    activeCollectionId: null,
    activeSmartCollectionId: null,
    showIgnoredItems: false,
    onToggleShowIgnoredItems: noop,
    allAssetCount: 7,
    rootAssetCount: 2,
    trashedAssetCount: 0,
    folders: [],
    collections: [],
    collectionTree: new Map(),
    smartCollections: [],
    linkedFolders: [],
    showCollectionInput: false,
    collectionInputValue: "",
    newCollectionParentId: null,
    inlineCollectionRename: null,
    draggedCollectionId: null,
    onSetDraggedCollectionId: noop,
    onChooseAllAssets: noop,
    onEnterTrash: noop,
    onEnterTagManagement: noop,
    onChooseFolder: noop,
    onResetFolderCreateParent: noop,
    onChooseCollection: noop,
    onChooseSmartCollection: noop,
    onExternalDragOver: noop,
    onExternalDrop: noop,
    onAssetsDroppedOnFolder: noop,
    onFoldersDroppedOnFolder: noop,
    selectedFolderIds: [],
    onAssetsDroppedOnTrash: noop,
    onFoldersDroppedOnTrash: noop,
    onAssetsDroppedOnCollection: noop,
    onImportFolderAsLinked: noop,
    onRelinkFolder: noop,
    onConvertLinkedDialog: noop,
    onAddCollection: noop,
    onSetShowCollectionInput: noop,
    onSetCollectionInputValue: noop,
    onSetNewCollectionParentId: noop,
    onCollectionInputCommit: noop,
    onInlineCollectionRenameChange: noop,
    onInlineCollectionRenameCommit: noop,
    onInlineCollectionRenameCancel: noop,
    onAddFolder: noop,
    onAddSmartCollection: noop,
    inlineFolderEdit: null,
    onInlineFolderEditChange: noop,
    onInlineFolderEditCommit: noop,
    onInlineFolderEditCancel: noop,
    inlineSmartCollectionEdit: null,
    onInlineSmartCollectionEditChange: noop,
    onInlineSmartCollectionEditCommit: noop,
    onInlineSmartCollectionEditCancel: noop,
    onOpenContextMenu: noop,
    onReorderCollection: noop,
    onImportDroppedFiles: noop,
    onCopyManagedToLinked: noop,
    ...overrides,
  };
}

describe("NavigationSidebar emoji icons", () => {
  let root: Root;
  let container: HTMLDivElement;
  const collection = { collectionId: "c", name: "Collection", parentId: null, description: null, coverAssetId: null, position: 0, assetCount: 0, childCollectionCount: 0 };
  function props() {
    return createNavigationProps({
      folders: [{ folderId: "f", name: "Folder", relativePath: "Folder", parentFolderId: null, directAssetCount: 0, childFolderCount: 0 }],
      collections: [collection], collectionTree: new Map([[null, [collection]]]),
      smartCollections: [{ collectionId: "s", name: "Smart", queryDefinition: "{}", position: 0, assetCount: 0 }],
      linkedFolders: [
        { folderId: "l", displayName: "Linked", relativePath: "", absoluteRootPath: "C:/linked", status: "offline", assetCount: 0 },
        { folderId: "lc", displayName: "Child", relativePath: "Child", linkedFolderId: "l", parentFolderId: "l", absoluteRootPath: "C:/linked", status: "offline", assetCount: 0 },
      ],
      onOpenContextMenu: vi.fn(),
    });
  }
  async function render(p: NavigationSidebarProps) {
    if (!container) {
      container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    }
    await act(async () => root.render(createElement(LocaleProvider, { initialPreference: "en", children: createElement(NavigationSidebar, p) })));
  }
  function row(name: string) {
    return [...container.querySelectorAll<HTMLButtonElement>(".nav-row")].find(item => item.querySelector(".nav-row-label")?.textContent === name)!;
  }
  async function open(name: string, p: NavigationSidebarProps) {
    await act(async () => row(name).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
    const descriptor = vi.mocked(p.onOpenContextMenu).mock.lastCall?.[0] as ContextMenuDescriptor;
    expect(descriptor).toHaveProperty("onCustomizeEmoji");
    if ("onCustomizeEmoji" in descriptor) await act(async () => descriptor.onCustomizeEmoji?.());
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  }
  async function click(label: string) {
    const button = [...document.querySelectorAll<HTMLButtonElement>("#sidebar-emoji button")].find(item => item.textContent === label)!;
    expect(button).toBeDefined();
    await act(async () => button.click());
  }
  afterEach(async () => {
    await act(async () => root?.unmount());
    container?.remove();
    container = undefined as unknown as HTMLDivElement;
    localStorage.clear(); vi.restoreAllMocks();
  });
  it.each(["Folder", "Linked", "Child", "Collection", "Smart"])("sets and resets %s without navigating", async name => {
    const p = props(); await render(p); await open(name, p);
    await click("🎨");
    expect(row(name).querySelector(".sidebar-emoji-glyph")).toBeNull();
    await click("Save");
    expect(row(name).querySelector(".sidebar-emoji-glyph")?.textContent).toBe("🎨");
    expect(p.onChooseFolder).not.toHaveBeenCalled();
    expect(p.onChooseCollection).not.toHaveBeenCalled();
    if (name === "Linked" || name === "Child") expect(row(name).querySelector(".sidebar-emoji-link-badge svg")).not.toBeNull();
    if (name === "Child") expect(row("Linked").querySelector(".sidebar-emoji-glyph")).toBeNull();
    await open(name, p); await click("Restore default");
    expect(row(name).querySelector(".sidebar-emoji-glyph")).toBeNull();
  });
  it("persists after remount and rename; isolates library switches and closes stale editors", async () => {
    const p = props(); await render(p); await open("Folder", p); await click("📚"); await click("Save");
    await act(async () => root.unmount()); root = createRoot(container);
    p.folders[0] = { ...p.folders[0]!, name: "Renamed" };
    await render(p); expect(row("Renamed").querySelector(".sidebar-emoji-glyph")?.textContent).toBe("📚");
    await open("Renamed", p);
    await render({ ...p, library: { ...p.library!, libraryId: "other" } });
    expect(document.querySelector("#sidebar-emoji")).toBeNull();
    expect(row("Renamed").querySelector(".sidebar-emoji-glyph")).toBeNull();
    await render(p); expect(document.querySelector("#sidebar-emoji")).toBeNull();
    expect(row("Renamed").querySelector(".sidebar-emoji-glyph")?.textContent).toBe("📚");
  });
  it("cancel and Escape do not write; save errors keep the editor open", async () => {
    const p = props(); await render(p); await open("Folder", p); await click("🔥"); await click("Cancel");
    expect(localStorage.getItem(emojiStorageKey("library-1"))).toBeNull();
    await open("Folder", p);
    await act(async () => document.querySelector("#sidebar-emoji-input")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.querySelector("#sidebar-emoji")).toBeNull();
    await open("Folder", p); await click("🌍");
    vi.spyOn(emojiPreferences, "saveEmojiPreference").mockImplementation(() => { throw new Error("quota"); });
    await click("Save");
    expect(document.querySelector("#sidebar-emoji-message")?.textContent).toContain("Could not save");
    expect(document.querySelector("#sidebar-emoji")).not.toBeNull();
    expect(row("Folder").querySelector(".sidebar-emoji-glyph")).toBeNull();
  });
  it("reacts to another window updating local preferences", async () => {
    const p = props(); await render(p);
    await act(async () => {
      localStorage.setItem(emojiStorageKey("library-1"), JSON.stringify({ [emojiKey("folder", "f")]: "🇨🇳" }));
      window.dispatchEvent(new Event("storage"));
    });
    expect(row("Folder").querySelector(".sidebar-emoji-glyph")?.textContent).toBe("🇨🇳");
  });
});

describe("NavigationSidebar virtual library root", () => {
  let root: Root | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    root?.unmount();
    root = undefined;
    container?.remove();
    container = undefined;
  });

  it("resets only the creation parent and preserves mouse focus", async () => {
    const onResetFolderCreateParent = vi.fn();
    const onChooseFolder = vi.fn();
    const props = createNavigationProps({ assetScope: "child", onResetFolderCreateParent, onChooseFolder });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(createElement(LocaleProvider, null, createElement(NavigationSidebar, props))));
    const button = container.querySelector<HTMLButtonElement>(".nav-section-title-action");
    expect(button).not.toBeNull();
    expect(button?.getAttribute("aria-pressed")).toBe("false");
    const focusTarget = document.createElement("input");
    container.append(focusTarget);
    focusTarget.focus();
    const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 });
    button?.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    await act(async () => button?.click());
    expect(document.activeElement).toBe(focusTarget);
    expect(onResetFolderCreateParent).toHaveBeenCalledOnce();
    expect(onChooseFolder).not.toHaveBeenCalled();
    expect(props.onChooseAllAssets).not.toHaveBeenCalled();
  });

  it("marks the root creation target and isolates neighboring icon actions", async () => {
    const onResetFolderCreateParent = vi.fn();
    const onAddFolder = vi.fn();
    const onImportFolderAsLinked = vi.fn();
    const onToggleShowIgnoredItems = vi.fn();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(createElement(LocaleProvider, null, createElement(NavigationSidebar, createNavigationProps({
      onResetFolderCreateParent, onAddFolder, onImportFolderAsLinked, onToggleShowIgnoredItems,
    })))));
    const button = container.querySelector<HTMLButtonElement>(".nav-section-title-action");
    expect(button?.getAttribute("aria-pressed")).toBe("true");
    const icons = button?.closest(".nav-section-heading")?.querySelectorAll<HTMLButtonElement>(".nav-section-actions button");
    expect(icons?.length).toBe(3);
    await act(async () => icons?.forEach(icon => icon.click()));
    expect(onAddFolder).toHaveBeenCalledOnce();
    expect(onImportFolderAsLinked).toHaveBeenCalledOnce();
    expect(onToggleShowIgnoredItems).toHaveBeenCalledOnce();
    expect(onResetFolderCreateParent).not.toHaveBeenCalled();
  });

  it("disables root creation selection without an open library", async () => {
    const onResetFolderCreateParent = vi.fn();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(createElement(LocaleProvider, null, createElement(NavigationSidebar, createNavigationProps({
      library: null, onResetFolderCreateParent,
    })))));
    const button = container.querySelector<HTMLButtonElement>(".nav-section-title-action");
    expect(button?.disabled).toBe(true);
    await act(async () => button?.click());
    expect(onResetFolderCreateParent).not.toHaveBeenCalled();
  });

  it("renders one selectable root row with its direct-asset count", async () => {
    const onChooseFolder = vi.fn();
    const props = createNavigationProps({ onChooseFolder });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        createElement(
          LocaleProvider,
          null,
          createElement(NavigationSidebar, props),
        ),
      );
    });

    const rows = [...container.querySelectorAll<HTMLButtonElement>(".nav-row")];
    const rootRows = rows.filter((row) => (row.textContent ?? "").includes("Library root"));
    expect(rootRows).toHaveLength(1);
    expect(rootRows[0]?.classList.contains("is-active")).toBe(true);
    expect(rootRows[0]?.textContent).toContain("2");

    await act(async () => rootRows[0]?.click());
    expect(onChooseFolder).toHaveBeenCalledWith("root");
  });

  it("keeps nested folder and collection rows aligned with long labels and counts", async () => {
    const onChooseFolder = vi.fn();
    const onChooseCollection = vi.fn();
    const parentFolderName = "A very long parent folder name that must stay on one row";
    const childFolderName = "A deeply nested child folder with a long display name";
    const parentCollectionName = "A long parent collection name with many characters";
    const childCollectionName = "A long nested collection name with many characters";
    const parentFolderId = "folder-parent";
    const childFolderId = "folder-child";
    const parentCollectionId = "collection-parent";
    const childCollectionId = "collection-child";
    const parentCollection = {
      collectionId: parentCollectionId,
      parentId: null,
      name: parentCollectionName,
      description: null,
      coverAssetId: null,
      position: 0,
      assetCount: 4,
      childCollectionCount: 1,
    };
    const childCollection = {
      collectionId: childCollectionId,
      parentId: parentCollectionId,
      name: childCollectionName,
      description: null,
      coverAssetId: null,
      position: 0,
      assetCount: 2,
      childCollectionCount: 0,
    };
    const props = createNavigationProps({
      activeCollectionId: childCollectionId,
      folders: [
        {
          folderId: parentFolderId,
          parentFolderId: null,
          name: parentFolderName,
          relativePath: "parent",
          directAssetCount: 3,
          childFolderCount: 1,
        },
        {
          folderId: childFolderId,
          parentFolderId: parentFolderId,
          name: childFolderName,
          relativePath: "parent/child",
          directAssetCount: 5,
          childFolderCount: 0,
        },
      ],
      collections: [parentCollection, childCollection],
      collectionTree: new Map([
        [null, [parentCollection]],
        [parentCollectionId, [childCollection]],
      ]),
      onChooseFolder,
      onChooseCollection,
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        createElement(
          LocaleProvider,
          null,
          createElement(NavigationSidebar, props),
        ),
      );
    });

    const folderRows = [
      ...container.querySelectorAll<HTMLButtonElement>(
        'button[data-nav-folder-kind="managed"]',
      ),
    ];
    expect(folderRows).toHaveLength(2);
    const parentFolderRow = folderRows.find(
      (row) => row.dataset.navFolderId === parentFolderId,
    );
    const childFolderRow = folderRows.find(
      (row) => row.dataset.navFolderId === childFolderId,
    );
    expect(parentFolderRow?.querySelector(".nav-row-label")?.textContent).toBe(
      parentFolderName,
    );
    expect(childFolderRow?.querySelector(".nav-row-label")?.textContent).toBe(
      childFolderName,
    );
    expect(parentFolderRow?.title).toBe(parentFolderName);
    expect(childFolderRow?.title).toBe(childFolderName);
    expect(parentFolderRow?.style.paddingLeft).toBe("21px");
    expect(childFolderRow?.style.paddingLeft).toBe("35px");
    expect(
      parentFolderRow?.closest(".nav-tree-row")?.querySelector(".nav-disclosure"),
    ).not.toBeNull();
    expect(
      childFolderRow?.closest(".nav-tree-row")?.querySelector(".nav-disclosure-spacer"),
    ).not.toBeNull();
    expect(parentFolderRow?.querySelector(".nav-count")?.textContent).toBe("3");
    expect(childFolderRow?.querySelector(".nav-count")?.textContent).toBe("5");

    const collectionRows = [
      ...container.querySelectorAll<HTMLButtonElement>(
        "button[data-nav-collection-id]",
      ),
    ];
    expect(collectionRows).toHaveLength(2);
    const parentCollectionRow = collectionRows.find(
      (row) => row.dataset.navCollectionId === parentCollectionId,
    );
    const childCollectionRow = collectionRows.find(
      (row) => row.dataset.navCollectionId === childCollectionId,
    );
    expect(parentCollectionRow?.title).toBe(parentCollectionName);
    expect(childCollectionRow?.title).toBe(childCollectionName);
    expect(parentCollectionRow?.style.paddingLeft).toBe("7px");
    expect(childCollectionRow?.style.paddingLeft).toBe("21px");
    expect(parentCollectionRow?.classList.contains("is-active")).toBe(false);
    expect(childCollectionRow?.classList.contains("is-active")).toBe(true);
    expect(parentCollectionRow?.querySelectorAll(".nav-count")).toHaveLength(1);
    expect(parentCollectionRow?.textContent).toContain("4");
    expect(parentCollectionRow?.textContent).not.toContain("1");
    expect(childCollectionRow?.querySelector(".nav-count")?.textContent).toBe("2");

    await act(async () => childCollectionRow?.click());
    await act(async () => childFolderRow?.click());
    expect(onChooseCollection).toHaveBeenCalledWith(childCollectionId);
    expect(onChooseFolder).toHaveBeenCalledWith(childFolderId);
  });

  it("reserves one trailing grid column for the asset count", () => {
    const styles = readFileSync(
      resolve(process.cwd(), "src/renderer/styles.css"),
      "utf8",
    );

    expect(styles).toMatch(
      /\.nav-row\s*\{[\s\S]*?grid-template-columns:\s*17px minmax\(0, 1fr\) auto;/,
    );
    expect(styles).not.toContain(".nav-child-count");
  });

  it("collapses and expands collection children via the disclosure button (Super-c42eb1)", async () => {
    const parentId = "collection-parent";
    const childId = "collection-child";
    const parentCollection = {
      collectionId: parentId,
      parentId: null,
      name: "Parent",
      description: null,
      coverAssetId: null,
      position: 0,
      assetCount: 4,
      childCollectionCount: 1,
    };
    const childCollection = {
      collectionId: childId,
      parentId,
      name: "Child",
      description: null,
      coverAssetId: null,
      position: 0,
      assetCount: 2,
      childCollectionCount: 0,
    };
    const props = createNavigationProps({
      collections: [parentCollection, childCollection],
      collectionTree: new Map([
        [null, [parentCollection]],
        [parentId, [childCollection]],
      ]),
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        createElement(
          LocaleProvider,
          { children: null, initialPreference: "zh-CN" },
          createElement(NavigationSidebar, props),
        ),
      );
    });

    const rows = () => [
      ...(container as HTMLDivElement).querySelectorAll<HTMLButtonElement>(
        "button[data-nav-collection-id]",
      ),
    ];
    // Both rows visible initially (expanded).
    expect(rows().map((row) => row.dataset.navCollectionId)).toEqual([
      parentId,
      childId,
    ]);

    // Parent row exposes a disclosure button with the chevron icon.
    const parentRow = rows().find(
      (row) => row.dataset.navCollectionId === parentId,
    );
    const disclosure = parentRow
      ? [...(container as HTMLDivElement).querySelectorAll<HTMLButtonElement>(".nav-disclosure")]
          .find((button) =>
            button.getAttribute("aria-label")?.includes("Parent"),
          )
      : undefined;
    expect(disclosure).toBeDefined();
    expect(disclosure?.getAttribute("aria-expanded")).toBe("true");

    // Collapse: child row disappears, disclosure flips to collapsed.
    await act(async () => disclosure?.click());
    expect(rows().map((row) => row.dataset.navCollectionId)).toEqual([
      parentId,
    ]);
    const collapsedDisclosure = [
      ...(container as HTMLDivElement).querySelectorAll<HTMLButtonElement>(".nav-disclosure"),
    ].find((button) => button.getAttribute("aria-label")?.includes("Parent"));
    expect(collapsedDisclosure?.getAttribute("aria-expanded")).toBe("false");

    // Expand: child row returns.
    await act(async () => collapsedDisclosure?.click());
    expect(rows().map((row) => row.dataset.navCollectionId)).toEqual([
      parentId,
      childId,
    ]);
  });
});
