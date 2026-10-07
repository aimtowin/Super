import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { _electron as electron, expect, test, type Page } from "@playwright/test";
import { assetCard, resolveElectronExecutablePath } from "./electron-test-helpers";

test.describe.configure({ timeout: 120_000 });

async function openFilter(page: Page, dimension: string) {
  const button = page.locator(`.dimension-filter-dim[data-dimension="${dimension}"] > button`);
  await expect(button).toBeEnabled();
  await button.hover();
  await button.focus();
  const panel = page.locator(`.dimension-filter-popover[data-dimension="${dimension}"]`);
  await expect(panel).toBeVisible();
  return panel;
}
async function expectNames(page: Page, names: string[]) {
  await expect.poll(() => page.locator(".asset-card").evaluateAll((cards) =>
    cards.map((card) => card.getAttribute("title")).sort())).toEqual([...names].sort());
}

test("include/exclude modes preserve results, multi-select, scrolling and asset inversion", async () => {
  const testInfo = test.info();
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), "super-filter-interaction-"));
  const sources = ["wide.png", "portrait.jpg", "notes.txt"].map((name) => path.join(temporaryRoot, name));
  await sharp({ create: { width: 32, height: 16, channels: 3, background: "#5a8cc0" } }).png().toFile(sources[0]!);
  await sharp({ create: { width: 16, height: 32, channels: 3, background: "#bb6655" } }).jpeg().toFile(sources[1]!);
  writeFileSync(sources[2]!, "Filter regression fixture");
  const applicationDirectory = process.env.SUPER_E2E_APP_DIRECTORY ?? process.cwd();
  const application = await electron.launch({
    args: [applicationDirectory], cwd: applicationDirectory, executablePath: resolveElectronExecutablePath(),
    env: { ...process.env, SUPER_E2E: "1", SUPER_E2E_USER_DATA_PATH: path.join(temporaryRoot, "user-data"),
      SUPER_E2E_CREATE_PARENT_PATH: temporaryRoot, SUPER_E2E_IMPORT_FILES: sources.join(path.delimiter) },
  });
  try {
    // Packaged builds disable development-only picker overrides. Stub only
    // native file selection for this isolated fixture, not the import/query.
    if (process.env.SUPER_E2E_PACKAGED_EXECUTABLE) {
      await application.evaluate(({ dialog }, paths) => {
        dialog.showOpenDialog = async (...args: unknown[]) => {
          const options = args.at(-1) as { properties?: string[] };
          return { canceled: false, filePaths: options.properties?.includes("openDirectory") ? [paths.root] : paths.files };
        };
      }, { root: temporaryRoot, files: sources });
    }
    const page = await application.firstWindow();
    await expect(page.locator("#quick-start-guide")).toBeVisible();
    await page.getByRole("button", { name: "跳过引导", exact: true }).click();
    await page.getByRole("button", { name: "创建资源库", exact: true }).click();
    await page.getByRole("textbox", { name: "名称", exact: true }).fill("筛选回归验收");
    await page.getByRole("button", { name: "创建", exact: true }).click();
    await page.getByRole("button", { name: "导入文件", exact: true }).first().click();
    await expectNames(page, ["wide.png", "portrait.jpg", "notes.txt"]);

    let panel = await openFilter(page, "format");
    await expect(panel.getByRole("radio", { name: "排除", exact: true })).toBeDisabled();
    await panel.getByRole("button", { name: "png", exact: true }).click();
    await expectNames(page, ["wide.png"]);
    await expect(panel.getByRole("checkbox", { name: "图像", exact: true })).toHaveJSProperty("indeterminate", true);
    await panel.getByRole("button", { name: "jpg", exact: true }).click({ modifiers: ["Shift"] });
    await expectNames(page, ["wide.png", "portrait.jpg"]);

    await panel.getByRole("radio", { name: "排除", exact: true }).check();
    await expectNames(page, ["notes.txt"]);
    await expect(page.locator(".dimension-active-chip.is-excluding")).toHaveText("排除 格式 · png, jpg");
    await expect(panel).toHaveClass(/is-excluding/);
    await panel.getByRole("radio", { name: "排除", exact: true }).focus();
    await page.keyboard.press("ArrowLeft");
    await expect(panel.getByRole("radio", { name: "包含", exact: true })).toBeChecked();
    await expectNames(page, ["wide.png", "portrait.jpg"]);
    await panel.getByRole("radio", { name: "排除", exact: true }).check();
    await expectNames(page, ["notes.txt"]);
    await panel.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    const positions = await panel.evaluate((element) => ({
      panel: element.getBoundingClientRect().top,
      header: element.querySelector(".dimension-filter-header")!.getBoundingClientRect().top,
      scroll: element.scrollTop,
    }));
    expect(positions.scroll).toBeGreaterThan(0);
    expect(Math.abs(positions.header - positions.panel)).toBeLessThan(5);
    await expect(panel.getByRole("radio", { name: "包含", exact: true })).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath("filter-exclude-light-scrolled.png") });
    await panel.getByRole("radio", { name: "包含", exact: true }).check();
    await expectNames(page, ["wide.png", "portrait.jpg"]);

    // Asset inversion stays within the filtered browse scope, not the whole library.
    await page.keyboard.press("Escape");
    await assetCard(page, "wide.png").click();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+i" : "Control+i");
    await expect(assetCard(page, "portrait.jpg")).toHaveClass(/is-selected/);
    await expect(assetCard(page, "wide.png")).not.toHaveClass(/is-selected/);
    await expectNames(page, ["wide.png", "portrait.jpg"]);
    await page.getByRole("button", { name: "移除筛选：格式 · png, jpg", exact: true }).click();
    await expectNames(page, ["wide.png", "portrait.jpg", "notes.txt"]);

    // Normal click still replaces, repeated click clears; group selection is unchanged.
    panel = await openFilter(page, "format");
    await panel.getByRole("button", { name: "png", exact: true }).click();
    await panel.getByRole("button", { name: "jpg", exact: true }).click();
    await expectNames(page, ["portrait.jpg"]);
    await panel.getByRole("button", { name: "jpg", exact: true }).click();
    await expectNames(page, ["wide.png", "portrait.jpg", "notes.txt"]);
    await panel.getByRole("checkbox", { name: "图像", exact: true }).check();
    await expectNames(page, ["wide.png", "portrait.jpg"]);
    await expect(panel.getByRole("checkbox", { name: "图像", exact: true })).toBeChecked();
    await panel.getByRole("checkbox", { name: "图像", exact: true }).uncheck();
    await expectNames(page, ["wide.png", "portrait.jpg", "notes.txt"]);

    // OR shape presets with blank custom inputs can be excluded as one dimension.
    panel = await openFilter(page, "shape");
    await panel.getByRole("button", { name: "横图", exact: true }).click();
    await expectNames(page, ["wide.png"]);
    await panel.getByRole("button", { name: "竖图", exact: true }).click({ modifiers: ["Shift"] });
    await expectNames(page, ["wide.png", "portrait.jpg"]);
    await expect(panel.getByRole("spinbutton", { name: "宽高比最小值", exact: true })).toHaveValue("");
    await panel.getByRole("radio", { name: "排除", exact: true }).check();
    await expect(page.locator('[data-dimension="shape"] > button')).toHaveClass(/is-excluding/);
    // Missing aspect metadata follows the existing backend semantics; do not redefine it here.
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "全部清除", exact: true }).click();
    await expectNames(page, ["wide.png", "portrait.jpg", "notes.txt"]);

    panel = await openFilter(page, "more");
    await panel.getByRole("spinbutton", { name: "宽度最小值", exact: true }).fill("20");
    const width = panel.getByRole("group", { name: "宽度", exact: true });
    await width.getByRole("radio", { name: "排除", exact: true }).check();
    await expect(page.locator('[data-dimension="more"] > button')).toHaveClass(/is-excluding/);
    await expect(page.locator(".dimension-active-chip.is-excluding")).toHaveText("排除 宽度 · ≥20");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "全部清除", exact: true }).click();
    await expectNames(page, ["wide.png", "portrait.jpg", "notes.txt"]);

    panel = await openFilter(page, "format");
    await panel.getByRole("textbox", { name: "格式过滤", exact: true }).fill("png, jpg");
    await panel.getByRole("radio", { name: "排除", exact: true }).check();
    await expectNames(page, ["notes.txt"]);
    await page.keyboard.press("Escape");
    const formatButton = page.locator('[data-dimension="format"] > button');
    await formatButton.click();
    await expectNames(page, ["wide.png", "portrait.jpg", "notes.txt"]);
    await formatButton.click();
    await expectNames(page, ["notes.txt"]);
    // Exercise the real theme provider, using only this disposable test profile.
    for (const theme of ["dark", "light"] as const) {
      await page.evaluate((value) => {
        localStorage.setItem("superApi.theme-prefs.v1", JSON.stringify({ version: 1, theme: value }));
      }, theme);
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expectNames(page, ["wide.png", "portrait.jpg", "notes.txt"]);
      panel = await openFilter(page, "format");
      await panel.getByRole("textbox", { name: "格式过滤", exact: true }).fill("png, jpg");
      await panel.getByRole("radio", { name: "排除", exact: true }).check();
      await expectNames(page, ["notes.txt"]);
      const contrast = await page.evaluate(() => {
        const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
        const luminance = (color: string) => {
          context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1);
          const pixel = context.getImageData(0, 0, 1, 1).data;
          const rgb = [pixel[0]!, pixel[1]!, pixel[2]!].map((value) => {
            const s = value / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          });
          return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
        };
        return [".filter-mode-option input:checked + span", ".dimension-active-chip.is-excluding", ".filter-preset-chip.is-active"]
          .map((selector) => {
            const style = getComputedStyle(document.querySelector(selector)!);
            const fg = luminance(style.color); const bg = luminance(style.backgroundColor);
            return { selector, ratio: (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05) };
          });
      });
      for (const sample of contrast) expect(sample.ratio, `${theme}: ${sample.selector}`).toBeGreaterThanOrEqual(4.5);
      expect(await panel.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: testInfo.outputPath(`filter-exclude-${theme}.png`) });
    }
    await application.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0]!.setBounds({ width: 1000, height: 760 }); });
    await page.evaluate(() => { document.documentElement.style.setProperty("--app-font-scale", "1.25"); });
    const scaledPanel = await openFilter(page, "format");
    await scaledPanel.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(scaledPanel.getByRole("radio", { name: "排除", exact: true })).toBeInViewport();
    expect(await scaledPanel.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath("filter-exclude-scaled.png") });
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expectNames(page, ["notes.txt"]);
  } finally {
    await application.close();
    rmSync(temporaryRoot, { force: true, recursive: true });
  }
});
