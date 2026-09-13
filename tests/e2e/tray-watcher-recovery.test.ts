import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import type { SuperLibraryApi } from '../../src/shared/library-api';
import { resolveElectronExecutablePath, resolveSessionLogPath } from './electron-test-helpers';

test('tray restore serves directory reads while coalesced file changes are reconciled', async () => {
  test.setTimeout(120_000);
  test.skip(process.platform !== 'win32', 'Windows tray lifecycle');
  const root = mkdtempSync(path.join(tmpdir(), 'super-tray-recovery-'));
  const source = path.join(root, 'source');
  const profile = path.join(root, 'profile');
  mkdirSync(source);
  for (let index = 0; index < 100; index++) writeFileSync(path.join(source, `before-${index}.txt`), 'before');
  const applicationDirectory = process.env.SUPER_E2E_APP_DIRECTORY ?? process.cwd();
  const application = await electron.launch({
    executablePath: resolveElectronExecutablePath(), args: [applicationDirectory], cwd: applicationDirectory,
    env: { ...process.env, SUPER_E2E: '1', SUPER_E2E_USER_DATA_PATH: profile,
      SUPER_E2E_CREATE_PARENT_PATH: root, SUPER_E2E_LINKED_SOURCE: source },
  });
  try {
    const window = await application.firstWindow();
    await window.getByRole('button', { name: '创建资源库' }).click();
    await window.getByRole('textbox', { name: '名称' }).fill('Tray recovery');
    await window.getByRole('button', { name: '创建', exact: true }).click();
    await expect(window.getByRole('heading', { name: '导入资产以开始整理' })).toBeVisible();
    await window.getByRole('button', { name: '主菜单' }).click();
    await window.getByRole('menuitem', { name: '文件', exact: true }).hover();
    await window.getByRole('menuitem', { name: '导入链接文件夹' }).click();
    await expect(window.getByRole('button', { name: 'source', exact: true })).toBeVisible();
    // Linking deliberately opens the task monitor; dismiss it through the
    // same Escape action a user uses before navigating the workspace.
    await expect(window.locator('.dialog-backdrop')).toBeVisible();
    await window.keyboard.press('Escape');
    await expect(window.locator('.dialog-backdrop')).toHaveCount(0);
    await window.getByRole('button', { name: 'source', exact: true }).click();
    const libraryId = await window.evaluate(async () => {
      const api = (globalThis as typeof globalThis & { super: { library: SuperLibraryApi } }).super.library;
      const result = await api.listOpen();
      if (!result.ok || !result.value[0]) throw new Error('Missing test library');
      return result.value[0].libraryId;
    });
    const logText = () => readFileSync(resolveSessionLogPath(path.join(profile, 'logs')), 'utf8');
    await window.locator('.windows-caption-button-close').dispatchEvent('click');
    await expect.poll(() => logText()).toContain('Paused non-interactive maintenance');
    for (let index = 0; index < 800; index++) writeFileSync(path.join(source, `after-${index}.txt`), 'added while hidden');
    // Allow the real fs.watch debounce to accumulate its pending scope. Long
    // standby itself is covered by state transitions, not a fake soak claim.
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.show());
    const durations: number[] = [];
    for (let index = 0; index < 8; index++) {
      await window.getByRole('button', { name: index % 2 === 0 ? /^资源库根目录/ : 'source', exact: index % 2 !== 0 }).click();
      const duration = await window.evaluate(async (id) => {
        const api = (globalThis as typeof globalThis & { super: { library: SuperLibraryApi } }).super.library;
        const started = performance.now();
        const result = await api.searchAssets({ libraryId: id, limit: 100, offset: 0 });
        if (!result.ok) throw new Error(JSON.stringify(result.error));
        return performance.now() - started;
      }, libraryId);
      durations.push(duration);
      expect(duration).toBeLessThan(2_000);
      await expect(window.getByText('正在读取…', { exact: true })).toBeHidden({ timeout: 3_000 });
    }
    await expect.poll(async () => window.evaluate(async (id) => {
      const api = (globalThis as typeof globalThis & { super: { library: SuperLibraryApi } }).super.library;
      const result = await api.searchAssets({ libraryId: id, limit: 1 });
      return result.ok ? result.value.total : -1;
    // Leave a real idle window between probes: a once-per-second browse
    // intentionally keeps maintenance parked under the new priority policy.
    }, libraryId), { timeout: 30_000, intervals: [4_000] }).toBe(900);
    expect(logText()).not.toContain('WorkerRequestTimeoutError');
    console.log(`TRAY_RECOVERY_READ_MS ${JSON.stringify(durations.map((duration) => Math.round(duration)))}`);
    await window.screenshot({ path: test.info().outputPath('tray-restored.png') });
  } finally {
    await application.close();
    await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  }
});
