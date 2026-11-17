import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { _electron as electron, expect, test } from "@playwright/test";

import {
  dismissQuickStart,
  resolveElectronExecutablePath,
} from "./electron-test-helpers";

test.describe.configure({ timeout: 120_000 });

test("offers six app font levels with level four as the default", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "super-font-size-e2e-"));
  const profile = path.join(root, "profile");
  mkdirSync(profile);
  let application: Awaited<ReturnType<typeof electron.launch>> | undefined;
  try {
    application = await electron.launch({
      executablePath: resolveElectronExecutablePath(),
      args: [process.cwd()],
      cwd: process.cwd(),
      env: {
        ...process.env,
        SUPER_E2E: "1",
        SUPER_E2E_USER_DATA_PATH: profile,
        SUPER_E2E_CREATE_PARENT_PATH: root,
        SUPER_DISABLE_AUTOMATIC_UPDATES: "1",
      },
    });
    const window = await application.firstWindow();
    await dismissQuickStart(window);
    await expect
      .poll(() => window.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--app-font-scale").trim()))
      .toBe("1.2");

    await window.getByRole("button", { name: "创建资源库" }).click();
    await window.getByRole("textbox", { name: "名称" }).fill("Font size test");
    await window.getByRole("button", { name: "创建", exact: true }).click();
    await expect(window.getByRole("heading", { name: "导入资产以开始整理" })).toBeVisible();

    await expect(window.locator(".app-settings-entry")).toBeEnabled();
    await window.locator(".app-settings-entry").dispatchEvent("click");
    const dialog = window.getByRole("dialog", { name: "通用设置" });
    await dialog.getByRole("tab", { name: "外观", exact: true }).click();
    const slider = dialog.getByRole("slider", { name: "应用字体大小" });
    await expect(slider).toHaveAttribute("max", "6");
    await expect(slider).toHaveAttribute("value", "4");
    await expect(slider).toHaveAttribute("aria-valuetext", "4 大");

    const ticks = dialog.locator(".app-settings-font-size-scale .app-settings-elevation-tick");
    await expect(ticks).toHaveCount(6);
    await slider.focus();
    await slider.press("End");
    await expect(slider).toHaveAttribute("aria-valuetext", "6 最大");
    await expect
      .poll(() => window.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--app-font-scale").trim()))
      .toBe("1.4");
    await expect.poll(() => window.evaluate(() => JSON.parse(localStorage.getItem("superApi.font-size.v1") ?? "null")?.level)).toBe(6);
    const overflow = await window.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
    await window.screenshot({ path: test.info().outputPath("font-size-6.png") });
  } finally {
    await application?.close();
    rmSync(root, { recursive: true, force: true });
  }
});