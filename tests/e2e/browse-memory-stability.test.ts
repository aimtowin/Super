import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { electronLaunchEnv, resolveElectronExecutablePath } from './electron-test-helpers';

test.describe.configure({ timeout: 180_000 });

async function visibleSummariesReady(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLElement>('.workspace-canvas');
    if (!canvas) return false;
    const bounds = canvas.getBoundingClientRect();
    const visible = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return rect.bottom > bounds.top && rect.top < bounds.bottom && rect.right > bounds.left && rect.left < bounds.right;
    };
    const cards = [...document.querySelectorAll<HTMLElement>('.asset-card:not(.is-layout-preview)')].filter(visible);
    const ids = new Set(cards.map((card) => card.dataset.assetId));
    const slots = [...document.querySelectorAll<HTMLElement>('[data-layout-asset-id]')].filter(visible);
    return cards.length > 0 && slots.every((slot) => ids.has(slot.dataset.layoutAssetId));
  });
}

test('repeated forward/backward jumps reuse summaries without unbounded heap growth', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'super-browse-memory-e2e-'));
  const source = path.join(root, 'source');
  mkdirSync(source);
  const count = 5_000;
  for (let index = 0; index < count; index += 1) {
    writeFileSync(path.join(source, `asset-${String(index).padStart(4, '0')}.txt`), `asset ${index}`);
  }
  const directory = process.env.SUPER_E2E_APP_DIRECTORY ?? process.cwd();
  const application = await electron.launch({
    args: [directory], cwd: directory, executablePath: resolveElectronExecutablePath(),
    env: electronLaunchEnv({
      SUPER_E2E: '1', SUPER_E2E_USER_DATA_PATH: path.join(root, 'user-data'),
      SUPER_E2E_CREATE_PARENT_PATH: root, SUPER_E2E_LINKED_SOURCE: source,
    }),
  });
  try {
    // The packaged app does not accept development native-picker overrides.
    if (process.env.SUPER_E2E_PACKAGED_EXECUTABLE) {
      await application.evaluate(({ dialog }, paths) => {
        dialog.showOpenDialog = async (...args: unknown[]) => {
          const options = args.at(-1) as { title?: string };
          const isCreate = options.title === 'Create Library' || options.title === '创建资源库';
          return { canceled: false, filePaths: [isCreate ? paths.root : paths.source] };
        };
      }, { root, source });
    }
    const page = await application.firstWindow();
    await page.getByRole('button', { name: '跳过引导', exact: true }).click();
    await page.getByRole('button', { name: '创建资源库', exact: true }).click();
    await page.getByRole('textbox', { name: '名称' }).fill('Memory fixture');
    await page.getByRole('button', { name: '创建', exact: true }).click();
    await page.getByRole('button', { name: '主菜单' }).click();
    await page.getByRole('menuitem', { name: '文件', exact: true }).hover();
    await page.getByRole('menuitem', { name: '导入链接文件夹' }).click();
    await expect(page.getByRole('heading', { name: '后台媒体任务', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '关闭后台任务', exact: true }).click();
    await page.getByRole('button', { name: 'source', exact: true }).click();
    const canvas = page.locator('.workspace-canvas');
    await expect(page.locator('.item-count')).toContainText(String(count));
    const tail = page.locator('.asset-card').filter({ hasText: 'asset-4999.txt' });
    await expect.poll(async () => {
      await canvas.evaluate((element) => element.scrollTo(0, element.scrollHeight));
      return tail.count();
    }, { timeout: 60_000 }).toBeGreaterThan(0);
    await expect(tail).toBeInViewport();
    const cdp = await page.context().newCDPSession(page);
    const heap = async () => {
      await cdp.send('HeapProfiler.collectGarbage');
      return (await cdp.send('Runtime.getHeapUsage')).usedSize;
    };
    const initialBytes = await heap();
    const fractions = [0.05, 0.85, 0.25, 0.65, 0.45, 0.95, 0.15, 0.75, 0.35, 0.55];
    let maxMountedCards = 0;
    const traverse = async () => {
      for (const fraction of fractions) {
        await canvas.evaluate((element, ratio) => element.scrollTo(0, (element.scrollHeight - element.clientHeight) * ratio), fraction);
        await expect.poll(() => visibleSummariesReady(page), { timeout: 15_000 }).toBe(true);
        maxMountedCards = Math.max(maxMountedCards, await page.locator('.asset-card').count());
      }
    };
    await traverse();
    const warmedBytes = await heap();
    await traverse();
    await traverse();
    const repeatedBytes = await heap();
    await canvas.evaluate((element) => element.scrollTo(0, 0));
    await expect(page.locator('.asset-card').filter({ hasText: 'asset-0000.txt' })).toBeInViewport();
    console.info(`BROWSE_MEMORY_JSON ${JSON.stringify({ assets: count, initialBytes, warmedBytes, repeatedBytes, repeatGrowthBytes: repeatedBytes - warmedBytes, maxMountedCards })}`);
    // The current contract retains fetched summaries for selection/viewer
    // operations. Revisited pages must not accumulate another scope's worth
    // of objects, and virtualization must remain independent of scope size.
    expect(repeatedBytes - warmedBytes).toBeLessThan(24 * 1024 * 1024);
    expect(maxMountedCards).toBeLessThan(500);
    await cdp.detach();
  } finally {
    await application.close();
    rmSync(root, { recursive: true, force: true });
  }
});
