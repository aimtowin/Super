import { _electron as electron, expect, test } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import type { SuperLibraryApi } from "../../src/shared/library-api";
import { resolveElectronExecutablePath } from "./electron-test-helpers";

test.describe.configure({ timeout: 120_000 });

for (const scope of ["all", "filtered", "smart-collection", "draft-smart-collection"] as const) {
  test(`keeps fullscreen preview during background refresh in ${scope}`, async () => {
    const root = mkdtempSync(path.join(tmpdir(), "super-preview-refresh-"));
    const source = path.join(root, "preview-refresh.png");
    await sharp({ create: { width: 800, height: 600, channels: 3, background: "#4288aa" } }).png().toFile(source);
    const applicationDirectory = process.env.SUPER_E2E_APP_DIRECTORY ?? process.cwd();
    const packagedExecutable = process.env.SUPER_E2E_PACKAGED_EXECUTABLE;
    const application = await electron.launch({
      executablePath: packagedExecutable ?? resolveElectronExecutablePath(),
      args: packagedExecutable ? [] : [applicationDirectory],
      cwd: applicationDirectory,
      env: {
        ...process.env,
        SUPER_E2E: "1",
        SUPER_E2E_CREATE_PARENT_PATH: root,
        SUPER_E2E_USER_DATA_PATH: path.join(root, "user-data"),
        SUPER_E2E_IMPORT_FILES: source,
      },
    });
    try {
      // Packaged builds do not use the development native-picker overrides.
      await application.evaluate(({ dialog }, paths) => {
        dialog.showOpenDialog = async (...args: unknown[]) => {
          const options = args.at(-1) as { properties?: string[] };
          return {
            canceled: false,
            filePaths: [options.properties?.includes("openDirectory") ? paths.root : paths.source],
          };
        };
      }, { root, source });
      const page = await application.firstWindow();
      await page.getByRole("button", { name: "跳过引导", exact: true }).click();
      await page.getByRole("button", { name: "创建资源库", exact: true }).click();
      await page.getByRole("textbox", { name: "名称", exact: true }).fill("预览刷新验收");
      await page.getByRole("button", { name: "创建", exact: true }).click();
      await page.getByRole("button", { name: "导入文件", exact: true }).first().click();
      const card = page.locator(".asset-card").filter({ hasText: "preview-refresh.png" });
      await expect(card).toBeVisible();
      const libraryId = await page.evaluate(async () => {
        const api = (window as unknown as { super: { library: SuperLibraryApi } }).super.library;
        const result = await api.listOpen();
        if (!result.ok || !result.value[0]) throw new Error("Missing library");
        return result.value[0].libraryId;
      });
      if (scope === "smart-collection" || scope === "draft-smart-collection") {
        await page.evaluate(async ({ libraryId, draft }) => {
          const api = (window as unknown as { super: { library: SuperLibraryApi } }).super.library;
          const result = await api.createSmartCollection({
            libraryId, name: "图片智能合集",
            queryDefinitionJson: draft ? "{}" : JSON.stringify({ filters: [{ field: "format", values: ["png"], exclude: false }] }),
          });
          if (!result.ok) throw new Error("Cannot create smart collection");
        }, { libraryId, draft: scope === "draft-smart-collection" });
        await page.getByRole("button", { name: /所有资产/ }).click();
        await page.getByRole("button", { name: /图片智能合集/ }).click();
        if (scope === "draft-smart-collection") {
          await expect(card).toHaveCount(0);
          await application.evaluate(({ BrowserWindow }, libraryId) => {
            BrowserWindow.getAllWindows().find((entry) => entry.isVisible())!.webContents.send("super:asset:changed", {
              type: "asset.changed", libraryId, source: "watcher", changedCount: 1, missingCount: 0,
            });
          }, libraryId);
          await page.waitForTimeout(1_200);
          await expect(card).toHaveCount(0);
        }
      }
      if (scope === "filtered" || scope === "draft-smart-collection") {
        await page.getByLabel("搜索资源库", { exact: true }).fill("preview-refresh");
      }
      // Let the user's discovery debounce settle before opening the viewer.
      await page.waitForTimeout(800);
      await card.click();
      await page.keyboard.press("Space");
      const viewer = page.locator(".workspace-viewer");
      await expect(viewer.locator("img.preview-image:not(.is-hidden)")).toBeVisible();
      await viewer.getByRole("button", { name: "全屏", exact: true }).click();
      await expect.poll(() => page.evaluate(() => document.fullscreenElement?.classList.contains("workspace-viewer"))).toBe(true);
      const originalViewer = await viewer.elementHandle();
      const assetId = await card.getAttribute("data-asset-id");
      expect(assetId).toBeTruthy();
      const events = [
        { channel: "super:asset:changed", payload: { type: "asset.changed", libraryId, source: "watcher", changedCount: 1, missingCount: 0 } },
        { channel: "super:ai:completed", payload: { type: "ai.analysis.completed", libraryId, assetId, fieldCount: 1, tagCount: 0 } },
        { channel: "super:ai:cleared", payload: { type: "ai.content.cleared", libraryId, affectedAssetCount: 1, affectedAssetIds: [assetId] } },
        { channel: "super:asset:changed", payload: { type: "asset.changed", libraryId, source: "text-save", changedCount: 1, missingCount: 0 } },
      ];
      for (const event of events) {
        await application.evaluate(({ BrowserWindow }, event) => {
          BrowserWindow.getAllWindows().find((entry) => entry.isVisible())!.webContents.send(event.channel, event.payload);
        }, event);
        // Cover the 300ms watcher debounce and subsequent 200ms discovery debounce.
        await page.waitForTimeout(1_200);
        expect(await originalViewer!.evaluate((element) => element.isConnected && document.fullscreenElement === element), event.channel).toBe(true);
        await expect(viewer.locator("img.preview-image:not(.is-hidden)")).toBeVisible();
      }
      await page.evaluate(() => document.exitFullscreen());
      // A regular (non-fullscreen) viewer must also survive a refresh.
      await application.evaluate(({ BrowserWindow }, event) => {
        BrowserWindow.getAllWindows().find((entry) => entry.isVisible())!.webContents.send(event.channel, event.payload);
      }, events[0]!);
      await page.waitForTimeout(1_200);
      expect(await originalViewer!.evaluate((element) => element.isConnected)).toBe(true);
      await page.keyboard.press("Escape");
      await expect(viewer).toHaveCount(0);
      await expect(card).toBeVisible();
      await expect(card).toHaveAttribute("aria-pressed", "true");
      if (scope === "filtered" || scope === "draft-smart-collection") {
        await expect(page.getByLabel("搜索资源库", { exact: true })).toHaveValue("preview-refresh");
      }
      if (scope === "smart-collection" || scope === "draft-smart-collection") {
        await expect(page.getByRole("button", { name: /图片智能合集/ })).toHaveClass(/is-active/);
      }
      if (scope === "filtered") {
        // Genuine user query changes must still execute after background refresh.
        await page.getByLabel("搜索资源库", { exact: true }).fill("no-matching-asset");
        await expect(card).toHaveCount(0);
        await page.getByLabel("搜索资源库", { exact: true }).fill("");
        await expect(card).toBeVisible();
      }
    } finally {
      await application.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
}
