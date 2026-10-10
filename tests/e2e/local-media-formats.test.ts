import { _electron as electron, expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { resolveFfmpegPath } from "../../src/worker/binary-resolver";
import { assetCard, resolveElectronExecutablePath } from "./electron-test-helpers";

test("real JFIF/AVIF sources decode and real FLV falls back to a playable proxy in Electron", async () => {
  test.setTimeout(120_000);
  const root = mkdtempSync(path.join(tmpdir(), "super-local-media-e2e-"));
  const jpeg = path.join(root, "sample.jfif"); const avif = path.join(root, "sample.avif"); const video = path.join(root, "clip.flv");
  const image = () => sharp({ create: { width: 80, height: 48, channels: 3, background: "#5c8dcc" } });
  writeFileSync(jpeg, await image().jpeg().toBuffer()); writeFileSync(avif, await image().avif().toBuffer());
  const frame = path.join(root, "frame.png"); writeFileSync(frame, await image().png().toBuffer());
  execFileSync(resolveFfmpegPath(), ["-hide_banner", "-loglevel", "error", "-loop", "1", "-i", frame, "-t", "0.6", "-r", "10", "-c:v", "flv", "-an", "-y", video], { timeout: 20_000, windowsHide: true });
  const app = await electron.launch({ executablePath: resolveElectronExecutablePath(), args: [process.cwd()],
    env: { ...process.env, SUPER_E2E: "1", SUPER_E2E_CREATE_PARENT_PATH: root, SUPER_E2E_USER_DATA_PATH: path.join(root, "user-data"), SUPER_E2E_IMPORT_FILES: [jpeg, avif, video].join(path.delimiter) } });
  try {
    await app.evaluate(({ dialog }, paths) => {
      dialog.showOpenDialog = async (...args: unknown[]) => {
        const options = args.at(-1) as { properties?: string[] };
        return { canceled: false, filePaths: options.properties?.includes("openDirectory") ? [paths.root] : paths.sources };
      };
    }, { root, sources: [jpeg, avif, video] });
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "跳过引导", exact: true }).click();
    await page.getByRole("button", { name: "创建资源库", exact: true }).click();
    await page.getByRole("textbox", { name: "名称", exact: true }).fill("Media Test");
    await page.getByRole("button", { name: "创建", exact: true }).click();
    await page.getByRole("button", { name: "导入文件", exact: true }).first().click();
    for (const name of ["sample.jfif", "sample.avif", "clip.flv"]) {
      const card = assetCard(page, name);
      await expect(card).toBeVisible({ timeout: 20_000 });
      await card.click(); await page.keyboard.press("Space");
      const preview = page.getByRole("region", { name: name + " 查看页面", exact: true });
      await expect(preview).toBeVisible();
      if (name.endsWith("flv")) {
        const element = preview.locator("video").first();
        await expect.poll(() => element.evaluate(video => video instanceof HTMLVideoElement && video.readyState >= 2 && video.videoWidth === 80), { timeout: 30_000 }).toBe(true);
        await expect(element).toHaveAttribute("src", /super:\/\/proxy\//);
      } else {
        const element = preview.locator('img[src^="super://source/"]').first();
        await expect(element).toBeVisible();
        await expect.poll(() => element.evaluate(img => img instanceof HTMLImageElement && img.complete && img.naturalWidth === 80)).toBe(true);
        await expect(element).toHaveAttribute("src", /super:\/\/source\//);
      }
      await page.keyboard.press("Escape");
    }
  } catch (error) {
    await (await app.firstWindow()).screenshot({ path: test.info().outputPath("media-failure.png") });
    throw error;
  } finally { await app.close(); }
});
