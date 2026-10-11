import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { SuperLibraryApi } from '../../src/shared/library-api';
import { dismissQuickStart, resolveElectronExecutablePath } from './electron-test-helpers';

type SidebarProbe = {
  releaseFolders: () => void;
  releaseCounts: () => void;
  firstPages: number;
  folderHeld: boolean;
  rootCountHeld: boolean;
};
type ProbeHost = typeof globalThis & { __superSidebarProbe?: SidebarProbe };

test.describe.configure({ timeout: 120_000 });

test('restored sorting does not cancel sidebar; ready lists do not wait for unrelated counts', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'super-sidebar-hydration-'));
  const image = path.join(root, 'sidebar-fixture.png');
  writeFileSync(image, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
  const applicationDirectory = process.env.SUPER_E2E_APP_DIRECTORY ?? process.cwd();
  const packaged = process.env.SUPER_E2E_PACKAGED_EXECUTABLE;
  const application = await electron.launch({
    executablePath: packaged ?? resolveElectronExecutablePath(), args: packaged ? [] : [applicationDirectory], cwd: applicationDirectory,
    env: { ...process.env, SUPER_E2E: '1', SUPER_E2E_RESTORE_RECENT: '1',
      SUPER_E2E_CREATE_PARENT_PATH: root, SUPER_E2E_USER_DATA_PATH: path.join(root, 'profile'), SUPER_E2E_IMPORT_FILES: image },
  });
  try {
    if (packaged) await application.evaluate(({ dialog }, fixture) => {
      dialog.showOpenDialog = async (...args: unknown[]) => {
        const options = args.at(-1) as { title?: string };
        return { canceled: false, filePaths: [options.title === 'Create Library' || options.title === '创建资源库' ? fixture.root : fixture.image] };
      };
    }, { root, image });
    const page = await application.firstWindow();
    await dismissQuickStart(page);
    await page.getByRole('button', { name: '创建资源库', exact: true }).click();
    await page.getByRole('textbox', { name: '名称', exact: true }).fill('Sidebar regression fixture');
    await page.getByRole('button', { name: '创建', exact: true }).click();
    await page.getByRole('button', { name: '导入文件', exact: true }).first().click();
    await expect(page.locator('.asset-card').filter({ hasText: 'sidebar-fixture.png' })).toBeVisible();
    const fixture = await page.evaluate(async () => {
      const api = (window as unknown as { super: { library: SuperLibraryApi } }).super.library;
      const opened = await api.listOpen();
      if (!opened.ok || !opened.value[0]) throw Error('Expected isolated open library');
      const libraryId = opened.value[0].libraryId;
      const folder = await api.createFolder({ libraryId, name: 'Sidebar ready folder' });
      const collection = await api.createCollection({ libraryId, name: 'Sidebar ready collection' });
      const smart = await api.createSmartCollection({ libraryId, name: 'Sidebar ready smart', queryDefinitionJson: '{}' });
      if (!folder.ok || !collection.ok || !smart.ok) throw Error('Could not create isolated organization fixture');
      localStorage.setItem('superApi.browse-sort-prefs.v1', JSON.stringify({ version: 1, field: 'modified_at', order: 'desc' }));
      localStorage.setItem(`superApi.browser-session.v1.${libraryId}`, JSON.stringify({ version: 1, scope: { kind: 'all' }, selectedAssetId: '', selectedAssetName: '' }));
      return { libraryId, folderId: folder.value.folderId, collectionId: collection.value.collectionId };
    });
    await application.evaluate(({ ipcMain }, libraryId) => {
      const channel = 'super:library:request';
      const handlers = (ipcMain as unknown as { _invokeHandlers?: Map<string, (...args: unknown[]) => unknown> })._invokeHandlers;
      const original = handlers?.get(channel);
      if (!original) throw Error('Fixture requires existing real Main IPC handler');
      let releaseFolders!: () => void, releaseCounts!: () => void;
      const foldersGate = new Promise<void>(resolve => { releaseFolders = resolve; });
      const countsGate = new Promise<void>(resolve => { releaseCounts = resolve; });
      const probe: SidebarProbe = { releaseFolders, releaseCounts, firstPages: 0, folderHeld: false, rootCountHeld: false };
      (globalThis as ProbeHost).__superSidebarProbe = probe;
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, async (event, input: unknown) => {
        const command = input as { type?: string; libraryId?: string; limit?: number; idsOnly?: boolean; layoutOnly?: boolean; scope?: { kind?: string; folderId?: string | null } };
        // Preserve real parsing, authorization, database reads and responses.
        // Only transport delivery is controlled inside this owned test process.
        const result = await original(event, input);
        if (command.libraryId !== libraryId) return result;
        if (command.type === 'asset.search.request' && command.limit === 100 && !command.idsOnly && !command.layoutOnly) probe.firstPages += 1;
        if (command.type === 'folder.list.request') { probe.folderHeld = true; await foldersGate; }
        if (command.type === 'asset.search.request' && command.limit === 1 && command.scope?.kind === 'folder' && command.scope.folderId === null) {
          probe.rootCountHeld = true; await countsGate;
        }
        return result;
      });
    }, fixture.libraryId);
    await page.reload();
    await expect.poll(() => application.evaluate(() => {
      const probe = (globalThis as ProbeHost).__superSidebarProbe;
      return Boolean(probe && probe.firstPages >= 2 && probe.folderHeld && probe.rootCountHeld);
    }), { timeout: 15_000 }).toBe(true);
    // The real persisted sort has now issued the superseding foreground query.
    // Folder/count gates remain held, but independent collections must appear.
    await expect(page.locator(`.nav-row[data-nav-collection-id="${fixture.collectionId}"]`)).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.nav-row').filter({ hasText: 'Sidebar ready smart' })).toBeVisible();
    await application.evaluate(() => (globalThis as ProbeHost).__superSidebarProbe!.releaseFolders());
    await expect(page.locator(`.nav-row[data-nav-folder-id="${fixture.folderId}"]`)).toBeVisible();
    await expect(page.getByRole('button', { name: '所有资产', exact: true }).locator('.nav-count')).toHaveText('1');
    await expect(page.locator('.inspector-content .metadata-list > div').filter({ hasText: '文件夹' }).locator('dd')).toHaveText('1');
    await page.screenshot({ path: test.info().outputPath('sidebar-before-slow-count.png') });
    await application.evaluate(() => (globalThis as ProbeHost).__superSidebarProbe!.releaseCounts());
    await page.getByRole('button', { name: '资源库根目录', exact: true }).click();
    await expect(page.locator('.folder-card').filter({ hasText: 'Sidebar ready folder' })).toBeVisible();
    await page.getByRole('button', { name: '所有资产', exact: true }).click();
    await page.getByLabel('搜索资源库', { exact: true }).fill('no-matching-asset');
    await expect(page.locator('.asset-card')).toHaveCount(0);
    // Force the real renderer background reconciliation for this owned library,
    // preserving the active filter. This is presentation wiring, not a disk test.
    await application.evaluate(({ BrowserWindow }, libraryId) => {
      BrowserWindow.getAllWindows().find(window => window.isVisible())!.webContents.send('super:asset:changed', {
        type: 'asset.changed', libraryId, source: 'watcher', changedCount: 1, missingCount: 0,
      });
    }, fixture.libraryId);
    await expect(page.getByText('已自动同步 1 项磁盘变化。', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '所有资产', exact: true }).locator('.nav-count')).toHaveText('1');
    await expect(page.locator('.asset-card')).toHaveCount(0);
  } finally {
    await application.evaluate(() => {
      const probe = (globalThis as ProbeHost).__superSidebarProbe;
      probe?.releaseFolders(); probe?.releaseCounts();
    }).catch(() => undefined);
    await application.close();
    // Keep this small owned fixture and traces available for investigation.
  }
});
