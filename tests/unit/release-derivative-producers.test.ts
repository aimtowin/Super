import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, mkdtemp, open, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ForgeMakeResult, IForgePluginInterface, ResolvedForgeConfig } from '@electron-forge/shared-types';

import { bindPackageProvenance, captureBuildProvenance } from '../../scripts/release/build-provenance.mjs';
import { DELTA_SOURCE_RETENTION } from '../../scripts/release/update-retention-policy.mjs';

type ProcessOptions = { cwd: string; shell: false; stdio: 'inherit'; env?: NodeJS.ProcessEnv };
type ProcessResult = { status: number | null; error?: Error };
type Run = (command: string, argv: string[], options: ProcessOptions) => ProcessResult | Promise<ProcessResult>;
type ProducerPorts = { repoRoot: string; packageRoot: string; outputDirectory: string; isccPath: string; run: Run; env: NodeJS.ProcessEnv };
type FullResult = { installerPath: string; updateArchivePath: string; derivativeReceiptPaths: string[] };
type DeltaResult = {
  fromVersion: string; toVersion: string; path: string; remoteName: string; size: number; sha256: string;
  changedFiles: string[]; removedFiles: string[]; receiptPath: string;
};
type ProducerContract = {
  buildInnoInstaller(options: ProducerPorts): Promise<FullResult>;
  buildInnoDelta(options: ProducerPorts & { fromVersion: string; toVersion: string; baselinePath: string }): Promise<DeltaResult>;
  buildRetainedDeltas(options: Omit<ProducerPorts, 'isccPath'> & { baselineDirectory: string; fullPackagePath: string; dryRun?: boolean }): Promise<unknown>;
  writePackageFileManifest(options: { repoRoot: string; packageRoot: string; outputPath: string; version: string }): Promise<unknown>;
  writeReleaseChecksums(options: { repoRoot: string; packageRoot: string; targetVersion: string; platform: string }): Promise<unknown>;
};

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const roots: string[] = [];
const targetVersion = '2.3.16';
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const exportsByFile = [
  ['scripts/inno-build.mjs', 'buildInnoInstaller'],
  ['scripts/release/build-inno-delta.mjs', 'buildInnoDelta'],
  ['scripts/release/build-retained-deltas.mjs', 'buildRetainedDeltas'],
  ['scripts/release/package-file-manifest.mjs', 'writePackageFileManifest'],
  ['scripts/release/pipeline.mjs', 'writeReleaseChecksums'],
] as const;

// Current scripts auto-run their real CLI main on import. Do NOT import an old
// entry merely to obtain its future export: that could execute actual ISCC.
// These checks are explicit new-port TDD, not business-red evidence. The source
// assertions in the next describe separately identify actual missing wiring.
async function contract(): Promise<ProducerContract> {
  for (const [relative, name] of exportsByFile) {
    const source = await readFile(path.join(projectRoot, relative), 'utf8');
    expect(source, `${name} is a new injectable actual producer entry contract (not an old behavior reproduction).`)
      .toMatch(new RegExp(`export\\s+async\\s+function\\s+${name}\\b`, 'u'));
    expect(source, `${relative} must guard its CLI main before unit import.`).toMatch(/if\s*\([^\n]*process\.argv\[1\][\s\S]*fileURLToPath\(import\.meta\.url\)/u);
  }
  const modules = await Promise.all(exportsByFile.map(async ([relative]) => await import(new URL(`../../${relative}`, import.meta.url).href)));
  return Object.assign({}, ...modules) as ProducerContract;
}

async function put(root: string, relative: string, content: string | Buffer) {
  const filename = path.join(root, relative);
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, content);
  return filename;
}

async function sparseBinary(filename: string, bytes: number) {
  await mkdir(path.dirname(filename), { recursive: true });
  const handle = await open(filename, 'wx');
  try { await handle.truncate(bytes); }
  finally { await handle.close(); }
}

async function streamHash(filename: string) {
  const handle = await open(filename, 'r');
  try {
    const digest = createHash('sha256');
    for await (const chunk of handle.createReadStream({ autoClose: false })) digest.update(chunk);
    return digest.digest('hex');
  } finally {
    await handle.close();
  }
}

async function fixture() {
  const repoRoot = await realpath(await mkdtemp(path.join(tmpdir(), 'super-derivative-producers-')));
  roots.push(repoRoot);
  await put(repoRoot, 'package.json', JSON.stringify({ name: 'Super', version: targetVersion, devDependencies: { electron: '43.1.0' } }));
  await put(repoRoot, 'node_modules/electron/package.json', '{"version":"42.0.0"}');
  await put(repoRoot, 'src/main/index.ts', 'fixture immutable source');
  await put(repoRoot, 'assets/inno/supersetup.iss', await readFile(path.join(projectRoot, 'assets/inno/supersetup.iss')));
  await put(repoRoot, 'assets/inno/silent-update-ui.iss', await readFile(path.join(projectRoot, 'assets/inno/silent-update-ui.iss')));
  await put(repoRoot, 'assets/icons/app.ico', 'fixture icon');
  await put(repoRoot, 'resources/media-binaries/source-lock.json', '{"schemaVersion":1,"components":{}}');
  const generated = [
    { path: 'ffmpeg/win32-x64/ffmpeg.exe', content: 'locked ffmpeg' },
    { path: 'ffmpeg/win32-x64/ffprobe.exe', content: 'locked ffprobe' },
    { path: 'oiio/win32-x64/oiiotool.exe', content: 'locked oiio' },
  ];
  const mediaManifest = JSON.stringify({ schemaVersion: 1, platform: 'win32-x64',
    files: generated.map((file) => ({ path: file.path, role: 'executable', sha256: hash(file.content) })),
  });
  const bundle = { status: 'ready', url: 'https://example.invalid/no-network.zip', sha256: hash('locked archive'),
    size: 42, manifestSha256: hash(mediaManifest) };
  await put(repoRoot, 'resources/media-binaries/win32-x64/manifest.json', mediaManifest);
  await put(repoRoot, 'resources/media-binaries/bundle-lock.json', JSON.stringify({ schemaVersion: 1, bundles: { 'win32-x64': bundle } }));
  for (const file of generated) await put(repoRoot, `resources/${file.path}`, file.content);
  await put(repoRoot, 'resources/media-binaries/win32-x64/acquisition.json', JSON.stringify({ schemaVersion: 1, platform: 'win32-x64',
    url: bundle.url, archiveSha256: bundle.sha256, manifestSha256: bundle.manifestSha256 }));
  const input = await captureBuildProvenance({ repoRoot, buildId: randomUUID(), sourceHead: 'a'.repeat(40), targetVersion,
    platform: 'win32-x64', builderVersion: '7.11.2', toolVersions: { node: '24.0.0', electron: '43.1.0', forge: '7.11.2' } });
  const packageRoot = path.join(repoRoot, 'out/Super-win32-x64');
  await put(packageRoot, 'Super.exe', 'current runtime executable');
  await put(packageRoot, 'resources/app/package.json', JSON.stringify({ name: 'Super', version: targetVersion }));
  await put(packageRoot, 'resources/app/main.js', 'current renderer bundle');
  const packageReceipt = await bindPackageProvenance({ repoRoot, receipt: input, packageRoot, targetVersion, platform: 'win32-x64',
    receiptPath: path.join(repoRoot, `tmp/build-provenance/${input.buildId}/package.json`) });
  const pointerPath = await put(repoRoot, 'out/.build-provenance/Super-win32-x64.json', JSON.stringify({ schemaVersion: 1,
    buildId: input.buildId, receiptPath: `tmp/build-provenance/${input.buildId}/package.json` }));
  const isccPath = await put(repoRoot, 'owned-tools/ISCC.exe', 'compiler path fixture, never executed');
  const calls: { command: string; argv: string[]; options: ProcessOptions }[] = [];
  const run = vi.fn<Run>(async (command, argv, options) => {
    calls.push({ command, argv: [...argv], options: { ...options } });
    expect(command).toBe(isccPath);
    expect(options.cwd).toBe(repoRoot);
    expect(options.shell).toBe(false);
    const outputFlag = argv.find((argument) => argument.startsWith('/O'));
    expect(outputFlag, 'The real compiler must write only to a fresh explicitly owned /O directory.').toBeDefined();
    if (outputFlag === undefined) throw new Error('Producer did not supply ISCC /O.');
    const output = path.resolve(outputFlag.slice(2));
    const relative = path.relative(repoRoot, output).replaceAll('\\', '/');
    expect(relative).toMatch(new RegExp(`^tmp/build-provenance/${input.buildId}/derivative-builds/[a-f0-9-]{36}$`, 'iu'));
    expect(await access(path.join(output, 'SuperSetup.exe')).then(() => true, () => false)).toBe(false);
    const isDelta = argv.some((argument) => argument.endsWith('-delta.iss'));
    // Keep actual production thresholds. This is a sparse owned regular file,
    // NOT a minimum-size test override and NOT an actual compiled installer.
    await sparseBinary(path.join(output, 'SuperSetup.exe'), isDelta ? 512 * 1024 : 100 * 1024 * 1024 + 1);
    return { status: 0 };
  });
  return { repoRoot, packageRoot, outputDirectory: path.join(repoRoot, 'out/make/inno'), isccPath, run, calls,
    env: {}, packageReceipt, pointerPath, baselineDirectory: path.join(repoRoot, 'release/baselines') };
}

async function oldBaseline(ports: Awaited<ReturnType<typeof fixture>>, fromVersion = '2.3.15', runtimeVersion = '42.0.0') {
  return await put(ports.repoRoot, `release/baselines/${fromVersion}.json`, JSON.stringify({ version: fromVersion, runtimeVersion,
    files: [{ path: 'Super.exe', size: 10, sha256: hash('old executable') },
      { path: 'resources/app/main.js', size: 10, sha256: hash('old main') },
      { path: 'obsolete-runtime.txt', size: 10, sha256: hash('old obsolete') }],
  }));
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== await realpath(tmpdir()) || !path.basename(root).startsWith('super-derivative-producers-')) {
      throw new Error('Refusing to remove a non-owned derivative producer fixture.');
    }
    await rm(root, { recursive: true, force: true });
  }
});

describe('A1b actual derivative-entry wiring gaps (read-only source, not runtime proof)', () => {
  it.each(exportsByFile)('%s connects the actual entry to exact target receipt verification', async (relative) => {
    const source = await readFile(path.join(projectRoot, relative), 'utf8');
    expect(source).toMatch(/loadPackageBuildProvenance/u);
  });

  it('passes an explicit fresh ISCC /O rather than checking an old final file in a requested --out directory', async () => {
    const source = await readFile(path.join(projectRoot, 'scripts/inno-build.mjs'), 'utf8');
    expect(source).toMatch(/(?:`\/O\$\{|['"]\/O['"]\s*\+|['"]\/O[^'"]+['"])/u);
  });

  it('wires pipeline checksums to a verified artifact manifest rather than a second historical directory collector', async () => {
    const source = await readFile(path.join(projectRoot, 'scripts/release/pipeline.mjs'), 'utf8');
    expect(source).toMatch(/createArtifactManifest/u);
    expect(source).toMatch(/writeArtifactChecksums/u);
    expect(source).not.toMatch(/const artifacts\s*=\s*collectMakeArtifacts\(\)/u);
  });

  it('binds actual Forge postMake output paths while retaining maker result ownership and the existing product makers', async () => {
    const source = await readFile(path.join(projectRoot, 'scripts/release/build-with-provenance.mjs'), 'utf8');
    expect(source).toMatch(/postMake:\s*async/u);
    expect(source).toMatch(/bindDerivativeProvenance/u);
    const config = await readFile(path.join(projectRoot, 'forge.config.ts'), 'utf8');
    expect(config).toContain("new MakerZIP({}, ['darwin', 'win32'])");
    expect(config).toContain('new MakerDMG({})');
  });
});

describe('A1b actual producer injectable ports (new contract TDD, fake ISCC only)', () => {
  it.each(['missing-receipt', 'stale-package', 'source-drift'] as const)('full Inno refuses %s before any mkdir, replacement, ZIP or compiler invocation', async (mode) => {
    const api = await contract();
    const ports = await fixture();
    const outputDirectory = path.join(ports.repoRoot, 'out/requested output');
    if (mode === 'missing-receipt') await rm(ports.pointerPath);
    if (mode === 'stale-package') await put(ports.packageRoot, 'Super.exe', 'old package copied into current output');
    if (mode === 'source-drift') await put(ports.repoRoot, 'src/main/index.ts', 'source changed since packaging');
    await expect(api.buildInnoInstaller({ ...ports, outputDirectory })).rejects.toThrow(/unverified|receipt|package|immutable|changed|ENOENT/iu);
    expect(ports.calls).toHaveLength(0);
    expect(await access(outputDirectory).then(() => true, () => false)).toBe(false);
  });

  it('uses one fresh compiler output with the true /O directory and publishes associated installer/ZIP proofs in a supported custom final --out directory', async () => {
    const api = await contract();
    const ports = await fixture();
    const outputDirectory = path.join(ports.repoRoot, 'out/custom installer output');
    const result = await api.buildInnoInstaller({ ...ports, outputDirectory });
    expect(ports.calls).toHaveLength(1);
    expect(ports.calls[0]!.argv).toContain(`/DAppVersion=${targetVersion}`);
    expect(result.installerPath).toBe(path.join(outputDirectory, 'SuperSetup.exe'));
    expect(result.updateArchivePath).toBe(path.join(path.dirname(outputDirectory), `Super-win-x86-64-${targetVersion}-setup.zip`));
    expect(result.derivativeReceiptPaths).toHaveLength(2);
    for (const receiptPath of result.derivativeReceiptPaths) {
      const proof = JSON.parse(await readFile(receiptPath, 'utf8'));
      expect(proof.buildId).toBe(ports.packageReceipt.buildId);
      expect(proof.targetVersion).toBe(targetVersion);
    }
  });

  it('does not accept an old large generic SuperSetup.exe when ISCC returns success without producing the fresh file', async () => {
    const api = await contract();
    const ports = await fixture();
    const installerPath = path.join(ports.outputDirectory, 'SuperSetup.exe');
    await sparseBinary(installerPath, 100 * 1024 * 1024 + 1);
    const before = await streamHash(installerPath);
    const run: Run = (command, argv, options) => {
      ports.calls.push({ command, argv, options });
      return { status: 0 };
    };
    await expect(api.buildInnoInstaller({ ...ports, run })).rejects.toThrow(/fresh|produced|installer|ENOENT/iu);
    expect(await streamHash(installerPath)).toBe(before);
    expect(await access(path.join(ports.repoRoot, 'out/make', `Super-win-x86-64-${targetVersion}-setup.zip`)).then(() => true, () => false)).toBe(false);
  });

  it('does not replace an existing final installer/ZIP after compiler failure', async () => {
    const api = await contract();
    const ports = await fixture();
    const installerPath = await put(ports.repoRoot, 'out/make/inno/SuperSetup.exe', 'old final installer');
    const updatePath = await put(ports.repoRoot, `out/make/Super-win-x86-64-${targetVersion}-setup.zip`, 'old final ZIP');
    await expect(api.buildInnoInstaller({ ...ports, run: () => ({ status: 7 }) })).rejects.toThrow(/ISCC|compiler|failed|7/iu);
    expect(await readFile(installerPath, 'utf8')).toBe('old final installer');
    expect(await readFile(updatePath, 'utf8')).toBe('old final ZIP');
  });

  it('direct delta refuses a missing target proof before creating an ISS, ZIP, output directory or compiler call', async () => {
    const api = await contract();
    const ports = await fixture();
    const baselinePath = await oldBaseline(ports);
    await rm(ports.pointerPath);
    const outputDirectory = path.join(ports.repoRoot, 'out/not-created-delta');
    await expect(api.buildInnoDelta({ ...ports, outputDirectory, fromVersion: '2.3.15', toVersion: targetVersion, baselinePath })).rejects.toThrow(/unverified|receipt|ENOENT/iu);
    expect(ports.calls).toHaveLength(0);
    expect(await access(outputDirectory).then(() => true, () => false)).toBe(false);
  });

  it.each(['42.0.0', '43.1.0'])('direct delta compares runtime with trusted target receipt, preserving the old Super.exe policy (baseline runtime=%s)', async (runtimeVersion) => {
    const api = await contract();
    const ports = await fixture();
    const baselinePath = await oldBaseline(ports, '2.3.15', runtimeVersion);
    const original = await readFile(baselinePath);
    const outputDirectory = path.join(ports.repoRoot, 'out/make/delta');
    const result = await api.buildInnoDelta({ ...ports, outputDirectory, fromVersion: '2.3.15', toVersion: targetVersion, baselinePath });
    expect(result.changedFiles.includes('Super.exe')).toBe(runtimeVersion !== ports.packageReceipt.toolVersions.electron);
    expect(result.removedFiles).toContain('obsolete-runtime.txt');
    expect(result.remoteName).toBe(`Super-win-x86-64-2.3.15-to-${targetVersion}-delta.zip`);
    expect(result.size).toBeGreaterThan(0);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/u);
    const proof = JSON.parse(await readFile(result.receiptPath, 'utf8'));
    expect(proof).toMatchObject({ buildId: ports.packageReceipt.buildId, kind: 'delta', fromVersion: '2.3.15', targetVersion });
    expect(await readFile(baselinePath)).toEqual(original);
  });

  it('new baseline preserves its old wire shape but obtains runtime/files from the verified target, not installed Electron metadata', async () => {
    const api = await contract();
    const ports = await fixture();
    const outputPath = path.join(ports.baselineDirectory, `${targetVersion}.json`);
    await api.writePackageFileManifest({ ...ports, outputPath, version: targetVersion });
    const baseline = JSON.parse(await readFile(outputPath, 'utf8'));
    expect(Object.keys(baseline).sort()).toEqual(['files', 'runtimeVersion', 'version']);
    expect(baseline.version).toBe(targetVersion);
    expect(baseline.runtimeVersion).toBe('43.1.0');
    for (const file of baseline.files) expect(Object.keys(file).sort()).toEqual(['path', 'sha256', 'size']);
    expect(baseline.files).toContainEqual({ path: 'Super.exe', size: Buffer.byteLength('current runtime executable'), sha256: hash('current runtime executable') });
  });

  it('baseline refuses missing target proof before making directories and never overwrites a different immutable historical baseline', async () => {
    const api = await contract();
    const ports = await fixture();
    const outputPath = path.join(ports.repoRoot, 'not-created/baseline.json');
    await rm(ports.pointerPath);
    await expect(api.writePackageFileManifest({ ...ports, outputPath, version: targetVersion })).rejects.toThrow(/unverified|receipt|ENOENT/iu);
    expect(await access(path.dirname(outputPath)).then(() => true, () => false)).toBe(false);
    await writeFile(ports.pointerPath, JSON.stringify({ schemaVersion: 1, buildId: ports.packageReceipt.buildId,
      receiptPath: `tmp/build-provenance/${ports.packageReceipt.buildId}/package.json` }));
    const historical = await oldBaseline(ports, targetVersion);
    const bytes = await readFile(historical);
    await expect(api.writePackageFileManifest({ ...ports, outputPath: historical, version: targetVersion })).rejects.toThrow(/immutable|overwrite|baseline/iu);
    expect(await readFile(historical)).toEqual(bytes);
  });

  it.each(['target', 'full-zip'] as const)('retained wrapper validates %s proof before deleting existing current-target deltas or spawning children', async (mode) => {
    const api = await contract();
    const ports = await fixture();
    await oldBaseline(ports);
    const fullPackagePath = await put(ports.repoRoot, `out/make/Super-win-x86-64-${targetVersion}-setup.zip`, 'raw ZIP without valid full derivative proof');
    const outputDirectory = path.join(ports.repoRoot, 'out/make/delta');
    const existing = await put(ports.repoRoot, `out/make/delta/Super-win-x86-64-2.3.15-to-${targetVersion}-delta.zip`, 'must survive missing proof');
    if (mode === 'target') await rm(ports.pointerPath);
    await expect(api.buildRetainedDeltas({ ...ports, outputDirectory, fullPackagePath })).rejects.toThrow(/unverified|receipt|full|zip|proof|ENOENT/iu);
    expect(ports.calls).toHaveLength(0);
    expect(await readFile(existing, 'utf8')).toBe('must survive missing proof');
  });

  it('retained dry-run also validates proof and leaves existing history untouched rather than using raw size as authority', async () => {
    const api = await contract();
    const ports = await fixture();
    for (let index = 0; index < DELTA_SOURCE_RETENTION + 3; index++) await oldBaseline(ports, `2.2.${index}`);
    const fullPackagePath = await put(ports.repoRoot, `out/make/Super-win-x86-64-${targetVersion}-setup.zip`, 'not a verified full ZIP');
    await expect(api.buildRetainedDeltas({ ...ports, fullPackagePath, outputDirectory: path.join(ports.repoRoot, 'out/make/delta'), dryRun: true })).rejects.toThrow(/unverified|receipt|full|zip|proof|ENOENT/iu);
    expect(ports.calls).toHaveLength(0);
  });

  it('the actual checksum phase derives exactly the official manifest, not a second glob of history or local portable ZIPs', async () => {
    const api = await contract();
    const ports = await fixture();
    const full = await api.buildInnoInstaller(ports);
    await put(ports.repoRoot, 'out/make/history-2.3.15.zip', 'do not release');
    await put(ports.repoRoot, 'out/make/unrelated.zip', 'do not release');
    await put(ports.repoRoot, 'out/make/delta/SuperSetup.exe', 'old intermediate');
    await api.writeReleaseChecksums({ ...ports, targetVersion, platform: 'win32-x64' });
    const aggregate = await readFile(path.join(ports.repoRoot, 'out/make/SHA256SUMS-win32-x64.txt'), 'utf8');
    const binaryPaths = aggregate.trim().split(/\r?\n/u).filter((line) => !line.startsWith('#'))
      .map((line) => line.slice(line.indexOf('  ') + 2)).sort();
    expect(binaryPaths).toEqual([full.installerPath, full.updateArchivePath].map((filename) =>
      path.relative(ports.repoRoot, filename).replaceAll('\\', '/')).sort());
    expect(await access(path.join(ports.repoRoot, 'out/make/unrelated.zip.sha256')).then(() => true, () => false)).toBe(false);
  });

  it('actual checksum phase rejects a missing target package proof before creating or replacing checksum files', async () => {
    const api = await contract();
    const ports = await fixture();
    const existing = await put(ports.repoRoot, 'out/make/SHA256SUMS-win32-x64.txt', 'old checksum remains');
    await rm(ports.pointerPath);
    await expect(api.writeReleaseChecksums({ ...ports, targetVersion, platform: 'win32-x64' })).rejects.toThrow(/receipt|unverified|ENOENT/iu);
    expect(await readFile(existing, 'utf8')).toBe('old checksum remains');
  });

  it('the actual Forge postMake hook binds fresh derivative receipts from maker artifacts and returns the untouched results', async () => {
    await contract();
    const ports = await fixture();
    const { createBuildProvenanceHooks } = await import('../../scripts/release/build-with-provenance.mjs');
    const baseConfig = { plugins: [], packagerConfig: {}, rebuildConfig: {}, makers: [], publishers: [] };
    const { default: PluginInterface } = createRequire(import.meta.url)(path.join(projectRoot, 'node_modules/@electron-forge/core/dist/util/plugin-interface.js')) as {
      default: { create(root: string, config: Omit<ResolvedForgeConfig, 'pluginInterface'>): Promise<IForgePluginInterface> };
    };
    const config: ResolvedForgeConfig = { ...baseConfig, pluginInterface: await PluginInterface.create(ports.repoRoot, baseConfig) };
    const hooks = createBuildProvenanceHooks({ repoRoot: ports.repoRoot, platform: 'win32-x64', env: {}, makeArgv: [],
      run: () => ({ status: 0 }) });
    await hooks.preMake?.(config);
    const archive = await put(ports.repoRoot, `out/make/zip/win32/x64/Super-win32-x64-${targetVersion}.zip`, 'local maker portable ZIP');
    const outputs: ForgeMakeResult[] = [{ artifacts: [archive], packageJSON: { name: 'Super', version: targetVersion }, platform: 'win32', arch: 'x64' }];
    expect(hooks.postMake).toBeTypeOf('function');
    const result = await hooks.postMake?.(config, outputs);
    expect(result).toBe(outputs);
    expect(await readFile(archive, 'utf8')).toBe('local maker portable ZIP');
    const pointer = JSON.parse(await readFile(path.join(ports.repoRoot, 'out/.build-provenance/artifacts', `${path.basename(archive)}.json`), 'utf8'));
    const proof = JSON.parse(await readFile(path.join(ports.repoRoot, pointer.receiptPath), 'utf8'));
    expect(proof).toMatchObject({ buildId: ports.packageReceipt.buildId, kind: 'forge-zip', targetVersion, platform: 'win32-x64' });
  });
});
