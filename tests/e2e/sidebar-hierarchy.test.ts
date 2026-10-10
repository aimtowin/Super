import { _electron as electron, expect, test } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SuperLibraryApi } from "../../src/shared/library-api";
import { resolveElectronExecutablePath } from "./electron-test-helpers";

test("sidebar direct-parent folder/collection drops promote to root through the real bridge", async () => {
  test.setTimeout(90_000);
  const root = mkdtempSync(path.join(tmpdir(), "super-sidebar-hierarchy-"));
  const app = await electron.launch({ executablePath: resolveElectronExecutablePath(), args: [process.cwd()],
    env: { ...process.env, SUPER_E2E: "1", SUPER_E2E_USER_DATA_PATH: path.join(root, "user-data"), SUPER_E2E_CREATE_PARENT_PATH: root } });
  try {
    await app.evaluate(({ dialog }, parent) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [parent] }); }, root);
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "跳过引导", exact: true }).click();
    await page.getByRole("button", { name: "创建资源库", exact: true }).click();
    await page.getByRole("textbox", { name: "名称", exact: true }).fill("Hierarchy Test");
    await page.getByRole("button", { name: "创建", exact: true }).click();
    const ids = await page.evaluate(async () => {
      const api = (globalThis as typeof globalThis & { super: { library: SuperLibraryApi } }).super.library;
      const opened = await api.listOpen(); if (!opened.ok || !opened.value[0]) throw Error("No library");
      const libraryId = opened.value[0].libraryId;
      const folder = await api.createFolder({ libraryId, name: "Parent folder" }); if (!folder.ok) throw Error(folder.error.code);
      const child = await api.createFolder({ libraryId, name: "Child folder", parentFolderId: folder.value.folderId }); if (!child.ok) throw Error(child.error.code);
      const parent = await api.createCollection({ libraryId, name: "Parent collection" }); if (!parent.ok) throw Error(parent.error.code);
      const collection = await api.createCollection({ libraryId, name: "Child collection", parentId: parent.value.collectionId }); if (!collection.ok) throw Error(collection.error.code);
      return { libraryId, folder: folder.value.folderId, child: child.value.folderId, parent: parent.value.collectionId, collection: collection.value.collectionId };
    });
    // Reload only the disposable renderer to acquire bridge-created rows.
    await page.reload();
    const folder = page.locator(`[data-nav-folder-id="${ids.folder}"]`);
    await expect(folder).toBeVisible();
    const transfer = await page.evaluateHandle(() => new DataTransfer());
    await page.evaluate(({ id, data }) => data.setData("application/x-super-managed-folders", JSON.stringify([id])), { id: ids.child, data: transfer });
    await folder.dispatchEvent("dragover", { dataTransfer: transfer });
    await folder.dispatchEvent("drop", { dataTransfer: transfer });
    await expect.poll(() => page.evaluate(async ({ libraryId, child }) => {
      const api = (globalThis as typeof globalThis & { super: { library: SuperLibraryApi } }).super.library;
      const listed = await api.listFolders({ libraryId }); return listed.ok ? listed.value.find(f => f.folderId === child)?.parentFolderId : "error";
    }, ids)).toBeNull();
    const parentRow = page.locator(`[data-nav-collection-id="${ids.parent}"]`);
    if (await page.getByRole("button", { name: "展开 Parent collection", exact: true }).count()) await page.getByRole("button", { name: "展开 Parent collection", exact: true }).click();
    const childRow = page.locator(`[data-nav-collection-id="${ids.collection}"]`);
    await expect(childRow).toBeVisible();
    await childRow.dispatchEvent("dragstart", { dataTransfer: transfer });
    await parentRow.dispatchEvent("dragover", { dataTransfer: transfer });
    await parentRow.dispatchEvent("drop", { dataTransfer: transfer });
    await expect.poll(() => page.evaluate(async ({ libraryId, collection }) => {
      const api = (globalThis as typeof globalThis & { super: { library: SuperLibraryApi } }).super.library;
      const listed = await api.listCollections({ libraryId }); return listed.ok ? listed.value.find(c => c.collectionId === collection)?.parentId : "error";
    }, ids)).toBeNull();
    await page.screenshot({ path: test.info().outputPath("sidebar-promoted.png") });
  } finally { await app.close(); }
});
