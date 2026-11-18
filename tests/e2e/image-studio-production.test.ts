import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { _electron as electron, expect, test } from '@playwright/test';

import type { SuperPluginManagerApi } from '../../src/shared/plugin-manager-api';
import { resolveElectronExecutablePath } from './electron-test-helpers';

test.describe.configure({ timeout: 120_000 });

test('production image studio catalogue and history render in the workbench', async () => {
  const password = process.env.IMAGE_STUDIO_REAL_PASSWORD;
  test.skip(password === undefined || password.length === 0, 'requires IMAGE_STUDIO_REAL_PASSWORD');
  const root = mkdtempSync(path.join(tmpdir(), 'super-image-studio-prod-e2e-'));
  let application: Awaited<ReturnType<typeof electron.launch>> | undefined;
  try {
    application = await electron.launch({
      executablePath: resolveElectronExecutablePath(),
      args: [process.cwd()],
      cwd: process.cwd(),
      env: {
        ...process.env,
        SUPER_E2E: '1',
        SUPER_E2E_USER_DATA_PATH: path.join(root, 'profile'),
        SUPER_E2E_CREATE_PARENT_PATH: root,
        SUPER_DISABLE_AUTOMATIC_UPDATES: '1',
      },
    });
    const window = await application.firstWindow();
    await window.getByRole('button', { name: '跳过引导', exact: true }).click();
    await window.getByRole('button', { name: '创建资源库' }).click();
    await window.getByRole('textbox', { name: '名称' }).fill('Image studio prod');
    await window.getByRole('button', { name: '创建', exact: true }).click();
    await expect(window.getByRole('heading', { name: '导入资产以开始整理' })).toBeVisible();

    const libraryId = await window.evaluate(async () => {
      const api = (globalThis as typeof globalThis & { super: { library: { listOpen(): Promise<{ ok: boolean; value: Array<{ libraryId: string }> }> } } }).super.library;
      const libraries = await api.listOpen();
      if (!libraries.ok || !libraries.value[0]) throw new Error('Missing library');
      return libraries.value[0].libraryId;
    });
    await window.evaluate(async (libraryId) => {
      const plugins = (globalThis as typeof globalThis & { super: { plugins: SuperPluginManagerApi } }).super.plugins;
      const catalog = await plugins.request({ type: 'plugin-manager.list-server-extensions' });
      if (!catalog.ok || !('extensions' in catalog)) throw new Error('Missing catalogue');
      if (!catalog.extensions.some((entry) => entry.id === 'com.super.image-studio')) {
        throw new Error('Image studio missing from production catalogue');
      }
      const installed = await plugins.request({
        type: 'plugin-manager.install-server-extension',
        pluginId: 'com.super.image-studio',
        scope: 'user',
      });
      if (!installed.ok) throw new Error('Install failed');
      const after = await plugins.request({ type: 'plugin-manager.list', libraryId });
      if (!after.ok || !('packages' in after)) throw new Error('Missing packages');
      const pkg = after.packages.find((entry) => entry.pluginId === 'com.super.image-studio');
      if (!pkg) throw new Error('Missing package');
      if (pkg.trust !== 'trusted') {
        const trusted = await plugins.request({
          type: 'plugin-manager.trust',
          scope: 'user',
          pluginId: pkg.pluginId,
          packageHash: pkg.packageHash,
          decision: 'trusted',
        });
        if (!trusted.ok) throw new Error('Trust failed');
      }
      const resolved = await plugins.request({
        type: 'plugin-manager.resolve',
        libraryId,
        pluginId: pkg.pluginId,
        selection: 'use-global',
        packageHash: pkg.packageHash,
        propagateUserScoped: true,
      });
      if (!resolved.ok) throw new Error('Resolve failed');
    }, libraryId);

    const expandSidebar = window.getByRole('button', { name: '展开导航', exact: true });
    if (await expandSidebar.isVisible()) await expandSidebar.click();
    await window.getByRole('button', { name: '图片素材生成', exact: true }).click();
    const frame = window.frameLocator('iframe.plugin-sidebar-view-frame');
    await expect(frame.getByRole('heading', { name: '输入访问密码' })).toBeVisible({ timeout: 20_000 });
    await frame.locator('#password').fill(password!);
    await frame.getByRole('button', { name: '解锁工作台' }).click();
    await expect(frame.getByRole('heading', { name: '生成一张素材' })).toBeVisible({ timeout: 20_000 });
    await expect(frame.locator('.history-card')).toHaveCount(1, { timeout: 20_000 });
    const historyImage = frame.locator('.history-thumbs img').first();
    await expect(historyImage).toBeVisible();
    await expect.poll(async () => historyImage.evaluate((image) => (image as HTMLImageElement).naturalWidth), { timeout: 20_000 }).toBeGreaterThan(0);
    await window.waitForTimeout(1200);
    await window.screenshot({ path: test.info().outputPath('image-studio-production.png') });
  } finally {
    await application?.close();
    rmSync(root, { recursive: true, force: true });
  }
});