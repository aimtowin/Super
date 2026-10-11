import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import AdmZip from 'adm-zip';
import type { SuperLibraryApi } from '../../src/shared/library-api';
import { resolveElectronExecutablePath, dismissQuickStart } from './electron-test-helpers';

test.describe.configure({ timeout: 180_000 });
test('real viewer: Markdown, readonly ZIP, custom covers, proximity chrome and fullscreen navigation/deletion', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'super-upgrade-e2e-'));
  const files = ['A.png', 'B.png', 'notes.md', 'archive.zip'].map(name => path.join(root, name));
  await sharp({ create: { width: 400, height: 300, channels: 3, background: '#4288aa' } }).png().toFile(files[0]!);
  await sharp({ create: { width: 400, height: 300, channels: 3, background: '#bb7733' } }).png().toFile(files[1]!);
  writeFileSync(files[2]!, '# Safe Markdown\n\n- [x] task\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n![blocked](https://tracking.invalid/pixel.png)\n<script>window.UNSAFE_MARKDOWN = true</script>');
  const archive = new AdmZip(); archive.addFile('nested/read.md', Buffer.from('# ZIP read-only')); archive.writeZip(files[3]!);
  const linkedSource = path.join(root, 'linked-source');
  mkdirSync(path.join(linkedSource, 'gone'), { recursive: true });
  await sharp({ create: { width: 40, height: 30, channels: 3, background: '#227744' } }).png().toFile(path.join(linkedSource, 'live.png'));
  await sharp({ create: { width: 40, height: 30, channels: 3, background: '#aa2244' } }).png().toFile(path.join(linkedSource, 'gone', 'missing.png'));
  const applicationDirectory = process.env.SUPER_E2E_APP_DIRECTORY ?? process.cwd();
  const packaged = process.env.SUPER_E2E_PACKAGED_EXECUTABLE;
  const application = await electron.launch({ executablePath: packaged ?? resolveElectronExecutablePath(), args: packaged ? [] : [applicationDirectory], cwd: applicationDirectory,
    env: { ...process.env, SUPER_E2E: '1', SUPER_E2E_CREATE_PARENT_PATH: root,
      SUPER_E2E_USER_DATA_PATH: path.join(root, 'user-data'), SUPER_E2E_LINKED_SOURCE: linkedSource, SUPER_E2E_IMPORT_FILES: files.join(path.delimiter) } });
  try {
    if (packaged) await application.evaluate(({ dialog }, paths) => {
      dialog.showOpenDialog = async (...args: unknown[]) => {
        const options = args.at(-1) as { title?: string; properties?: string[] };
        const create = options.title === 'Create Library' || options.title === '创建资源库';
        return { canceled: false, filePaths: create ? [paths.root] : options.properties?.includes('openDirectory') ? [paths.linkedSource] : paths.files };
      };
    }, { root, linkedSource, files });
    const page = await application.firstWindow();
    await dismissQuickStart(page);
    await page.getByRole('button', { name: '创建资源库', exact: true }).click();
    await page.getByRole('textbox', { name: '名称', exact: true }).fill('Viewer upgrades');
    await page.getByRole('button', { name: '创建', exact: true }).click();
    await page.getByRole('button', { name: '导入文件', exact: true }).first().click();
    const notes = page.locator('.asset-card').filter({ hasText: 'notes.md' });
    await expect(notes.locator('.markdown-preview')).toContainText('Safe Markdown');
    await notes.dblclick();
    const viewer = page.locator('.workspace-viewer');
    await expect(viewer.locator('.markdown-preview h1')).toHaveText('Safe Markdown');
    await expect(viewer.locator('table')).toHaveCount(1);
    expect(await page.evaluate(() => (window as unknown as { UNSAFE_MARKDOWN?: boolean }).UNSAFE_MARKDOWN)).toBeUndefined();
    await expect(viewer.locator('.markdown-preview img')).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('markdown-rendered.png') });
    await viewer.getByRole('radio', { name: '源码', exact: true }).click();
    // The exact accessible name comes from the existing editor, not the new tabs.
    const textarea = viewer.locator('textarea');
    await expect(textarea).toHaveValue(/Safe Markdown/);
    await textarea.fill('# Edited Markdown\n\nkept after switching modes');
    await viewer.getByRole('radio', { name: '渲染预览', exact: true }).click();
    await expect(viewer.locator('.markdown-preview h1')).toHaveText('Edited Markdown');
    await viewer.getByRole('button', { name: '关闭', exact: true }).click();
    await expect(viewer).toHaveCount(0);
    await expect(notes.locator('.markdown-preview')).toContainText('Edited Markdown');

    await page.locator('.asset-card').filter({ hasText: 'archive.zip' }).click(); await page.keyboard.press('Space');
    await expect(viewer.getByRole('button', { name: /nested\/read.md/ })).toBeVisible();
    await viewer.getByRole('button', { name: /nested\/read.md/ }).click();
    await expect(viewer.locator('.markdown-preview h1')).toHaveText('ZIP read-only');
    await page.screenshot({ path: test.info().outputPath('zip-readonly.png') });
    await page.keyboard.press('Escape'); await expect(viewer).toHaveCount(0);

    const folder = await page.evaluate(async () => {
      const api = (window as unknown as { super: { library: SuperLibraryApi } }).super.library;
      const opened = await api.listOpen(); if (!opened.ok || !opened.value[0]) throw Error('No library');
      const libraryId = opened.value[0].libraryId, created = await api.createFolder({ libraryId, name: 'Custom cover' });
      if (!created.ok) throw Error(created.error.message); return { libraryId, folderId: created.value.folderId };
    });
    await page.getByRole('button', { name: /资源库根目录/ }).click();
    const folderCard = page.locator('.folder-card').filter({ hasText: 'Custom cover' });
    await expect(folderCard).toBeVisible(); await folderCard.click({ button: 'right' });
    await page.getByRole('menuitem', { name: '设置文件夹图片封面', exact: true }).click();
    const coverDialog = page.getByRole('dialog', { name: /设置文件夹图片封面/ });
    await expect(coverDialog).toBeVisible();
    await coverDialog.getByRole('button', { name: 'A.png', exact: true }).click();
    await page.screenshot({ path: test.info().outputPath('folder-cover.png') });
    await coverDialog.getByRole('button', { name: '保存', exact: true }).click(); await expect(coverDialog).toHaveCount(0);
    await expect(folderCard.locator('img')).toBeVisible();
    expect(await page.evaluate(async folder => {
      const api = (window as unknown as { super: { library: SuperLibraryApi } }).super.library;
      const result = await api.folderCover(folder); return result.ok && result.value.assetId !== null;
    }, folder)).toBe(true);

    await page.getByRole('button', { name: /所有资产/ }).click();
    await page.getByLabel('搜索资源库', { exact: true }).fill('png');
    const imageCards = page.locator('.asset-card'); await expect(imageCards).toHaveCount(2);
    const initialId = await imageCards.first().getAttribute('data-asset-id');
    await imageCards.first().click(); await page.keyboard.press('Space');
    await expect(viewer.locator('img.preview-image:not(.is-hidden)')).toBeVisible();
    await viewer.getByRole('button', { name: '全屏', exact: true }).click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement?.classList.contains('viewer-fullscreen-host'))).toBe(true);
    const host = await page.locator('.viewer-fullscreen-host').elementHandle();
    const initialLabel = await viewer.getAttribute('aria-label');
    await page.keyboard.press('ArrowRight'); await expect(viewer).not.toHaveAttribute('aria-label', initialLabel!);
    expect(await host!.evaluate(element => document.fullscreenElement === element && element.isConnected)).toBe(true);
    await page.keyboard.press('ArrowLeft'); await expect(viewer).toHaveAttribute('aria-label', initialLabel!);
    expect(await host!.evaluate(element => document.fullscreenElement === element && element.isConnected)).toBe(true);
    const bounds = await viewer.boundingBox(); if (!bounds) throw Error('No viewer bounds');
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await expect(viewer).toHaveClass(/is-chrome-idle/, { timeout: 5000 });
    await page.mouse.move(bounds.x + 5, bounds.y + bounds.height / 2);
    await expect(viewer).not.toHaveClass(/is-chrome-idle/);
    await page.screenshot({ path: test.info().outputPath('fullscreen-viewer.png') });
    // Current preview only, irrespective of any previous browse selection.
    await page.keyboard.press('Delete'); await expect(viewer).toHaveCount(0);
    expect(await page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    const remaining = await page.evaluate(async libraryId => {
      const result = await (window as unknown as { super: { library: SuperLibraryApi } }).super.library.searchAssets({ libraryId });
      if (!result.ok) throw Error(result.error.message); return result.value.items.map(item => item.assetId);
    }, folder.libraryId);
    expect(remaining).not.toContain(initialId); expect(remaining).toHaveLength(3);
    await page.evaluate(async libraryId => {
      const result = await (window as unknown as { super: { library: SuperLibraryApi } }).super.library.importFolderAsLinked({ libraryId });
      if (!result.ok) throw Error(result.error.message);
    }, folder.libraryId);
    await expect(page.locator('.asset-card').filter({ hasText: 'missing.png' })).toBeVisible();
    const offlineSource = path.join(root, 'offline-source');
    expect(path.relative(root, linkedSource).startsWith('..')).toBe(false);
    expect(path.relative(root, offlineSource).startsWith('..')).toBe(false);
    renameSync(linkedSource, offlineSource);
    await page.evaluate(async libraryId => {
      const result = await (window as unknown as { super: { library: SuperLibraryApi } }).super.library.refreshAssets({ libraryId });
      if (!result.ok) throw Error(result.error.message);
    }, folder.libraryId);
    await page.getByRole('button', { name: '设置', exact: true }).click();
    const settings = page.getByRole('dialog', { name: '通用设置' });
    await settings.getByRole('tab', { name: '浏览', exact: true }).click();
    await expect(settings.getByRole('radio', { name: '靠近边缘显示', exact: true })).toHaveAttribute('aria-checked', 'true');
    const hideMissing = settings.getByRole('switch', { name: '隐藏缺失的链接资产与文件夹', exact: true });
    await hideMissing.click(); await expect(hideMissing).toBeChecked();
    await settings.getByRole('button', { name: '关闭', exact: true }).click();
    await expect(page.locator('.asset-card').filter({ hasText: 'missing.png' })).toHaveCount(0);
    await expect(page.locator('.asset-card').filter({ hasText: 'live.png' })).toHaveCount(0);
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await settings.getByRole('tab', { name: '浏览', exact: true }).click();
    await hideMissing.click(); await expect(hideMissing).not.toBeChecked();
    await settings.getByRole('button', { name: '关闭', exact: true }).click();
    await expect(page.locator('.asset-card').filter({ hasText: 'missing.png' })).toBeVisible();
  } finally { await application.close(); rmSync(root, { recursive: true, force: true }); }
});
