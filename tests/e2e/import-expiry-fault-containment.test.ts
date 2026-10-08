import { createHash } from 'node:crypto';
import { lstat, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

import { electronLaunchEnv } from './electron-test-helpers';

interface Digest { path: string; bytes: number; sha256: string }
interface Manifest {
  formatVersion: number;
  kind: string;
  runId: string;
  repositoryRoot: string;
  outputDirectory: string;
  sourceSha256: string;
  sourceFiles: Digest[];
  compiledFiles: Digest[];
  bundles: { main: Digest; worker: Digest };
}
interface ProbeSnapshot {
  readyPid: number | null;
  childPid: number | null;
  forkCount: number;
  exitCode: number | null;
  diagnostics: unknown[];
  stdout: string;
  stderr: string;
}
interface ProbeApi {
  request(command: { type: string }): Promise<unknown>;
  snapshot(): ProbeSnapshot;
  waitForExpiryDiagnostic(): Promise<unknown>;
  waitForExit(): Promise<unknown>;
}
type ProbeGlobal = typeof globalThis & { importExpiryProbe: ProbeApi };

const fixedInputs = [
  'package.json', 'package-lock.json', 'tsconfig.json', 'vite.worker.config.ts', 'playwright.config.ts',
  'scripts/build-import-expiry-probe.mjs', 'tests/fixtures/import-expiry-probe/main.ts',
  'tests/fixtures/import-expiry-probe/worker.ts', 'tests/e2e/import-expiry-fault-containment.test.ts',
  'tests/e2e/electron-test-helpers.ts',
];
async function treePaths(root: string, directory = ''): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`Probe source input is a symlink: ${directory}/${entry.name}`);
    const relative = directory ? `${directory}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await treePaths(root, relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}
async function digest(filename: string): Promise<{ bytes: number; sha256: string }> {
  const bytes = await readFile(filename);
  return { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
function contained(root: string, filename: string): boolean {
  const relative = path.relative(root, filename);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function verifiedManifest(): Promise<Manifest> {
  const manifestPath = process.env.SUPER_E2E_IMPORT_EXPIRY_PROBE_MANIFEST;
  if (!manifestPath || !path.isAbsolute(manifestPath)) {
    throw new Error('Build a fresh probe with scripts/build-import-expiry-probe.mjs --print-manifest and set SUPER_E2E_IMPORT_EXPIRY_PROBE_MANIFEST.');
  }
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Manifest;
  const root = await realpath(process.cwd());
  expect(manifest.formatVersion).toBe(1);
  expect(manifest.kind).toBe('import-expiry-utility-probe');
  expect(manifest.runId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  expect(await realpath(manifest.repositoryRoot)).toBe(root);
  const expectedOutput = path.join(root, 'tmp', `architecture-stage-a-${manifest.runId}`, 'import-expiry-probe');
  expect(await realpath(manifest.outputDirectory)).toBe(await realpath(expectedOutput));
  expect(await realpath(path.dirname(manifestPath))).toBe(await realpath(expectedOutput));
  const current: Digest[] = [];
  for (const relative of [...new Set([...fixedInputs, ...await treePaths(root, 'src')])].sort()) {
    current.push({ path: relative, ...await digest(path.join(root, relative)) });
  }
  expect(current, 'Probe source changed: rebuild, do not consume an old compiled fixture.').toEqual(manifest.sourceFiles);
  expect(createHash('sha256').update(JSON.stringify(current)).digest('hex')).toBe(manifest.sourceSha256);
  const compiled: Digest[] = [];
  for (const relative of (await treePaths(expectedOutput)).filter((entry) => entry !== 'manifest.json').sort()) {
    compiled.push({ path: relative, ...await digest(path.join(expectedOutput, relative)) });
  }
  expect(compiled, 'Probe compiled entry/chunk bytes changed; rebuild a fresh fixture.').toEqual(manifest.compiledFiles);
  for (const name of ['main', 'worker'] as const) {
    const bundle = manifest.bundles[name];
    expect(path.resolve(bundle.path)).toBe(path.join(expectedOutput, `${name}.cjs`));
    expect(contained(await realpath(expectedOutput), await realpath(bundle.path))).toBe(true);
    const stat = await lstat(bundle.path);
    expect(stat.isFile() && !stat.isSymbolicLink()).toBe(true);
    expect(await digest(bundle.path)).toEqual({ bytes: bundle.bytes, sha256: bundle.sha256 });
  }
  return manifest;
}

async function probeRequest(application: ElectronApplication, type: string): Promise<unknown> {
  return application.evaluate(async (_electron, commandType) =>
    (globalThis as ProbeGlobal).importExpiryProbe.request({ type: commandType }), type);
}

async function removeOwnedProbeRoot(ownedRoot: string, runId: string): Promise<void> {
  // Only this newly minted, marked, non-symlink directory can be removed.
  const stat = await lstat(ownedRoot);
  if (!path.isAbsolute(ownedRoot) || path.dirname(ownedRoot) !== path.resolve(tmpdir())
    || !path.basename(ownedRoot).startsWith('super-import-expiry-probe-')
    || !stat.isDirectory() || stat.isSymbolicLink()
    || await readFile(path.join(ownedRoot, '.probe-owned'), 'utf8') !== runId) {
    throw new Error('Refusing cleanup of an unowned probe directory.');
  }
  await rm(ownedRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

// eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixture parameter even when this isolated probe uses none.
test('contains the real import TTL cleanup fault in the same UtilityProcess and recovers only its staged operation', async ({}, testInfo) => {
  // A standalone fixture build is required. This test never launches the
  // production application or uses an installed app/user library.
  const manifest = await verifiedManifest();
  // Ignore packaged/installed executable overrides accepted by the general
  // E2E helper: this fault probe must use this checkout's Electron runtime.
  const localRequire = createRequire(path.join(manifest.repositoryRoot, 'package.json'));
  // Never invoke Electron's package entry: it may install missing binaries.
  const electronPackage = path.dirname(localRequire.resolve('electron/package.json'));
  const electronDist = await realpath(path.join(electronPackage, 'dist'));
  const executablePath = path.resolve(electronDist, (await readFile(path.join(electronPackage, 'path.txt'), 'utf8')).trim());
  const executableStat = await lstat(executablePath);
  if (!contained(electronDist, await realpath(executablePath))
    || !executableStat.isFile() || executableStat.isSymbolicLink()) {
    throw new Error('The probe requires an existing local Electron binary; no automatic installation.');
  }
  const ownedRoot = await mkdtemp(path.join(tmpdir(), 'super-import-expiry-probe-'));
  await writeFile(path.join(ownedRoot, '.probe-owned'), manifest.runId, { flag: 'wx' });
  let application: ElectronApplication | undefined;
  try {
    application = await electron.launch({
      args: [manifest.bundles.main.path, `--probe-owned-root=${ownedRoot}`, `--probe-run-id=${manifest.runId}`],
      cwd: manifest.outputDirectory,
      executablePath,
      env: electronLaunchEnv(),
    });
    const setup = await probeRequest(application, 'setup') as {
      pid: number; libraryId: string; importId: string; operationPath: string; operationExists: boolean;
    };
    expect(contained(ownedRoot, setup.operationPath)).toBe(true);
    expect(setup.operationExists).toBe(true);
    const before = await application.evaluate(() => (globalThis as ProbeGlobal).importExpiryProbe.snapshot());
    expect(before).toMatchObject({ readyPid: setup.pid, childPid: setup.pid, forkCount: 1, exitCode: null });
    expect(await probeRequest(application, 'arm')).toEqual({ armed: true, pid: setup.pid });
    // Old scheduleImportExpiry must cause a real child exit here. The Main
    // fixture rejects immediately on exit, preserving its stderr as evidence.
    const diagnostic = await application.evaluate(async () =>
      (globalThis as ProbeGlobal).importExpiryProbe.waitForExpiryDiagnostic());
    expect(diagnostic).toMatchObject({ scope: 'import.expiry.cleanup', error: { code: 'EPERM' },
      context: { libraryId: setup.libraryId, operationId: setup.importId } });
    expect(await probeRequest(application, 'ping')).toEqual({ pid: setup.pid, pong: true });
    const inspection = await probeRequest(application, 'inspect');
    expect(inspection).toMatchObject({ pid: setup.pid, faultThrown: true, operationExists: true,
      operationStatus: 'rolled_back', operationErrorCode: 'IMPORT_EXPIRED', tokenErrorCode: 'IMPORT_NOT_FOUND',
      assetCount: 1, existingAssetContent: 'old fixture content' });
    expect(await probeRequest(application, 'recover')).toMatchObject({ pid: setup.pid, operationExists: false,
      operationStatus: 'rolled_back', operationErrorCode: 'IMPORT_EXPIRED', tokenErrorCode: 'IMPORT_NOT_FOUND',
      assetCount: 1, existingAssetContent: 'old fixture content' });
    const after = await application.evaluate(() => (globalThis as ProbeGlobal).importExpiryProbe.snapshot());
    expect(after).toMatchObject({ readyPid: setup.pid, childPid: setup.pid, forkCount: 1, exitCode: null });
    expect(await probeRequest(application, 'shutdown')).toEqual({ stopped: true, pid: setup.pid });
    expect(await application.evaluate(async () => (globalThis as ProbeGlobal).importExpiryProbe.waitForExit())).toBe(0);
  } finally {
    try {
      if (application) {
        const evidence = await application.evaluate(() => (globalThis as ProbeGlobal).importExpiryProbe.snapshot()).catch((error: unknown) => ({ error: String(error) }));
        await testInfo.attach('import-expiry-utility-process', { body: JSON.stringify({
          scope: 'real LibraryService TTL callback in fixture UtilityProcess; not production composition-root E2E',
          manifestPath: process.env.SUPER_E2E_IMPORT_EXPIRY_PROBE_MANIFEST,
          sourceSha256: manifest.sourceSha256, runId: manifest.runId, evidence,
        }, null, 2), contentType: 'application/json' });
        await application.close();
      }
    } finally {
      await removeOwnedProbeRoot(ownedRoot, manifest.runId);
    }
  }
});
