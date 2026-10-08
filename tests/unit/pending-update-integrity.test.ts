import { createHash } from 'node:crypto';
import { ChildProcess } from 'node:child_process';
import * as fsPromises from 'node:fs/promises';
import type * as FsPromisesTypes from 'node:fs/promises';
import { access, mkdir, mkdtemp, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { compileFunction } from 'node:vm';

import AdmZip from 'adm-zip';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAppUpdateInstallerLauncher, createAppUpdateService } from '../../src/main/app-update-service';
import * as pendingUpdates from '../../src/main/pending-app-update';
import { PendingAppUpdateStore } from '../../src/main/pending-app-update';

// Keep the real filesystem methods, but expose a configurable Vitest wrapper
// for open so the mutation fixture can instrument the actual file handle.
vi.mock('node:fs/promises', async (importOriginal) => ({
  ...await importOriginal<typeof FsPromisesTypes>(),
}));

const roots: string[] = [];
const installerBytes = Buffer.from('verified Super installer fixture\n');
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
type UpdateService = ReturnType<typeof createAppUpdateService>;
type UpdateLogger = {
  info: ReturnType<typeof vi.fn<(scope: string, message: string, context?: Record<string, unknown>) => void>>;
  error: ReturnType<typeof vi.fn<(scope: string, error: unknown, context?: Record<string, unknown>) => void>>;
};
type BootstrapPorts = {
  store: PendingAppUpdateStore; service: UpdateService; currentVersion: string;
  logger: UpdateLogger; onInvalidUpdate(): void | Promise<void>;
};

async function updateFixture() {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'super-update-integrity-')));
  roots.push(root);
  const cache = path.join(root, 'updates');
  await mkdir(cache);
  const archive = new AdmZip();
  archive.addFile('SuperSetup.exe', installerBytes);
  const archiveBytes = archive.toBuffer();
  const assetName = 'Super-win-x86-64-0.1.3-setup.zip';
  const assetUrl = `https://liuyangyang.me/downloads/super/releases/0.1.3/${assetName}`;
  const manifest = {
    tag_name: 'v0.1.3', html_url: 'https://liuyangyang.me/downloads/super/',
    draft: false, prerelease: false, body: 'Verified fixture release notes',
    assets: [{ name: assetName, browser_download_url: assetUrl, size: archiveBytes.length,
      digest: `sha256:${digest(archiveBytes)}` }],
  };
  const fetchImpl = vi.fn(async (url: string) => {
    if (url.endsWith('/downloads/super/latest.json') || url.endsWith('/api/super/updates/latest')) {
      return new Response(JSON.stringify(manifest));
    }
    if (url === assetUrl) return new Response(archiveBytes as unknown as BodyInit);
    throw new Error(`Unexpected fixture network request: ${url}`);
  });
  const launchInstaller = vi.fn<(installerPath: string, mode: 'interactive' | 'silent') => Promise<void>>()
    .mockResolvedValue(undefined);
  const logger: UpdateLogger = { info: vi.fn(), error: vi.fn() };
  const options = {
    currentVersion: '0.1.1', isPackaged: true, platform: 'win32', arch: 'x64',
    executablePath: path.join(root, 'Super.exe'), tempDirectory: root,
    downloadsDirectory: path.join(root, 'Downloads'), preparedUpdateDirectory: cache,
    environment: { SUPER_DISTRIBUTION: 'installed' }, fetchImpl, launchInstaller, logger,
  };
  return { root, cache, launchInstaller, fetchImpl, logger,
    service: createAppUpdateService(options), createService: () => createAppUpdateService(options),
    store: new PendingAppUpdateStore(cache) };
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== await realpath(tmpdir()) || !path.basename(root).startsWith('super-update-integrity-')) {
      throw new Error('Refusing to remove a non-owned update fixture.');
    }
    await rm(root, { recursive: true, force: true });
  }
});

async function writeLegacyPending(cache: string) {
  const cleanupPath = path.join(cache, 'super-update-legacy');
  const installerPath = path.join(cleanupPath, 'SuperSetup.exe');
  await mkdir(cleanupPath);
  await writeFile(installerPath, 'unverified historical installer');
  const legacy = { version: '0.1.3', releaseNotes: 'Historical notes', installerPath, cleanupPath };
  await writeFile(path.join(cache, 'pending.json'), JSON.stringify(legacy));
  return legacy;
}

// Before extraction, execute the precise existing Main startup block against
// the real Store/Service. This is not a parallel lifecycle implementation and
// never starts Electron or an installer. After extraction use the same helper
// with a separate source-wiring assertion; this is not a full Main-process E2E.
// Absence of a future export is NOT the red signal.
async function runActualStartup(ports: BootstrapPorts, quit: () => void) {
  const exports = pendingUpdates as typeof pendingUpdates & {
    resumePendingAppUpdate?: (ports: BootstrapPorts) => Promise<{ continueStartup: boolean }>;
  };
  if (exports.resumePendingAppUpdate) {
    const source = await readFile(new URL('../../src/main/index.ts', import.meta.url), 'utf8');
    expect(source).toMatch(/import \{[^\n]*resumePendingAppUpdate[^\n]*\} from '\.\/pending-app-update'/u);
    expect(source).toMatch(/const pendingUpdateStartup = await resumePendingAppUpdate\(\{\s*store: pendingAppUpdateStore,\s*service: appUpdateService,/u);
    expect(source).toContain('completedAppUpdateNotice = pendingUpdateStartup.completionNotice');
    expect(source).toMatch(/if \(!pendingUpdateStartup\.continueStartup\) \{\s*setImmediate\(\(\) => app\.quit\(\)\);\s*return;/u);
    expect(source).toMatch(/await createMainWindow\(\);\s*if \(pendingUpdateRecoveryNotice/u);
    const result = await exports.resumePendingAppUpdate(ports);
    if (!result.continueStartup) quit();
    return;
  }
  const source = await readFile(new URL('../../src/main/index.ts', import.meta.url), 'utf8');
  const start = source.indexOf('  const deferredUpdate = await pendingAppUpdateStore.loadPending();');
  const end = source.indexOf('  // Super-wgmy:', start);
  if (start < 0 || end < 0) throw new Error('The current Main pending-update block was not located.');
  const block = source.slice(start, end);
  const execute = compileFunction(`return (async () => {\n${block}\n})()`,
    ['pendingAppUpdateStore', 'appUpdateService', 'logger', 'app', 'setImmediate']);
  await execute(ports.store, ports.service, ports.logger, { quit }, (callback: () => void) => callback());
}

describe('pending update state classification', () => {
  it('distinguishes absent metadata from malformed metadata instead of swallowing both', async () => {
    const fixture = await updateFixture();
    await expect(fixture.store.loadPending()).resolves.toMatchObject({ status: 'absent' });
    await writeFile(path.join(fixture.cache, 'pending.json'), '{broken json');
    await expect(fixture.store.loadPending()).resolves.toMatchObject({ status: 'invalid' });
  });

  it('classifies existing old-format metadata as legacy even when its installer exists', async () => {
    const fixture = await updateFixture();
    await writeLegacyPending(fixture.cache);
    await expect(fixture.store.loadPending()).resolves.toMatchObject({ status: 'legacy' });
  });

  it('returns a receipt-bearing metadata candidate for asynchronous Service validation', async () => {
    const fixture = await updateFixture();
    const legacy = await writeLegacyPending(fixture.cache);
    const bytes = await readFile(legacy.installerPath);
    const candidate = { ...legacy, receipt: { schemaVersion: 1, sha256: digest(bytes), bytes: bytes.length,
      appVersion: legacy.version, installerPath: legacy.installerPath } };
    await writeFile(path.join(fixture.cache, 'pending.json'), JSON.stringify(candidate));
    await expect(fixture.store.loadPending()).resolves.toMatchObject({ status: 'candidate', update: candidate });
  });

  it('does not erase the distinction when an existing pending record names a missing installer', async () => {
    const fixture = await updateFixture();
    const legacy = await writeLegacyPending(fixture.cache);
    await rm(legacy.installerPath);
    await expect(fixture.store.loadPending()).resolves.toMatchObject({ status: 'legacy' });
  });
});

describe('verified installer receipt and final launch guard', () => {
  it('records the extracted installer bytes/hash/path/version, not the ZIP checksum', async () => {
    const fixture = await updateFixture();
    await expect(fixture.service.prepareUpdate()).resolves.toMatchObject({ ok: true, action: 'installer-staged' });
    const prepared = fixture.service.getPreparedUpdate()!;
    expect(prepared).toMatchObject({ receipt: { schemaVersion: 1, sha256: digest(installerBytes), bytes: installerBytes.length,
      appVersion: '0.1.3', installerPath: prepared.installerPath } });
    await fixture.store.savePending(prepared);
    const persisted = JSON.parse(await readFile(path.join(fixture.cache, 'pending.json'), 'utf8'));
    expect(persisted.receipt).toEqual(expect.objectContaining({ sha256: digest(installerBytes), bytes: installerBytes.length }));
    expect(fixture.launchInstaller).not.toHaveBeenCalled();
  });

  it.each(['same-size replacement', 'truncated', 'missing', 'directory'])('refuses %s cache at the final silent launch boundary', async (change) => {
    const fixture = await updateFixture();
    await expect(fixture.service.prepareUpdate()).resolves.toMatchObject({ ok: true, action: 'installer-staged' });
    const prepared = fixture.service.getPreparedUpdate()!;
    if (change === 'same-size replacement') await writeFile(prepared.installerPath, Buffer.alloc(installerBytes.length, 0x78));
    else if (change === 'truncated') await writeFile(prepared.installerPath, 'x');
    else {
      await rm(prepared.installerPath);
      if (change === 'directory') await mkdir(prepared.installerPath);
    }
    await expect(fixture.service.launchPreparedUpdate('silent')).resolves.toMatchObject({ ok: false, code: 'verification-failed' });
    expect(fixture.launchInstaller).not.toHaveBeenCalled();
    expect(fixture.service.getPreparedUpdate()).toBeUndefined();
    await expect(access(path.join(fixture.cache, 'completed.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('cannot restore an old existing installer by computing fresh trust from the cache itself', async () => {
    const fixture = await updateFixture();
    const legacy = await writeLegacyPending(fixture.cache);
    await expect(Promise.resolve(fixture.service.restorePreparedUpdate(legacy))).resolves.toBe(false);
    expect(fixture.service.getPreparedUpdate()).toBeUndefined();
    expect(fixture.launchInstaller).not.toHaveBeenCalled();
  });

  it('checks again after a valid restore rather than trusting its earlier hash indefinitely', async () => {
    const fixture = await updateFixture();
    await fixture.service.prepareUpdate();
    const prepared = fixture.service.getPreparedUpdate()!;
    const resumed = fixture.createService();
    await expect(Promise.resolve(resumed.restorePreparedUpdate(prepared))).resolves.toBe(true);
    await writeFile(prepared.installerPath, Buffer.alloc(installerBytes.length, 0x79));
    await expect(resumed.launchPreparedUpdate('silent')).resolves.toMatchObject({ ok: false, code: 'verification-failed' });
    expect(fixture.launchInstaller).not.toHaveBeenCalled();
  });

  it('uses the same final guard for downloadAndInstall and the manual interactive path', async () => {
    const fixture = await updateFixture();
    const actualPrepare = fixture.service.prepareUpdate.bind(fixture.service);
    vi.spyOn(fixture.service, 'prepareUpdate').mockImplementation(async () => {
      const result = await actualPrepare();
      const prepared = fixture.service.getPreparedUpdate()!;
      await writeFile(prepared.installerPath, Buffer.alloc(installerBytes.length, 0x7a));
      return result;
    });
    await expect(fixture.service.downloadAndInstall()).resolves.toMatchObject({ ok: false, code: 'verification-failed' });
    expect(fixture.launchInstaller).not.toHaveBeenCalled();
  });

  it('keeps legitimate deferred notes and silently launches once under concurrent clicks', async () => {
    const fixture = await updateFixture();
    await fixture.service.prepareUpdate();
    const prepared = fixture.service.getPreparedUpdate()!;
    await fixture.store.savePending(prepared);
    let releaseLaunch!: () => void;
    const blockedLaunch = new Promise<void>((resolve) => { releaseLaunch = resolve; });
    fixture.launchInstaller.mockImplementation(async () => blockedLaunch);
    const first = fixture.service.launchPreparedUpdate('silent');
    const second = fixture.service.launchPreparedUpdate('silent');
    await expect(second).resolves.toMatchObject({ ok: false, code: 'busy' });
    releaseLaunch();
    await expect(first).resolves.toMatchObject({ ok: true, action: 'installer-opened' });
    expect(fixture.launchInstaller).toHaveBeenCalledTimes(1);
    expect(fixture.launchInstaller).toHaveBeenCalledWith(prepared.installerPath, 'silent');
    await fixture.store.saveCompletion({ version: '0.1.3', releaseNotes: prepared.releaseNotes });
    await expect(fixture.store.consumeCompletion('0.1.1')).resolves.toBeUndefined();
    await expect(fixture.store.consumeCompletion('0.1.3')).resolves.toEqual({ version: '0.1.3', releaseNotes: 'Verified fixture release notes' });
    await expect(fixture.store.consumeCompletion('0.1.3')).resolves.toBeUndefined();
  });

  it('runs the beforeLaunch callback only after final verification, with its entire await inside the single flight', async () => {
    const fixture = await updateFixture();
    await fixture.service.prepareUpdate();
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    let started!: () => void;
    const entered = new Promise<void>((resolve) => { started = resolve; });
    const beforeLaunch = vi.fn(async () => { started(); await blocked; });
    const first = fixture.service.launchPreparedUpdate('silent', { beforeLaunch });
    await entered;
    await expect(fixture.service.launchPreparedUpdate('silent', { beforeLaunch })).resolves.toMatchObject({ code: 'busy' });
    expect(fixture.launchInstaller).not.toHaveBeenCalled();
    release();
    await expect(first).resolves.toMatchObject({ ok: true, action: 'installer-opened' });
    expect(beforeLaunch).toHaveBeenCalledTimes(1);
    expect(fixture.launchInstaller).toHaveBeenCalledTimes(1);
  });

  it('does not spawn when completion persistence fails and never calls the hook for a bad cache', async () => {
    const fixture = await updateFixture();
    await fixture.service.prepareUpdate();
    const beforeLaunch = vi.fn(async () => { throw new Error('fixture disk write denied'); });
    await expect(fixture.service.launchPreparedUpdate('silent', { beforeLaunch })).resolves.toMatchObject({ code: 'open-failed' });
    expect(fixture.launchInstaller).not.toHaveBeenCalled();
    await fixture.service.prepareUpdate();
    await writeFile(fixture.service.getPreparedUpdate()!.installerPath, 'tampered');
    beforeLaunch.mockClear();
    await expect(fixture.service.launchPreparedUpdate('silent', { beforeLaunch })).resolves.toMatchObject({ code: 'verification-failed' });
    expect(beforeLaunch).not.toHaveBeenCalled();
  });

  it('detects same-size replacement during the streaming verification rather than hashing the old open handle', async () => {
    const fixture = await updateFixture();
    await fixture.service.prepareUpdate();
    const prepared = fixture.service.getPreparedUpdate()!;
    const actualOpen = fsPromises.open;
    let swapped = false;
    const openSpy = vi.spyOn(fsPromises, 'open').mockImplementation(async (...args) => {
      const handle = await actualOpen(...args);
      if (args[0] === prepared.installerPath && !swapped) {
        const actualStream = handle.createReadStream.bind(handle);
        vi.spyOn(handle, 'createReadStream').mockImplementation((options) => {
          const stream = actualStream(options);
          const actualIterator = stream[Symbol.asyncIterator].bind(stream);
          stream[Symbol.asyncIterator] = async function* () {
            for await (const chunk of { [Symbol.asyncIterator]: actualIterator }) {
              if (!swapped) {
                swapped = true;
                await rename(prepared.installerPath, `${prepared.installerPath}.old`);
                await writeFile(prepared.installerPath, Buffer.alloc(installerBytes.length, 0x78));
              }
              yield chunk;
            }
            return undefined;
          };
          return stream;
        });
      }
      return handle;
    });
    try {
      await expect(fixture.service.launchPreparedUpdate('silent')).resolves.toMatchObject({ code: 'verification-failed' });
      expect(swapped).toBe(true);
      expect(fixture.launchInstaller).not.toHaveBeenCalled();
    } finally {
      openSpy.mockRestore();
    }
  });

  it('rejects a symbolic-link installer without touching the external regular file', async () => {
    const fixture = await updateFixture();
    await fixture.service.prepareUpdate();
    const prepared = fixture.service.getPreparedUpdate()!;
    const external = path.join(fixture.root, 'external-installer.exe');
    await writeFile(external, installerBytes);
    await rm(prepared.installerPath);
    await symlink(external, prepared.installerPath, 'file');
    await expect(fixture.service.launchPreparedUpdate('silent')).resolves.toMatchObject({ code: 'verification-failed' });
    expect(await readFile(external)).toEqual(installerBytes);
    expect(fixture.launchInstaller).not.toHaveBeenCalled();
  });

  it('rejects a junction/symlink parent both on restore and launch without deleting its external target', async () => {
    const fixture = await updateFixture();
    await fixture.service.prepareUpdate();
    const prepared = fixture.service.getPreparedUpdate()!;
    const parent = path.dirname(prepared.installerPath);
    const external = path.join(fixture.root, 'external-installer-directory');
    await rename(parent, external);
    await symlink(external, parent, process.platform === 'win32' ? 'junction' : 'dir');
    await expect(fixture.createService().restorePreparedUpdate(prepared)).resolves.toBe(false);
    await expect(fixture.service.launchPreparedUpdate('silent')).resolves.toMatchObject({ code: 'verification-failed' });
    expect(await readFile(path.join(external, 'SuperSetup.exe'))).toEqual(installerBytes);
    expect(fixture.launchInstaller).not.toHaveBeenCalled();
  });

  it('rejects a correctly hashed external installer and does not backfill trust for it', async () => {
    const fixture = await updateFixture();
    const external = path.join(fixture.root, 'external-installer.exe');
    await writeFile(external, installerBytes);
    const update = { version: '0.1.3', releaseNotes: '', installerPath: external, cleanupPath: fixture.root,
      receipt: { schemaVersion: 1, installerPath: external, appVersion: '0.1.3', bytes: installerBytes.length, sha256: digest(installerBytes) } };
    await expect(fixture.service.restorePreparedUpdate(update)).resolves.toBe(false);
    await writeFile(path.join(fixture.cache, 'pending.json'), JSON.stringify(update));
    await expect(fixture.store.loadPending()).resolves.toMatchObject({ status: 'invalid' });
    expect(await readFile(external)).toEqual(installerBytes);
  });
});

describe('actual Main startup handoff through Store and Service', () => {
  it('continues normal startup for legacy metadata, prompts re-prepare once and never creates completion', async () => {
    const fixture = await updateFixture();
    await writeLegacyPending(fixture.cache);
    const quit = vi.fn();
    const onInvalidUpdate = vi.fn();
    const ports = { store: fixture.store, service: fixture.service, currentVersion: '0.1.1', logger: fixture.logger, onInvalidUpdate };
    await runActualStartup(ports, quit);
    expect(fixture.launchInstaller).not.toHaveBeenCalled();
    expect(quit).not.toHaveBeenCalled();
    expect(onInvalidUpdate).toHaveBeenCalledTimes(1);
    await expect(access(path.join(fixture.cache, 'pending.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(path.join(fixture.cache, 'completed.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    await runActualStartup(ports, quit);
    expect(onInvalidUpdate).toHaveBeenCalledTimes(1);
    expect(fixture.fetchImpl).not.toHaveBeenCalled();
  });

  it('treats absent metadata as ordinary startup with no warning and no network', async () => {
    const fixture = await updateFixture();
    const quit = vi.fn();
    const onInvalidUpdate = vi.fn();
    await runActualStartup({ store: fixture.store, service: fixture.service, currentVersion: '0.1.1', logger: fixture.logger, onInvalidUpdate }, quit);
    expect(quit).not.toHaveBeenCalled();
    expect(onInvalidUpdate).not.toHaveBeenCalled();
    expect(fixture.fetchImpl).not.toHaveBeenCalled();
    expect(fixture.launchInstaller).not.toHaveBeenCalled();
  });

  it('awaits a real restore, writes completion after verification, and hands off a valid candidate once', async () => {
    const fixture = await updateFixture();
    await fixture.service.prepareUpdate();
    const prepared = fixture.service.getPreparedUpdate()!;
    await fixture.store.savePending(prepared);
    const resumed = fixture.createService();
    const quit = vi.fn();
    const onInvalidUpdate = vi.fn();
    fixture.launchInstaller.mockImplementation(async () => {
      expect(JSON.parse(await readFile(path.join(fixture.cache, 'completed.json'), 'utf8'))).toEqual({
        version: prepared.version, releaseNotes: prepared.releaseNotes,
      });
    });
    await runActualStartup({ store: fixture.store, service: resumed, currentVersion: '0.1.1', logger: fixture.logger, onInvalidUpdate }, quit);
    expect(quit).toHaveBeenCalledTimes(1);
    expect(onInvalidUpdate).not.toHaveBeenCalled();
    expect(fixture.launchInstaller).toHaveBeenCalledTimes(1);
    await expect(fixture.store.loadPending()).resolves.toMatchObject({ status: 'absent' });
    await expect(fixture.store.consumeCompletion('0.1.1')).resolves.toBeUndefined();
    await expect(fixture.store.consumeCompletion('0.1.3')).resolves.toEqual({ version: prepared.version, releaseNotes: prepared.releaseNotes });
    await expect(fixture.store.consumeCompletion('0.1.3')).resolves.toBeUndefined();
  });

  it('continues startup if async restore rejects and preserves an unrelated completion notice', async () => {
    const fixture = await updateFixture();
    await fixture.service.prepareUpdate();
    await fixture.store.savePending(fixture.service.getPreparedUpdate()!);
    await fixture.store.saveCompletion({ version: '0.1.9', releaseNotes: 'Unrelated completion' });
    const resumed = fixture.createService();
    vi.spyOn(resumed, 'restorePreparedUpdate').mockRejectedValue(new Error('fixture filesystem unavailable'));
    const quit = vi.fn();
    const onInvalidUpdate = vi.fn();
    await runActualStartup({ store: fixture.store, service: resumed, currentVersion: '0.1.1', logger: fixture.logger, onInvalidUpdate }, quit);
    expect(quit).not.toHaveBeenCalled();
    expect(fixture.launchInstaller).not.toHaveBeenCalled();
    expect(onInvalidUpdate).toHaveBeenCalledTimes(1);
    await expect(fixture.store.consumeCompletion('0.1.9')).resolves.toEqual({ version: '0.1.9', releaseNotes: 'Unrelated completion' });
  });

  it('does not create completion if a valid startup restore is replaced before its final launch check', async () => {
    const fixture = await updateFixture();
    await fixture.service.prepareUpdate();
    const prepared = fixture.service.getPreparedUpdate()!;
    await fixture.store.savePending(prepared);
    const resumed = fixture.createService();
    const actualRestore = resumed.restorePreparedUpdate.bind(resumed);
    vi.spyOn(resumed, 'restorePreparedUpdate').mockImplementation(async (candidate) => {
      const restored = await actualRestore(candidate);
      await writeFile(prepared.installerPath, Buffer.alloc(installerBytes.length, 0x7b));
      return restored;
    });
    const quit = vi.fn();
    const onInvalidUpdate = vi.fn();
    await runActualStartup({ store: fixture.store, service: resumed, currentVersion: '0.1.1', logger: fixture.logger, onInvalidUpdate }, quit);
    expect(quit).not.toHaveBeenCalled();
    expect(onInvalidUpdate).toHaveBeenCalledTimes(1);
    expect(fixture.launchInstaller).not.toHaveBeenCalled();
    await expect(access(path.join(fixture.cache, 'completed.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('consumes matching completion once without re-launching an already installed candidate', async () => {
    const fixture = await updateFixture();
    await fixture.service.prepareUpdate();
    const prepared = fixture.service.getPreparedUpdate()!;
    await fixture.store.savePending(prepared);
    await fixture.store.saveCompletion({ version: prepared.version, releaseNotes: prepared.releaseNotes });
    const onInvalidUpdate = vi.fn();
    const result = await pendingUpdates.resumePendingAppUpdate({
      store: fixture.store, service: fixture.createService(), currentVersion: prepared.version,
      logger: fixture.logger, onInvalidUpdate,
    });
    expect(result).toEqual({ continueStartup: true, completionNotice: { version: prepared.version, releaseNotes: prepared.releaseNotes } });
    expect(fixture.launchInstaller).not.toHaveBeenCalled();
    expect(onInvalidUpdate).not.toHaveBeenCalled();
    await expect(fixture.store.consumeCompletion(prepared.version)).resolves.toBeUndefined();
    await expect(fixture.store.loadPending()).resolves.toMatchObject({ status: 'absent' });
  });

  it('propagates an actual asynchronous launcher error through Service and startup without quit or a false completion', async () => {
    const fixture = await updateFixture();
    await fixture.service.prepareUpdate();
    await fixture.store.savePending(fixture.service.getPreparedUpdate()!);
    // A ChildProcess object alone launches nothing; preserve the exact emitter
    // method contracts while controlling its asynchronous failure below.
    const child = Object.assign(new ChildProcess(), { unref: vi.fn() });
    const launcher = createAppUpdateInstallerLauncher({
      platform: 'win32', openPath: vi.fn(async () => ''),
      spawnChild: () => {
        queueMicrotask(() => child.emit('error', new Error('fixture async EACCES')));
        return child;
      },
    });
    fixture.launchInstaller.mockImplementation(launcher);
    const quit = vi.fn();
    const onInvalidUpdate = vi.fn();
    await runActualStartup({ store: fixture.store, service: fixture.createService(), currentVersion: '0.1.1', logger: fixture.logger, onInvalidUpdate }, quit);
    expect(quit).not.toHaveBeenCalled();
    expect(onInvalidUpdate).toHaveBeenCalledTimes(1);
    expect(child.unref).not.toHaveBeenCalled();
    expect(child.listenerCount('spawn')).toBe(0);
    expect(child.listenerCount('error')).toBe(0);
    await expect(fixture.store.loadPending()).resolves.toMatchObject({ status: 'absent' });
    await expect(access(path.join(fixture.cache, 'completed.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('does not follow a redirected cache root to clear external metadata and still continues startup', async () => {
    const fixture = await updateFixture();
    await writeLegacyPending(fixture.cache);
    const external = path.join(fixture.root, 'external-cache');
    await rename(fixture.cache, external);
    await symlink(external, fixture.cache, process.platform === 'win32' ? 'junction' : 'dir');
    const original = await readFile(path.join(external, 'pending.json'), 'utf8');
    const quit = vi.fn();
    const onInvalidUpdate = vi.fn();
    await runActualStartup({ store: fixture.store, service: fixture.service, currentVersion: '0.1.1', logger: fixture.logger, onInvalidUpdate }, quit);
    expect(quit).not.toHaveBeenCalled();
    expect(onInvalidUpdate).toHaveBeenCalledTimes(1);
    expect(fixture.launchInstaller).not.toHaveBeenCalled();
    expect(await readFile(path.join(external, 'pending.json'), 'utf8')).toBe(original);
  });
});
