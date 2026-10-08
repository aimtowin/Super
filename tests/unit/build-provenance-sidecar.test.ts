import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import type * as FsPromisesTypes from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { bindPackageProvenance, captureBuildProvenance } from '../../scripts/release/build-provenance.mjs';

const openInstrumentation = vi.hoisted(() => ({ payloadPath: '', sourcePath: '', mutation: '', triggered: 0 }));

// Preserve the real FileHandle and stream/hash implementation. The sole
// instrumentation point deterministically changes a fixture input after the
// production binder's initial source verification, at the real payload open.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromisesTypes>();
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args);
      if (typeof args[0] === 'string' && path.resolve(args[0]) === openInstrumentation.payloadPath
        && openInstrumentation.triggered === 0) {
        openInstrumentation.triggered++;
        try {
          await actual.writeFile(openInstrumentation.sourcePath, openInstrumentation.mutation);
        } catch (error) {
          await handle.close();
          throw error;
        }
      }
      return handle;
    },
  };
});

const ownedRoots: string[] = [];
const junctions: string[] = [];
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

async function put(root: string, relative: string, content: string) {
  const filename = path.join(root, relative);
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, content);
}

async function fixture() {
  const ownedRoot = await realpath(await mkdtemp(path.join(tmpdir(), 'super-provenance-sidecar-')));
  ownedRoots.push(ownedRoot);
  const repoRoot = path.join(ownedRoot, 'repository');
  const externalRoot = path.join(ownedRoot, 'external-receipt-parent');
  await mkdir(repoRoot);
  await mkdir(externalRoot);
  await put(repoRoot, 'package.json', '{"name":"Super","version":"2.3.16"}');
  await put(repoRoot, 'src/main/index.ts', 'export const fixture = "captured source";');
  await put(repoRoot, 'resources/media-binaries/source-lock.json', '{"schemaVersion":1,"components":{}}');
  const platform = 'win32-x64';
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
  const targetVersion = '2.3.16';
  const receipt = await captureBuildProvenance({ repoRoot, buildId: randomUUID(), sourceHead: 'a'.repeat(40),
    targetVersion, platform, builderVersion: '7.10.2',
    toolVersions: { node: '24.0.0', electron: '43.1.0', forge: '7.10.2' },
  });
  const packageRoot = path.join(repoRoot, 'out/Super-win32-x64');
  await put(packageRoot, 'resources/app/package.json', '{"name":"Super","version":"2.3.16"}');
  await put(packageRoot, 'Super.exe', 'actual fixture final executable');
  const receiptPath = path.join(repoRoot, `tmp/build-provenance/${receipt.buildId}/package.json`);
  return { ownedRoot, repoRoot, externalRoot, receipt, packageRoot, receiptPath, targetVersion, platform };
}

afterEach(async () => {
  Object.assign(openInstrumentation, { payloadPath: '', sourcePath: '', mutation: '', triggered: 0 });
  // Unlink only the explicitly created junction before recursively removing
  // the owned fixture, so cleanup never traverses its external destination.
  for (const junction of junctions.splice(0)) {
    const owner = ownedRoots.find((root) => {
      const relative = path.relative(root, junction);
      return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
    });
    if (!owner || !(await lstat(junction)).isSymbolicLink()) throw new Error('Refusing to unlink a non-owned sidecar fixture junction.');
    await unlink(junction);
  }
  const temporaryRoot = await realpath(tmpdir());
  for (const root of ownedRoots.splice(0)) {
    if (path.dirname(root) !== temporaryRoot || !path.basename(root).startsWith('super-provenance-sidecar-')) {
      throw new Error('Refusing to remove a non-owned sidecar fixture.');
    }
    await rm(root, { recursive: true, force: true });
  }
});

describe('A1b actual package sidecar write containment (isolated real filesystem)', () => {
  it('rejects a redirected existing parent before creating any external receipt directories', async () => {
    const ports = await fixture();
    const junction = path.join(ports.repoRoot, 'tmp/redirected-receipt-parent');
    await mkdir(path.dirname(junction), { recursive: true });
    await symlink(ports.externalRoot, junction, process.platform === 'win32' ? 'junction' : 'dir');
    junctions.push(junction);
    expect((await lstat(junction)).isSymbolicLink()).toBe(true);
    const firstNewDirectory = `must-not-create-${randomUUID()}`;
    const externalFirst = path.join(ports.externalRoot, firstNewDirectory);
    const externalSecond = path.join(externalFirst, 'second-level');
    const receiptPath = path.join(junction, firstNewDirectory, 'second-level/package.json');
    expect(await readdir(ports.externalRoot)).toEqual([]);

    await expect(bindPackageProvenance({ ...ports, receiptPath })).rejects.toThrow(/link|symlink|junction|redirect/iu);

    expect(await readdir(ports.externalRoot), 'Rejecting the sidecar must not first mkdir through the redirected parent.').toEqual([]);
    await expect(lstat(externalFirst)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(lstat(externalSecond)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(lstat(path.join(externalSecond, 'package.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('does not write a sidecar when immutable source changes at the real final payload open', async () => {
    const ports = await fixture();
    const sourcePath = path.join(ports.repoRoot, 'src/main/index.ts');
    const mutation = 'export const fixture = "source changed during payload hashing";';
    Object.assign(openInstrumentation, { payloadPath: path.join(ports.packageRoot, 'Super.exe'), sourcePath, mutation, triggered: 0 });

    const error = await bindPackageProvenance(ports).then(() => null, (failure: unknown) => failure);

    expect(openInstrumentation.triggered, 'The test must reach the actual package FileHandle, not fail in an earlier fixture gate.').toBe(1);
    expect(await readFile(sourcePath, 'utf8')).toBe(mutation);
    expect.soft(error, 'Source drift during the actual package hash must invalidate binding.').toMatchObject({ code: 'BUILD_PROVENANCE_UNVERIFIED' });
    expect.soft(error instanceof Error ? error.message : '', 'The binding failure must identify immutable source drift.').toMatch(/immutable|drift|changed/iu);
    expect(await lstat(ports.receiptPath).then(() => true, (failure: NodeJS.ErrnoException) => {
      if (failure.code !== 'ENOENT') throw failure;
      return false;
    }), 'An invalidated build must not leave a newly written package sidecar.').toBe(false);
  });
});
