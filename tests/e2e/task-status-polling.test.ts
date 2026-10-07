import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';
import type { AppLogEntry } from '../../src/shared/app-log';
import { resolveElectronExecutablePath } from './electron-test-helpers';

test('shares a single status poll when opening, closing and reopening the task panel', async () => {
  test.setTimeout(90_000);
  const root = mkdtempSync(path.join(tmpdir(), 'super-task-polling-'));
  const applicationDirectory = process.env.SUPER_E2E_APP_DIRECTORY ?? process.cwd();
  const application = await electron.launch({ executablePath: resolveElectronExecutablePath(),
    args: [applicationDirectory], cwd: applicationDirectory,
    env: { ...process.env, SUPER_E2E: '1', SUPER_E2E_CREATE_PARENT_PATH: root,
      SUPER_E2E_USER_DATA_PATH: path.join(root, 'profile'), SUPER_WORKER_CMD_LOG: '1' } });
  try {
    if (process.env.SUPER_E2E_PACKAGED_EXECUTABLE) {
      await application.evaluate(({ dialog }, parent) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [parent] });
      }, root);
    }
    const page = await application.firstWindow();
    await page.getByRole('button', { name: '跳过引导', exact: true }).click();
    await page.getByRole('button', { name: '创建资源库', exact: true }).click();
    await page.getByRole('textbox', { name: '名称', exact: true }).fill('轮询回归');
    await page.getByRole('button', { name: '创建', exact: true }).click();
    await expect(page.locator('.workspace-tools-overflow > button')).toBeEnabled();
    const logsPath = await application.evaluate(({ app }) => app.getPath('logs'));
    // Count completed real Worker requests, not mocked timers or renderer calls.
    const countPolls = () => readdirSync(logsPath).filter((name) => name.startsWith('super-') && name.endsWith('.log'))
      .flatMap((name) => readFileSync(path.join(logsPath, name), 'utf8').trim().split(/\r?\n/))
      .filter(Boolean).map((line) => JSON.parse(line) as AppLogEntry)
      .filter((entry) => entry.scope === 'worker.cmd.roundtrip' && entry.context?.commandType === 'media.list-jobs').length;
    await expect.poll(countPolls).toBeGreaterThan(0);
    const dialog = page.getByRole('dialog', { name: '后台媒体任务', exact: true });
    for (let cycle = 0; cycle < 2; cycle++) {
      await page.locator('.workspace-tools-overflow > button').click();
      await page.getByRole('menuitem', { name: '后台任务', exact: true }).click();
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('.field-help').first()).toContainText('0');
      const openStart = countPolls();
      await page.waitForTimeout(4_400);
      const openPolls = countPolls() - openStart;
      expect(openPolls).toBeGreaterThanOrEqual(3);
      expect(openPolls).toBeLessThanOrEqual(5);
      await dialog.getByRole('button', { name: '关闭后台任务', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      const closedStart = countPolls();
      await page.waitForTimeout(4_400);
      const closedPolls = countPolls() - closedStart;
      expect(closedPolls).toBeGreaterThanOrEqual(1);
      expect(closedPolls).toBeLessThanOrEqual(3);
      console.info('[task-status-polling]', JSON.stringify({ cycle, openPolls, closedPolls, sampleMs: 4_400 }));
    }
  } finally {
    await application.close();
    rmSync(root, { recursive: true, force: true });
  }
});
