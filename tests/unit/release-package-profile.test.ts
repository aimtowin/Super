import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, symlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { inspectPackagePayload } from '../../scripts/release/build-provenance.mjs';
import { profilePackage } from '../../scripts/release/profile-package.mjs';

const roots: string[] = [];
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const script = fileURLToPath(new URL('../../scripts/release/profile-package.mjs', import.meta.url));

async function fixture() {
  const repoRoot = await realpath(await mkdtemp(path.join(tmpdir(), 'super-release-profile-')));
  roots.push(repoRoot);
  const packageRoot = path.join(repoRoot, 'out/package');
  const content = {
    'resources/app/package.json': '{"name":"Super","version":"2.3.21"}',
    'Super.exe': 'fixture executable, never launched',
    'resources/app/fixture.js': 'export const fixture = true;',
    'resources/nested/数据 [OPPO].txt': 'unicode and brackets',
  };
  for (const [relative, value] of Object.entries(content)) {
    const file = path.join(packageRoot, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, value);
  }
  return { repoRoot, packageRoot, content, platform: 'win32-x64' };
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== await realpath(tmpdir()) || !path.basename(root).startsWith('super-release-profile-')) {
      throw new Error('Refusing to remove a non-owned profiling fixture.');
    }
    await rm(root, { recursive: true, force: true });
  }
});

describe('fresh payload hashing and read-only release profiling', () => {
  it('matches the original serial digest format and bytes at every supported width', async () => {
    const context = await fixture();
    const expected = Object.entries(context.content).map(([relative, content]) => ({
      path: relative, bytes: Buffer.byteLength(content), sha256: sha256(content),
    })).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    for (const concurrency of [1, 4, 8]) {
      const result = await inspectPackagePayload({ ...context, concurrency });
      expect(result.files).toEqual(expected);
      expect(result.metrics).toMatchObject({ concurrency, fileCount: 4, linkCount: 0,
        bytes: expected.reduce((total, file) => total + file.bytes, 0) });
      expect(result.metrics.totalMs).toBeGreaterThanOrEqual(0);
      expect(result.metrics.totalMs).toBeCloseTo(result.metrics.walkMs + result.metrics.hashMs + result.metrics.finalizeMs, 5);
    }
  });

  it('does not reuse a digest after same-sized bytes change and mtime is restored', async () => {
    const context = await fixture();
    const filename = path.join(context.packageRoot, 'Super.exe');
    const before = await inspectPackagePayload(context);
    const info = await stat(filename);
    await writeFile(filename, 'X'.repeat(info.size));
    await utimes(filename, info.atime, info.mtime);
    const after = await inspectPackagePayload(context);
    expect(after.files.find((file) => file.path === 'Super.exe')?.sha256)
      .not.toBe(before.files.find((file) => file.path === 'Super.exe')?.sha256);
  });

  it('freshly discovers added and removed files instead of caching directory membership', async () => {
    const context = await fixture();
    const before = await inspectPackagePayload(context);
    await rm(path.join(context.packageRoot, 'Super.exe'));
    await writeFile(path.join(context.packageRoot, 'new.dat'), 'new member');
    const after = await inspectPackagePayload(context);
    expect(after.files).not.toEqual(before.files);
    expect(after.files.map((file) => file.path)).toContain('new.dat');
    expect(after.files.map((file) => file.path)).not.toContain('Super.exe');
  });

  it('rejects package directories outside the owned repository', async () => {
    const context = await fixture();
    const outside = await fixture();
    await expect(inspectPackagePayload({ ...context, packageRoot: outside.packageRoot })).rejects.toThrow(/escaped/iu);
  });

  it('rejects redirected package ancestors and Windows payload links', async () => {
    const context = await fixture();
    const outside = await fixture();
    const linkedParent = path.join(context.repoRoot, 'redirected');
    await symlink(outside.repoRoot, linkedParent, process.platform === 'win32' ? 'junction' : 'dir');
    await expect(inspectPackagePayload({ ...context, packageRoot: path.join(linkedParent, 'out/package') }))
      .rejects.toThrow(/linked|redirected|link/iu);
    await symlink(outside.packageRoot, path.join(context.packageRoot, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    await expect(inspectPackagePayload(context)).rejects.toThrow(/linked|link/iu);
  });

  it.each([0, 9, 2.5, NaN])('rejects invalid inspection concurrency %s before dispatch', async (concurrency) => {
    const context = await fixture();
    await expect(inspectPackagePayload({ ...context, concurrency })).rejects.toThrow(/concurrency/iu);
  });

  it('rejects an unsupported inspection platform', async () => {
    const context = await fixture();
    await expect(inspectPackagePayload({ ...context, platform: 'linux-x64' })).rejects.toThrow(/platform/iu);
  });

  it('profiles in alternating order without producing a receipt or writing files', async () => {
    const context = await fixture();
    const before = await readdir(context.repoRoot, { recursive: true });
    const result = await profilePackage({ ...context, concurrency: [1, 4, 8], rounds: 2 });
    expect(result.mode).toBe('payload-inspection-only');
    expect(result.provenanceVerified).toBe(false);
    expect(result.samples.map((sample) => sample.metrics.concurrency)).toEqual([1, 4, 8, 8, 4, 1]);
    expect(new Set(result.samples.map((sample) => sample.fingerprint)).size).toBe(1);
    expect(await readdir(context.repoRoot, { recursive: true })).toEqual(before);
    expect(await readFile(path.join(context.packageRoot, 'Super.exe'), 'utf8')).toBe(context.content['Super.exe']);
  });

  it.each([0, 1.5, 6])('rejects unsafe profiling rounds %s', async (rounds) => {
    const context = await fixture();
    await expect(profilePackage({ ...context, rounds })).rejects.toThrow(/rounds/iu);
  });

  it('guards the CLI and outputs parseable timing JSON for a fixture, without launching it', async () => {
    const context = await fixture();
    const result = spawnSync(process.execPath, [script, '--repo-root', context.repoRoot, '--package-dir', context.packageRoot,
      '--platform', context.platform, '--concurrency', '1,4', '--rounds', '1'], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ mode: 'payload-inspection-only', provenanceVerified: false });
    expect(JSON.parse(result.stdout).samples).toHaveLength(2);
  });

  it.each([['--rounds', '0'], ['--concurrency', '100'], ['--unknown'], ['--package-dir']])(
    'rejects invalid CLI input %j without inspecting a package', async (...argv) => {
      const context = await fixture();
      const result = spawnSync(process.execPath, [script, ...argv], { cwd: context.repoRoot, encoding: 'utf8' });
      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
    },
  );
});
