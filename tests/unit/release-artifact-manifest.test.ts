import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import AdmZip from 'adm-zip';
import { afterEach, describe, expect, it } from 'vitest';

import { bindPackageProvenance, captureBuildProvenance } from '../../scripts/release/build-provenance.mjs';
import type { PackageBuildReceipt } from '../../scripts/release/build-provenance.mjs';
import { DELTA_SOURCE_RETENTION, selectRetainedDeltaSources } from '../../scripts/release/update-retention-policy.mjs';

type Kind = 'full-installer' | 'full-update' | 'delta' | 'forge-zip' | 'dmg';
type Digest = { path: string; bytes: number; sha256: string };
type Derivative = {
  schemaVersion: 1; derivativeId: string; buildId: string; targetVersion: string; platform: string;
  kind: Kind; packageFingerprint: string; inputFingerprint: string; artifact: Digest;
  installer?: { bytes: number; sha256: string }; fromVersion?: string; baseline?: Digest;
};
type ManifestArtifact = Digest & { kind: Kind; remoteName: string; derivativeId: string; fromVersion?: string };
type Manifest = {
  schemaVersion: 1; buildId: string; targetVersion: string; platform: string;
  packageFingerprint: string; artifacts: ManifestArtifact[]; fingerprint: string;
};
type PackagePorts = { repoRoot: string; packageRoot: string; packageReceipt: PackageBuildReceipt; targetVersion: string; platform: string };
type DerivativePorts = PackagePorts & {
  derivativeId: string; artifactKind: Kind; artifactPath: string; installerPath?: string;
  fromVersion?: string; baselinePath?: string;
};
type ManifestPorts = PackagePorts & { derivativeReceiptPaths?: string[]; baselineDirectory?: string };
type Contract = {
  bindDerivativeProvenance(options: DerivativePorts): Promise<{ receipt: Derivative; receiptPath: string }>;
  createArtifactManifest(options: ManifestPorts): Promise<Manifest>;
  verifyArtifactManifest(options: PackagePorts & { manifest: Manifest }): Promise<void>;
  writeArtifactChecksums(options: PackagePorts & { manifest: Manifest; outputPath: string }): Promise<{ checksumPath: string; sidecars: string[] }>;
};

const roots: string[] = [];
const targetVersion = '2.3.16';
const platform = 'win32-x64';
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

// These exports are a NEW thin provenance/selection contract. An initial
// absent module is contract TDD, not the old collector's historical 265-file
// defect or proof that an existing production installer was rebuilt wrongly.
async function contract(): Promise<Contract> {
  const url = new URL('../../scripts/release/artifact-manifest.mjs', import.meta.url);
  expect(await access(url).then(() => true, () => false), 'A1b derivative/manifest contract is not implemented (new-contract TDD).').toBe(true);
  const module = await import(url.href) as Partial<Contract>;
  for (const name of ['bindDerivativeProvenance', 'createArtifactManifest', 'verifyArtifactManifest', 'writeArtifactChecksums'] as const) {
    expect(module[name], `The thin artifact contract requires ${name}.`).toBeTypeOf('function');
  }
  return module as Contract;
}

async function put(root: string, relative: string, content: string | Buffer) {
  const filename = path.join(root, relative);
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, content);
  return filename;
}

function installerZip(binary: Buffer, name = 'SuperSetup.exe', extra = false) {
  const zip = new AdmZip();
  zip.addFile(name, binary);
  if (extra) zip.addFile('unexpected.txt', Buffer.from('must not be present in an official updater ZIP'));
  return zip.toBuffer();
}

async function fixture(fixturePlatform = platform) {
  const repoRoot = await realpath(await mkdtemp(path.join(tmpdir(), 'super-artifact-contract-')));
  roots.push(repoRoot);
  await put(repoRoot, 'package.json', JSON.stringify({ name: 'Super', version: targetVersion }));
  await put(repoRoot, 'src/main/index.ts', 'fixture immutable source');
  await put(repoRoot, 'resources/media-binaries/source-lock.json', '{"schemaVersion":1,"components":{}}');
  const suffix = fixturePlatform === platform ? '.exe' : '';
  const generated = [
    { path: `ffmpeg/${fixturePlatform}/ffmpeg${suffix}`, content: 'locked ffmpeg' },
    { path: `ffmpeg/${fixturePlatform}/ffprobe${suffix}`, content: 'locked ffprobe' },
    { path: `oiio/${fixturePlatform}/oiiotool${suffix}`, content: 'locked oiio' },
  ];
  const mediaManifest = JSON.stringify({ schemaVersion: 1, platform: fixturePlatform,
    files: generated.map((file) => ({ path: file.path, role: 'executable', sha256: hash(file.content) })),
  });
  const bundle = { status: 'ready', url: 'https://example.invalid/not-downloaded.zip', sha256: hash('locked archive'),
    size: 42, manifestSha256: hash(mediaManifest) };
  await put(repoRoot, `resources/media-binaries/${fixturePlatform}/manifest.json`, mediaManifest);
  await put(repoRoot, 'resources/media-binaries/bundle-lock.json', JSON.stringify({ schemaVersion: 1, bundles: { [fixturePlatform]: bundle } }));
  for (const file of generated) await put(repoRoot, `resources/${file.path}`, file.content);
  await put(repoRoot, `resources/media-binaries/${fixturePlatform}/acquisition.json`, JSON.stringify({
    schemaVersion: 1, platform: fixturePlatform, url: bundle.url, archiveSha256: bundle.sha256, manifestSha256: bundle.manifestSha256,
  }));
  const input = await captureBuildProvenance({ repoRoot, buildId: randomUUID(), sourceHead: 'a'.repeat(40),
    targetVersion, platform: fixturePlatform, builderVersion: '7.11.2', toolVersions: { node: '24.0.0', electron: '43.1.0', forge: '7.11.2' } });
  const packageRoot = path.join(repoRoot, `out/Super-${fixturePlatform}`);
  const packageManifest = fixturePlatform === platform ? 'resources/app/package.json' : 'Super.app/Contents/Resources/app/package.json';
  await put(packageRoot, packageManifest, JSON.stringify({ name: 'Super', version: targetVersion }));
  await put(packageRoot, fixturePlatform === platform ? 'Super.exe' : 'Super.app/Contents/MacOS/Super', 'final executable');
  const packageReceipt = await bindPackageProvenance({ repoRoot, receipt: input, packageRoot, targetVersion,
    platform: fixturePlatform, receiptPath: path.join(repoRoot, `tmp/build-provenance/${input.buildId}/package.json`) });
  return { repoRoot, packageRoot, packageReceipt, targetVersion, platform: fixturePlatform,
    baselineDirectory: path.join(repoRoot, 'release/baselines') };
}

async function baseline(ports: PackagePorts, version: string) {
  // Legacy source baseline shape remains untouched: no source HEAD/build ID or
  // new receipt is required for an already immutable historical source.
  return await put(ports.repoRoot, `release/baselines/${version}.json`, JSON.stringify({ version, runtimeVersion: '42.0.0',
    files: [{ path: 'Super.exe', size: 10, sha256: hash('old executable') },
      { path: 'resources/app/main.js', size: 8, sha256: hash('old main') }],
  }));
}

async function officialFixture() {
  const api = await contract();
  const ports = await fixture();
  const binary = randomBytes(8192);
  const installerPath = await put(ports.repoRoot, 'out/make/inno/SuperSetup.exe', binary);
  const updatePath = await put(ports.repoRoot, `out/make/Super-win-x86-64-${targetVersion}-setup.zip`, installerZip(binary));
  const full = await api.bindDerivativeProvenance({ ...ports, derivativeId: randomUUID(), artifactKind: 'full-installer', artifactPath: installerPath });
  const update = await api.bindDerivativeProvenance({ ...ports, derivativeId: randomUUID(), artifactKind: 'full-update', artifactPath: updatePath, installerPath });
  return { api, ports, installerPath, updatePath, full, update, binary, receiptPaths: [full.receiptPath, update.receiptPath] };
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== await realpath(tmpdir()) || !path.basename(root).startsWith('super-artifact-contract-')) {
      throw new Error('Refusing to remove a non-owned artifact contract fixture.');
    }
    await rm(root, { recursive: true, force: true });
  }
});

describe('A1b derivative proof contract (new TDD, tiny real ZIPs, no compiler)', () => {
  it('binds full installer and update ZIP to the exact package identity and their streamed binary hashes', async () => {
    const { ports, full, update, binary } = await officialFixture();
    expect(full.receipt).toMatchObject({ schemaVersion: 1, buildId: ports.packageReceipt.buildId,
      kind: 'full-installer', targetVersion, platform, inputFingerprint: ports.packageReceipt.inputFingerprint,
      packageFingerprint: ports.packageReceipt.package.fingerprint,
      artifact: { path: 'out/make/inno/SuperSetup.exe', bytes: binary.length, sha256: hash(binary) } });
    expect(update.receipt.installer).toEqual({ bytes: binary.length, sha256: hash(binary) });
    for (const derivative of [full, update]) {
      expect(path.relative(ports.repoRoot, derivative.receiptPath).replaceAll('\\', '/')).toBe(
        `tmp/build-provenance/${ports.packageReceipt.buildId}/derivatives/${derivative.receipt.derivativeId}.json`,
      );
      expect(await readFile(derivative.receiptPath, 'utf8')).not.toContain(ports.repoRoot);
    }
  });

  it.each(['source', 'package', 'targetVersion', 'platform'] as const)('refuses %s mismatch before binding derivative receipts or locators', async (field) => {
    const api = await contract();
    const ports = await fixture();
    const artifactPath = await put(ports.repoRoot, 'out/make/inno/SuperSetup.exe', 'tiny binary');
    if (field === 'source') await put(ports.repoRoot, 'src/main/index.ts', 'changed immutable input');
    if (field === 'package') await put(ports.packageRoot, 'Super.exe', 'changed final package');
    const options = { ...ports, derivativeId: randomUUID(), artifactKind: 'full-installer' as const, artifactPath };
    if (field === 'targetVersion') options.targetVersion = '2.3.15';
    if (field === 'platform') options.platform = 'darwin-arm64';
    await expect(api.bindDerivativeProvenance(options)).rejects.toThrow(/unverified|receipt|package|target|platform|immutable|changed/iu);
    expect(await access(path.join(ports.repoRoot, 'tmp/build-provenance', ports.packageReceipt.buildId, 'derivatives')).then(() => true, () => false)).toBe(false);
  });

  it.each(['different-binary', 'wrong-name', 'extra-entry'])('rejects a full ZIP with %s instead of certifying the ZIP filename alone', async (mode) => {
    const api = await contract();
    const ports = await fixture();
    const binary = Buffer.from('tiny installer');
    const installerPath = await put(ports.repoRoot, 'out/make/inno/SuperSetup.exe', binary);
    const archive = installerZip(mode === 'different-binary' ? Buffer.from('wrong installer') : binary,
      mode === 'wrong-name' ? 'Folder/SuperSetup.exe' : 'SuperSetup.exe', mode === 'extra-entry');
    const artifactPath = await put(ports.repoRoot, `out/make/Super-win-x86-64-${targetVersion}-setup.zip`, archive);
    await expect(api.bindDerivativeProvenance({ ...ports, derivativeId: randomUUID(), artifactKind: 'full-update', artifactPath, installerPath })).rejects.toThrow(/zip|installer|entry|checksum|hash|match/iu);
  });

  it('links a delta to unchanged legacy baseline bytes without requiring a historical source receipt', async () => {
    const { api, ports } = await officialFixture();
    const fromVersion = '2.3.15';
    const baselinePath = await baseline(ports, fromVersion);
    const originalBaseline = await readFile(baselinePath);
    const installerPath = await put(ports.repoRoot, 'tmp/fresh-delta/SuperSetup.exe', 'tiny new delta installer');
    const artifactPath = await put(ports.repoRoot, `out/make/delta/Super-win-x86-64-${fromVersion}-to-${targetVersion}-delta.zip`, installerZip(Buffer.from('tiny new delta installer')));
    const delta = await api.bindDerivativeProvenance({ ...ports, derivativeId: randomUUID(), artifactKind: 'delta', artifactPath,
      installerPath, fromVersion, baselinePath });
    expect(delta.receipt).toMatchObject({ kind: 'delta', fromVersion, targetVersion,
      baseline: { path: `release/baselines/${fromVersion}.json`, bytes: originalBaseline.length, sha256: hash(originalBaseline) } });
    expect(await readFile(baselinePath)).toEqual(originalBaseline);
  });

  it.each(['../escape.json', '/absolute.json', 'C:/absolute.json'])('rejects unsafe artifact/receipt path %s rather than allowing an external derivative', async (relative) => {
    const api = await contract();
    const ports = await fixture();
    await expect(api.bindDerivativeProvenance({ ...ports, derivativeId: randomUUID(), artifactKind: 'full-installer',
      artifactPath: relative })).rejects.toThrow(/path|absolute|owned|root|unsafe|unverified/iu);
  });

  it('rejects artifact symlinks and locator parent junctions before creating proof metadata through them', async () => {
    const api = await contract();
    const ports = await fixture();
    const realArtifact = await put(ports.repoRoot, 'owned-external/SuperSetup.exe', 'linked binary');
    const artifactPath = path.join(ports.repoRoot, 'out/make/inno/SuperSetup.exe');
    await mkdir(path.dirname(artifactPath), { recursive: true });
    await symlink(realArtifact, artifactPath, 'file');
    await expect(api.bindDerivativeProvenance({ ...ports, derivativeId: randomUUID(), artifactKind: 'full-installer', artifactPath })).rejects.toThrow(/link|symlink|owned|unverified/iu);
    await rm(artifactPath);
    await writeFile(artifactPath, 'real binary');
    const external = path.join(ports.repoRoot, 'owned-outside-locator');
    await mkdir(external);
    await symlink(external, path.join(ports.repoRoot, 'out/.build-provenance'), process.platform === 'win32' ? 'junction' : 'dir');
    await expect(api.bindDerivativeProvenance({ ...ports, derivativeId: randomUUID(), artifactKind: 'full-installer', artifactPath })).rejects.toThrow(/link|junction|owned|unverified/iu);
    expect(await access(path.join(external, 'artifacts')).then(() => true, () => false)).toBe(false);
  });
});

describe('A1b official attachment selection/checksum contract (new TDD)', () => {
  it('selects only the existing Windows official full/ZIP/delta roles, ignoring raw historical/cross-platform/unrelated files and local portable ZIPs', async () => {
    const { api, ports, receiptPaths } = await officialFixture();
    for (const relative of ['out/make/inno/OldSetup.exe', 'out/make/Super-win-x86-64-2.3.15-setup.zip',
      'out/make/Super-darwin-arm64-2.3.16.zip', 'out/make/unrelated.zip']) await put(ports.repoRoot, relative, 'must not be selected');
    const portablePath = await put(ports.repoRoot, `out/make/zip/win32/x64/Super-win32-x64-${targetVersion}.zip`, 'fixture local portable ZIP');
    const portable = await api.bindDerivativeProvenance({ ...ports, derivativeId: randomUUID(), artifactKind: 'forge-zip', artifactPath: portablePath });
    const manifest = await api.createArtifactManifest({ ...ports, derivativeReceiptPaths: [...receiptPaths, portable.receiptPath] });
    expect(manifest).toMatchObject({ schemaVersion: 1, buildId: ports.packageReceipt.buildId, targetVersion, platform,
      packageFingerprint: ports.packageReceipt.package.fingerprint });
    expect(manifest.artifacts.map((artifact) => artifact.kind).sort()).toEqual(['full-installer', 'full-update']);
    await expect(api.verifyArtifactManifest({ ...ports, manifest })).resolves.toBeUndefined();
  });

  it('uses exact current locator candidates by default, never recursively globbing raw out/make history', async () => {
    const { api, ports } = await officialFixture();
    await put(ports.repoRoot, 'out/make/delta/SuperSetup.exe', 'old delta intermediate');
    await put(ports.repoRoot, 'out/make/unrelated.zip', 'old raw ZIP');
    const manifest = await api.createArtifactManifest(ports);
    expect(manifest.artifacts).toHaveLength(2);
    expect(manifest.artifacts.some((artifact) => artifact.path.includes('/delta/'))).toBe(false);
  });

  it('derives retained sources from the existing newest-20 policy and permits fewer actual kept deltas without hardcoded release counts', async () => {
    const { api, ports, receiptPaths } = await officialFixture();
    const versions = Array.from({ length: DELTA_SOURCE_RETENTION + 3 }, (_value, index) => `2.2.${index}`);
    const kept = selectRetainedDeltaSources(versions, targetVersion);
    for (const version of versions) await baseline(ports, version);
    const fromVersion = kept[0]!;
    const installerPath = await put(ports.repoRoot, 'tmp/fresh-delta/SuperSetup.exe', 'small delta');
    const artifactPath = await put(ports.repoRoot, `out/make/delta/Super-win-x86-64-${fromVersion}-to-${targetVersion}-delta.zip`, installerZip(Buffer.from('small delta')));
    const delta = await api.bindDerivativeProvenance({ ...ports, derivativeId: randomUUID(), artifactKind: 'delta', artifactPath, installerPath,
      fromVersion, baselinePath: path.join(ports.baselineDirectory, `${fromVersion}.json`) });
    const manifest = await api.createArtifactManifest({ ...ports, derivativeReceiptPaths: [...receiptPaths, delta.receiptPath] });
    expect(manifest.artifacts).toHaveLength(3);
    expect(manifest.artifacts.filter((artifact) => artifact.kind === 'delta').map((artifact) => artifact.fromVersion)).toEqual([fromVersion]);
  });

  it.each(['old-source', 'too-large'])('refuses a declared delta that violates the existing %s retention policy', async (mode) => {
    const { api, ports, receiptPaths } = await officialFixture();
    const versions = Array.from({ length: DELTA_SOURCE_RETENTION + 1 }, (_value, index) => `2.2.${index}`);
    for (const version of versions) await baseline(ports, version);
    const fromVersion = mode === 'old-source' ? versions[0]! : versions.at(-1)!;
    const binary = mode === 'too-large' ? randomBytes(16384) : Buffer.from('small delta');
    const installerPath = await put(ports.repoRoot, 'tmp/fresh-delta/SuperSetup.exe', binary);
    const artifactPath = await put(ports.repoRoot, `out/make/delta/Super-win-x86-64-${fromVersion}-to-${targetVersion}-delta.zip`, installerZip(binary));
    const delta = await api.bindDerivativeProvenance({ ...ports, derivativeId: randomUUID(), artifactKind: 'delta', artifactPath, installerPath,
      fromVersion, baselinePath: path.join(ports.baselineDirectory, `${fromVersion}.json`) });
    await expect(api.createArtifactManifest({ ...ports, derivativeReceiptPaths: [...receiptPaths, delta.receiptPath] })).rejects.toThrow(/source|retain|ratio|size|policy|delta/iu);
  });

  it.each(['missing-full', 'missing-zip', 'duplicate-full', 'missing-binary', 'changed-binary'])('rejects %s in the declared official set', async (mode) => {
    const { api, ports, receiptPaths, installerPath, full } = await officialFixture();
    let candidates = receiptPaths;
    if (mode === 'missing-full') candidates = candidates.slice(1);
    if (mode === 'missing-zip') candidates = candidates.slice(0, 1);
    if (mode === 'duplicate-full') candidates = [...candidates, full.receiptPath];
    if (mode === 'missing-binary') await rm(installerPath);
    if (mode === 'changed-binary') await writeFile(installerPath, 'different installer');
    await expect(api.createArtifactManifest({ ...ports, derivativeReceiptPaths: candidates })).rejects.toThrow(/full|missing|duplicate|hash|changed|artifact|ENOENT|unverified/iu);
  });

  it.each(['buildId', 'targetVersion', 'platform', 'receipt-path'])('refuses a current locator with %s mismatch instead of trusting a filename or last proof', async (field) => {
    const { api, ports, full } = await officialFixture();
    const locator = path.join(ports.repoRoot, 'out/.build-provenance/artifacts/SuperSetup.exe.json');
    const pointer = JSON.parse(await readFile(locator, 'utf8'));
    if (field === 'receipt-path') pointer.receiptPath = '../outside-proof.json';
    else {
      const receipt = JSON.parse(await readFile(full.receiptPath, 'utf8'));
      receipt[field] = field === 'targetVersion' ? '2.3.15' : field === 'platform' ? 'darwin-arm64' : randomUUID();
      await writeFile(full.receiptPath, JSON.stringify(receipt));
    }
    await writeFile(locator, JSON.stringify(pointer));
    await expect(api.createArtifactManifest(ports)).rejects.toThrow(/receipt|locator|path|identity|build|full|target|platform|unverified/iu);
  });

  it('produces aggregate and per-binary checksums from exactly the verified manifest with no historical extras', async () => {
    const { api, ports, receiptPaths } = await officialFixture();
    const manifest = await api.createArtifactManifest({ ...ports, derivativeReceiptPaths: receiptPaths });
    await put(ports.repoRoot, 'out/make/history.zip', 'must not be checksummed');
    const outputPath = path.join(ports.repoRoot, 'out/make/SHA256SUMS-win32-x64.txt');
    const result = await api.writeArtifactChecksums({ ...ports, manifest, outputPath });
    expect(result.checksumPath).toBe(outputPath);
    expect(result.sidecars.sort()).toEqual(manifest.artifacts.map((artifact) => path.join(ports.repoRoot, `${artifact.path}.sha256`)).sort());
    const expectedLines = manifest.artifacts.map((artifact) => `${artifact.sha256}  ${artifact.path}`).sort();
    const aggregateLines = (await readFile(outputPath, 'utf8')).trim().split(/\r?\n/u).filter((line) => !line.startsWith('#')).sort();
    expect(aggregateLines).toEqual(expectedLines);
    for (const artifact of manifest.artifacts) {
      const text = await readFile(path.join(ports.repoRoot, `${artifact.path}.sha256`), 'utf8');
      expect(text).toContain(`${artifact.sha256}  ${artifact.path}`);
      expect(text).not.toContain('history.zip');
    }
  });

  it('verifies every declared artifact before replacing checksum output and leaves existing checksum bytes intact on failure', async () => {
    const { api, ports, receiptPaths, installerPath } = await officialFixture();
    const manifest = await api.createArtifactManifest({ ...ports, derivativeReceiptPaths: receiptPaths });
    const outputPath = await put(ports.repoRoot, 'out/make/SHA256SUMS-win32-x64.txt', 'existing checksum must survive');
    await writeFile(installerPath, 'tampered after selection');
    await expect(api.writeArtifactChecksums({ ...ports, manifest, outputPath })).rejects.toThrow(/hash|artifact|changed|unverified/iu);
    expect(await readFile(outputPath, 'utf8')).toBe('existing checksum must survive');
    expect(await access(`${installerPath}.sha256`).then(() => true, () => false)).toBe(false);
  });

  it('keeps the configured darwin maker ZIP/DMG roles without requiring a Windows Inno installer', async () => {
    const api = await contract();
    const ports = await fixture('darwin-arm64');
    const zipPath = await put(ports.repoRoot, `out/make/zip/darwin/arm64/Super-darwin-arm64-${targetVersion}.zip`, 'actual maker ZIP fixture');
    const dmgPath = await put(ports.repoRoot, 'out/make/Super.dmg', 'actual maker DMG fixture');
    const zip = await api.bindDerivativeProvenance({ ...ports, derivativeId: randomUUID(), artifactKind: 'forge-zip', artifactPath: zipPath });
    const dmg = await api.bindDerivativeProvenance({ ...ports, derivativeId: randomUUID(), artifactKind: 'dmg', artifactPath: dmgPath });
    const manifest = await api.createArtifactManifest({ ...ports, derivativeReceiptPaths: [zip.receiptPath, dmg.receiptPath] });
    expect(manifest.artifacts.map((artifact) => artifact.kind).sort()).toEqual(['dmg', 'forge-zip']);
    await expect(api.verifyArtifactManifest({ ...ports, manifest })).resolves.toBeUndefined();
  });
});
