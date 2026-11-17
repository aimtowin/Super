import { createServer, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { _electron as electron, expect, test } from '@playwright/test';

import type { SuperLibraryApi } from '../../src/shared/library-api';
import type { SuperPluginManagerApi } from '../../src/shared/plugin-manager-api';
import { resolveElectronExecutablePath } from './electron-test-helpers';

test.describe.configure({ timeout: 180_000 });

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nXQAAAAASUVORK5CYII=',
  'base64',
);

async function startCatalogServer(): Promise<{ server: Server; url: string }> {
  const zip = readFileSync(path.join(process.cwd(), 'extensions/dist/com.super.infinite-canvas-1.0.0-win32-x64.zip'));
  const sha256 = createHash('sha256').update(zip).digest('hex');
  const catalog = {
    catalogVersion: 1,
    extensions: [{
      id: 'com.super.infinite-canvas',
      name: '无限画布',
      version: '1.0.0',
      description: 'detached preview',
      author: 'Super',
      platform: 'win32-x64',
      minAppVersion: '2.4.5',
      asset: {
        path: 'com.super.infinite-canvas-1.0.0-win32-x64.zip',
        size: zip.byteLength,
        sha256,
      },
    }],
  };
  const server = createServer((request, response) => {
    if (request.url === '/latest.json') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(catalog));
      return;
    }
    if (request.url === '/com.super.infinite-canvas-1.0.0-win32-x64.zip') {
      response.writeHead(200, { 'content-type': 'application/octet-stream' });
      response.end(zip);
      return;
    }
    response.writeHead(404);
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('No catalog port');
  return { server, url: `http://127.0.0.1:${address.port}/latest.json` };
}

async function mainWindowState(application: Awaited<ReturnType<typeof electron.launch>>) {
  return application.evaluate(({ BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows().find((window) => {
      try {
        if (window.isDestroyed() || window.webContents.isDestroyed()) return false;
        return !window.webContents.getURL().includes('floating-preview.html');
      } catch {
        return false;
      }
    });
    return {
      count: BrowserWindow.getAllWindows().length,
      minimized: main?.isMinimized() ?? true,
    };
  });
}

test('server-installed infinite canvas opens a detached preview and teaches it once', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'super-infinite-canvas-e2e-'));
  const source = path.join(root, 'infinite-canvas.png');
  writeFileSync(source, PNG_1X1);
  const catalog = await startCatalogServer();
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
        SUPER_E2E_IMPORT_FILES: source,
        SUPER_PLUGIN_CATALOG_URL: catalog.url,
        SUPER_DISABLE_AUTOMATIC_UPDATES: '1',
      },
    });
    const window = await application.firstWindow();
    await window.getByRole('button', { name: '跳过引导', exact: true }).click();
    await window.getByRole('button', { name: '创建资源库' }).click();
    await window.getByRole('textbox', { name: '名称' }).fill('Infinite canvas');
    await window.getByRole('button', { name: '创建', exact: true }).click();
    await expect(window.getByRole('heading', { name: '导入资产以开始整理' })).toBeVisible();
    await expect(window.getByRole('button', { name: '导入文件', exact: true }).first()).toBeVisible();
    await window.getByRole('button', { name: '导入文件', exact: true }).first().click();
    await expect(window.locator('.asset-card').filter({ hasText: 'infinite-canvas.png' })).toBeVisible({ timeout: 20_000 });

    const libraryId = await window.evaluate(async () => {
      const api = (globalThis as typeof globalThis & { super: { library: SuperLibraryApi } }).super.library;
      const libraries = await api.listOpen();
      if (!libraries.ok || !libraries.value[0]) throw new Error('Missing library');
      return libraries.value[0].libraryId;
    });
    const installed = await window.evaluate(async (libraryId) => {
      const plugins = (globalThis as typeof globalThis & { super: { plugins: SuperPluginManagerApi } }).super.plugins;
      const listed = await plugins.listPluginContributions({ libraryId });
      if (!listed.ok) throw new Error('Plugin manager unavailable');
      const catalogResult = await plugins.request({ type: 'plugin-manager.list-server-extensions' });
      if (!catalogResult.ok || !('extensions' in catalogResult)) throw new Error('Missing server catalogue');
      const serverInstall = await plugins.request({
        type: 'plugin-manager.install-server-extension',
        pluginId: 'com.super.infinite-canvas',
        scope: 'user',
      });
      if (!serverInstall.ok) throw new Error('Server install failed');
      const after = await plugins.request({ type: 'plugin-manager.list', libraryId });
      if (!after.ok || !('packages' in after)) throw new Error('Missing packages');
      const pkg = after.packages.find((entry) => entry.pluginId === 'com.super.infinite-canvas');
      if (!pkg) throw new Error('Extension package is missing after install');
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
      return pkg.version;
    }, libraryId);
    expect(installed).toBe('1.0.0');

    await window.locator('.asset-card').filter({ hasText: 'infinite-canvas.png' }).click();
    await window.keyboard.press('Space');
    const tutorial = window.getByRole('dialog', { name: '无限画布已就绪' });
    const canvasButton = window.getByRole('button', { name: '无限画布' });
    await expect(canvasButton).toBeVisible({ timeout: 15_000 });
    await canvasButton.click();
    await expect(tutorial).toBeVisible();
    await window.screenshot({ path: test.info().outputPath('infinite-canvas-tutorial.png') });
    await tutorial.getByRole('button', { name: '开始使用' }).click();
    await expect.poll(async () => (await mainWindowState(application!)).count).toBe(2);
    expect((await mainWindowState(application)).minimized).toBe(false);
    await expect.poll(async () => (await application!.windows()).some((candidate) =>
      candidate.url().includes('floating-preview.html'))).toBe(true);

    const detached = (await application.windows()).find((candidate) =>
      candidate.url().includes('floating-preview.html'));
    expect(detached).toBeDefined();
    const closed = detached!.waitForEvent('close');
    await detached!.getByRole('button', { name: '关闭悬浮预览' }).click().catch((error) => {
      if (!detached!.isClosed()) throw error;
    });
    await closed;
    await expect.poll(async () => (await mainWindowState(application!)).count).toBe(1);
    expect((await mainWindowState(application)).minimized).toBe(false);

    // The one-time guide does not return on the next use.
    await canvasButton.click();
    await expect(tutorial).toBeHidden();
    await expect.poll(async () => (await mainWindowState(application!)).count).toBe(2);
    await expect.poll(async () => (await application!.windows()).some((candidate) =>
      candidate.url().includes('floating-preview.html'))).toBe(true);
    const secondDetached = (await application.windows()).find((candidate) =>
      candidate.url().includes('floating-preview.html'));
    const secondClosed = secondDetached!.waitForEvent('close');
    await secondDetached!.getByRole('button', { name: '关闭悬浮预览' }).click().catch((error) => {
      if (!secondDetached!.isClosed()) throw error;
    });
    await secondClosed;
  } finally {
    catalog.server.close();
    await application?.close();
    rmSync(root, { recursive: true, force: true });
  }
});