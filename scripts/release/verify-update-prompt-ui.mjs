// Render the actual App.tsx update section with controlled state, then verify
// its production CSS in Chromium. No installed Super Lib or update API is used.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from '@playwright/test';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '../..');
const source = await readFile(resolve(root, 'src/renderer/App.tsx'), 'utf8');
const parsed = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let section;
let percentage;
function visit(node) {
  if (ts.isJsxElement(node) && node.openingElement.attributes.properties.some(
    (attribute) => ts.isJsxAttribute(attribute) && attribute.name.text === 'className' &&
      attribute.initializer?.text === 'app-update-ready-prompt',
  )) section = node.getText(parsed);
  if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === 'appUpdatePercent') {
    percentage = node.initializer.getText(parsed);
  }
  ts.forEachChild(node, visit);
}
visit(parsed);
assert(section && percentage, 'Update prompt JSX and progress computation must exist');
const renderSource = `function render(state) {
  const { appUpdateDownloading, appUpdateProgress, preparedAppUpdate, availableAppUpdate,
    appUpdateRestarting, t, formatBytes } = state;
  const appUpdatePercent = ${percentage};
  const cancelAppUpdateDownload = () => {};
  const setPreparedAppUpdate = () => {};
  const completePreparedAppUpdate = () => {};
  const downloadAppUpdate = () => {};
  return (${section});
}`;
const compiled = ts.transpileModule(renderSource, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
}).outputText;
// Only trusted local source is evaluated; this keeps the fixture from drifting
// into a separate hand-written replica of the shipped UI.
const render = new Function('require', 'exports', `${compiled}; return render;`)(require, {});
const messages = {
  'dialog.about.updateDownloading': '正在下载更新…',
  'dialog.about.updateReadyTitle': '更新已准备就绪',
  'dialog.about.updateAvailable': '发现新版本 {version}',
  'dialog.about.updateReadyMessage': '版本 {version} 已下载完成。重启后开始安装更新。',
  'dialog.about.updateAvailableMessage': '新版本已准备就绪。',
  'dialog.about.cancelDownload': '取消下载',
  'dialog.about.updateLater': '稍后更新',
  'dialog.about.updateRestarting': '正在准备安装…',
  'dialog.about.updateRestart': '重启并完成更新',
  'dialog.about.updateDownload': '下载更新',
};
const base = {
  appUpdateDownloading: false, appUpdateProgress: null, preparedAppUpdate: null,
  availableAppUpdate: { latestVersion: '2.2.2', releaseNotes: '优化资源加载与更新体验。\n保留现有的资源库和个人设置。' },
  appUpdateRestarting: false,
  t: (key, params = {}) => Object.entries(params).reduce((text, [name, value]) => text.replace(`{${name}}`, value), messages[key] ?? key),
  formatBytes: (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`,
};
const cases = {
  available: {},
  downloading: { appUpdateDownloading: true, appUpdateProgress: { downloadedBytes: 56e6, totalBytes: 100e6 } },
  unknown: { appUpdateDownloading: true, appUpdateProgress: { downloadedBytes: 4e6 } },
  zero: { appUpdateDownloading: true, appUpdateProgress: { downloadedBytes: 0, totalBytes: 0 } },
  clamped: { appUpdateDownloading: true, appUpdateProgress: { downloadedBytes: 120, totalBytes: 100 } },
  ready: { preparedAppUpdate: { version: '2.2.2' } },
  restarting: { preparedAppUpdate: { version: '2.2.2' }, appUpdateRestarting: true },
  long: { availableAppUpdate: { latestVersion: '2.2.2', releaseNotes: '长版本说明与连续文件路径'.repeat(100) } },
};
const css = await readFile(resolve(root, 'src/renderer/styles.css'), 'utf8');
const output = resolve(root, 'tmp/update-ui-preview');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
let checks = 0;
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  for (const theme of ['dark', 'light']) {
    for (const width of [320, 900]) {
      await page.setViewportSize({ width, height: 620 });
      for (const [name, state] of Object.entries(cases)) {
        await page.setContent(`<style>${css}</style><style>
          :root { ${theme === 'light' ? '--ui-surface-raised:#fafafa;--ui-content-primary:#22262b;--ui-content-secondary:#59616c;--ui-border-divider:#cfd4da;--ui-surface-canvas:#e6e9ee;color-scheme:light;' : ''} }
          body { margin:0; background:var(--canvas); }
        </style>${renderToStaticMarkup(render({ ...base, ...state }))}`);
        const prompt = page.locator('.app-update-ready-prompt');
        assert(await prompt.isVisible());
        assert(await prompt.evaluate((el) => el.scrollWidth <= el.clientWidth), `${theme}/${width}/${name}: overflow`);
        if (name === 'downloading') assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'), '56');
        if (name === 'clamped') assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'), '100');
        if (name === 'unknown' || name === 'zero') {
          assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'), null);
          assert.equal(await page.locator('.app-update-mini-progress > span').evaluate((el) => globalThis.getComputedStyle(el).animationName), 'none');
        }
        if (name === 'restarting') assert(await page.getByRole('button', { name: '正在准备安装…' }).isDisabled());
        if (name === 'ready') {
          await page.keyboard.press('Tab');
          assert.equal(await page.locator(':focus').textContent(), '稍后更新');
          await page.keyboard.press('Tab');
          assert.equal(await page.locator(':focus').textContent(), '重启并完成更新');
        }
        if (['downloading', 'ready'].includes(name)) {
          await prompt.screenshot({ path: resolve(output, `app-${theme}-${width}-${name}.png`) });
        }
        checks++;
      }
    }
  }
  console.log(`Passed ${checks} update prompt visual/state checks (light/dark, 320/900px).`);
} finally {
  await browser.close();
}
