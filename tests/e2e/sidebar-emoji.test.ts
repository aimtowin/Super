import { _electron as electron, expect, test } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveElectronExecutablePath } from "./electron-test-helpers";

test("sidebar Emoji picker persists, resets and respects modal keyboard interactions", async () => {
  const testInfo = test.info();
  test.setTimeout(120_000);
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), "super-sidebar-emoji-"));
  const packagedExecutable = process.env.SUPER_E2E_PACKAGED_EXECUTABLE;
  const launch = async () => {
    const application = await electron.launch({
    args: packagedExecutable ? [] : [process.cwd()], executablePath: packagedExecutable ?? resolveElectronExecutablePath(),
    env: { ...process.env, SUPER_E2E: "1", SUPER_E2E_CREATE_PARENT_PATH: temporaryRoot,
      SUPER_E2E_OPEN_LIBRARY_PATH: path.join(temporaryRoot, "Emoji Test"),
      SUPER_E2E_USER_DATA_PATH: path.join(temporaryRoot, "user-data") },
    });
    await application.evaluate(({ dialog }, paths) => {
      dialog.showOpenDialog = async (...args: unknown[]) => {
        const options = args.at(-1) as { title?: string };
        const creating = options.title === "Create Library" || options.title === "创建资源库";
        return { canceled: false, filePaths: [creating ? paths.parent : paths.library] };
      };
    }, { parent: temporaryRoot, library: path.join(temporaryRoot, "Emoji Test") });
    return application;
  };
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await page.getByRole("button", { name: "跳过引导", exact: true }).click();
    await page.getByRole("button", { name: "创建资源库", exact: true }).click();
    await page.getByRole("textbox", { name: "名称", exact: true }).fill("Emoji Test");
    await page.getByRole("button", { name: "创建", exact: true }).click();
    const setTheme = async (name: string) => {
      await page.getByRole("button", { name: "设置", exact: true }).click();
      await page.locator("#app-settings-tab-appearance").click();
      await page.getByRole("radio", { name, exact: true }).click();
      await page.keyboard.press("Escape");
    };
    await setTheme("暗色");
    await page.getByRole("button", { name: "添加文件夹", exact: true }).click();
    await page.locator(".nav-inline-edit input").fill("图标测试文件夹");
    await page.locator(".nav-inline-edit input").press("Enter");
    const row = () => page.locator('.nav-row[data-nav-folder-kind="managed"]').filter({ hasText: "图标测试文件夹" });
    const openPicker = async () => {
      await row().click({ button: "right" });
      await page.getByRole("menuitem", { name: "设置 Emoji…", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "设置 Emoji 图标" })).toBeVisible();
    };
    await openPicker();
    const input = () => page.getByRole("textbox", { name: "输入或粘贴一个 Emoji" });
    await expect(input()).toBeFocused();
    await input().fill("not an emoji");
    await expect(page.getByRole("button", { name: "保存", exact: true })).toBeDisabled();
    await input().fill("👩🏽‍💻");
    await page.screenshot({ path: testInfo.outputPath("emoji-dark.png") });
    await page.getByRole("button", { name: "保存", exact: true }).focus();
    await page.keyboard.press("Tab");
    await expect(input()).toBeFocused();
    await input().press("Enter");
    await expect(row().locator(".sidebar-emoji-glyph")).toHaveText("👩🏽‍💻");
    await expect(row()).toBeFocused();
    await app.close();
    app = await launch(); page = await app.firstWindow();
    // Recent-library reopen is explicit when the app starts on the library index.
    await page.getByRole("button", { name: "打开资源库", exact: true }).click();
    await expect(row().locator(".sidebar-emoji-glyph")).toHaveText("👩🏽‍💻");
    await setTheme("亮色");
    await openPicker();
    await page.screenshot({ path: testInfo.outputPath("emoji-light.png") });
    await page.keyboard.press("Escape");
    await expect(page.locator("#sidebar-emoji")).toHaveCount(0);
    await openPicker();
    await page.getByRole("button", { name: "恢复默认", exact: true }).click();
    await expect(row().locator(".sidebar-emoji-glyph")).toHaveCount(0);
  } finally { await app.close(); }
});
