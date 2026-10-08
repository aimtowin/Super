import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import type * as FsPromisesTypes from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { bindDerivativeProvenance } from '../../scripts/release/artifact-manifest.mjs';
import { bindPackageProvenance, captureBuildProvenance } from '../../scripts/release/build-provenance.mjs';

const openInstrumentation = vi.hoisted(() => ({
  artifactPath: '', sourcePath: '', mutation: '', artifactOpens: 0, triggered: 0,
}));

// The production binder and real FileHandle streams remain untouched. Its
// first artifact open captures the initial digest; the SECOND open belongs to
// final verifyDerivative, after the last package/source verification. Only at
// that precise point do we change an owned fixture input. No sleeps, missing
// exports, fake binder or mutation during package-receipt setup are involved.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromisesTypes>();
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args);
      if (typeof args[0] === 'string' && path.resolve(args[0]) === openInstrumentation.artifactPath) {
        openInstrumentation.artifactOpens++;
        if (openInstrumentation.artifactOpens === 2 && openInstrumentation.triggered === 0) {
          openInstrumentation.triggered++;
          try {
            await actual.writeFile(openInstrumentation.sourcePath, openInstrumentation.mutation);
          } catch (error) {
            await handle.close();
            throw error;
          }
        }
      }
      return handle;
    },
  };
});

const roots: string[] = [];
const hash = (content: string) => createHash('sha256').update(content).digest('hex');

async function put(root: string, relative: string, content: string) {
  const filename = path.join(root, relative);
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, content);
  return filename;
}

async function fixture() {
  const repoRoot = await realpath(await mkdtemp(path.join(tmpdir(), 'super-derivative-source-drift-')));
  roots.push(repoRoot);
  const targetVersion = '2.3.16';
  const platform = 'win32-x64';
  await put(repoRoot, 'package.json', JSON.stringify({ name: 'Super', version: targetVersion }));
  const sourcePath = await put(repoRoot, 'src/main/index.ts', 'export const fixture = "captured source";');
  await put(repoRoot, 'resources/media-binaries/source-lock.json', '{"schemaVersion":1,"components":{}}');
  const mediaFiles = [
    { path: 'ffmpeg/win32-x64/ffmpeg.exe', role: 'executable', content: 'pinned ffmpeg' },
    { path: 'ffmpeg/win32-x64/ffprobe.exe', role: 'executable', content: 'pinned ffprobe' },
    { path: 'oiio/win32-x64/oiiotool.exe', role: 'executable', content: 'pinned oiio' },
    { path: 'media-binaries/win32-x64/licenses/COPYING.LGPLv2.1', role: 'license', content: 'pinned LGPL license' },
  ];
  const manifest = JSON.stringify({ schemaVersion: 1, platform,
    files: mediaFiles.map(({ path: relative, role, content }) => ({ path: relative, role, sha256: hash(content) })),
  });
  const bundle = { status: 'ready', url: 'https://example.invalid/never-download.zip', sha256: hash('pinned archive'),
    size: 42, manifestSha256: hash(manifest) };
  await put(repoRoot, 'resources/media-binaries/win32-x64/manifest.json', manifest);
  await put(repoRoot, 'resources/media-binaries/bundle-lock.json', JSON.stringify({ schemaVersion: 1, bundles: { [platform]: bundle } }));
  for (const file of mediaFiles) await put(repoRoot, `resources/${file.path}`, file.content);
  await put(repoRoot, 'resources/media-binaries/win32-x64/acquisition.json', JSON.stringify({
    schemaVersion: 1, platform, url: bundle.url, archiveSha256: bundle.sha256, manifestSha256: bundle.manifestSha256,
  }));
  const input = await captureBuildProvenance({ repoRoot, buildId: randomUUID(), sourceHead: 'a'.repeat(40),
    targetVersion, platform, builderVersion: '7.11.2',
    toolVersions: { node: '24.0.0', electron: '43.1.0', forge: '7.11.2' },
  });
  const packageRoot = path.join(repoRoot, 'out/Super-win32-x64');
  await put(packageRoot, 'resources/app/package.json', JSON.stringify({ name: 'Super', version: targetVersion }));
  await put(packageRoot, 'Super.exe', 'actual fixture final executable');
  const packageReceipt = await bindPackageProvenance({ repoRoot, receipt: input, packageRoot, targetVersion, platform,
    receiptPath: path.join(repoRoot, `tmp/build-provenance/${input.buildId}/package.json`) });
  const artifactPath = await put(repoRoot, 'out/make/inno/SuperSetup.exe', 'actual fixture derivative binary');
  const derivativeId = randomUUID();
  const receiptPath = path.join(repoRoot, `tmp/build-provenance/${input.buildId}/derivatives/${derivativeId}.json`);
  const locatorPath = path.join(repoRoot, 'out/.build-provenance/artifacts/SuperSetup.exe.json');
  return { repoRoot, packageRoot, packageReceipt, targetVersion, platform,
    artifactPath, derivativeId, sourcePath, receiptPath, locatorPath };
}

async function exists(filename: string) {
  return await lstat(filename).then(() => true, (error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
    return false;
  });
}

afterEach(async () => {
  Object.assign(openInstrumentation, { artifactPath: '', sourcePath: '', mutation: '', artifactOpens: 0, triggered: 0 });
  const temporaryRoot = await realpath(tmpdir());
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== temporaryRoot || !path.basename(root).startsWith('super-derivative-source-drift-')) {
      throw new Error('Refusing to remove a non-owned derivative source-drift fixture.');
    }
    await rm(root, { recursive: true, force: true });
  }
});

describe('A1b actual final derivative source check (isolated real filesystem)', () => {
  it('binds an unchanged real derivative fixture and writes its exact immutable receipt and locator', async () => {
    const ports = await fixture();
    const result = await bindDerivativeProvenance({ ...ports, artifactKind: 'full-installer' });
    expect(result.receiptPath).toBe(ports.receiptPath);
    expect(result.receipt).toMatchObject({ buildId: ports.packageReceipt.buildId, derivativeId: ports.derivativeId,
      kind: 'full-installer', targetVersion: ports.targetVersion });
    expect(await exists(ports.receiptPath)).toBe(true);
    expect(await exists(ports.locatorPath)).toBe(true);
  });

  it('refuses both receipt and locator when immutable source changes at the real final artifact digest', async () => {
    const ports = await fixture();
    const mutation = 'export const fixture = "source changed during final derivative digest";';
    Object.assign(openInstrumentation, { artifactPath: ports.artifactPath, sourcePath: ports.sourcePath, mutation,
      artifactOpens: 0, triggered: 0 });

    const error = await bindDerivativeProvenance({ ...ports, artifactKind: 'full-installer' })
      .then(() => null, (failure: unknown) => failure);

    expect(openInstrumentation.artifactOpens, 'Must reach the final real artifact hash, not fail in fixture/package setup.').toBe(2);
    expect(openInstrumentation.triggered).toBe(1);
    expect(await readFile(ports.sourcePath, 'utf8')).toBe(mutation);
    expect.soft(error, 'Final source drift must invalidate derivative binding.').toMatchObject({ code: 'BUILD_PROVENANCE_UNVERIFIED' });
    expect.soft(error instanceof Error ? error.message : '').toMatch(/immutable|drift|changed/iu);
    expect.soft(await exists(ports.receiptPath), 'No immutable derivative receipt may be written for an invalidated build.').toBe(false);
    expect.soft(await exists(ports.locatorPath), 'No current-artifact locator may promote an invalidated derivative.').toBe(false);
  });
});
