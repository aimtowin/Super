import { dismissQuickStart } from './electron-test-helpers';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { _electron as electron, expect, test } from '@playwright/test';

import { assetCard, resolveElectronExecutablePath } from './electron-test-helpers';

test('cancels a legacy missing-asset batch relink preview and later applies a fresh preview', async () => {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'super-relink-e2e-'));
  const libraryName = '批量找回验收';
  const libraryPath = path.join(temporaryRoot, libraryName);
  const sourcePath = path.join(temporaryRoot, 'missing.txt');
  const replacementRoot = path.join(temporaryRoot, 'replacement-root');
  writeFileSync(sourcePath, 'original');
  mkdirSync(replacementRoot);
  writeFileSync(path.join(replacementRoot, 'missing.txt'), 'replacement');

  const applicationDirectory = process.env.SUPER_E2E_APP_DIRECTORY ?? process.cwd();
  const application = await electron.launch({
    args: [applicationDirectory],
    cwd: applicationDirectory,
    executablePath: resolveElectronExecutablePath(),
    env: {
      ...process.env,
      SUPER_E2E: '1',
      SUPER_E2E_USER_DATA_PATH: path.join(temporaryRoot, 'user-data'),
      SUPER_E2E_CREATE_PARENT_PATH: temporaryRoot,
      SUPER_E2E_IMPORT_FILES: sourcePath,
      SUPER_E2E_RELINK_ROOT: replacementRoot,
    },
  });

  try {
    const window = await application.firstWindow();
    await dismissQuickStart(window);
    await window.getByRole('button', { name: '创建资源库' }).click();
    await window.getByRole('textbox', { name: '名称' }).fill(libraryName);
    await window.getByRole('button', { name: '创建', exact: true }).click();
    await window.getByRole('button', { name: '导入文件', exact: true }).first().click();
    await expect(assetCard(window, 'missing.txt')).toBeVisible();

    // Seed a historical broken location, not a successful current disk
    // reconciliation: confirmed removals intentionally leave no index row.
    // This only writes the owned fixture DB, never the installed user's library.
    const managedPath = path.join(libraryPath, 'Assets', 'legacy', 'missing.txt');
    await application.evaluate(({app}, fixturePath) => {
      const {createRequire} = process.getBuiltinModule('node:module');
      const require = createRequire(`${app.getAppPath()}/package.json`);
      const Database = require('better-sqlite3');
      const database = new Database(`${fixturePath}/.super/library.db`);
      try {
        const result = database.prepare(
          "UPDATE assets SET availability = 'missing', relative_file_path = 'legacy/missing.txt', path_identity = 'legacy/missing.txt' WHERE relative_file_path = 'missing.txt'",
        ).run();
        if (result.changes !== 1) throw new Error('Expected one owned legacy fixture asset.');
      } finally {database.close();}
    }, libraryPath);
    await window.getByRole('button', { name: '所有资产', exact: true }).click();
    await assetCard(window, 'missing.txt').click();
    const inspectorStatus = window.locator('.inspector-status-row');
    await expect(inspectorStatus).toBeVisible();
    await expect(inspectorStatus).toContainText('未在已知位置找到，请选择恢复位置');
    await expect(inspectorStatus.getByRole('button', { name: '找回资产' })).toBeVisible();
    await expect(window.getByRole('button', { name: '批量重新定位' })).toBeVisible();

    await window.getByRole('button', { name: '批量重新定位' }).click();
    const firstPreview = window.getByRole('dialog', { name: '批量重新定位预览' });
    await expect(firstPreview).toContainText('已找回');
    await expect(firstPreview).toContainText('1');
    await firstPreview.getByRole('button', { name: '取消', exact: true }).last().click();
    await expect(firstPreview).toHaveCount(0);
    expect(existsSync(managedPath)).toBe(false);

    await window.getByRole('button', { name: '批量重新定位' }).click();
    const freshPreview = window.getByRole('dialog', { name: '批量重新定位预览' });
    await freshPreview.getByRole('button', { name: '应用批量重新定位' }).click();
    await expect(window.locator('.workspace-notice')).toContainText('恢复 1 项');
    expect(readFileSync(managedPath, 'utf8')).toBe('replacement');
    await window.getByRole('button', { name: '刷新磁盘变化' }).click();
    await expect(window.getByRole('button', { name: '批量重新定位' })).toHaveCount(0);
  } finally {
    await application.close();
    rmSync(temporaryRoot, { force: true, recursive: true });
  }
});
