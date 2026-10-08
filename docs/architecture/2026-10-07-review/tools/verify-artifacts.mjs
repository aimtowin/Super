// Artifact-only checks. Does not build, install, launch Super, or access a live library.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const review = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(review, '../../..');
const inventory = JSON.parse(fs.readFileSync(path.join(review, 'inventory.json'), 'utf8'));
const tests = JSON.parse(fs.readFileSync(path.join(root, 'tmp/architecture-review-v2.3.16-tests.json'), 'utf8'));
if (!tests.success || tests.numFailedTests !== 0) throw new Error('Focused regression report is not green.');
const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
if (git(['rev-parse', 'HEAD']) !== inventory.sourceCommit) throw new Error('Review HEAD has changed.');
const changedProductionFiles = git(['diff', '--name-only', 'v2.3.16', '--', 'src', 'extension', 'scripts',
  'package.json', 'package-lock.json', 'assets/inno', 'PRODUCT.md']);
if (changedProductionFiles) throw new Error(`Production paths differ from released source: ${changedProductionFiles}`);
for (const file of inventory.files) {
  const bytes = fs.readFileSync(path.join(root, file.path));
  if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) {
    throw new Error(`Snapshot changed: ${file.path}`);
  }
}

const browser = await chromium.launch({ channel: 'msedge', headless: true });
let preview;
try {
  const page = await browser.newPage({ viewport: { width: 1560, height: 1110 }, deviceScaleFactor: 1 });
  const errors = [];
  const requests = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('request', (request) => requests.push(request.url()));
  await page.goto(pathToFileURL(path.join(review, 'architecture-overview.svg')).href);
  if (await page.locator('parsererror').count()) throw new Error('SVG XML parser error.');
  await page.locator('svg').screenshot({ path: path.join(review, 'architecture-overview.png') });
  await page.goto(pathToFileURL(path.join(review, 'index.html')).href);
  await page.locator('.figure img').evaluate((image) => image.decode());
  preview = await page.locator('.figure img').evaluate((image) => ({ width: image.naturalWidth,
    height: image.naturalHeight, loaded: image.complete,
    documentScrollWidth: image.ownerDocument.documentElement.scrollWidth,
    viewportWidth: image.ownerDocument.defaultView.innerWidth }));
  if (errors.length || requests.some((url) => /^https?:/u.test(url))) {
    throw new Error(`Offline artifact unexpected errors/network: ${JSON.stringify({ errors, requests })}`);
  }
  if (!preview.loaded || preview.width !== 1560 || preview.documentScrollWidth > preview.viewportWidth) {
    throw new Error('Offline artifact image failed or overflows viewport.');
  }
  await page.screenshot({ path: path.join(root, 'tmp/architecture-review-offline-preview.png'), fullPage: true });
} finally {
  await browser.close();
}
const summary = {
  schema: 1, checkedAt: new Date().toISOString(), version: inventory.version, sourceCommit: inventory.sourceCommit,
  tests: { passed: tests.numPassedTests, failed: tests.numFailedTests, skipped: tests.numPendingTests,
    files: tests.testResults.map((file) => ({ path: path.relative(root, file.name).replaceAll('\\', '/'),
      status: file.status, tests: file.assertionResults.length })) },
  sourceUnchanged: { allInventoriedFilesMatchSha256: true, count: inventory.files.length,
    productionDiffAgainstTag: 'none', tag: 'v2.3.16' },
  artifacts: { offlineHeadlessBrowser: 'Microsoft Edge', preview, externalRequests: 0,
    svgParsed: true, pngGenerated: true },
  notRun: ['full test suite', 'new software build/package', 'full application E2E',
    'native installed update', 'real NAS/multi-host', 'GPU/large-media soak', 'CVE/penetration scan'],
};
fs.writeFileSync(path.join(review, 'verification-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);

const documents = ['README.md', 'architecture-review.md', 'adr-proposals.md', 'verification.md', 'codex-plan-prompt.md'];
let links = 0;
for (const name of documents) {
  const file = path.join(review, name);
  const content = fs.readFileSync(file, 'utf8');
  for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)) {
    const href = match[1];
    if (/^https?:/u.test(href) || href.startsWith('#')) continue;
    if (!fs.existsSync(path.resolve(path.dirname(file), href.split('#')[0]))) {
      throw new Error(`Broken local document link: ${name} → ${href}`);
    }
    links++;
  }
}
for (const match of fs.readFileSync(path.join(review, 'index.html'), 'utf8').matchAll(/(?:href|src)="([^"]+)"/gu)) {
  if (!fs.existsSync(path.resolve(review, match[1]))) throw new Error(`Broken HTML link: ${match[1]}`);
  links++;
}
process.stdout.write(`${JSON.stringify({ passed: tests.numPassedTests, testFiles: tests.testResults.length,
  snapshotFilesVerified: inventory.files.length, localLinksVerified: links, preview, productionDiff: 'none' }, null, 2)}\n`);
