import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import type { SuperLibraryApi } from "../../src/shared/library-api";
import { assetCard, importFilesThroughBridge, resolveElectronExecutablePath } from "./electron-test-helpers";

test.describe.configure({ timeout: 120_000 });

test("Folders heading resets only the creation parent while preview and focus stay put", async () => {
  const testInfo = test.info();
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), "super-folder-create-root-"));
  const profilePath = path.join(temporaryRoot, "profile");
  mkdirSync(profilePath);
  const sourcePath = path.join(temporaryRoot, "folder-preview.png");
  writeFileSync(sourcePath, Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64",
  ));
  const applicationDirectory = process.env.SUPER_E2E_APP_DIRECTORY ?? process.cwd();
  const application = await electron.launch({
    args: [applicationDirectory], cwd: applicationDirectory,
    executablePath: resolveElectronExecutablePath(),
    env: {
      ...process.env, SUPER_E2E: "1", SUPER_E2E_USER_DATA_PATH: profilePath,
      SUPER_E2E_CREATE_PARENT_PATH: temporaryRoot, SUPER_E2E_IMPORT_FILES: sourcePath,
    },
  });
  try {
    // Packaged builds deliberately ignore development-only dialog path overrides.
    await application.evaluate(({ dialog }, paths) => {
      dialog.showOpenDialog = async (...args: unknown[]) => {
        const options = args.at(-1) as { title?: string };
        const creating = options.title === "Create Library" || options.title === "创建资源库";
        return { canceled: false, filePaths: [creating ? paths.temporaryRoot : paths.sourcePath] };
      };
    }, { temporaryRoot, sourcePath });
    const window = await application.firstWindow();
    await window.emulateMedia({ colorScheme: "light" });
    await window.getByRole("button", { name: "创建资源库" }).click();
    await window.getByRole("textbox", { name: "名称" }).fill("新建目标回归库");
    await window.getByRole("button", { name: "创建", exact: true }).click();
    const add = window.getByRole("button", { name: "添加文件夹", exact: true });
    const heading = window.locator(".nav-section-title-action");
    const crumb = window.locator(".scope-crumb-label.is-current");
    const createFolder = async (name: string) => {
      await add.click();
      await window.getByLabel("新文件夹名称").fill(name);
      await window.getByLabel("新文件夹名称").press("Enter");
      await expect(window.getByLabel("新文件夹名称")).toHaveCount(0);
    };
    const chooseFolder = async (name: string) => {
      await window.locator(".navigation-pane .nav-row-label", { hasText: new RegExp(`^${name}$`) })
        .locator("xpath=ancestor::button[contains(@class, 'nav-row')]").click();
      await expect(crumb).toHaveText(name);
    };
    const listFolders = () => window.evaluate(async () => {
      const bridge = globalThis as typeof globalThis & { super: { library: SuperLibraryApi } };
      const opened = await bridge.super.library.listOpen();
      if (!opened.ok || !opened.value[0]) throw new Error("No open test library");
      const folders = await bridge.super.library.listFolders({ libraryId: opened.value[0].libraryId });
      if (!folders.ok) throw new Error("Cannot list test folders");
      return folders.value;
    });

    await expect(add).toBeVisible({ timeout: 15_000 });
    await createFolder("父目录");
    await chooseFolder("父目录");
    await createFolder("子目录");
    await chooseFolder("子目录");
    const child = (await listFolders()).find((folder) => folder.name === "子目录")!;

    // A native title-bar double-click must no longer reset the creation parent.
    await window.locator(".app-toolbar").dispatchEvent("dblclick", { bubbles: true });
    await expect(heading).toHaveAttribute("aria-pressed", "false");
    await expect(crumb).toHaveText("子目录");
    await createFolder("仍在子目录中");
    expect((await listFolders()).find((folder) => folder.name === "仍在子目录中")?.parentFolderId).toBe(child.folderId);

    await importFilesThroughBridge(window, "子目录");
    const card = assetCard(window, "folder-preview.png");
    await expect(card).toBeVisible({ timeout: 20_000 });
    await card.click();
    await window.keyboard.press("Space");
    const preview = window.getByRole("region", { name: "folder-preview.png 查看页面" });
    await expect(preview).toBeVisible();
    const fit = preview.getByRole("button", { name: "适应", exact: true });
    await fit.focus();
    const image = preview.locator("img.preview-image:not(.is-hidden)");
    await expect(image).toBeVisible();
    const imageSource = await image.getAttribute("src");
    const originalNode = await image.elementHandle();
    await heading.hover();
    await window.screenshot({ path: testInfo.outputPath("folder-root-hover.png") });
    // Use trailing blank space, not only the glyphs, to exercise the full hit area.
    const headingBox = await heading.boundingBox();
    await heading.click({ position: { x: headingBox!.width - 8, y: headingBox!.height / 2 } });
    await expect(heading).toHaveAttribute("aria-pressed", "true");
    await expect(fit).toBeFocused();
    await expect(crumb).toHaveText("子目录");
    await expect(preview).toBeVisible();
    await expect(image).toHaveAttribute("src", imageSource!);
    expect(await originalNode!.evaluate((element) => element.isConnected)).toBe(true);
    await window.screenshot({ path: testInfo.outputPath("folder-root-selected.png") });
    const lightBackground = await heading.evaluate((element) => getComputedStyle(element).backgroundColor);
    await window.emulateMedia({ colorScheme: "dark" });
    await expect(window.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect.poll(() => heading.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(lightBackground);
    await window.screenshot({ path: testInfo.outputPath("folder-root-selected-dark.png") });
    await window.emulateMedia({ colorScheme: "light" });
    await createFolder("新建根目录");
    expect((await listFolders()).find((folder) => folder.name === "新建根目录")?.parentFolderId).toBeNull();
    await expect(preview).toBeVisible();
    await expect(crumb).toHaveText("子目录");

    // Re-selecting a directory restores normal child creation; keyboard activation also works.
    await chooseFolder("子目录");
    await expect(heading).toHaveAttribute("aria-pressed", "false");
    await heading.focus();
    await heading.press("Enter");
    await expect(heading).toHaveAttribute("aria-pressed", "true");
    await expect(crumb).toHaveText("子目录");
  } finally {
    await application.close();
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
