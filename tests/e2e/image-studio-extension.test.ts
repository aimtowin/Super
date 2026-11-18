import { createServer, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { _electron as electron, expect, test } from '@playwright/test';

import type { SuperPluginManagerApi } from '../../src/shared/plugin-manager-api';
import { resolveElectronExecutablePath } from './electron-test-helpers';

test.describe.configure({ timeout: 180_000 });

const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nXQAAAAASUVORK5CYII=';

async function startMockServices(): Promise<{ catalog: Server; proxy: Server; catalogUrl: string; proxyUrl: string }> {
  const zip = readFileSync(path.join(process.cwd(), 'extensions/dist/com.super.image-studio-1.0.0-win32-x64.zip'));
  const sha256 = createHash('sha256').update(zip).digest('hex');
  const catalog = {
    catalogVersion: 1,
    extensions: [{
      id: 'com.super.image-studio',
      name: '图片素材生成',
      version: '1.0.0',
      description: 'image studio',
      author: 'Super',
      platform: 'win32-x64',
      minAppVersion: '2.4.8',
      asset: {
        path: 'com.super.image-studio-1.0.0-win32-x64.zip',
        size: zip.byteLength,
        sha256,
      },
    }],
  };
  const proxyRecords: Array<{
    id: string;
    createdAt: string;
    prompt: string;
    model: string;
    size: string;
    images: Array<{ url: string; downloadUrl: string; width: number; height: number; bytes: number }>;
  }> = [];
  const proxy = createServer((request, response) => {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { raw += chunk; });
    request.on('end', () => {
      let body;
      try { body = JSON.parse(raw); } catch { body = {}; }
      response.setHeader('content-type', 'application/json');
      if (body.password !== 'test-password') {
        response.statusCode = 401;
        response.end(JSON.stringify({ ok: false, error: { code: 'UNAUTHORIZED', message: '密码不正确。' } }));
        return;
      }
      if (request.url === '/history') {
        response.end(JSON.stringify({ ok: true, records: proxyRecords }));
        return;
      }
      if (request.url === '/generate') {
        const record = {
          id: `record-${proxyRecords.length + 1}`,
          createdAt: new Date().toISOString(),
          prompt: body.prompt,
          model: 'gpt-image-2.6',
          size: body.size,
          images: [{
            url: PNG_DATA_URL,
            downloadUrl: PNG_DATA_URL,
            width: 1024,
            height: 1024,
            bytes: 68,
          }],
        };
        proxyRecords.unshift(record);
        response.end(JSON.stringify({ ok: true, record }));
        return;
      }
      response.statusCode = 404;
      response.end(JSON.stringify({ ok: false }));
    });
  });
  const catalogServer = createServer((request, response) => {
    if (request.url === '/latest.json') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(catalog));
      return;
    }
    if (request.url === '/com.super.image-studio-1.0.0-win32-x64.zip') {
      response.writeHead(200, { 'content-type': 'application/octet-stream' });
      response.end(zip);
      return;
    }
    response.writeHead(404);
    response.end();
  });
  await Promise.all([
    new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve)),
    new Promise<void>((resolve) => catalogServer.listen(0, '127.0.0.1', resolve)),
  ]);
  const proxyAddress = proxy.address();
  const catalogAddress = catalogServer.address();
  if (proxyAddress === null || typeof proxyAddress === 'string'
    || catalogAddress === null || typeof catalogAddress === 'string') {
    throw new Error('No service port');
  }
  return {
    catalog: catalogServer,
    proxy,
    catalogUrl: `http://127.0.0.1:${catalogAddress.port}/latest.json`,
    proxyUrl: `http://127.0.0.1:${proxyAddress.port}`,
  };
}

test('image studio installs, unlocks with the password and generates an asset', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'super-image-studio-e2e-'));
  const services = await startMockServices();
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
        SUPER_PLUGIN_CATALOG_URL: services.catalogUrl,
        IMAGE_STUDIO_PROXY_URL: services.proxyUrl,
        SUPER_DISABLE_AUTOMATIC_UPDATES: '1',
      },
    });
    const window = await application.firstWindow();
    await window.getByRole('button', { name: '跳过引导', exact: true }).click();
    await window.getByRole('button', { name: '创建资源库' }).click();
    await window.getByRole('textbox', { name: '名称' }).fill('Image studio');
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
      const listed = await plugins.request({ type: 'plugin-manager.list-server-extensions' });
      if (!listed.ok || !('extensions' in listed)) throw new Error('Missing catalogue');
      const installed = await plugins.request({
        type: 'plugin-manager.install-server-extension',
        pluginId: 'com.super.image-studio',
        scope: 'user',
      });
      if (!installed.ok) throw new Error('Install failed');
      const after = await plugins.request({ type: 'plugin-manager.list', libraryId });
      if (!after.ok || !('packages' in after)) throw new Error('Missing packages');
      const pkg = after.packages.find((entry) => entry.pluginId === 'com.super.image-studio');
      if (!pkg) throw new Error('Missing extension package');
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
    const studioEntry = window.getByRole('button', { name: '图片素材生成', exact: true });
    await expect(studioEntry).toBeVisible({ timeout: 15_000 });
    await studioEntry.click();

    const frame = window.frameLocator('iframe.plugin-sidebar-view-frame');
    await expect(frame.getByRole('heading', { name: '输入访问密码' })).toBeVisible({ timeout: 15_000 });
    await frame.locator('#password').fill('wrong-password');
    await frame.getByRole('button', { name: '解锁工作台' }).click();
    await expect(frame.getByRole('alert')).toContainText('密码不正确');

    await frame.locator('#password').fill('test-password');
    await frame.getByRole('button', { name: '解锁工作台' }).click();
    await expect(frame.getByRole('heading', { name: '生成一张素材' })).toBeVisible();
    await frame.getByPlaceholder(/例如/).fill('测试图片素材');
    await frame.getByRole('button', { name: '生成素材' }).click();
    await expect(frame.locator('.stage-card img')).toBeVisible({ timeout: 15_000 });
    await expect(frame.getByText('生成完成')).toBeVisible();
    await expect(frame.locator('.history-card')).toHaveCount(1);
  } finally {
    services.catalog.close();
    services.proxy.close();
    await application?.close();
    rmSync(root, { recursive: true, force: true });
  }
});