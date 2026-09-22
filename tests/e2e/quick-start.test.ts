import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { _electron as electron, test, expect, type Page } from "@playwright/test";
import { electronLaunchEnv, resolveElectronExecutablePath } from "./electron-test-helpers";

test.describe.configure({ timeout: 120_000 });

async function expectContained(page: Page) {
  const bounds = await page.locator("#quick-start-guide").evaluate(node => {
    const rect = node.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
      w: innerWidth, h: innerHeight, overflow: node.scrollWidth > node.clientWidth };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(8);
  expect(bounds.top).toBeGreaterThanOrEqual(8);
  expect(bounds.right).toBeLessThanOrEqual(bounds.w - 8);
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.h - 8);
  expect(bounds.overflow).toBe(false);
}

test("first-run guide: cancel, create, import, tour, settings, replay and persistence", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "super-quick-start-"));
  const profile = path.join(root, "profile");
  mkdirSync(profile);
  const source = path.join(root, "first-asset.txt");
  writeFileSync(source, "A first asset for the quick start guide.");
  const application = await electron.launch({
    args: process.env.SUPER_E2E_PACKAGED_EXECUTABLE ? [] : [process.cwd()],
    executablePath: process.env.SUPER_E2E_PACKAGED_EXECUTABLE ?? resolveElectronExecutablePath(),
    env: electronLaunchEnv({ SUPER_E2E: "1", SUPER_E2E_USER_DATA_PATH: profile,
      SUPER_E2E_CREATE_PARENT_PATH: root, SUPER_E2E_IMPORT_FILES: source }),
  });
  try {
    // Packaged builds deliberately do not trust development dialog-path env
    // overrides. Select only this test's temporary files through the dialog.
    await application.evaluate(({ dialog }, paths) => {
      dialog.showOpenDialog = async (...args: unknown[]) => {
        const options = args.at(-1) as { properties?: string[] };
        return { canceled: false, filePaths: [options.properties?.includes('openDirectory') ? paths.root : paths.source] };
      };
    }, { root, source });
    const page = await application.firstWindow();
    const guide = page.locator("#quick-start-guide");
    await expect(guide).toBeVisible();
    await page.evaluate(() => localStorage.setItem("superApi.theme-prefs.v1", JSON.stringify({ version: 1, theme: "dark" })));
    await page.reload();
    await expect(guide).toBeVisible();
    await expect(guide.getByText("欢迎使用 Super Lib")).toBeVisible();
    await expect(page.locator('[role="dialog"]:visible')).toHaveCount(1);
    await expectContained(page);
    await page.screenshot({ path: test.info().outputPath("welcome-dark.png"), animations: "disabled" });
    // Name-form cancel must return to the same step without a second modal.
    await guide.getByRole("button", { name: "创建资源库", exact: true }).click();
    await expect(guide).toBeHidden();
    await expect(page.getByRole("textbox", { name: "名称", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(guide).toBeVisible();
    await guide.getByRole("button", { name: "创建资源库", exact: true }).click();
    await page.getByRole("textbox", { name: "名称", exact: true }).fill("Quick start test");
    await page.getByRole("button", { name: "创建", exact: true }).click();
    await expect(guide.getByText("放入第一批素材")).toBeVisible();
    await guide.getByRole("button", { name: /导入素材/ }).click();
    await expect(guide).toBeVisible();
    await expect(page.locator('.asset-card').filter({ hasText: "first-asset.txt" })).toHaveCount(1);
    await guide.getByRole("button", { name: "继续 / 稍后添加" }).click();
    await expect(guide.getByText("在左侧切换范围")).toBeVisible();
    await expect(page.locator(".quick-start-highlight")).toBeVisible();
    await expectContained(page);
    await page.screenshot({ path: test.info().outputPath("tour-dark.png"), animations: "disabled" });
    for (let i = 0; i < 4; i++) await guide.getByRole("button", { name: "下一步", exact: true }).click();
    await expect(guide.getByText("调整为你喜欢的样子")).toBeVisible();
    await guide.getByRole("button", { name: /外观设置/ }).click();
    await expect(page.locator("#app-settings-dialog")).toBeVisible();
    await expect(guide).toBeHidden();
    await expect.poll(() => page.locator("#app-settings-dialog").evaluate(node => node.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(guide.getByText("调整为你喜欢的样子")).toBeVisible();
    // Resize the actual Electron window, with maximum app font size and light theme.
    await page.evaluate(() => {
      localStorage.setItem("superApi.theme-prefs.v1", JSON.stringify({ version: 1, theme: "light" }));
      localStorage.setItem("superApi.font-size.v1", JSON.stringify({ version: 1, level: 4 }));
    });
    await page.reload();
    await expect(guide.getByText("调整为你喜欢的样子")).toBeVisible();
    await application.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find(w => w.isVisible())!;
      win.setMinimumSize(360, 300); win.setSize(640, 480);
    });
    await expectContained(page);
    await page.screenshot({ path: test.info().outputPath("personalize-light-small.png"), animations: "disabled" });
    await application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows().find(w => w.isVisible())!.setSize(360, 340);
    });
    await expectContained(page);
    await guide.getByRole("button", { name: "反馈问题" }).scrollIntoViewIfNeeded();
    await expect(guide.getByRole("button", { name: "反馈问题" })).toBeInViewport();
    await expect(guide.getByRole("button", { name: "开始使用", exact: true })).toBeInViewport();
    await page.screenshot({ path: test.info().outputPath("personalize-narrow.png"), animations: "disabled" });
    await guide.getByRole("button", { name: "开始使用", exact: true }).click();
    await expect(guide).toBeHidden();
    await application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows().find(w => w.isVisible())!.setSize(1280, 800);
    });
    await page.reload();
    await expect(page.locator(".asset-card").first()).toBeVisible();
    await expect(guide).toBeHidden();
    // Open general settings from the bottom-left footer.
    const expand = page.getByRole("button", { name: "展开导航", exact: true });
    if (await expand.isVisible()) await expand.click();
    await page.getByRole("button", { name: "设置", exact: true }).click();
    await page.getByRole("button", { name: "重新查看引导", exact: true }).click();
    await expect(guide.getByText("放入第一批素材")).toBeVisible();
    await guide.getByRole("button", { name: "继续 / 稍后添加" }).focus();
    await page.keyboard.press("Tab");
    await expect(guide.getByRole("button", { name: "跳过引导" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(guide.getByRole("button", { name: "继续 / 稍后添加" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(guide).toBeHidden();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("superApi.quick-start.v1")!).status)).toBe("done");
    // Simulate upgrading an existing profile that predates the guide.
    await page.evaluate(() => localStorage.removeItem("superApi.quick-start.v1"));
    await page.reload();
    await expect(page.locator(".asset-card").first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("superApi.quick-start.v1") ?? "null")?.status)).toBe("done");
    await expect(guide).toBeHidden();
  } finally { await application.close(); }
});

test("skipping the welcome survives reload and leaves the normal library chooser", async () => {
  const profile = mkdtempSync(path.join(tmpdir(), "super-quick-start-skip-"));
  const application = await electron.launch({
    args: process.env.SUPER_E2E_PACKAGED_EXECUTABLE ? [] : [process.cwd()],
    executablePath: process.env.SUPER_E2E_PACKAGED_EXECUTABLE ?? resolveElectronExecutablePath(),
    env: electronLaunchEnv({ SUPER_E2E: "1", SUPER_E2E_USER_DATA_PATH: profile }) });
  try {
    const page = await application.firstWindow();
    await expect(page.locator("#quick-start-guide")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#quick-start-guide")).toBeHidden();
    await expect(page.locator(".library-start-dialog")).toBeVisible();
    await page.reload();
    await expect(page.locator(".library-start-dialog")).toBeVisible();
    await expect(page.locator("#quick-start-guide")).toBeHidden();
  } finally { await application.close(); }
});
