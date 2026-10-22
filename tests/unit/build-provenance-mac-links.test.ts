import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readlink, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  bindPackageProvenance, captureBuildProvenance, inspectPackagePayload, verifyPackageProvenance,
} from '../../scripts/release/build-provenance.mjs';

const roots: string[] = [];
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const framework = 'Super.app/Contents/Frameworks/Electron Framework.framework';

async function put(root: string, relative: string, content: string) {
  const filename = path.join(root, relative);
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, content);
}

async function relativeLink(root: string, relative: string, target: string, type: 'file' | 'dir') {
  const filename = path.join(root, relative);
  await mkdir(path.dirname(filename), { recursive: true });
  try {
    // This MUST be a genuine relative symlink. A Windows junction replaces the
    // raw target with an absolute path and would not test the macOS contract.
    await symlink(target, filename, type);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (['EPERM', 'EACCES', 'ENOSYS', 'ENOTSUP'].includes(code ?? '')) {
      throw Object.assign(new Error(`BLOCKED: host cannot create the genuine relative symlink fixture (${code}).`), {
        code: 'FIXTURE_CAPABILITY_BLOCKED', cause: error,
      });
    }
    throw error;
  }
  const rawTarget = await readlink(filename);
  if (!path.isAbsolute(target)) {
    // Node preserves the relative link but translates separators on Windows.
    // Receipts must bind what readlink actually returns, not a canonical path.
    expect(rawTarget).toBe(process.platform === 'win32' ? target.replaceAll('/', '\\') : target);
  }
  return rawTarget;
}

async function fixture(platform: 'darwin-arm64' | 'win32-x64' = 'darwin-arm64') {
  const repoRoot = await realpath(await mkdtemp(path.join(tmpdir(), 'super-provenance-mac-links-')));
  roots.push(repoRoot);
  await put(repoRoot, 'package.json', '{"name":"Super","version":"2.3.16"}');
  await put(repoRoot, 'src/main/index.ts', 'export const fixture = true;');
  await put(repoRoot, 'resources/media-binaries/source-lock.json', '{"schemaVersion":1,"components":{}}');
  const suffix = platform === 'win32-x64' ? '.exe' : '';
  const files = [
    { path: `ffmpeg/${platform}/ffmpeg${suffix}`, role: 'executable', content: 'pinned ffmpeg' },
    { path: `ffmpeg/${platform}/ffprobe${suffix}`, role: 'executable', content: 'pinned ffprobe' },
    { path: `oiio/${platform}/oiiotool${suffix}`, role: 'executable', content: 'pinned oiio' },
    { path: `media-binaries/${platform}/licenses/COPYING.LGPLv2.1`, role: 'license', content: 'pinned LGPL' },
  ];
  const manifest = JSON.stringify({ schemaVersion: 1, platform,
    files: files.map(({ path: relative, role, content }) => ({ path: relative, role, sha256: hash(content) })),
  });
  const bundle = { status: 'ready', url: 'https://example.invalid/never-download.zip', sha256: hash('pinned archive'),
    size: 42, manifestSha256: hash(manifest) };
  await put(repoRoot, `resources/media-binaries/${platform}/manifest.json`, manifest);
  await put(repoRoot, 'resources/media-binaries/bundle-lock.json', JSON.stringify({ schemaVersion: 1, bundles: { [platform]: bundle } }));
  for (const file of files) await put(repoRoot, `resources/${file.path}`, file.content);
  await put(repoRoot, `resources/media-binaries/${platform}/acquisition.json`, JSON.stringify({
    schemaVersion: 1, platform, url: bundle.url, archiveSha256: bundle.sha256, manifestSha256: bundle.manifestSha256,
  }));
  const options = { repoRoot, buildId: randomUUID(), sourceHead: 'a'.repeat(40), targetVersion: '2.3.16', platform,
    builderVersion: '7.10.2', toolVersions: { node: '24.0.0', electron: '43.0.0', forge: '7.10.2' } };
  const receipt = await captureBuildProvenance(options);
  const relativePackageRoot = `out/Super-${platform}`;
  const packageRoot = path.join(repoRoot, relativePackageRoot);
  const packageManifest = platform === 'darwin-arm64' ? 'Super.app/Contents/Resources/app/package.json' : 'resources/app/package.json';
  await put(packageRoot, packageManifest, '{"name":"Super","version":"2.3.16"}');
  await put(packageRoot, `${framework}/Versions/A/Electron Framework`, 'signed framework binary');
  await put(packageRoot, `${framework}/Versions/A/Resources/Info.plist`, 'framework plist');
  return { repoRoot, receipt, packageRoot, platform, targetVersion: options.targetVersion,
    receiptPath: path.join(repoRoot, `tmp/build-provenance/${options.buildId}/package.json`) };
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== await realpath(tmpdir()) || !path.basename(root).startsWith('super-provenance-mac-links-')) {
      throw new Error('Refusing to remove a non-owned macOS provenance fixture.');
    }
    await rm(root, { recursive: true, force: true });
  }
});

describe('A1b macOS framework symlink receipt contract (test-only, no package execution)', () => {
  it('retains the regular-file digest shape for link-free darwin payloads', async () => {
    const ports = await fixture();
    const bound = await bindPackageProvenance(ports);
    expect(bound.package.files).toContainEqual({ path: `${framework}/Versions/A/Electron Framework`,
      bytes: Buffer.byteLength('signed framework binary'), sha256: hash('signed framework binary') });
    await expect(verifyPackageProvenance({ ...ports, receipt: bound })).resolves.toBeUndefined();
  });

  it('binds valid relative, contained framework links by kind and raw target without recursively following directory aliases', async () => {
    const ports = await fixture();
    const currentTarget = await relativeLink(ports.packageRoot, `${framework}/Versions/Current`, 'A', 'dir');
    const executableTarget = await relativeLink(ports.packageRoot, `${framework}/Electron Framework`, 'Versions/Current/Electron Framework', 'file');
    const resourcesTarget = await relativeLink(ports.packageRoot, `${framework}/Resources`, 'Versions/Current/Resources', 'dir');
    const bound = await bindPackageProvenance(ports);
    expect(bound.package.files).toContainEqual({ path: `${framework}/Versions/Current`, kind: 'symlink', target: currentTarget });
    expect(bound.package.files).toContainEqual({ path: `${framework}/Electron Framework`,
      kind: 'symlink', target: executableTarget });
    expect(bound.package.files).toContainEqual({ path: `${framework}/Resources`, kind: 'symlink', target: resourcesTarget });
    expect(bound.package.files.some((file) => file.path.startsWith(`${framework}/Versions/Current/`))).toBe(false);
    expect(bound.package.files.some((file) => file.path.startsWith(`${framework}/Resources/`))).toBe(false);
    await expect(verifyPackageProvenance({ ...ports, receipt: bound })).resolves.toBeUndefined();
  });

  it('binds the raw target, rejecting an equivalent target rewrite after the receipt was captured', async () => {
    const ports = await fixture();
    const relative = `${framework}/Versions/Current`;
    await relativeLink(ports.packageRoot, relative, 'A', 'dir');
    const bound = await bindPackageProvenance(ports);
    const fingerprint = bound.package.fingerprint;
    await rm(path.join(ports.packageRoot, relative));
    await relativeLink(ports.packageRoot, relative, './A', 'dir');
    await expect(verifyPackageProvenance({ ...ports, receipt: bound })).rejects.toThrow(/package|payload|changed|target|link/iu);
    // A fresh binding also demonstrates that the canonical payload bytes alone
    // cannot make these two differently targeted link receipts equivalent.
    const rebound = await bindPackageProvenance({ ...ports, receiptPath: path.join(ports.repoRoot, 'tmp/rebound.json') });
    expect(rebound.package.fingerprint).not.toBe(fingerprint);
  });

  it('produces identical contained framework link and regular-file records with serial, four and eight hash streams', async () => {
    const ports = await fixture();
    await relativeLink(ports.packageRoot, `${framework}/Versions/Current`, 'A', 'dir');
    await relativeLink(ports.packageRoot, `${framework}/Electron Framework`, 'Versions/Current/Electron Framework', 'file');
    await relativeLink(ports.packageRoot, `${framework}/Resources`, 'Versions/Current/Resources', 'dir');
    const serial = await inspectPackagePayload({ ...ports, concurrency: 1 });
    for (const concurrency of [4, 8]) {
      const concurrent = await inspectPackagePayload({ ...ports, concurrency });
      expect(concurrent.files).toEqual(serial.files);
      expect(concurrent.metrics.linkCount).toBe(3);
      expect(concurrent.metrics.bytes).toBe(serial.metrics.bytes);
    }
  });

  it('still hashes regular framework targets, rejecting a binary mutation behind a contained link', async () => {
    const ports = await fixture();
    await relativeLink(ports.packageRoot, `${framework}/Versions/Current`, 'A', 'dir');
    const bound = await bindPackageProvenance(ports);
    await put(ports.packageRoot, `${framework}/Versions/A/Electron Framework`, 'changed signed binary');
    await expect(verifyPackageProvenance({ ...ports, receipt: bound })).rejects.toThrow(/package|payload|hash|changed/iu);
  });

  it('rejects tampering with a recorded link kind/target even if the outer fingerprint is recomputed', async () => {
    const ports = await fixture();
    await relativeLink(ports.packageRoot, `${framework}/Versions/Current`, 'A', 'dir');
    const bound = await bindPackageProvenance(ports);
    const altered = structuredClone(bound);
    const link = altered.package.files.find((file) => file.path.endsWith('/Versions/Current'));
    expect(link).toBeDefined();
    Object.assign(link!, { kind: 'symlink', target: './A' });
    altered.package.fingerprint = hash(JSON.stringify(altered.package.files));
    await expect(verifyPackageProvenance({ ...ports, receipt: altered })).rejects.toThrow(/package|payload|changed|target|link/iu);
  });

  it('rejects absolute targets even when they resolve inside the same darwin package', async () => {
    const ports = await fixture();
    await relativeLink(ports.packageRoot, `${framework}/Versions/Current`, path.join(ports.packageRoot, framework, 'Versions/A'), 'dir');
    await expect(bindPackageProvenance(ports)).rejects.toThrow(/link|relative|absolute|target/iu);
  });

  it('rejects relative escape targets, even when the external destination is otherwise owned by the repository', async () => {
    const ports = await fixture();
    await put(ports.repoRoot, 'owned-outside-package/payload.txt', 'must not bless an external resource');
    const target = path.relative(ports.packageRoot, path.join(ports.repoRoot, 'owned-outside-package')).replaceAll('\\', '/');
    await relativeLink(ports.packageRoot, 'External', target, 'dir');
    await expect(bindPackageProvenance(ports)).rejects.toThrow(/link|escape|contain|target/iu);
  });

  it('rejects a lexically contained target whose link chain escapes the package', async () => {
    const ports = await fixture();
    await put(ports.repoRoot, 'owned-outside-package/payload.txt', 'external payload');
    await relativeLink(ports.packageRoot, 'Outside', '../..' + '/owned-outside-package', 'dir');
    await relativeLink(ports.packageRoot, 'ContainedAlias', 'Outside', 'dir');
    await expect(bindPackageProvenance(ports)).rejects.toThrow(/link|escape|contain|target/iu);
  });

  it.each(['Missing', 'Loop'])('rejects %s darwin symlink targets rather than skipping the unresolved payload', async (mode) => {
    const ports = await fixture();
    if (mode === 'Missing') {
      await relativeLink(ports.packageRoot, 'Missing', 'not-present', 'file');
    } else {
      await relativeLink(ports.packageRoot, 'Loop/A', 'B', 'file');
      await relativeLink(ports.packageRoot, 'Loop/B', 'A', 'file');
    }
    await expect(bindPackageProvenance(ports)).rejects.toThrow(/link|resolve|loop|broken|target/iu);
  });

  it('still rejects a genuine relative link in Windows package payloads', async () => {
    const ports = await fixture('win32-x64');
    await put(ports.packageRoot, 'Super.exe', 'windows binary');
    await relativeLink(ports.packageRoot, 'Super-link.exe', 'Super.exe', 'file');
    await expect(bindPackageProvenance(ports)).rejects.toThrow(/link|symlink|payload/iu);
  });

  it('does not permit source symlinks merely because the selected build target is darwin', async () => {
    const ports = await fixture();
    await relativeLink(ports.repoRoot, 'src/main/linked.ts', 'index.ts', 'file');
    await expect(bindPackageProvenance(ports)).rejects.toThrow(/link|production|input/iu);
  });

  it('rejects a linked package root and does not write a receipt via that alias', async () => {
    const ports = await fixture();
    const alias = path.join(ports.repoRoot, 'out/PackageAlias');
    await relativeLink(ports.repoRoot, 'out/PackageAlias', path.basename(ports.packageRoot), 'dir');
    await expect(bindPackageProvenance({ ...ports, packageRoot: alias })).rejects.toThrow(/link|redirect|root|parent/iu);
  });

  it('rejects a linked ancestor of a package root instead of blessing its resolved canonical directory', async () => {
    const ports = await fixture();
    await relativeLink(ports.repoRoot, 'alias-out', 'out', 'dir');
    await expect(bindPackageProvenance({ ...ports,
      packageRoot: path.join(ports.repoRoot, 'alias-out', path.basename(ports.packageRoot)),
    })).rejects.toThrow(/link|redirect|root|parent/iu);
  });
});
