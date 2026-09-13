import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import AdmZip from 'adm-zip';
import { parseAppUpdatePrepared } from '../../src/shared/app-update';

import {
  createAppUpdateService,
  detectAppDistribution,
  parseEcsUpdateRelease,
  parseGitHubRelease,
  parseSha256,
  resolveAppUpdateTarget,
  selectUpdateAsset,
  SUPER_UPDATE_MANIFEST_URL,
  updateAssetName,
} from '../../src/main/app-update-service';

function releasePayload(overrides: Record<string, unknown> = {}) {
  return {
    tag_name: 'v0.1.3',
    html_url: 'https://liuyangyang.me/downloads/super/',
    draft: false,
    prerelease: false,
    body: 'Release notes',
    assets: [
      {
        name: 'Super-darwin-arm64-0.1.3-package.dmg',
        browser_download_url: 'https://liuyangyang.me/downloads/super/releases/0.1.3/Super-darwin-arm64-0.1.3-package.dmg',
        size: 123,
        digest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
    ],
    ...overrides,
  };
}

function isUpdateManifestRequest(url: string): boolean {
  return url.endsWith('/downloads/super/latest.json')
    || url.endsWith('/api/super/updates/latest');
}

describe('Super app update release contract', () => {
  it('accepts only a bounded prepared-update notification payload', () => {
    expect(parseAppUpdatePrepared({ version: '0.1.3', releaseNotes: 'Release notes' }))
      .toEqual({ version: '0.1.3', releaseNotes: 'Release notes' });
    expect(parseAppUpdatePrepared({ version: '' })).toBeNull();
    expect(parseAppUpdatePrepared({ version: '0.1.3', installerPath: 'C:\\temp\\setup.exe' }))
      .toBeNull();
  });

  it('distinguishes development, Inno-installed, and portable launches', () => {
    expect(detectAppDistribution({
      isPackaged: false,
      platform: 'darwin',
      executablePath: '/Applications/Super.app/Contents/MacOS/Super',
    })).toBe('installed');

    expect(detectAppDistribution({
      isPackaged: false,
      platform: 'darwin',
      executablePath: '/Applications/Super.app/Contents/MacOS/Super',
      environment: { SUPER_DISTRIBUTION: 'development' },
    })).toBe('development');

    expect(detectAppDistribution({
      isPackaged: false,
      platform: 'win32',
      executablePath: 'C:\\Dev\\Super\\node_modules\\electron\\dist\\electron.exe',
      environment: { SUPER_DISTRIBUTION: 'portable' },
    })).toBe('portable');

    expect(detectAppDistribution({
      isPackaged: true,
      platform: 'win32',
      executablePath: 'C:\\Program Files\\Super\\Super.exe',
      fileExists: (filePath) => filePath.endsWith('.super-installed'),
    })).toBe('installed');

    expect(detectAppDistribution({
      isPackaged: true,
      platform: 'win32',
      executablePath: 'C:\\Program Files\\Super\\Super.exe',
      fileExists: (filePath) => filePath.endsWith('.super-installed'),
    })).toBe('installed');

    expect(detectAppDistribution({
      isPackaged: true,
      platform: 'win32',
      executablePath: 'C:\\Program Files\\Super\\Super.exe',
      fileExists: (filePath) => filePath.endsWith('unins000.exe'),
    })).toBe('installed');

    expect(detectAppDistribution({
      isPackaged: true,
      platform: 'win32',
      executablePath: 'D:\\Tools\\Super\\Super.exe',
      environment: { PORTABLE_EXECUTABLE_FILE: 'D:\\Tools\\Super\\Super.exe' },
    })).toBe('portable');

    expect(detectAppDistribution({
      isPackaged: true,
      platform: 'darwin',
      executablePath: '/Applications/Super.app/Contents/MacOS/Super',
    })).toBe('installed');
  });

  it('maps each release target to the established release asset name', () => {
    const installedMac = resolveAppUpdateTarget({
      platform: 'darwin',
      arch: 'arm64',
      distribution: 'installed',
    });
    const portableWindows = resolveAppUpdateTarget({
      platform: 'win32',
      arch: 'x64',
      distribution: 'portable',
    });
    expect(installedMac).toEqual({ platform: 'darwin', arch: 'arm64', distribution: 'installed' });
    expect(portableWindows).toEqual({ platform: 'win32', arch: 'x64', distribution: 'portable' });
    expect(updateAssetName('0.1.3', installedMac!)).toEqual({
      name: 'Super-darwin-arm64-0.1.3-package.dmg',
      assetKind: 'installer',
    });
    expect(updateAssetName('0.1.3', portableWindows!)).toEqual({
      name: 'Super-win-x86-64-0.1.3-portable.zip',
      assetKind: 'portable',
    });
    expect(resolveAppUpdateTarget({
      platform: 'darwin',
      arch: 'x64',
      distribution: 'installed',
    })).toBeUndefined();
  });

  it('parses GitHub releases and requires a verifiable selected asset', () => {
    const release = parseGitHubRelease(releasePayload());
    expect(release?.version).toBe('0.1.3');
    expect(parseSha256('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  file.zip'))
      .toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(parseSha256('not a checksum')).toBeUndefined();

    const target = resolveAppUpdateTarget({
      platform: 'darwin',
      arch: 'arm64',
      distribution: 'installed',
    });
    expect(selectUpdateAsset(release!, target!)).toMatchObject({
      assetKind: 'installer',
      asset: { name: 'Super-darwin-arm64-0.1.3-package.dmg' },
    });
    expect(parseGitHubRelease({ ...releasePayload(), prerelease: true })).toBeUndefined();
    expect(selectUpdateAsset(
      parseGitHubRelease({
        ...releasePayload(),
        assets: [{
          name: 'Super-darwin-arm64-0.1.3-package.dmg',
          browser_download_url: 'https://liuyangyang.me/downloads/super/releases/0.1.3/Super-darwin-arm64-0.1.3-package.dmg',
          size: 123,
        }],
      })!,
      target!,
    )).toBeUndefined();
  });

  it('prefers only an exact-source ECS delta and otherwise keeps the full installer', () => {
    const release = parseEcsUpdateRelease({
      version: '2.0.3',
      notes: 'Incremental update',
      full: {
        name: 'Super-win-x86-64-2.0.3-setup.zip',
        path: 'releases/2.0.3/Super-win-x86-64-2.0.3-full-setup.zip',
        size: 200,
        sha256: 'a'.repeat(64),
      },
      deltas: [{
        fromVersion: '2.0.2',
        asset: {
          name: 'Super-win-x86-64-2.0.2-to-2.0.3-delta.zip',
          path: 'releases/2.0.3/Super-win-x86-64-2.0.2-to-2.0.3-delta.zip',
          size: 20,
          sha256: 'b'.repeat(64),
        },
      }],
    });
    const target = resolveAppUpdateTarget({
      platform: 'win32', arch: 'x64', distribution: 'installed',
    });
    expect(selectUpdateAsset(release!, target!, '2.0.2')).toMatchObject({
      assetKind: 'delta-installer',
      asset: { name: 'Super-win-x86-64-2.0.2-to-2.0.3-delta.zip', size: 20 },
    });
    expect(selectUpdateAsset(release!, target!, '2.0.1')).toMatchObject({
      assetKind: 'installer',
      asset: { name: 'Super-win-x86-64-2.0.3-setup.zip', size: 200 },
    });
    expect(parseEcsUpdateRelease({
      version: '2.0.3',
      full: { name: 'bad.zip', path: '../escape.zip', size: 1, sha256: 'c'.repeat(64) },
    })).toBeUndefined();
  });

  it('retries the full installer when an exact-source delta cannot be extracted', async () => {
    const archive = new AdmZip();
    archive.addFile('SuperSetup.exe', Buffer.from('full installer'));
    const fullBytes = archive.toBuffer();
    const deltaBytes = Buffer.from('not a valid installer archive');
    const root = await mkdtemp(path.join(tmpdir(), 'super-app-update-delta-fallback-test-'));
    const requested: string[] = [];
    try {
      const payload = {
        version: '2.0.3',
        full: {
          name: 'Super-win-x86-64-2.0.3-setup.zip',
          path: 'releases/2.0.3/Super-win-x86-64-2.0.3-full-setup.zip',
          size: fullBytes.byteLength,
          sha256: createHash('sha256').update(fullBytes).digest('hex'),
        },
        deltas: [{
          fromVersion: '2.0.2',
          asset: {
            name: 'Super-win-x86-64-2.0.2-to-2.0.3-delta.zip',
            path: 'releases/2.0.3/Super-win-x86-64-2.0.2-to-2.0.3-delta.zip',
            size: deltaBytes.byteLength,
            sha256: createHash('sha256').update(deltaBytes).digest('hex'),
          },
        }],
      };
      const service = createAppUpdateService({
        currentVersion: '2.0.2',
        isPackaged: true,
        platform: 'win32',
        arch: 'x64',
        executablePath: path.join(root, 'Super.exe'),
        tempDirectory: root,
        downloadsDirectory: path.join(root, 'Downloads'),
        preparedUpdateDirectory: path.join(root, 'updates'),
        environment: { SUPER_DISTRIBUTION: 'installed' },
        fetchImpl: async (url) => {
          requested.push(url);
          if (url.endsWith('/latest.json')) return new Response(JSON.stringify(payload));
          if (url.endsWith('delta.zip')) return new Response(deltaBytes as unknown as BodyInit);
          return new Response(fullBytes as unknown as BodyInit);
        },
      });

      await service.checkForUpdates();
      await expect(service.prepareUpdate()).resolves.toMatchObject({
        ok: true,
        action: 'installer-staged',
        version: '2.0.3',
      });
      expect(requested.some((url) => url.endsWith('delta.zip'))).toBe(true);
      expect(requested.some((url) => url.endsWith('full-setup.zip'))).toBe(true);
      await service.discardPreparedUpdate();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('checks the public ECS manifest without sending a GitHub credential', async () => {
    let authorization: string | null = null;
    let requestedUrl = '';
    const service = createAppUpdateService({
      currentVersion: '0.1.1',
      isPackaged: true,
      platform: 'darwin',
      arch: 'arm64',
      executablePath: '/tmp/Super.app/Contents/MacOS/Super',
      tempDirectory: '/tmp',
      downloadsDirectory: '/tmp',
      environment: {
        SUPER_DISTRIBUTION: 'installed',
      },
      fetchImpl: async (url, init) => {
        requestedUrl = url;
        authorization = new Headers(init?.headers).get('authorization');
        return new Response(JSON.stringify(releasePayload()), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });

    const result = await service.checkForUpdates();
    expect(result).toMatchObject({
      ok: true,
      status: 'available',
      latestVersion: '0.1.3',
      assetName: 'Super-darwin-arm64-0.1.3-package.dmg',
    });
    expect(requestedUrl).toBe(SUPER_UPDATE_MANIFEST_URL);
    expect(authorization).toBeNull();
    expect(JSON.stringify(result)).not.toContain('/tmp');
  });

  it('checks updates from an unpackaged dev build by default', async () => {
    const service = createAppUpdateService({
      currentVersion: '0.1.1',
      isPackaged: false,
      platform: 'win32',
      arch: 'x64',
      executablePath: 'C:\\Dev\\Super\\node_modules\\electron\\dist\\electron.exe',
      tempDirectory: '/tmp',
      downloadsDirectory: '/tmp',
      fetchImpl: async () => new Response(JSON.stringify(releasePayload({
        assets: [{
          name: 'Super-win-x86-64-0.1.3-setup.zip',
          browser_download_url: 'https://liuyangyang.me/downloads/super/releases/0.1.3/Super-win-x86-64-0.1.3-setup.zip',
          size: 123,
          digest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        }],
      })), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    });

    const result = await service.checkForUpdates();
    expect(result).toMatchObject({
      ok: true,
      status: 'available',
      latestVersion: '0.1.3',
      distribution: 'installed',
      assetName: 'Super-win-x86-64-0.1.3-setup.zip',
    });
  });

  it('honors SUPER_DISTRIBUTION=development to disable dev update checks', async () => {
    const service = createAppUpdateService({
      currentVersion: '0.1.1',
      isPackaged: false,
      platform: 'win32',
      arch: 'x64',
      executablePath: 'C:\\Dev\\Super\\node_modules\\electron\\dist\\electron.exe',
      tempDirectory: '/tmp',
      downloadsDirectory: '/tmp',
      environment: { SUPER_DISTRIBUTION: 'development' },
      fetchImpl: async () => new Response(JSON.stringify(releasePayload()), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    });

    const result = await service.checkForUpdates();
    expect(result).toEqual({
      ok: true,
      status: 'unsupported',
      reason: 'development',
      currentVersion: '0.1.1',
      distribution: 'development',
    });
  });

  it('downloads, verifies, and reveals a portable update without replacing the running app', async () => {
    const portableBytes = Buffer.from('portable update bytes');
    const checksum = createHash('sha256').update(portableBytes).digest('hex');
    const root = await mkdtemp(path.join(tmpdir(), 'super-app-update-test-'));
    const revealed: string[] = [];
    try {
      const payload = releasePayload({
        assets: [{
          name: 'Super-win-x86-64-0.1.3-portable.zip',
          browser_download_url: 'https://liuyangyang.me/downloads/super/releases/0.1.3/Super-win-x86-64-0.1.3-portable.zip',
          size: portableBytes.byteLength,
        }, {
          name: 'Super-win-x86-64-0.1.3-portable.zip.sha256',
          browser_download_url: 'https://liuyangyang.me/downloads/super/releases/0.1.3/Super-win-x86-64-0.1.3-portable.zip.sha256',
          size: checksum.length,
        }],
      });
      const service = createAppUpdateService({
        currentVersion: '0.1.1',
        isPackaged: true,
        platform: 'win32',
        arch: 'x64',
        executablePath: path.join(root, 'Super.exe'),
        tempDirectory: root,
        downloadsDirectory: path.join(root, 'Downloads'),
        environment: { SUPER_DISTRIBUTION: 'portable' },
        fetchImpl: async (url) => {
          if (isUpdateManifestRequest(url)) return new Response(JSON.stringify(payload));
          if (url.endsWith('.sha256')) return new Response(`${checksum}\n`);
          return new Response(portableBytes);
        },
        showItemInFolder: (filePath) => revealed.push(filePath),
      });

      const result = await service.downloadAndInstall();
      expect(result).toEqual({
        ok: true,
        status: 'completed',
        action: 'portable-downloaded',
        version: '0.1.3',
        distribution: 'portable',
      });
      expect(revealed).toHaveLength(1);
      expect(await readFile(revealed[0]!)).toEqual(portableBytes);
      expect(revealed[0]).toContain('Super-win-x86-64-0.1.3-portable.zip');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('emits download progress while fetching an update', async () => {
    const portableBytes = Buffer.from('portable update bytes');
    const checksum = createHash('sha256').update(portableBytes).digest('hex');
    const root = await mkdtemp(path.join(tmpdir(), 'super-app-update-progress-test-'));
    const progressEvents: Array<{ phase: string; downloadedBytes: number }> = [];
    try {
      const payload = releasePayload({
        assets: [{
          name: 'Super-win-x86-64-0.1.3-portable.zip',
          browser_download_url: 'https://liuyangyang.me/downloads/super/releases/0.1.3/Super-win-x86-64-0.1.3-portable.zip',
          size: portableBytes.byteLength,
        }, {
          name: 'Super-win-x86-64-0.1.3-portable.zip.sha256',
          browser_download_url: 'https://liuyangyang.me/downloads/super/releases/0.1.3/Super-win-x86-64-0.1.3-portable.zip.sha256',
          size: checksum.length,
        }],
      });
      const service = createAppUpdateService({
        currentVersion: '0.1.1',
        isPackaged: true,
        platform: 'win32',
        arch: 'x64',
        executablePath: path.join(root, 'Super.exe'),
        tempDirectory: root,
        downloadsDirectory: path.join(root, 'Downloads'),
        environment: { SUPER_DISTRIBUTION: 'portable' },
        fetchImpl: async (url) => {
          if (isUpdateManifestRequest(url)) return new Response(JSON.stringify(payload));
          if (url.endsWith('.sha256')) return new Response(`${checksum}\n`);
          return new Response(portableBytes);
        },
        showItemInFolder: () => undefined,
        onDownloadProgress: (progress) => {
          progressEvents.push({
            phase: progress.phase,
            downloadedBytes: progress.downloadedBytes,
          });
        },
      });

      await service.checkForUpdates();
      await service.downloadAndInstall();
      expect(progressEvents.some((event) => event.phase === 'verifying')).toBe(true);
      expect(progressEvents.some((event) =>
        event.phase === 'downloading' && event.downloadedBytes === portableBytes.byteLength)).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('cancels an in-progress download and returns cancelled', async () => {
    const portableBytes = Buffer.from('portable update bytes that are long enough to stream');
    const checksum = createHash('sha256').update(portableBytes).digest('hex');
    const root = await mkdtemp(path.join(tmpdir(), 'super-app-update-cancel-test-'));
    const rangeRequests: string[] = [];
    let assetRequestCount = 0;
    try {
      const payload = releasePayload({
        assets: [{
          name: 'Super-win-x86-64-0.1.3-portable.zip',
          browser_download_url: 'https://liuyangyang.me/downloads/super/releases/0.1.3/Super-win-x86-64-0.1.3-portable.zip',
          size: portableBytes.byteLength,
        }, {
          name: 'Super-win-x86-64-0.1.3-portable.zip.sha256',
          browser_download_url: 'https://liuyangyang.me/downloads/super/releases/0.1.3/Super-win-x86-64-0.1.3-portable.zip.sha256',
          size: checksum.length,
        }],
      });
      const service = createAppUpdateService({
        currentVersion: '0.1.1',
        isPackaged: true,
        platform: 'win32',
        arch: 'x64',
        executablePath: path.join(root, 'Super.exe'),
        tempDirectory: root,
        downloadsDirectory: path.join(root, 'Downloads'),
        preparedUpdateDirectory: path.join(root, 'updates'),
        environment: { SUPER_DISTRIBUTION: 'portable' },
        fetchImpl: async (url, init) => {
          if (isUpdateManifestRequest(url)) return new Response(JSON.stringify(payload));
          if (url.endsWith('.sha256')) return new Response(`${checksum}\n`);
          assetRequestCount += 1;
          const range = new Headers(init?.headers).get('range');
          if (range !== null) rangeRequests.push(range);
          if (assetRequestCount > 1) {
            const offset = Number(/^bytes=(\d+)-$/u.exec(range ?? '')?.[1]);
            return new Response(portableBytes.subarray(offset), {
              status: 206,
              headers: {
                'content-range': `bytes ${offset}-${portableBytes.byteLength - 1}/${portableBytes.byteLength}`,
                etag: '"release-1"',
              },
            });
          }
          const signal = init?.signal;
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              let offset = 0;
              const push = () => {
                if (signal?.aborted) {
                  controller.error(new DOMException('Aborted', 'AbortError'));
                  return;
                }
                if (offset >= portableBytes.byteLength) {
                  controller.close();
                  return;
                }
                const next = portableBytes.subarray(offset, offset + 8);
                offset += next.byteLength;
                controller.enqueue(next);
                setTimeout(push, 20);
              };
              push();
            },
          });
          return new Response(stream, {
            headers: { 'content-type': 'application/octet-stream' },
          });
        },
        showItemInFolder: () => undefined,
      });

      await service.checkForUpdates();
      const downloadPromise = service.downloadAndInstall();
      await new Promise((resolve) => { setTimeout(resolve, 40); });
      service.cancelDownload();
      const result = await downloadPromise;
      expect(result).toEqual({ ok: false, status: 'error', code: 'cancelled' });
      expect((await readdir(path.join(root, 'Downloads')))).toEqual([]);
      expect((await readdir(path.join(root, 'updates', 'partials'))).sort())
        .toEqual(expect.arrayContaining([expect.stringMatching(/\.part$/u), expect.stringMatching(/\.json$/u)]));

      const resumed = await service.downloadAndInstall();
      expect(resumed).toEqual({
        ok: true,
        status: 'completed',
        action: 'portable-downloaded',
        version: '0.1.3',
        distribution: 'portable',
      });
      expect(rangeRequests).toHaveLength(1);
      expect(rangeRequests[0]).toMatch(/^bytes=\d+-$/u);
      const downloaded = await readdir(path.join(root, 'Downloads'));
      expect(downloaded).toHaveLength(1);
      expect(await readFile(path.join(root, 'Downloads', downloaded[0]!))).toEqual(portableBytes);
      expect(await readdir(path.join(root, 'updates', 'partials'))).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('restarts from zero when an update server ignores a Range request', async () => {
    const portableBytes = Buffer.from('portable update bytes returned in full after a stale range');
    const checksum = createHash('sha256').update(portableBytes).digest('hex');
    const root = await mkdtemp(path.join(tmpdir(), 'super-app-update-range-fallback-test-'));
    const assetUrl = 'https://liuyangyang.me/downloads/super/releases/0.1.3/Super-win-x86-64-0.1.3-portable.zip';
    const partialBytes = portableBytes.subarray(0, 11);
    const updateDirectory = path.join(root, 'updates');
    const partialKey = createHash('sha256')
      .update(`${assetUrl}\n${checksum}\n${portableBytes.byteLength}`)
      .digest('hex');
    const partialRoot = path.join(updateDirectory, 'partials');
    const partialPath = path.join(partialRoot, `update-${partialKey}.part`);
    const metadataPath = path.join(partialRoot, `update-${partialKey}.json`);
    const rangeRequests: string[] = [];
    try {
      await mkdir(partialRoot, { recursive: true });
      await writeFile(partialPath, partialBytes);
      await writeFile(metadataPath, JSON.stringify({
        schemaVersion: 1,
        assetUrl,
        assetName: 'Super-win-x86-64-0.1.3-portable.zip',
        version: '0.1.3',
        expectedSha256: checksum,
        totalBytes: portableBytes.byteLength,
        validator: '"old-release"',
      }));
      const payload = releasePayload({
        assets: [{
          name: 'Super-win-x86-64-0.1.3-portable.zip',
          browser_download_url: assetUrl,
          size: portableBytes.byteLength,
        }, {
          name: 'Super-win-x86-64-0.1.3-portable.zip.sha256',
          browser_download_url: `${assetUrl}.sha256`,
          size: checksum.length,
        }],
      });
      const service = createAppUpdateService({
        currentVersion: '0.1.1',
        isPackaged: true,
        platform: 'win32',
        arch: 'x64',
        executablePath: path.join(root, 'Super.exe'),
        tempDirectory: root,
        downloadsDirectory: path.join(root, 'Downloads'),
        preparedUpdateDirectory: updateDirectory,
        environment: { SUPER_DISTRIBUTION: 'portable' },
        fetchImpl: async (url, init) => {
          if (isUpdateManifestRequest(url)) return new Response(JSON.stringify(payload));
          if (url.endsWith('.sha256')) return new Response(`${checksum}\n`);
          const range = new Headers(init?.headers).get('range');
          if (range !== null) rangeRequests.push(range);
          return new Response(portableBytes, { headers: { etag: '"new-release"' } });
        },
        showItemInFolder: () => undefined,
      });

      const result = await service.downloadAndInstall();
      expect(result).toMatchObject({ ok: true, action: 'portable-downloaded' });
      expect(rangeRequests).toEqual(['bytes=11-']);
      const downloaded = await readdir(path.join(root, 'Downloads'));
      expect(downloaded).toHaveLength(1);
      expect(await readFile(path.join(root, 'Downloads', downloaded[0]!))).toEqual(portableBytes);
      expect(await readdir(partialRoot)).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('cleans an installed update when opening the installer fails', async () => {
    const installerBytes = Buffer.from('macOS installer bytes');
    const checksum = createHash('sha256').update(installerBytes).digest('hex');
    const root = await mkdtemp(path.join(tmpdir(), 'super-app-update-open-failure-test-'));
    try {
      const payload = releasePayload({
        assets: [{
          name: 'Super-darwin-arm64-0.1.3-package.dmg',
          browser_download_url: 'https://liuyangyang.me/downloads/super/releases/0.1.3/Super-darwin-arm64-0.1.3-package.dmg',
          size: installerBytes.byteLength,
          digest: `sha256:${checksum}`,
        }],
      });
      const service = createAppUpdateService({
        currentVersion: '0.1.1',
        isPackaged: true,
        platform: 'darwin',
        arch: 'arm64',
        executablePath: path.join(root, 'Super.app', 'Contents', 'MacOS', 'Super'),
        tempDirectory: root,
        downloadsDirectory: path.join(root, 'Downloads'),
        environment: { SUPER_DISTRIBUTION: 'installed' },
        fetchImpl: async (url) => {
          if (isUpdateManifestRequest(url)) return new Response(JSON.stringify(payload));
          return new Response(installerBytes as unknown as BodyInit);
        },
        openPath: async () => 'The installer could not be opened.',
      });

      const result = await service.downloadAndInstall();
      expect(result).toEqual({ ok: false, status: 'error', code: 'open-failed' });
      expect((await readdir(path.join(root, 'Downloads')))).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('cleans the archive and extraction directory when the Windows archive is invalid', async () => {
    const archive = new AdmZip();
    archive.addFile('not-an-installer.txt', Buffer.from('wrong entry'));
    const archiveBytes = archive.toBuffer();
    const checksum = createHash('sha256').update(archiveBytes).digest('hex');
    const root = await mkdtemp(path.join(tmpdir(), 'super-app-update-extraction-failure-test-'));
    try {
      const payload = releasePayload({
        assets: [{
          name: 'Super-win-x86-64-0.1.3-setup.zip',
          browser_download_url: 'https://liuyangyang.me/downloads/super/releases/0.1.3/Super-win-x86-64-0.1.3-setup.zip',
          size: archiveBytes.byteLength,
          digest: `sha256:${checksum}`,
        }],
      });
      const service = createAppUpdateService({
        currentVersion: '0.1.1',
        isPackaged: true,
        platform: 'win32',
        arch: 'x64',
        executablePath: path.join(root, 'Super.exe'),
        tempDirectory: root,
        downloadsDirectory: path.join(root, 'Downloads'),
        environment: { SUPER_DISTRIBUTION: 'installed' },
        fetchImpl: async (url) => {
          if (isUpdateManifestRequest(url)) return new Response(JSON.stringify(payload));
          return new Response(archiveBytes as unknown as BodyInit);
        },
      });

      const result = await service.downloadAndInstall();
      expect(result).toEqual({ ok: false, status: 'error', code: 'download-failed' });
      expect((await readdir(path.join(root, 'Downloads')))).toEqual([]);
      expect((await readdir(root)).filter((entry) => entry.startsWith('super-installer-')))
        .toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('uses launchInstaller for installed Windows updates when provided', async () => {
    const installerBytes = Buffer.from('Super installer bytes');
    const archive = new AdmZip();
    archive.addFile('SuperSetup.exe', installerBytes);
    const archiveBytes = archive.toBuffer();
    const checksum = createHash('sha256').update(archiveBytes).digest('hex');
    const root = await mkdtemp(path.join(tmpdir(), 'super-app-update-installer-test-'));
    const launched: string[] = [];
    let launchedBytes: Buffer | undefined;
    try {
      const payload = releasePayload({
        assets: [{
          name: 'Super-win-x86-64-0.1.3-setup.zip',
          browser_download_url: 'https://liuyangyang.me/downloads/super/releases/0.1.3/Super-win-x86-64-0.1.3-setup.zip',
          size: archiveBytes.byteLength,
        }, {
          name: 'Super-win-x86-64-0.1.3-setup.zip.sha256',
          browser_download_url: 'https://liuyangyang.me/downloads/super/releases/0.1.3/Super-win-x86-64-0.1.3-setup.zip.sha256',
          size: checksum.length,
        }],
      });
      const service = createAppUpdateService({
        currentVersion: '0.1.1',
        isPackaged: true,
        platform: 'win32',
        arch: 'x64',
        executablePath: path.join(root, 'Super.exe'),
        tempDirectory: root,
        downloadsDirectory: path.join(root, 'Downloads'),
        environment: { SUPER_DISTRIBUTION: 'installed' },
        fetchImpl: async (url) => {
          if (isUpdateManifestRequest(url)) return new Response(JSON.stringify(payload));
          if (url.endsWith('.sha256')) return new Response(`${checksum}\n`);
          return new Response(archiveBytes as unknown as BodyInit);
        },
        launchInstaller: async (installerPath) => {
          launched.push(installerPath);
          launchedBytes = await readFile(installerPath);
        },
      });

      const result = await service.downloadAndInstall();
      expect(result).toEqual({
        ok: true,
        status: 'completed',
        action: 'installer-opened',
        version: '0.1.3',
        distribution: 'installed',
      });
      expect(launched).toHaveLength(1);
      expect(path.basename(launched[0]!)).toBe('SuperSetup.exe');
      expect(launchedBytes).toEqual(installerBytes);
      expect((await readdir(path.join(root, 'Downloads')))).toEqual([]);
      expect((await readdir(root)).filter((entry) => entry.startsWith('super-installer-')))
        .toHaveLength(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('stages a verified Windows installer until shutdown launches it silently', async () => {
    const installerBytes = Buffer.from('Super installer bytes');
    const archive = new AdmZip();
    archive.addFile('SuperSetup.exe', installerBytes);
    const archiveBytes = archive.toBuffer();
    const checksum = createHash('sha256').update(archiveBytes).digest('hex');
    const root = await mkdtemp(path.join(tmpdir(), 'super-app-update-stage-test-'));
    const launched: Array<{ path: string; mode: string }> = [];
    try {
      const payload = releasePayload({
        assets: [{
          name: 'Super-win-x86-64-0.1.3-setup.zip',
          browser_download_url: 'https://liuyangyang.me/downloads/super/releases/0.1.3/Super-win-x86-64-0.1.3-setup.zip',
          size: archiveBytes.byteLength,
        }, {
          name: 'Super-win-x86-64-0.1.3-setup.zip.sha256',
          browser_download_url: 'https://liuyangyang.me/downloads/super/releases/0.1.3/Super-win-x86-64-0.1.3-setup.zip.sha256',
          size: checksum.length,
        }],
      });
      const service = createAppUpdateService({
        currentVersion: '0.1.1',
        isPackaged: true,
        platform: 'win32',
        arch: 'x64',
        executablePath: path.join(root, 'Super.exe'),
        tempDirectory: root,
        downloadsDirectory: path.join(root, 'Downloads'),
        preparedUpdateDirectory: path.join(root, 'updates'),
        environment: { SUPER_DISTRIBUTION: 'installed' },
        fetchImpl: async (url) => {
          if (isUpdateManifestRequest(url)) return new Response(JSON.stringify(payload));
          if (url.endsWith('.sha256')) return new Response(`${checksum}\n`);
          return new Response(archiveBytes as unknown as BodyInit);
        },
        launchInstaller: async (installerPath, mode) => {
          launched.push({ path: installerPath, mode });
          expect(await readFile(installerPath)).toEqual(installerBytes);
        },
      });

      const prepared = await service.prepareUpdate();
      expect(prepared).toEqual({
        ok: true,
        status: 'completed',
        action: 'installer-staged',
        version: '0.1.3',
        distribution: 'installed',
      });
      expect((await readdir(path.join(root, 'updates'))).some((entry) => entry.startsWith('super-update-'))).toBe(true);

      const launchedResult = await service.launchPreparedUpdate('silent');
      expect(launchedResult).toEqual({
        ok: true,
        status: 'completed',
        action: 'installer-opened',
        version: '0.1.3',
        distribution: 'installed',
      });
      expect(launched).toHaveLength(1);
      expect(launched[0]?.mode).toBe('silent');
      // Windows keeps the staged installer until the newly launched app can
      // safely prune it. The foreground updater may relay-launch itself after
      // the original process exits, so deleting it at handoff is unsafe.
      const stagedDirectories = (await readdir(path.join(root, 'updates')))
        .filter((entry) => entry.startsWith('super-update-'));
      expect(stagedDirectories).toHaveLength(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('extracts and opens the verified Windows installer for an installed launch', async () => {
    const installerBytes = Buffer.from('Super installer bytes');
    const archive = new AdmZip();
    archive.addFile('SuperSetup.exe', installerBytes);
    const archiveBytes = archive.toBuffer();
    const checksum = createHash('sha256').update(archiveBytes).digest('hex');
    const root = await mkdtemp(path.join(tmpdir(), 'super-app-update-installer-openpath-test-'));
    const opened: string[] = [];
    let openedBytes: Buffer | undefined;
    try {
      const payload = releasePayload({
        assets: [{
          name: 'Super-win-x86-64-0.1.3-setup.zip',
          browser_download_url: 'https://liuyangyang.me/downloads/super/releases/0.1.3/Super-win-x86-64-0.1.3-setup.zip',
          size: archiveBytes.byteLength,
        }, {
          name: 'Super-win-x86-64-0.1.3-setup.zip.sha256',
          browser_download_url: 'https://liuyangyang.me/downloads/super/releases/0.1.3/Super-win-x86-64-0.1.3-setup.zip.sha256',
          size: checksum.length,
        }],
      });
      const service = createAppUpdateService({
        currentVersion: '0.1.1',
        isPackaged: true,
        platform: 'win32',
        arch: 'x64',
        executablePath: path.join(root, 'Super.exe'),
        tempDirectory: root,
        downloadsDirectory: path.join(root, 'Downloads'),
        environment: { SUPER_DISTRIBUTION: 'installed' },
        fetchImpl: async (url) => {
          if (isUpdateManifestRequest(url)) return new Response(JSON.stringify(payload));
          if (url.endsWith('.sha256')) return new Response(`${checksum}\n`);
          return new Response(archiveBytes as unknown as BodyInit);
        },
        openPath: async (filePath) => {
          opened.push(filePath);
          openedBytes = await readFile(filePath);
          return '';
        },
      });

      const result = await service.downloadAndInstall();
      expect(result).toEqual({
        ok: true,
        status: 'completed',
        action: 'installer-opened',
        version: '0.1.3',
        distribution: 'installed',
      });
      expect(opened).toHaveLength(1);
      expect(path.basename(opened[0]!)).toBe('SuperSetup.exe');
      expect(openedBytes).toEqual(installerBytes);
      expect((await readdir(path.join(root, 'Downloads')))).toEqual([]);
      expect((await readdir(root)).filter((entry) => entry.startsWith('super-installer-')))
        .toHaveLength(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
