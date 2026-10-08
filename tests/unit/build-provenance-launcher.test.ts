import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

type Receipt = {
  schemaVersion: 1; buildId: string; sourceHead: string; targetVersion: string; platform: string;
  builderVersion: string; toolVersions: Record<string, string>; phase: 'inputs' | 'package';
  inputs: { path: string; bytes: number; sha256: string }[];
  package?: { relativePath: string; files: { path: string; bytes: number; sha256: string }[] };
};
type RunOptions = { cwd: string; env: NodeJS.ProcessEnv; shell: false; stdio: 'pipe' | 'inherit' };
type RunResult = { status: number | null; stdout?: string; error?: Error };
type Run = (command: string, argv: string[], options: RunOptions) => Promise<RunResult> | RunResult;
type WiringOptions = { repoRoot: string; platform: string; env: NodeJS.ProcessEnv; run: Run; makeArgv: string[] };
type BuildResult = { buildId: string; receiptPath: string } | { buildId: null; receiptPath: null };
type Hooks = {
  generateAssets(config: unknown, platform: string, arch: string): Promise<void>;
  prePackage(config: unknown, platform: string, arch: string): Promise<void>;
  postPackage(config: unknown, result: { platform: string; arch: string; outputPaths: string[] }): Promise<void>;
  preMake(config: unknown): Promise<void>;
};
type Contract = {
  runBuildWithProvenance(options: WiringOptions & { command: 'package' | 'make'; argv: string[] }): Promise<BuildResult>;
  createBuildProvenanceHooks(options: WiringOptions): Hooks;
  loadPackageBuildProvenance(options: { repoRoot: string; packageRoot: string; targetVersion: string; platform: string }): Promise<Receipt>;
};
type Task = { title?: string; task(ctx: object, task: TaskPort): unknown };
type TaskPort = { title: string; newListr(tasks: Task[]): Promise<void> };

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const ownedRoots: string[] = [];
const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
const identity = { id: 'SUPER_BUILD_PROVENANCE_BUILD_ID', receipt: 'SUPER_BUILD_PROVENANCE_INPUT_RECEIPT' } as const;
const fixtureHead = 'a'.repeat(40);
const fixtureVersion = '2.3.16';

function scriptName(argv: string[]) {
  const first = argv[0];
  expect(first, 'The fixture process port requires an explicit executable/script argv.').toBeTypeOf('string');
  if (first === undefined) throw new Error('Fixture process argv is empty.');
  return path.basename(first);
}

function completedBuild(result: BuildResult): { buildId: string; receiptPath: string } {
  expect(result.buildId, 'A non-informational build must return its exact build identity.').toBeTypeOf('string');
  expect(result.receiptPath, 'A non-informational build must return its exact owned receipt path.').toBeTypeOf('string');
  if (result.buildId === null || result.receiptPath === null) throw new Error('Fixture expected a completed build identity.');
  return result;
}

// The existing-script tests below are real current-wiring regressions. The
// exported launcher tests specify NEW orchestration contracts; absent exports
// are contract TDD, never evidence that an old binary was built incorrectly.
async function contract(): Promise<Contract> {
  const url = new URL('../../scripts/release/build-with-provenance.mjs', import.meta.url);
  expect(await access(url).then(() => true, () => false), 'A1b launcher contract is not implemented yet (contract TDD, not a production-defect reproduction).').toBe(true);
  const module = await import(url.href) as Partial<Contract>;
  for (const name of ['runBuildWithProvenance', 'createBuildProvenanceHooks', 'loadPackageBuildProvenance'] as const) {
    expect(module[name], `The thin wiring contract requires ${name}.`).toBeTypeOf('function');
  }
  return module as Contract;
}

async function put(root: string, relative: string, contents: string) {
  const filename = path.join(root, relative);
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, contents);
}

async function fixture() {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'super-provenance-wiring-owned path-')));
  ownedRoots.push(root);
  const manifest = JSON.stringify({ schemaVersion: 1, platform: 'win32-x64', files: [
    { role: 'executable', path: 'ffmpeg/win32-x64/ffmpeg.exe', sha256: hash('pinned ffmpeg') },
    { role: 'executable', path: 'ffmpeg/win32-x64/ffprobe.exe', sha256: hash('pinned ffprobe') },
    { role: 'executable', path: 'oiio/win32-x64/oiiotool.exe', sha256: hash('pinned oiio') },
    { role: 'license', path: 'media-binaries/win32-x64/licenses/LICENSE.txt', sha256: hash('pinned license') },
  ] });
  const bundle = { status: 'ready', url: 'https://example.invalid/no-network.zip', size: 42,
    sha256: hash('pinned archive'), manifestSha256: hash(manifest) };
  for (const [relative, contents] of Object.entries({
    'package.json': JSON.stringify({ name: 'super', productName: 'Super', version: fixtureVersion,
      devDependencies: { electron: '43.1.0', '@electron-forge/cli': '7.11.2' } }),
    'package-lock.json': '{"lockfileVersion":3}',
    'forge.config.ts': 'export default {};',
    'src/main/index.ts': 'fixture immutable source',
    'src/new-file.txt': 'untracked input still captured',
    'scripts/media-binaries.mjs': 'fixture media script (never executed)',
    'scripts/verify-ufbx-wasm.mjs': 'fixture ufbx gate (never executed)',
    'scripts/build-extension.mjs': 'fixture extension gate (never executed)',
    'scripts/verify-package.mjs': 'fixture package gate (never executed)',
    'resources/ufbx/ufbx.wasm': 'fixture immutable WASM',
    'THIRD_PARTY_NOTICES.md': 'fixture shipped notice',
    'resources/media-binaries/source-lock.json': '{"schemaVersion":1,"components":{}}',
    'resources/media-binaries/bundle-lock.json': JSON.stringify({ schemaVersion: 1, bundles: { 'win32-x64': bundle } }),
    'resources/media-binaries/win32-x64/manifest.json': manifest,
    'resources/media-binaries/win32-x64/licenses/LICENSE.txt': 'pinned license',
    'node_modules/electron/package.json': '{"version":"43.1.0"}',
    'node_modules/@electron-forge/cli/package.json': '{"version":"7.11.2","bin":{"electron-forge":"dist/electron-forge.js"}}',
    'node_modules/@electron-forge/core/package.json': '{"version":"7.11.2"}',
    'node_modules/@electron-forge/cli/dist/electron-forge.js': 'fixture CLI (never executed)',
  })) await put(root, relative, contents);

  const calls: { command: string; argv: string[]; options: RunOptions }[] = [];
  const events: string[] = [];
  let onRun: ((argv: string[], options: RunOptions) => Promise<void>) | undefined;
  const run = vi.fn<Run>(async (command, argv, options) => {
    // Clone env at dispatch. Later hooks must not retroactively change proof.
    calls.push({ command, argv: [...argv], options: { ...options, env: { ...options.env } } });
    if (command === 'git') {
      events.push(`git:${argv.join(' ')}`);
      if (argv.join(' ') === 'rev-parse HEAD') return { status: 0, stdout: `${fixtureHead}\n` };
      if (argv.join(' ') === 'status --porcelain=v1 -z --untracked-files=all') return { status: 0, stdout: ' M src/main/index.ts\0?? src/new-file.txt\0' };
      throw new Error(`Unexpected Git diagnostic: ${JSON.stringify(argv)}`);
    }
    expect(command).toBe(process.execPath);
    expect(options.cwd).toBe(root);
    expect(options.shell).toBe(false);
    const script = scriptName(argv);
    events.push(script);
    await onRun?.(argv, options);
    if (script === 'media-binaries.mjs') {
      for (const [relative, bytes] of Object.entries({
        'resources/ffmpeg/win32-x64/ffmpeg.exe': 'pinned ffmpeg',
        'resources/ffmpeg/win32-x64/ffprobe.exe': 'pinned ffprobe',
        'resources/oiio/win32-x64/oiiotool.exe': 'pinned oiio',
        'resources/media-binaries/win32-x64/acquisition.json': JSON.stringify({ schemaVersion: 1, platform: 'win32-x64',
          url: bundle.url, archiveSha256: bundle.sha256, manifestSha256: bundle.manifestSha256 }),
      })) await put(root, relative, bytes);
    }
    return { status: 0 };
  });
  const options: WiringOptions = { repoRoot: root, platform: 'win32-x64', env: { FIXTURE_SECRET: 'not-for-receipt' }, run, makeArgv: [] };
  const packageRoot = path.join(root, 'out/Super-win32-x64');
  async function payload() {
    await put(root, 'out/Super-win32-x64/Super.exe', 'final signed/rebuilt executable');
    await put(root, 'out/Super-win32-x64/resources/app/package.json', JSON.stringify({ name: 'super', version: fixtureVersion }));
    await put(root, 'out/Super-win32-x64/resources/app/node_modules/native/addon.node', 'final rebuilt native addon');
  }
  return { ...options, options, calls, events, packageRoot, payload,
    onRun(callback: typeof onRun) { onRun = callback; },
    async input(env: NodeJS.ProcessEnv = options.env) {
      const filename = env[identity.receipt];
      expect(filename, 'The same immutable input receipt path must be explicit at the consuming boundary.').toBeTruthy();
      return JSON.parse(await readFile(filename!, 'utf8')) as Receipt;
    },
    pointerPath: path.join(root, 'out/.build-provenance/Super-win32-x64.json'),
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  const parent = await realpath(tmpdir());
  for (const root of ownedRoots.splice(0)) {
    expect(path.dirname(root)).toBe(parent);
    expect(path.basename(root)).toMatch(/^super-provenance-wiring-/u);
    await rm(root, { recursive: true, force: true });
  }
});

describe('A1b actual npm/Forge wiring gaps (read-only source, no packaging)', () => {
  it.each(['package', 'make'] as const)('%s uses the thin launcher and retains a read-only lifecycle alias', async (command) => {
    const source = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(source.scripts[command]).toBe(`node scripts/release/build-with-provenance.mjs ${command}`);
    expect(source.scripts[`pre${command}`]).toBe('node scripts/release/build-with-provenance.mjs preflight');
    expect(source.scripts[`pre${command}`]).not.toMatch(/media-binaries|ensure|verify-ufbx/u);
    expect(source.scripts['make:inno']).toBe('node scripts/inno-build.mjs');
    expect(source.scripts['release:delta']).toBe('node scripts/release/build-inno-delta.mjs');
  });

  it('wires the actual Forge config through an early generateAssets owner, not a late prePackage snapshot', async () => {
    const source = await readFile(path.join(repoRoot, 'forge.config.ts'), 'utf8');
    expect(source).toMatch(/import\s*\{\s*createBuildProvenanceHooks\s*\}\s*from\s*['"]\.\/scripts\/release\/build-with-provenance\.mjs['"]/u);
    expect(source).toMatch(/hooks:\s*createBuildProvenanceHooks\(\s*\{\s*repoRoot:\s*projectRoot\s*\}\s*\)/u);
    // Preserve payload shape and platform/product behavior while hook ownership
    // is moved. These assertions cannot by themselves prove a real Forge build.
    expect(source).toContain('asar: false');
    expect(source).toContain("identity: '-'");
    expect(source).toContain("'THIRD_PARTY_NOTICES.md'");
    expect(source).toContain('new VitePlugin(');
  });

  it('records installed Forge/Vite first-consumer ordering rather than assuming prePackage runs after the plugin', async () => {
    const core = await readFile(path.join(repoRoot, 'node_modules/@electron-forge/core/dist/api/package.js'), 'utf8');
    expect(core.indexOf("'generateAssets'")).toBeGreaterThanOrEqual(0);
    expect(core.indexOf("'generateAssets'")).toBeLessThan(core.indexOf("'prePackage'"));
    const hook = await readFile(path.join(repoRoot, 'node_modules/@electron-forge/core/dist/util/hook.js'), 'utf8');
    expect(hook.indexOf('hooks[hookName](forgeConfig')).toBeLessThan(hook.indexOf('pluginInterface.getHookListrTasks'));
    const plugin = await readFile(path.join(repoRoot, 'node_modules/@electron-forge/plugin-vite/dist/VitePlugin.js'), 'utf8');
    expect(plugin).toContain('prePackage: [');
    expect(plugin).toContain('await fs_extra_1.default.remove(this.baseDir)');
    expect(plugin).not.toContain('generateAssets:');
  });
});

describe('A1b thin npm launcher contracts (injected process port, real small receipt I/O)', () => {
  it.each(['package', 'make'] as const)('%s snapshots before media/ufbx, then passes argv and one identity to the local Forge CLI', async (command) => {
    const api = await contract();
    const fixturePorts = await fixture();
    let early: Receipt | undefined;
    fixturePorts.onRun(async (argv, options) => {
      if (scriptName(argv) === 'media-binaries.mjs') early = await fixturePorts.input(options.env);
      if (scriptName(argv) === 'electron-forge.js') {
        expect(await fixturePorts.input(options.env)).toEqual(early);
        expect(options.env.VcpkgEnabled).toBe('false');
      }
    });
    // Forge 7.11.2 package CLI has no --out option. The original contract red
    // used that illegal flag; this positive now uses the actual installed CLI
    // contract and exercises spaces through its supported positional directory.
    const argv = ['--arch=x64', '--platform=win32', fixturePorts.repoRoot];
    const result = completedBuild(await api.runBuildWithProvenance({ ...fixturePorts.options, command, argv }));
    expect(early?.phase).toBe('inputs');
    expect(early?.sourceHead).toBe(fixtureHead);
    expect(early?.inputs.some((file) => file.path === 'src/new-file.txt')).toBe(true);
    expect(fixturePorts.events).toEqual(['git:rev-parse HEAD', 'git:status --porcelain=v1 -z --untracked-files=all',
      'media-binaries.mjs', 'verify-ufbx-wasm.mjs', 'electron-forge.js']);
    const forge = fixturePorts.calls.at(-1)!;
    expect(forge.argv).toEqual([path.join(fixturePorts.repoRoot, 'node_modules/@electron-forge/cli/dist/electron-forge.js'), command, ...argv]);
    expect(forge.options.env[identity.id]).toBe(result.buildId);
    expect(forge.options.env[identity.receipt]).toBe(result.receiptPath);
    expect(path.relative(fixturePorts.repoRoot, result.receiptPath).replaceAll('\\', '/')).toBe(`tmp/build-provenance/${result.buildId}/inputs.json`);
    expect(JSON.stringify(early)).not.toContain('not-for-receipt');
  });

  it('does not trust inbound last-receipt hints for a fresh package and does not overwrite an older run', async () => {
    const api = await contract();
    const ports = await fixture();
    const first = completedBuild(await api.runBuildWithProvenance({ ...ports.options, command: 'package', argv: [] }));
    const original = await readFile(first.receiptPath, 'utf8');
    const second = completedBuild(await api.runBuildWithProvenance({ ...ports.options, command: 'package', argv: [],
      env: { ...ports.env, [identity.id]: first.buildId, [identity.receipt]: first.receiptPath } }));
    expect(second.buildId).not.toBe(first.buildId);
    expect(second.receiptPath).not.toBe(first.receiptPath);
    expect(await readFile(first.receiptPath, 'utf8')).toBe(original);
  });

  it.each(['media-binaries.mjs', 'verify-ufbx-wasm.mjs'] as const)('stops before Forge on %s failure and preserves the input proof', async (script) => {
    const api = await contract();
    const ports = await fixture();
    const run: Run = async (command, argv, options) => {
      const result = await ports.run(command, argv, options);
      return scriptName(argv) === script ? { status: 7 } : result;
    };
    await expect(api.runBuildWithProvenance({ ...ports.options, run, command: 'package', argv: [] })).rejects.toThrow(/gate|exited|failed|7/iu);
    expect(ports.calls.some((call) => scriptName(call.argv) === 'electron-forge.js')).toBe(false);
    const proofEnv = ports.calls.find((call) => scriptName(call.argv) === script)!.options.env;
    expect((await ports.input(proofEnv)).phase).toBe('inputs');
  });

  it('refuses immutable drift during ensure before spawning a Forge producer', async () => {
    const api = await contract();
    const ports = await fixture();
    ports.onRun(async (argv) => {
      if (scriptName(argv) === 'media-binaries.mjs') await put(ports.repoRoot, 'resources/ufbx/ufbx.wasm', 'changed after capture');
    });
    await expect(api.runBuildWithProvenance({ ...ports.options, command: 'package', argv: [] })).rejects.toThrow(/immutable|drift|changed|input/iu);
    expect(ports.calls.some((call) => scriptName(call.argv) === 'electron-forge.js')).toBe(false);
  });

  it('does not invent a HEAD when real Git identity lookup fails', async () => {
    const api = await contract();
    const ports = await fixture();
    const run: Run = (command, argv, options) => command === 'git'
      ? { status: 128, stdout: 'not a repository' } : ports.run(command, argv, options);
    await expect(api.runBuildWithProvenance({ ...ports.options, run, command: 'package', argv: [] })).rejects.toThrow(/git|head|128|identity/iu);
    expect(ports.calls).toHaveLength(0);
  });

  it.each(['--version', '-V', '--help', '-h'])('forwards informational %s to Forge without first capturing, ensuring or writing proof', async (flag) => {
    const api = await contract();
    const ports = await fixture();
    await api.runBuildWithProvenance({ ...ports.options, command: 'package', argv: [flag] });
    expect(ports.events).toEqual(['electron-forge.js']);
    expect(ports.calls[0]!.argv.slice(1)).toEqual(['package', flag]);
    expect(ports.calls[0]!.options.env[identity.id]).toBeUndefined();
    expect(await access(path.join(ports.repoRoot, 'tmp/build-provenance')).then(() => true, () => false)).toBe(false);
  });

  it.each([
    { argv: ['--out', 'unsupported package CLI output'] },
    { argv: ['--platform=darwin', '--arch=arm64'] },
    { argv: ['--platform', 'win32', '--arch', 'arm64'] },
    { argv: ['../another repository'] },
  ])('blocks unsafe or unsupported package argv $argv before any producer, preserving supported native aliases', async ({ argv }) => {
    const api = await contract();
    const ports = await fixture();
    await expect(api.runBuildWithProvenance({ ...ports.options, command: 'package', argv })).rejects.toThrow(/option|native|target|cross|repository|blocked/iu);
    expect(ports.calls).toHaveLength(0);
    expect(await access(path.join(ports.repoRoot, 'tmp/build-provenance')).then(() => true, () => false)).toBe(false);
  });

  it.each([false, true])('preserves make --targets and unknown-option allowance after an explicit owned directory (unknown value=%s)', async (hasValue) => {
    const api = await contract();
    const ports = await fixture();
    // Installed Commander concatenates unknown options into args, and Forge
    // action(dir) uses args[0]. With no explicit dir, the old fixture's unknown
    // flag itself was a non-owned directory, not a valid CLI positive.
    const argv = ['-a', 'x64', '-p', 'win32', '--targets=@electron-forge/maker-zip', ports.repoRoot,
      '--fixture-unknown-option', ...(hasValue ? ['ignored extra value with spaces'] : [])];
    await api.runBuildWithProvenance({ ...ports.options, command: 'make', argv });
    expect(ports.calls.at(-1)!.argv.slice(1)).toEqual(['make', ...argv]);
  });

  it('does not mistake an unknown make flag in the directory position for authorization to consume a different repository', async () => {
    const api = await contract();
    const ports = await fixture();
    await expect(api.runBuildWithProvenance({ ...ports.options, command: 'make', argv: ['--fixture-unknown-option'] })).rejects.toThrow(/cross|repository|blocked/iu);
    expect(ports.calls).toHaveLength(0);
  });

  it('records the same exact declared Electron version used by Forge instead of silently substituting installed metadata', async () => {
    const api = await contract();
    const ports = await fixture();
    await put(ports.repoRoot, 'node_modules/electron/package.json', '{"version":"42.0.0"}');
    const result = completedBuild(await api.runBuildWithProvenance({ ...ports.options, command: 'package', argv: [] }));
    const receipt = JSON.parse(await readFile(result.receiptPath, 'utf8'));
    expect(receipt.toolVersions.electron).toBe('43.1.0');
    expect(receipt.targetVersion).toBe(fixtureVersion);
  });
});

describe('A1b direct Forge hook lifecycle and exact package consumption', () => {
  async function boundFixture() {
    const api = await contract();
    const ports = await fixture();
    const hooks = api.createBuildProvenanceHooks(ports.options);
    await hooks.generateAssets({}, 'win32', 'x64');
    const input = await ports.input();
    await hooks.prePackage({}, 'win32', 'x64');
    await ports.payload();
    await hooks.postPackage({}, { platform: 'win32', arch: 'x64', outputPaths: [ports.packageRoot] });
    return { api, ports, hooks, input };
  }

  it('captures once at generateAssets, reuses the immutable proof and binds only after the existing copied-payload gate', async () => {
    const { api, ports, hooks, input } = await boundFixture();
    expect(ports.calls.filter((call) => call.command === 'git' && call.argv[0] === 'rev-parse')).toHaveLength(1);
    expect(ports.events).toEqual(['git:rev-parse HEAD', 'git:status --porcelain=v1 -z --untracked-files=all',
      'media-binaries.mjs', 'verify-ufbx-wasm.mjs', 'build-extension.mjs', 'verify-package.mjs']);
    const verify = ports.calls.at(-1)!;
    expect(verify.options.env.SUPER_PACKAGE_ROOT).toBe(ports.packageRoot);
    expect(verify.options.env.VcpkgEnabled).toBe('false');
    expect(await ports.input()).toEqual(input);
    const pointer = JSON.parse(await readFile(ports.pointerPath, 'utf8'));
    expect(Object.keys(pointer).sort()).toEqual(['buildId', 'receiptPath', 'schemaVersion']);
    expect(pointer).toEqual({ schemaVersion: 1, buildId: input.buildId, receiptPath: `tmp/build-provenance/${input.buildId}/package.json` });
    const bound = await api.loadPackageBuildProvenance({ repoRoot: ports.repoRoot, packageRoot: ports.packageRoot,
      targetVersion: fixtureVersion, platform: ports.platform });
    expect(bound.phase).toBe('package');
    expect(bound.buildId).toBe(input.buildId);
    expect(bound.package?.files.find((file) => file.path === 'Super.exe')?.sha256).toBe(hash('final signed/rebuilt executable'));
    await hooks.preMake({});
    expect(await ports.input()).toEqual(input);
    expect(ports.calls.filter((call) => call.command === 'git' && call.argv[0] === 'rev-parse')).toHaveLength(1);
  });

  it('npm-to-Forge transfers one identity across the process boundary without recapturing after media generation', async () => {
    const api = await contract();
    const ports = await fixture();
    ports.onRun(async (argv, options) => {
      if (scriptName(argv) !== 'electron-forge.js') return;
      const original = await ports.input(options.env);
      const env = { ...options.env };
      const hooks = api.createBuildProvenanceHooks({ ...ports.options, env });
      await hooks.generateAssets({}, 'win32', 'x64');
      await hooks.prePackage({}, 'win32', 'x64');
      expect(await ports.input(env)).toEqual(original);
    });
    await api.runBuildWithProvenance({ ...ports.options, command: 'make', argv: [] });
    expect(ports.calls.filter((call) => call.command === 'git' && call.argv[0] === 'rev-parse')).toHaveLength(1);
  });

  it.each(['wrong-id', 'wrong-target', 'outside-path'] as const)('rejects %s inherited input identity before direct Forge producers', async (kind) => {
    const api = await contract();
    const ports = await fixture();
    const result = completedBuild(await api.runBuildWithProvenance({ ...ports.options, command: 'package', argv: [] }));
    const env = { ...ports.env, [identity.id]: result.buildId, [identity.receipt]: result.receiptPath };
    if (kind === 'wrong-id') env[identity.id] = '00000000-0000-4000-8000-000000000001';
    if (kind === 'outside-path') env[identity.receipt] = path.resolve(ports.repoRoot, '../unowned-receipt.json');
    if (kind === 'wrong-target') {
      const receipt = JSON.parse(await readFile(result.receiptPath, 'utf8'));
      receipt.targetVersion = '2.3.15';
      await writeFile(result.receiptPath, JSON.stringify(receipt));
    }
    ports.calls.length = 0;
    const hooks = api.createBuildProvenanceHooks({ ...ports.options, env });
    await expect(hooks.generateAssets({}, 'win32', 'x64')).rejects.toThrow(/receipt|identity|build|version|target|owned|unverified/iu);
    expect(ports.calls).toHaveLength(0);
  });

  it('does not recapture source changed by an earlier asset-generation plugin before the Vite consumer', async () => {
    const api = await contract();
    const ports = await fixture();
    const hooks = api.createBuildProvenanceHooks(ports.options);
    await hooks.generateAssets({}, 'win32', 'x64');
    const before = await ports.input();
    await put(ports.repoRoot, 'src/main/index.ts', 'modified during generateAssets plugin hook');
    await expect(hooks.prePackage({}, 'win32', 'x64')).rejects.toThrow(/immutable|drift|changed|input/iu);
    expect(await ports.input()).toEqual(before);
    expect(ports.calls.filter((call) => call.command === 'git' && call.argv[0] === 'rev-parse')).toHaveLength(1);
    // An earlier generateAssets plugin can edit source between hooks. Reject
    // before media ensure (which can acquire/copy), not just before Vite/copy.
    expect(ports.calls.filter((call) => call.command !== 'git')).toHaveLength(0);
    expect(ports.events).not.toContain('build-extension.mjs');
  });

  it('runs the installed Forge task ordering and actual Vite prePackage hook with only build targets replaced', async () => {
    const api = await contract();
    const ports = await fixture();
    const hooks = api.createBuildProvenanceHooks(ports.options);
    const { VitePlugin } = require('@electron-forge/plugin-vite') as { VitePlugin: new (config: object) => {
      init(root: string): void; setDirectories(root: string): void; build(): Promise<void>; buildRenderer(): Promise<void>;
    } };
    const plugin = new VitePlugin({ build: [], renderer: [] });
    // init normally only adds process signal handlers and resolves paths. Keep
    // its directory setup while avoiding process handlers in this unit fixture.
    plugin.init = (root) => plugin.setDirectories(root);
    plugin.build = async () => {
      expect((await ports.input()).phase).toBe('inputs');
      ports.events.push('actual-vite-main-hook');
    };
    plugin.buildRenderer = async () => { ports.events.push('actual-vite-renderer-hook'); };
    const { default: PluginInterface } = require(path.join(repoRoot, 'node_modules/@electron-forge/core/dist/util/plugin-interface.js')) as {
      default: { create(root: string, config: object): Promise<unknown> };
    };
    const { getHookListrTasks } = require(path.join(repoRoot, 'node_modules/@electron-forge/core/dist/util/hook.js')) as {
      getHookListrTasks(trace: unknown, config: object, name: string, ...args: string[]): Promise<Task[]>;
    };
    const config = { hooks, plugins: [plugin], pluginInterface: undefined as unknown };
    config.pluginInterface = await PluginInterface.create(ports.repoRoot, config);
    const trace = (_metadata: unknown, callback: (trace: unknown, ctx: object, task: TaskPort) => unknown) =>
      (ctx: object, task: TaskPort) => callback(trace, ctx, task);
    const taskPort: TaskPort = { title: 'fixture', async newListr(tasks) {
      for (const task of tasks) await task.task({}, taskPort);
    } };
    for (const name of ['generateAssets', 'prePackage']) {
      const tasks = await getHookListrTasks(trace, config, name, 'win32', 'x64');
      await taskPort.newListr(tasks);
    }
    expect(ports.events).toEqual(['git:rev-parse HEAD', 'git:status --porcelain=v1 -z --untracked-files=all',
      'media-binaries.mjs', 'verify-ufbx-wasm.mjs', 'build-extension.mjs', 'actual-vite-main-hook', 'actual-vite-renderer-hook']);
    expect(ports.env.VcpkgEnabled).toBe('false');
  });

  it('rejects a failed copied-payload gate before publishing any package locator', async () => {
    const api = await contract();
    const ports = await fixture();
    const run: Run = async (command, argv, options) => {
      const result = await ports.run(command, argv, options);
      return scriptName(argv) === 'verify-package.mjs' ? { status: 9 } : result;
    };
    const hooks = api.createBuildProvenanceHooks({ ...ports.options, run });
    await hooks.generateAssets({}, 'win32', 'x64');
    await hooks.prePackage({}, 'win32', 'x64');
    await ports.payload();
    await expect(hooks.postPackage({}, { platform: 'win32', arch: 'x64', outputPaths: [ports.packageRoot] })).rejects.toThrow(/gate|exited|failed|9/iu);
    expect(await access(ports.pointerPath).then(() => true, () => false)).toBe(false);
  });

  it('accepts --skip-package only through an already bound, verified exact package receipt and keeps its original build identity', async () => {
    const { api, ports, input } = await boundFixture();
    ports.calls.length = 0;
    ports.events.length = 0;
    const result = completedBuild(await api.runBuildWithProvenance({ ...ports.options, command: 'make', argv: ['--skip-package', '--arch=x64'] }));
    expect(result.buildId).toBe(input.buildId);
    expect(ports.calls.filter((call) => call.command === 'git')).toHaveLength(0);
    const forge = ports.calls.at(-1)!;
    expect(forge.argv.slice(1)).toEqual(['make', '--skip-package', '--arch=x64']);
    expect(forge.options.env[identity.id]).toBe(input.buildId);
    expect((await ports.input(forge.options.env)).phase).toBe('package');
  });

  it('checks actual direct-make target flags before legacy gates rather than verifying a host package for a different maker architecture', async () => {
    const { api, ports } = await boundFixture();
    ports.calls.length = 0;
    const hooks = api.createBuildProvenanceHooks({ ...ports.options, makeArgv: ['--skip-package', '--arch=arm64'] });
    await expect(hooks.preMake({})).rejects.toThrow(/native|target|blocked/iu);
    expect(ports.calls).toHaveLength(0);
  });

  it('replaces only the exact-package locator for a later valid build and preserves earlier immutable receipts', async () => {
    const { api, ports } = await boundFixture();
    const oldPointer = JSON.parse(await readFile(ports.pointerPath, 'utf8'));
    const oldReceiptPath = path.join(ports.repoRoot, oldPointer.receiptPath);
    const oldBytes = await readFile(oldReceiptPath, 'utf8');
    const secondEnv: NodeJS.ProcessEnv = {};
    const hooks = api.createBuildProvenanceHooks({ ...ports.options, env: secondEnv });
    await hooks.generateAssets({}, 'win32', 'x64');
    await hooks.prePackage({}, 'win32', 'x64');
    await put(ports.repoRoot, 'out/Super-win32-x64/Super.exe', 'later final signed executable');
    await hooks.postPackage({}, { platform: 'win32', arch: 'x64', outputPaths: [ports.packageRoot] });
    const next = JSON.parse(await readFile(ports.pointerPath, 'utf8'));
    expect(next.buildId).not.toBe(oldPointer.buildId);
    expect(await readFile(oldReceiptPath, 'utf8')).toBe(oldBytes);
    const bound = await api.loadPackageBuildProvenance({ repoRoot: ports.repoRoot, packageRoot: ports.packageRoot,
      targetVersion: fixtureVersion, platform: ports.platform });
    expect(bound.buildId).toBe(next.buildId);
    expect(bound.package?.files.find((file) => file.path === 'Super.exe')?.sha256).toBe(hash('later final signed executable'));
  });

  it('cannot apply one package locator to a second package even when its version and every payload byte are identical', async () => {
    const { api, ports } = await boundFixture();
    const pointer = await readFile(ports.pointerPath, 'utf8');
    for (const [relative, bytes] of Object.entries({
      'out/Other-win32-x64/Super.exe': 'final signed/rebuilt executable',
      'out/Other-win32-x64/resources/app/package.json': JSON.stringify({ name: 'super', version: fixtureVersion }),
      'out/Other-win32-x64/resources/app/node_modules/native/addon.node': 'final rebuilt native addon',
      'out/.build-provenance/Other-win32-x64.json': pointer,
    })) await put(ports.repoRoot, relative, bytes);
    await expect(api.loadPackageBuildProvenance({ repoRoot: ports.repoRoot, packageRoot: path.join(ports.repoRoot, 'out/Other-win32-x64'),
      targetVersion: fixtureVersion, platform: ports.platform })).rejects.toThrow(/package|path|identity|unverified/iu);
    expect(await readFile(ports.pointerPath, 'utf8')).toBe(pointer);
  });

  it('consumes the exact actual Forge outDir/buildIdentifier path with spaces rather than substituting default out', async () => {
    const api = await contract();
    const ports = await fixture();
    const config = { outDir: 'output with spaces', buildIdentifier: 'fixture-channel', packagerConfig: { asar: false, prune: true } };
    await put(ports.repoRoot, 'forge.config.ts', `export default ${JSON.stringify(config)};`);
    const packageRoot = path.join(ports.repoRoot, 'output with spaces/fixture-channel/Super-win32-x64');
    const hooks = api.createBuildProvenanceHooks(ports.options);
    await hooks.generateAssets(config, 'win32', 'x64');
    await hooks.prePackage(config, 'win32', 'x64');
    const input = await ports.input();
    await put(ports.repoRoot, 'output with spaces/fixture-channel/Super-win32-x64/Super.exe', 'custom output final executable');
    await put(ports.repoRoot, 'output with spaces/fixture-channel/Super-win32-x64/resources/app/package.json', JSON.stringify({ version: fixtureVersion }));
    await hooks.postPackage(config, { platform: 'win32', arch: 'x64', outputPaths: [packageRoot] });
    await hooks.preMake(config);
    expect(ports.calls.at(-1)!.options.env.SUPER_PACKAGE_ROOT).toBe(packageRoot);
    ports.calls.length = 0;
    const result = completedBuild(await api.runBuildWithProvenance({ ...ports.options, command: 'make', argv: ['--skip-package'] }));
    expect(result.buildId).toBe(input.buildId);
    expect(ports.calls.filter((call) => call.command === 'git')).toHaveLength(0);
    const bound = await api.loadPackageBuildProvenance({ repoRoot: ports.repoRoot, packageRoot,
      targetVersion: fixtureVersion, platform: ports.platform });
    expect(bound.package?.relativePath).toBe('output with spaces/fixture-channel/Super-win32-x64');
  });

  it.each(['outside-output', 'linked-output', 'wrong-app-version'] as const)('blocks %s Forge configuration before any receipt or producer', async (kind) => {
    const api = await contract();
    const ports = await fixture();
    const config: { outDir?: string; packagerConfig?: { appVersion: string } } = {};
    if (kind === 'outside-output') config.outDir = '../unowned-output';
    if (kind === 'wrong-app-version') config.packagerConfig = { appVersion: '2.3.15' };
    if (kind === 'linked-output') {
      await mkdir(path.join(ports.repoRoot, 'owned-link-target'));
      await symlink(path.join(ports.repoRoot, 'owned-link-target'), path.join(ports.repoRoot, 'out'), process.platform === 'win32' ? 'junction' : 'dir');
    }
    await expect(api.createBuildProvenanceHooks(ports.options).generateAssets(config, 'win32', 'x64')).rejects.toThrow(/output|owned|root|link|version|target|unverified/iu);
    expect(ports.calls).toHaveLength(0);
    expect(await access(path.join(ports.repoRoot, 'tmp/build-provenance')).then(() => true, () => false)).toBe(false);
  });

  it('refuses --skip-package with only current sources or an inputs-only receipt before media/Forge work', async () => {
    const api = await contract();
    const ports = await fixture();
    const hooks = api.createBuildProvenanceHooks(ports.options);
    await hooks.generateAssets({}, 'win32', 'x64');
    await ports.payload();
    const receipt = await ports.input();
    await put(ports.repoRoot, 'out/.build-provenance/Super-win32-x64.json', JSON.stringify({ schemaVersion: 1,
      buildId: receipt.buildId, receiptPath: `tmp/build-provenance/${receipt.buildId}/inputs.json` }));
    ports.calls.length = 0;
    await expect(api.runBuildWithProvenance({ ...ports.options, command: 'make', argv: ['--skip-package'] })).rejects.toThrow(/receipt|package|phase|unverified/iu);
    expect(ports.calls).toHaveLength(0);
  });

  it.each(['buildId', 'targetVersion', 'platform', 'packageRoot', 'payload', 'source', 'missing'] as const)('refuses an exact-package consumer with %s mismatch without rewriting history', async (field) => {
    const { api, ports } = await boundFixture();
    const before = await readFile(ports.pointerPath, 'utf8');
    const pointer = JSON.parse(before);
    const options = { repoRoot: ports.repoRoot, packageRoot: ports.packageRoot, targetVersion: fixtureVersion, platform: ports.platform };
    if (field === 'buildId') { pointer.buildId = 'b'.repeat(36); await writeFile(ports.pointerPath, JSON.stringify(pointer)); }
    if (field === 'targetVersion') options.targetVersion = '2.3.15';
    if (field === 'platform') options.platform = 'darwin-arm64';
    if (field === 'packageRoot') { options.packageRoot = path.join(ports.repoRoot, 'out/Other-win32-x64'); await mkdir(options.packageRoot); }
    if (field === 'payload') await put(ports.repoRoot, 'out/Super-win32-x64/Super.exe', 'old binary copied over current output');
    if (field === 'source') await put(ports.repoRoot, 'src/main/index.ts', 'immutable source edited after package');
    if (field === 'missing') await rm(ports.pointerPath);
    await expect(api.loadPackageBuildProvenance(options)).rejects.toThrow(/receipt|package|identity|build|version|platform|unverified|drift|changed|ENOENT/iu);
    if (!['buildId', 'missing'].includes(field)) expect(await readFile(ports.pointerPath, 'utf8')).toBe(before);
  });

  it.each(['absolute', 'parent-escape', 'unknown-field', 'linked'] as const)('rejects %s package locators instead of trusting a last receipt', async (kind) => {
    const { api, ports } = await boundFixture();
    const pointer = JSON.parse(await readFile(ports.pointerPath, 'utf8'));
    if (kind === 'absolute') pointer.receiptPath = path.join(ports.repoRoot, pointer.receiptPath);
    if (kind === 'parent-escape') pointer.receiptPath = '../outside/package.json';
    if (kind === 'unknown-field') pointer.lastReceipt = pointer.receiptPath;
    if (kind === 'linked') {
      const original = path.join(ports.repoRoot, pointer.receiptPath);
      const linked = path.join(ports.repoRoot, 'tmp/linked-receipts');
      await symlink(path.dirname(original), linked, process.platform === 'win32' ? 'junction' : 'dir');
      pointer.receiptPath = 'tmp/linked-receipts/package.json';
    }
    await writeFile(ports.pointerPath, JSON.stringify(pointer));
    await expect(api.loadPackageBuildProvenance({ repoRoot: ports.repoRoot, packageRoot: ports.packageRoot,
      targetVersion: fixtureVersion, platform: ports.platform })).rejects.toThrow(/receipt|locator|path|link|field|safe|unverified/iu);
  });
});
