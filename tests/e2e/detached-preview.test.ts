import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { _electron as electron, expect, test } from '@playwright/test';

import type { SuperLibraryApi } from '../../src/shared/library-api';
import { resolveElectronExecutablePath } from './electron-test-helpers';

test.describe.configure({ timeout: 180_000 });

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nXQAAAAASUVORK5CYII=',
  'base64',
);

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
      visible: main?.isVisible() ?? false,
      minimized: main?.isMinimized() ?? true,
    };
  });
}

test('detached preview keeps the main viewport and default preview restores it', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'super-detached-preview-e2e-'));
  const source = path.join(root, 'detached-preview.png');
  writeFileSync(source, PNG_1X1);
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
        SUPER_DISABLE_AUTOMATIC_UPDATES: '1',
      },
    });
    const window = await application.firstWindow();
    await window.getByRole('button', { name: '跳过引导', exact: true }).click();
    await window.getByRole('button', { name: '创建资源库' }).click();
    await window.getByRole('textbox', { name: '名称' }).fill('Detached preview');
    await window.getByRole('button', { name: '创建', exact: true }).click();
    await window.getByRole('button', { name: '导入文件', exact: true }).first().click();
    await expect(window.locator('.asset-card').filter({ hasText: 'detached-preview.png' })).toBeVisible({ timeout: 20_000 });

    await expect.poll(async () => window.evaluate(async () => {
      const api = (globalThis as typeof globalThis & { super: { library: SuperLibraryApi } }).super.library;
      const libraries = await api.listOpen();
      if (!libraries.ok || !libraries.value[0]) return null;
      const result = await api.searchAssets({
        libraryId: libraries.value[0].libraryId,
        query: null,
        limit: 50,
        offset: 0,
      });
      return result.ok
        ? result.value.items.find((entry) => entry.displayName === 'detached-preview.png')?.assetId ?? null
        : null;
    })).not.toBeNull();
    const assetId = await window.evaluate(async () => {
      const api = (globalThis as typeof globalThis & { super: { library: SuperLibraryApi } }).super.library;
      const libraries = await api.listOpen();
      if (!libraries.ok || !libraries.value[0]) throw new Error('Missing library');
      const libraryId = libraries.value[0].libraryId;
      const result = await api.searchAssets({ libraryId, query: null, limit: 50, offset: 0 });
      const asset = result.ok
        ? result.value.items.find((entry) => entry.displayName === 'detached-preview.png')
        : undefined;
      if (!asset) throw new Error('Missing asset');
      return { libraryId, assetId: asset.assetId };
    });

    await window.evaluate(async ({ libraryId, assetId }) => {
      const api = (globalThis as typeof globalThis & { super: { library: SuperLibraryApi } }).super.library;
      const result = await api.openDetachedPreview({ libraryId, assetId });
      if (!result.ok) throw new Error(JSON.stringify(result.error));
    }, assetId);
    await expect.poll(async () => (await mainWindowState(application!)).count).toBe(2);
    // The same asset must not be opened twice as duplicate detached monitors.
    await window.evaluate(async ({ libraryId, assetId }) => {
      const api = (globalThis as typeof globalThis & { super: { library: SuperLibraryApi } }).super.library;
      const result = await api.openDetachedPreview({ libraryId, assetId });
      if (!result.ok) throw new Error(JSON.stringify(result.error));
    }, assetId);
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect((await mainWindowState(application)).count).toBe(2);
    let mainState = await mainWindowState(application);
    expect(mainState.visible).toBe(true);
    expect(mainState.minimized).toBe(false);

    const detached = (await application.windows()).find((candidate) =>
      candidate.url().includes('floating-preview.html'));
    expect(detached).toBeDefined();
    const detachedClosed = detached!.waitForEvent('close');
    await detached!.getByRole('button', { name: '关闭悬浮预览' }).click().catch((error) => {
      if (!detached!.isClosed()) throw error;
    });
    await detachedClosed;
    await expect.poll(async () => (await mainWindowState(application!)).count).toBe(1);
    mainState = await mainWindowState(application);
    expect(mainState.visible).toBe(true);
    expect(mainState.minimized).toBe(false);

    // The default preview keeps its existing minimize/restore contract.
    await window.evaluate(async ({ libraryId, assetId }) => {
      const api = (globalThis as typeof globalThis & { super: { library: SuperLibraryApi } }).super.library;
      const result = await api.openFloatingPreview({ libraryId, assetId });
      if (!result.ok) throw new Error(JSON.stringify(result.error));
    }, assetId);
    await expect.poll(async () => (await mainWindowState(application!)).count).toBe(2);
    await expect.poll(async () => (await mainWindowState(application!)).minimized).toBe(true);
    const defaultPreview = (await application.windows()).find((candidate) =>
      candidate.url().includes('floating-preview.html'));
    const defaultClosed = defaultPreview!.waitForEvent('close');
    await defaultPreview!.getByRole('button', { name: '关闭悬浮预览' }).click().catch((error) => {
      if (!defaultPreview!.isClosed()) throw error;
    });
    await defaultClosed;
    await expect.poll(async () => (await mainWindowState(application!)).count).toBe(1);
    await expect.poll(async () => (await mainWindowState(application!)).minimized).toBe(false);
  } finally {
    await application?.close();
    rmSync(root, { recursive: true, force: true });
  }
});