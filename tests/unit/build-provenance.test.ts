import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

type FileDigest = { path: string; bytes: number; sha256: string };
type InputReceipt = {
  schemaVersion: 1; buildId: string; sourceHead: string; targetVersion: string; platform: string;
  builderVersion: string; toolVersions: Record<string, string>;
  dirtyFingerprint: string; inputFingerprint: string; inputs: FileDigest[];
  phase: 'inputs' | 'package'; package?: { files: FileDigest[]; fingerprint: string };
};
type CaptureOptions = {
  repoRoot: string; buildId: string; sourceHead: string; targetVersion: string; platform: string;
  builderVersion: string; toolVersions: Record<string, string>;
  configuration?: Record<string, unknown>; dirtyPaths?: string[];
};
type ReceiptPorts = { repoRoot: string; receipt: InputReceipt };
type PackagePorts = ReceiptPorts & { packageRoot: string; receiptPath: string; targetVersion: string; platform: string };
type Contract = {
  captureBuildProvenance(options: CaptureOptions): Promise<InputReceipt>;
  verifyImmutableBuildInputs(options: ReceiptPorts): Promise<void>;
  verifyBuildInputs(options: ReceiptPorts): Promise<void>;
  bindPackageProvenance(options: PackagePorts): Promise<InputReceipt>;
  verifyPackageProvenance(options: Omit<PackagePorts, 'receiptPath'>): Promise<void>;
};

// This file specifies a NEW receipt contract. Its initial failure is TDD, not
// a claim that a missing future module reproduces the old collector's defect.
async function contract(): Promise<Contract> {
  const url = new URL('../../scripts/release/build-provenance.mjs', import.meta.url);
  const present = await access(url).then(() => true, () => false);
  expect(present, 'A1b receipt contract is not implemented yet (new-contract TDD, not a production-defect reproduction).').toBe(true);
  const module = await import(url.href) as Partial<Contract>;
  for (const name of ['captureBuildProvenance', 'verifyImmutableBuildInputs', 'verifyBuildInputs', 'bindPackageProvenance', 'verifyPackageProvenance'] as const) {
    expect(module[name], `The approved pure receipt contract requires ${name}.`).toBeTypeOf('function');
  }
  return module as Contract;
}

const roots: string[] = [];
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
async function put(root: string, relative: string, content: string | Buffer) {
  const file = path.join(root, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}

const immutableFixtureFiles = {
  'src/main/index.ts': 'export const version = "fixture";',
  'src/renderer/theme.css': '.fixture { color: red; }',
  'src/untracked/runtime-template.txt': 'not listed in any Git index',
  'extension/options.html': '<html>extension fixture</html>',
  'extension/options.css': '.fixture {}',
  'extension/manifest.json': '{"manifest_version":3}',
  'index.html': '<html>renderer fixture</html>',
  'floating-preview.html': '<html>floating fixture</html>',
  'offscreen-thumbnail.html': '<html>offscreen fixture</html>',
  'package.json': '{"name":"Super","version":"2.3.16"}',
  'package-lock.json': '{"lockfileVersion":3}',
  'tsconfig.json': '{"compilerOptions":{}}',
  'tsconfig.extension.json': '{"compilerOptions":{}}',
  'vite.main.config.ts': 'export default {};',
  'forge.config.ts': 'export default {};',
  'forge.env.d.ts': 'export {};',
  'scripts/release/pipeline.mjs': 'export const fixture = true;',
  'scripts/build-extension.mjs': 'export const fixture = true;',
  'scripts/ufbx-bridge.c': 'void super_fixture(void) {}',
  'scripts/ufbx-wasm-lock.json': '{"schemaVersion":1}',
  'assets/inno/supersetup.iss': '#include "silent-update-ui.iss"',
  'assets/inno/silent-update-ui.iss': '// fixture include',
  'assets/icons/app.ico': 'fixture icon',
  'resources/ufbx/ufbx.js': 'fixture glue',
  'resources/ufbx/ufbx.wasm': 'fixture WASM',
  'resources/ufbx/LICENSE': 'fixture ufbx license',
  'resources/fonts/DejaVuSans.ttf': 'fixture font',
  'resources/new-runtime-resource.dat': 'untracked copied runtime resource',
  'resources/media-binaries/source-lock.json': '{"schemaVersion":1,"components":{}}',
  'LICENSE': 'fixture project license',
  'THIRD_PARTY_NOTICES.md': 'fixture shipped third-party notices',
};

async function fixture() {
  const repoRoot = await realpath(await mkdtemp(path.join(tmpdir(), 'super-build-provenance-')));
  roots.push(repoRoot);
  for (const [relative, content] of Object.entries(immutableFixtureFiles)) await put(repoRoot, relative, content);
  const manifest = JSON.stringify({ schemaVersion: 1, platform: 'win32-x64', files: [
    { path: 'ffmpeg/win32-x64/ffmpeg.exe', role: 'executable', sha256: hash('pinned ffmpeg') },
    { path: 'ffmpeg/win32-x64/ffprobe.exe', role: 'executable', sha256: hash('pinned ffprobe') },
    { path: 'oiio/win32-x64/oiiotool.exe', role: 'executable', sha256: hash('pinned oiio') },
    { path: 'media-binaries/win32-x64/licenses/COPYING.LGPLv2.1', role: 'license', sha256: hash('pinned LGPL license') },
  ] });
  await put(repoRoot, 'resources/media-binaries/win32-x64/manifest.json', manifest);
  await put(repoRoot, 'resources/media-binaries/win32-x64/licenses/COPYING.LGPLv2.1', 'pinned LGPL license');
  await put(repoRoot, 'resources/media-binaries/bundle-lock.json', JSON.stringify({ schemaVersion: 1, bundles: {
    'win32-x64': { status: 'ready', url: 'https://example.invalid/no-network.zip', sha256: hash('pinned archive'),
      size: 42, manifestSha256: hash(manifest) },
  } }));
  await put(repoRoot, '.env', 'fixture-secret-must-not-be-persisted');
  const options: CaptureOptions = {
    repoRoot, buildId: randomUUID(), sourceHead: 'a'.repeat(40), targetVersion: '2.3.16', platform: 'win32-x64',
    builderVersion: '7.10.2', toolVersions: { node: '22.16.0', electron: '37.10.1', forge: '7.10.2' },
    dirtyPaths: ['src/untracked/runtime-template.txt'], configuration: { asar: false, vcpkgEnabled: false },
  };
  return { repoRoot, options, mediaManifest: manifest };
}

async function generateLockedMedia(repoRoot: string) {
  await put(repoRoot, 'resources/ffmpeg/win32-x64/ffmpeg.exe', 'pinned ffmpeg');
  await put(repoRoot, 'resources/ffmpeg/win32-x64/ffprobe.exe', 'pinned ffprobe');
  await put(repoRoot, 'resources/oiio/win32-x64/oiiotool.exe', 'pinned oiio');
  await put(repoRoot, 'resources/media-binaries/win32-x64/licenses/COPYING.LGPLv2.1', 'pinned LGPL license');
  const lock = JSON.parse(await readFile(path.join(repoRoot, 'resources/media-binaries/bundle-lock.json'), 'utf8'));
  const bundle = lock.bundles['win32-x64'];
  await put(repoRoot, 'resources/media-binaries/win32-x64/acquisition.json', JSON.stringify({
    schemaVersion: 1, platform: 'win32-x64', url: bundle.url,
    archiveSha256: bundle.sha256, manifestSha256: bundle.manifestSha256,
  }));
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== await realpath(tmpdir()) || !path.basename(root).startsWith('super-build-provenance-')) {
      throw new Error('Refusing to remove a non-owned provenance fixture.');
    }
    await rm(root, { recursive: true, force: true });
  }
});

describe('A1b immutable input receipt contract (new TDD, no package execution)', () => {
  it('checks a clean immutable snapshot before any media generation, without mistaking it for a complete consuming proof', async () => {
    const api = await contract();
    const { repoRoot, options } = await fixture();
    await rm(path.join(repoRoot, 'resources/media-binaries/win32-x64/manifest.json'));
    await rm(path.join(repoRoot, 'resources/media-binaries/win32-x64/licenses/COPYING.LGPLv2.1'));
    const receipt = await api.captureBuildProvenance(options);
    await expect(api.verifyImmutableBuildInputs({ repoRoot, receipt })).resolves.toBeUndefined();
    await expect(api.verifyBuildInputs({ repoRoot, receipt })).rejects.toThrow();
  });

  it.each(['src/main/index.ts', 'resources/media-binaries/bundle-lock.json', 'resources/media-binaries/source-lock.json'])(
    'rejects immutable %s drift before generated media exists', async (relative) => {
      const api = await contract();
      const { repoRoot, options } = await fixture();
      const receipt = await api.captureBuildProvenance(options);
      await put(repoRoot, relative, 'changed before producer');
      await expect(api.verifyImmutableBuildInputs({ repoRoot, receipt })).rejects.toThrow(/immutable|drift|changed|lock/iu);
    },
  );

  it('rejects newly added source/resources before media generation instead of authorizing an arbitrary producer exception', async () => {
    const api = await contract();
    const { repoRoot, options } = await fixture();
    const receipt = await api.captureBuildProvenance(options);
    await put(repoRoot, 'resources/fonts/new-after-capture.ttf', 'new immutable member');
    await expect(api.verifyImmutableBuildInputs({ repoRoot, receipt })).rejects.toThrow(/immutable|declared|resource/iu);
  });

  it('allows only hash-pinned new manifest/license members in an incomplete generation and still requires final binary/acquisition verification', async () => {
    const api = await contract();
    const { repoRoot, options, mediaManifest } = await fixture();
    await rm(path.join(repoRoot, 'resources/media-binaries/win32-x64/manifest.json'));
    await rm(path.join(repoRoot, 'resources/media-binaries/win32-x64/licenses/COPYING.LGPLv2.1'));
    const receipt = await api.captureBuildProvenance(options);
    await put(repoRoot, 'resources/media-binaries/win32-x64/manifest.json', mediaManifest);
    await put(repoRoot, 'resources/media-binaries/win32-x64/licenses/COPYING.LGPLv2.1', 'pinned LGPL license');
    await expect(api.verifyImmutableBuildInputs({ repoRoot, receipt })).resolves.toBeUndefined();
    await expect(api.verifyBuildInputs({ repoRoot, receipt })).rejects.toThrow();
    await put(repoRoot, 'resources/media-binaries/win32-x64/licenses/COPYING.LGPLv2.1', 'untrusted new license');
    await expect(api.verifyImmutableBuildInputs({ repoRoot, receipt })).rejects.toThrow(/media|checksum|lock/iu);
  });

  it('rejects a new unpinned manifest before producers without requiring complete generated media', async () => {
    const api = await contract();
    const { repoRoot, options } = await fixture();
    await rm(path.join(repoRoot, 'resources/media-binaries/win32-x64/manifest.json'));
    const receipt = await api.captureBuildProvenance(options);
    await put(repoRoot, 'resources/media-binaries/win32-x64/manifest.json', '{"schemaVersion":1,"platform":"win32-x64","files":[]}');
    await expect(api.verifyImmutableBuildInputs({ repoRoot, receipt })).rejects.toThrow(/manifest|hash|lock/iu);
  });

  it('does not let the pre-producer guard replace the final binary/acquisition proof', async () => {
    const api = await contract();
    const { repoRoot, options } = await fixture();
    const receipt = await api.captureBuildProvenance(options);
    await generateLockedMedia(repoRoot);
    await put(repoRoot, 'resources/ffmpeg/win32-x64/ffmpeg.exe', 'wrong generated bytes');
    await expect(api.verifyImmutableBuildInputs({ repoRoot, receipt })).resolves.toBeUndefined();
    await expect(api.verifyBuildInputs({ repoRoot, receipt })).rejects.toThrow(/media|checksum|lock/iu);
  });

  it('captures every production file type and copied resource, including untracked files, with stable relative hashes', async () => {
    const api = await contract();
    const { repoRoot, options } = await fixture();
    const receipt = await api.captureBuildProvenance(options);
    expect(receipt).toMatchObject({ schemaVersion: 1, phase: 'inputs', buildId: options.buildId,
      sourceHead: options.sourceHead, targetVersion: options.targetVersion, platform: options.platform,
      builderVersion: options.builderVersion, toolVersions: options.toolVersions });
    const files = receipt.inputs.map((file) => file.path);
    expect(files).toEqual([...files].sort());
    expect(new Set(files).size).toBe(files.length);
    for (const [relative, content] of Object.entries(immutableFixtureFiles)) {
      expect(receipt.inputs).toContainEqual({ path: relative, bytes: Buffer.byteLength(content), sha256: hash(content) });
    }
    expect(receipt.inputFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(receipt.dirtyFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(receipt.package).toBeUndefined();
    await generateLockedMedia(repoRoot);
    await expect(api.verifyBuildInputs({ repoRoot, receipt })).resolves.toBeUndefined();
  });

  it.each(['src/renderer/theme.css', 'src/untracked/runtime-template.txt', 'index.html', 'extension/options.html',
    'package-lock.json', 'scripts/release/pipeline.mjs', 'scripts/ufbx-wasm-lock.json', 'assets/inno/silent-update-ui.iss',
    'assets/icons/app.ico', 'resources/ufbx/ufbx.js', 'resources/ufbx/ufbx.wasm', 'resources/fonts/DejaVuSans.ttf',
    'resources/new-runtime-resource.dat', 'LICENSE', 'THIRD_PARTY_NOTICES.md'])('rejects immutable drift in %s instead of accepting stale build inputs', async (relative) => {
    const api = await contract();
    const { repoRoot, options } = await fixture();
    const receipt = await api.captureBuildProvenance(options);
    await generateLockedMedia(repoRoot);
    await put(repoRoot, relative, 'changed after capture');
    await expect(api.verifyBuildInputs({ repoRoot, receipt })).rejects.toThrow(/immutable|input.*drift|changed/iu);
  });

  it('rejects production input addition/deletion and changes fingerprints without relying on caller Git status', async () => {
    const api = await contract();
    const { repoRoot, options } = await fixture();
    const receipt = await api.captureBuildProvenance({ ...options, dirtyPaths: [] });
    await generateLockedMedia(repoRoot);
    await put(repoRoot, 'src/new-untracked.bin', 'new production input');
    await expect(api.verifyBuildInputs({ repoRoot, receipt })).rejects.toThrow(/immutable|input.*drift|changed/iu);
    const later = await api.captureBuildProvenance({ ...options, dirtyPaths: [] });
    expect(later.inputFingerprint).not.toBe(receipt.inputFingerprint);
    await rm(path.join(repoRoot, 'src/main/index.ts'));
    await expect(api.verifyBuildInputs({ repoRoot, receipt: later })).rejects.toThrow(/immutable|input.*drift|changed/iu);
  });

  it('permits only declared generated locations; Vite/extension/native build outputs are not immutable source inputs', async () => {
    const api = await contract();
    const { repoRoot, options } = await fixture();
    await put(repoRoot, '.vite/build/main.js', 'old generated bundle');
    await put(repoRoot, 'dist/extension/content-script.js', 'old generated extension');
    await put(repoRoot, 'node_modules/better-sqlite3/build/Release/better_sqlite3.node', 'old native ABI');
    const receipt = await api.captureBuildProvenance(options);
    await generateLockedMedia(repoRoot);
    await put(repoRoot, '.vite/build/main.js', 'fresh generated bundle');
    await put(repoRoot, 'dist/extension/content-script.js', 'fresh generated extension');
    await put(repoRoot, 'node_modules/better-sqlite3/build/Release/better_sqlite3.node', 'fresh native ABI');
    expect(receipt.inputs.some((file) => file.path.startsWith('.vite/') || file.path.startsWith('dist/') || file.path.startsWith('node_modules/'))).toBe(false);
    await expect(api.verifyBuildInputs({ repoRoot, receipt })).resolves.toBeUndefined();
  });

  it('checks generated media against the captured lock rather than accepting arbitrary rebuilt bytes', async () => {
    const api = await contract();
    const { repoRoot, options } = await fixture();
    const receipt = await api.captureBuildProvenance(options);
    await generateLockedMedia(repoRoot);
    await put(repoRoot, 'resources/ffmpeg/win32-x64/ffmpeg.exe', 'untrusted changed ffmpeg');
    await expect(api.verifyBuildInputs({ repoRoot, receipt })).rejects.toThrow(/media|lock|checksum|hash/iu);
  });

  it('accepts clean-checkout media generation only after its manifest matches the lock captured before ensure', async () => {
    const api = await contract();
    const { repoRoot, options, mediaManifest } = await fixture();
    await rm(path.join(repoRoot, 'resources/media-binaries/win32-x64/manifest.json'));
    await rm(path.join(repoRoot, 'resources/media-binaries/win32-x64/licenses/COPYING.LGPLv2.1'));
    const receipt = await api.captureBuildProvenance(options);
    expect(receipt.inputs.some((file) => file.path === 'resources/media-binaries/win32-x64/manifest.json')).toBe(false);
    await put(repoRoot, 'resources/media-binaries/win32-x64/manifest.json', mediaManifest);
    await generateLockedMedia(repoRoot);
    await expect(api.verifyBuildInputs({ repoRoot, receipt })).resolves.toBeUndefined();
    await put(repoRoot, 'resources/media-binaries/win32-x64/licenses/unlisted-new-license.txt', 'not declared by the captured lock manifest');
    await expect(api.verifyBuildInputs({ repoRoot, receipt })).rejects.toThrow(/immutable|declared|resource|drift|changed/iu);
  });

  it('rejects an after-ensure manifest that differs from the previously captured bundle hash', async () => {
    const api = await contract();
    const { repoRoot, options } = await fixture();
    await rm(path.join(repoRoot, 'resources/media-binaries/win32-x64/manifest.json'));
    const receipt = await api.captureBuildProvenance(options);
    await generateLockedMedia(repoRoot);
    await put(repoRoot, 'resources/media-binaries/win32-x64/manifest.json', '{"schemaVersion":1,"platform":"win32-x64","files":[]}');
    await expect(api.verifyBuildInputs({ repoRoot, receipt })).rejects.toThrow(/manifest|lock|hash|media/iu);
  });

  it.each(['url', 'archiveSha256', 'manifestSha256', 'platform'])('rejects generated acquisition metadata whose %s differs from its captured lock', async (field) => {
    const api = await contract();
    const { repoRoot, options } = await fixture();
    const receipt = await api.captureBuildProvenance(options);
    await generateLockedMedia(repoRoot);
    const acquisitionPath = path.join(repoRoot, 'resources/media-binaries/win32-x64/acquisition.json');
    const acquisition = JSON.parse(await readFile(acquisitionPath, 'utf8'));
    acquisition[field] = 'fixture untrusted replacement';
    await writeFile(acquisitionPath, JSON.stringify(acquisition));
    await expect(api.verifyBuildInputs({ repoRoot, receipt })).rejects.toThrow(/acquisition|lock|media|provenance/iu);
  });

  it('rejects newly added undeclared copied resources even when Vite and media generated outputs are permitted', async () => {
    const api = await contract();
    const { repoRoot, options } = await fixture();
    const receipt = await api.captureBuildProvenance(options);
    await generateLockedMedia(repoRoot);
    await put(repoRoot, 'resources/fonts/untracked-after-capture.ttf', 'not generated media');
    await expect(api.verifyBuildInputs({ repoRoot, receipt })).rejects.toThrow(/immutable|input.*drift|resource|changed/iu);
  });

  it('does not let a changed bundle/source lock or media manifest authorize new binary bytes retroactively', async () => {
    const api = await contract();
    const { repoRoot, options } = await fixture();
    const receipt = await api.captureBuildProvenance(options);
    await generateLockedMedia(repoRoot);
    await put(repoRoot, 'resources/media-binaries/bundle-lock.json', '{"schemaVersion":1,"bundles":{}}');
    await expect(api.verifyBuildInputs({ repoRoot, receipt })).rejects.toThrow(/immutable|lock|drift|changed/iu);
  });

  it('cannot classify ufbx WASM or arbitrary runtime resources as generated by an untrusted media manifest', async () => {
    const api = await contract();
    const { repoRoot, options } = await fixture();
    const manifest = JSON.stringify({ schemaVersion: 1, platform: 'win32-x64', files: [
      { path: 'ufbx/ufbx.wasm', role: 'executable', sha256: hash('fixture WASM') },
    ] });
    await put(repoRoot, 'resources/media-binaries/win32-x64/manifest.json', manifest);
    await put(repoRoot, 'resources/media-binaries/bundle-lock.json', JSON.stringify({ schemaVersion: 1, bundles: {
      'win32-x64': { status: 'ready', url: 'https://example.invalid/no-network.zip', sha256: hash('archive'), size: 42, manifestSha256: hash(manifest) },
    } }));
    await expect(api.captureBuildProvenance(options)).rejects.toThrow(/media|path|generated|allow/iu);
  });

  it('does not serialize source contents, arbitrary configuration, environment variables or credential-like tool keys', async () => {
    const api = await contract();
    const { options } = await fixture();
    const receipt = await api.captureBuildProvenance({ ...options,
      configuration: { asar: false, token: 'fixture-config-secret' },
      toolVersions: { ...options.toolVersions, secret: 'fixture-tool-secret' },
    });
    const serialized = JSON.stringify(receipt);
    expect(serialized).not.toContain('fixture-config-secret');
    expect(serialized).not.toContain('fixture-tool-secret');
    expect(serialized).not.toContain('fixture-secret-must-not-be-persisted');
    expect(serialized).not.toContain('not listed in any Git index');
    expect(serialized).not.toContain(options.repoRoot);
  });

  it('rejects linked production directories instead of silently skipping or following them', async () => {
    const api = await contract();
    const { repoRoot, options } = await fixture();
    const external = path.join(repoRoot, 'fixture-external');
    await mkdir(external);
    await put(repoRoot, 'fixture-external/evil.txt', 'outside production root');
    await symlink(external, path.join(repoRoot, 'src/linked-input'), process.platform === 'win32' ? 'junction' : 'dir');
    await expect(api.captureBuildProvenance(options)).rejects.toThrow(/link|symlink|junction|contain/iu);
  });
});

describe('A1b late package receipt binding (fresh tiny artifacts, no Forge)', () => {
  async function packageFixture() {
    const api = await contract();
    const { repoRoot, options } = await fixture();
    const receipt = await api.captureBuildProvenance(options);
    await generateLockedMedia(repoRoot);
    const packageRoot = path.join(repoRoot, 'out/Super-win32-x64');
    await put(repoRoot, 'out/Super-win32-x64/Super.exe', 'late signed executable');
    await put(repoRoot, 'out/Super-win32-x64/resources/app/package.json', '{"name":"Super","version":"2.3.16"}');
    await put(repoRoot, 'out/Super-win32-x64/resources/app/node_modules/better-sqlite3/build/Release/better_sqlite3.node', 'rebuilt native payload');
    const ports: PackagePorts = { repoRoot, receipt, packageRoot, receiptPath: path.join(repoRoot, `tmp/provenance/${options.buildId}.json`),
      targetVersion: options.targetVersion, platform: options.platform };
    return { api, ...ports };
  }

  it('binds actual final package bytes without adding a sidecar self-reference or making output files source inputs', async () => {
    const ports = await packageFixture();
    const bound = await ports.api.bindPackageProvenance(ports);
    expect(bound.phase).toBe('package');
    expect(bound.package?.files).toContainEqual({ path: 'Super.exe', bytes: Buffer.byteLength('late signed executable'), sha256: hash('late signed executable') });
    expect(bound.inputs).toEqual(ports.receipt.inputs);
    expect(bound.package?.files.some((file) => file.path.endsWith(`${ports.receipt.buildId}.json`))).toBe(false);
    await expect(ports.api.verifyPackageProvenance({ ...ports, receipt: bound })).resolves.toBeUndefined();
  });

  it('refuses to create a self-referential sidecar inside the package', async () => {
    const ports = await packageFixture();
    await expect(ports.api.bindPackageProvenance({ ...ports, receiptPath: path.join(ports.packageRoot, 'build-receipt.json') })).rejects.toThrow(/sidecar|outside|self/iu);
  });

  it('rejects stale payload replacement and version/platform mismatches at consumption', async () => {
    const ports = await packageFixture();
    const bound = await ports.api.bindPackageProvenance(ports);
    await expect(ports.api.verifyPackageProvenance({ ...ports, receipt: bound, targetVersion: '2.3.15' })).rejects.toThrow(/version|target/iu);
    await expect(ports.api.verifyPackageProvenance({ ...ports, receipt: bound, platform: 'darwin-arm64' })).rejects.toThrow(/platform|target/iu);
    await put(ports.repoRoot, 'out/Super-win32-x64/Super.exe', 'old executable replacement');
    await expect(ports.api.verifyPackageProvenance({ ...ports, receipt: bound })).rejects.toThrow(/package|payload|hash|changed/iu);
  });

  it('does not promote an inputs-only receipt or current source HEAD into proof of an old package', async () => {
    const ports = await packageFixture();
    await expect(ports.api.verifyPackageProvenance(ports)).rejects.toThrow(/receipt|package|unverified|phase/iu);
    const malformed = { ...ports.receipt, sourceHead: 'not-a-head', inputFingerprint: 'not-a-hash' };
    await expect(ports.api.bindPackageProvenance({ ...ports, receipt: malformed })).rejects.toThrow(/receipt|head|fingerprint|schema/iu);
    expect(await readFile(path.join(ports.packageRoot, 'Super.exe'), 'utf8')).toBe('late signed executable');
  });
});
