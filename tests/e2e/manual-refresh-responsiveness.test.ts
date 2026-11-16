import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { _electron as electron, expect, test } from '@playwright/test';

import type { SuperLibraryApi } from '../../src/shared/library-api';
import {
  dismissQuickStart,
  resolveElectronExecutablePath,
  resolveSessionLogPath,
} from './electron-test-helpers';

test.describe.configure({ timeout: 240_000 });

test('manual refresh yields the Worker loop to foreground queries', async () => {
  test.skip(process.platform !== 'win32', 'Windows desktop IPC regression');
  const root = mkdtempSync(path.join(tmpdir(), 'super-manual-refresh-'));
  const profile = path.join(root, 'profile');
  let application: Awaited<ReturnType<typeof electron.launch>> | undefined;
  try {
    application = await electron.launch({
      executablePath: resolveElectronExecutablePath(),
      args: [process.cwd()],
      cwd: process.cwd(),
      env: {
        ...process.env,
        SUPER_E2E: '1',
        SUPER_E2E_USER_DATA_PATH: profile,
        SUPER_E2E_CREATE_PARENT_PATH: root,
        SUPER_DISABLE_AUTOMATIC_UPDATES: '1',
      },
    });
    const window = await application.firstWindow();
    await dismissQuickStart(window);
    await window.getByRole('button', { name: '创建资源库' }).click();
    await window.getByRole('textbox', { name: '名称' }).fill('Manual refresh yield');
    await window.getByRole('button', { name: '创建', exact: true }).click();
    await expect(window.getByRole('heading', { name: '导入资产以开始整理' })).toBeVisible();

    const libraryId = await window.evaluate(async () => {
      const api = (globalThis as typeof globalThis & { super: { library: SuperLibraryApi } }).super.library;
      const result = await api.listOpen();
      if (!result.ok || !result.value[0]) throw new Error('Missing test library');
      return result.value[0].libraryId;
    });
    const assetsPath = path.join(root, 'Manual refresh yield', 'Assets');
    mkdirSync(assetsPath, { recursive: true });
    for (let index = 0; index < 30_000; index += 1) {
      writeFileSync(path.join(assetsPath, `refresh-${index}.txt`), 'x');
    }

    const refreshStartedAt = await window.evaluate(async (id) => {
      const api = (globalThis as typeof globalThis & { super: { library: SuperLibraryApi } }).super.library;
      (globalThis as typeof globalThis & { __manualRefresh?: Promise<unknown> }).__manualRefresh =
        api.refreshAssets({ libraryId: id });
      return performance.now();
    }, libraryId);
    await new Promise((resolve) => setTimeout(resolve, 150));

    const searchDurations: number[] = [];
    for (let index = 0; index < 5; index += 1) {
      const duration = await window.evaluate(async (id) => {
        const api = (globalThis as typeof globalThis & { super: { library: SuperLibraryApi } }).super.library;
        const started = performance.now();
        const result = await api.searchAssets({ libraryId: id, limit: 100, offset: 0 });
        if (!result.ok) throw new Error(JSON.stringify(result.error));
        return performance.now() - started;
      }, libraryId);
      searchDurations.push(duration);
      expect(duration).toBeLessThan(2_000);
    }

    const refresh = await window.evaluate(async () => {
      const pending = (globalThis as typeof globalThis & {
        __manualRefresh?: Promise<{ ok: boolean; value?: { changedCount: number }; error?: unknown }>;
      }).__manualRefresh;
      if (!pending) throw new Error('Manual refresh promise missing');
      const result = await pending;
      return { ok: result.ok, changedCount: result.value?.changedCount ?? -1 };
    });
    const refreshDurationMs = await window.evaluate((startedAt) => performance.now() - startedAt, refreshStartedAt);
    expect(refresh.ok).toBe(true);
    expect(refresh.changedCount).toBe(30_000);
    expect(refreshDurationMs).toBeGreaterThan(500);

    const logText = readFileSync(resolveSessionLogPath(path.join(profile, 'logs')), 'utf8');
    expect(logText).not.toContain('WorkerRequestTimeoutError');
    console.log(`MANUAL_REFRESH_MS ${Math.round(refreshDurationMs)} SEARCH_MS ${JSON.stringify(searchDurations.map(Math.round))}`);
  } finally {
    await application?.close();
    await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  }
});