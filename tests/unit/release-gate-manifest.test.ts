import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const projectUrl = new URL('../../', import.meta.url);
const read = (relative: string) => readFileSync(new URL(relative, projectUrl), 'utf8');
const packageJson = JSON.parse(read('package.json')) as { version: string; scripts: Record<string, string> };

type GateStatus = 'PASS' | 'FAIL' | 'SKIP' | 'NOT_RUN' | 'BLOCKED';
interface Gate {
  id: string; stage: string; command: string; argv: string[]; capabilities: string[];
  platform: 'all' | string[]; required: boolean; preconditions: string[]; evidence: string;
}
interface Capability { available: boolean; path?: string; reason: string }
interface SpawnOptions { cwd: string; env: Record<string, string | undefined>; shell: false; stdio: 'inherit' }
interface SpawnResult { status: number | null; error?: Error; signal?: string }
interface GateResult {
  id: string; status: GateStatus; required: boolean; reason: string; evidence: string[];
  executions?: { command: string; argv: string[] }[];
  tests?: { file: string; title: string; status: GateStatus; reason: string }[];
}
interface GateReport { dryRun: boolean; passed: boolean; releaseReady: boolean; exitCode: number; reportPath?: string; results: GateResult[] }
interface RunOptions {
  stages?: string[]; gates?: Gate[]; dryRun?: boolean; root?: string; platform?: string;
  environment?: Record<string, string | undefined>; capabilities?: Record<string, Capability>;
  spawn?: (command: string, argv: string[], options: SpawnOptions) => SpawnResult;
  fileExists?: (file: string) => boolean; createRunDirectory?: () => string; writeEvidence?: boolean;
}
interface ManifestModule {
  getDefaultE2EFiles(): string[]; resolveE2EArguments(argv: string[]): string[];
  getGateManifest(stages?: string[]): Gate[]; MAINLINE_STAGES: string[]; GATE_STAGES: string[]; GATE_STATUSES: GateStatus[];
}
interface RunnerModule {
  runGates(options?: RunOptions): GateReport;
  detectGateCapabilities(options: { platform: string; environment: Record<string, string>; fileExists?: (file: string) => boolean;
    readFile?: (file: string, encoding: 'utf8') => string; resolveElectronPackage?: () => string;
    fileStat?: (file: string) => { isSymbolicLink(): boolean; isDirectory(): boolean; isFile(): boolean } }): Record<string, Capability>;
}
const loadManifest = async () => await import(/* @vite-ignore */ new URL('scripts/release/gate-manifest.mjs', projectUrl).href) as ManifestModule;
const loadRunner = async () => await import(/* @vite-ignore */ new URL('scripts/release/run-gates.mjs', projectUrl).href) as RunnerModule;
const capabilities: Record<string, Capability> = Object.fromEntries(['npm', 'electron', 'desktop', 'iscc', 'csc', 'pwsh']
  .map((name) => [name, { available: true, path: `${name}-fixture`, reason: `${name} missing` }]));
const ownedDirectories: string[] = [];
function fixtureRoot() {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'super-release-gates-'));
  ownedDirectories.push(directory);
  writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ version: packageJson.version }));
  return directory;
}
afterEach(() => {
  for (const directory of ownedDirectories.splice(0)) {
    if (path.dirname(directory) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith('super-release-gates-')) {
      throw new Error('Refusing to clean a non-owned gate fixture.');
    }
    rmSync(directory, { recursive: true, force: true });
  }
});

function playwrightEvidence(root: string, files: string[], statuses: string[] = []) {
  const counts: Record<string, number> = { expected: 0, skipped: 0, unexpected: 0, flaky: 0 };
  const suites = files.map((file, index) => {
    const status = statuses[index] ?? 'expected';
    counts[status] = (counts[status] ?? 0) + 1;
    return { file: path.basename(file), specs: [{ file: path.basename(file), title: `scenario ${index}`,
      tests: [{ status, projectName: '', expectedStatus: 'passed', results: [{ status: status === 'expected' ? 'passed' : 'failed' }] }] }] };
  });
  return { config: { rootDir: path.join(root, 'tests/e2e') }, suites, errors: [], stats: counts };
}

// The pre-fix branch reads the REAL current npm defaults. Missing future
// modules are not the red: the omitted regression scenarios are.
async function defaultE2EFiles(): Promise<string[]> {
  const manifestUrl = new URL('scripts/release/gate-manifest.mjs', projectUrl);
  if (existsSync(manifestUrl)) {
    const manifest = await import(/* @vite-ignore */ manifestUrl.href) as {
      getDefaultE2EFiles(): string[];
    };
    return manifest.getDefaultE2EFiles();
  }
  return packageJson.scripts['test:e2e']!.match(/tests\/e2e\/[\w-]+\.test\.ts/g) ?? [];
}

const recentRegressions = [
  'tests/e2e/filter-interaction.test.ts',
  'tests/e2e/preview-background-refresh.test.ts',
  'tests/e2e/ai-inspector-refresh.test.ts',
  'tests/e2e/task-status-polling.test.ts',
  'tests/e2e/import-conflict-flows.test.ts',
  'tests/e2e/tray-watcher-recovery.test.ts',
];

describe('release regression gate contracts', () => {
  it('includes the recently shipped filter, preview, import and background regressions in the real default suite', async () => {
    const files = await defaultE2EFiles();
    const omitted = recentRegressions.filter((file) => !files.includes(file));
    expect(omitted, 'Default E2E silently omits recently shipped regression scenarios.').toEqual([]);
  });

  it('keeps explicit existing defaults unique and resolvable instead of globbing unrelated benchmarks', async () => {
    const files = await defaultE2EFiles();
    expect(files).toContain('tests/e2e/critical-confirmation.test.ts');
    expect(files).toContain('tests/e2e/plugin-standard-host-activation.test.ts');
    expect(files).toContain('tests/e2e/plugin-trusted-host-activation.test.ts');
    expect(new Set(files).size).toBe(files.length);
    for (const file of files) {
      expect(existsSync(new URL(file, projectUrl)), file).toBe(true);
      expect(file).not.toMatch(/benchmark|nas/i);
    }
  });

  it('uses one default list for the ordinary and isolated npm aliases', async () => {
    const isolatedInlineFiles = packageJson.scripts['test:e2e:isolated']!.match(/tests\/e2e\/[\w-]+\.test\.ts/g) ?? [];
    if (isolatedInlineFiles.length > 0) {
      expect(isolatedInlineFiles).toEqual(await defaultE2EFiles());
    } else {
      expect(packageJson.scripts['test:e2e']).toBe('node scripts/run-e2e.mjs');
      expect(packageJson.scripts['test:e2e:isolated']).toBe('node scripts/run-e2e-isolated.mjs');
    }
  });

  it('lets native verification and capture consume this run\'s explicit fixture roots', () => {
    const verifier = read('scripts/release/verify-update-native-ui.ps1');
    const capture = read('scripts/release/capture-update-preview.ps1');
    expect(verifier).toMatch(/param\([\s\S]*?\$PreviewDirectory/);
    expect(capture).toMatch(/param\([\s\S]*?\$OutputDirectory/);
    expect(verifier).toContain('-OutputDirectory');
    expect(verifier).toContain('Assert-NoPreviewProcesses');
    expect(verifier).toContain('$candidates.Count -gt 1');
    expect(verifier).not.toContain('Select-Object -First 1');
  });
});

describe('single manifest wiring and CLI compatibility', () => {
  it('defines the four stages and five statuses with unique non-recursive npm gates', async () => {
    const manifest = await loadManifest();
    expect(manifest.GATE_STAGES).toEqual(['contract', 'development', 'native-updater', 'package']);
    expect(manifest.GATE_STATUSES).toEqual(['PASS', 'FAIL', 'SKIP', 'NOT_RUN', 'BLOCKED']);
    const gates = manifest.getGateManifest();
    expect(new Set(gates.map((gate) => gate.id)).size).toBe(gates.length);
    for (const gate of gates) {
      expect(gate.required).toBe(true);
      expect(gate.capabilities.length).toBeGreaterThan(0);
      if (gate.command === 'npm') {
        expect(packageJson.scripts[gate.argv[1]!]).toBeTypeOf('string');
        expect(gate.argv[1]).not.toMatch(/^(?:verify:mainline|release:pipeline)$/);
      }
    }
    expect(() => manifest.getGateManifest(['unknown'])).toThrow('Unknown gate stage');
    for (const file of ['scripts/verify-mainline.mjs', 'scripts/release/pipeline.mjs']) {
      expect(read(file), file).toContain('MAINLINE_STAGES');
      expect(read(file), file).toContain('runGates(');
    }
    expect(read('scripts/run-e2e.mjs')).toContain('resolveE2EArguments(process.argv.slice(2))');
    expect(read('scripts/run-e2e-isolated.mjs')).toContain('process.argv.slice(2)');
  });

  it('preserves explicit file/path filters and retains defaults for option-only calls', async () => {
    const manifest = await loadManifest();
    for (const argv of [['tests/e2e/filter-interaction.test.ts', '--workers=1'], ['tests/e2e/context-menu'],
      ['--', 'context-menu.test.ts'], ['--grep', 'my.test.ts', 'tests/e2e/filter-interaction.test.ts'],
      ['--debug', 'tests/e2e/filter-interaction.test.ts'], ['-u', 'tests/e2e/filter-interaction.test.ts'],
      ['--debug', 'cli', 'tests/e2e/context-menu.test.ts']]) {
      expect(manifest.resolveE2EArguments(argv)).toEqual(argv);
    }
    for (const argv of [[], ['--workers=1'], ['--grep', 'my.test.ts'], ['--reporter', 'json', '-j', '1'],
      ['--grep-invert=ignored', '--config', 'playwright.config.ts'], ['--browser', 'chromium'], ['-G', 'ignored.test.ts'],
      ['--update-source-method', 'patch'], ['--run-agents', 'none'], ['--debug'], ['--debug', 'inspector'],
      ['--update-snapshots'], ['--update-snapshots', 'all'], ['-u', 'missing'], ['--only-changed'], ['--only-changed', 'HEAD'],
      ['--project', 'chromium', 'webkit'], ['--project=chromium', 'webkit']]) {
      expect(manifest.resolveE2EArguments(argv)).toEqual([...manifest.getDefaultE2EFiles(), ...argv]);
    }
    const copy = manifest.getDefaultE2EFiles();
    copy.pop();
    expect(manifest.getDefaultE2EFiles().length).toBe(copy.length + 1);
  });
});

describe('hermetic gate status and capability handling', () => {
  it('does not spawn or create evidence in dry-run, and does not claim release readiness', async () => {
    const { runGates } = await loadRunner();
    const spawn = vi.fn(() => ({ status: 0 }));
    const createRunDirectory = vi.fn(() => { throw new Error('Dry-run must not create directories.'); });
    const report = runGates({ dryRun: true, capabilities, platform: 'win32', spawn, createRunDirectory });
    expect(report.results.every((result) => result.status === 'NOT_RUN')).toBe(true);
    expect(report.passed).toBe(false);
    expect(report.releaseReady).toBe(false);
    expect(report.exitCode).toBe(0); // Successful planning is not a passing gate.
    expect(spawn).not.toHaveBeenCalled();
    expect(createRunDirectory).not.toHaveBeenCalled();
  });

  it('marks required missing capabilities BLOCKED instead of PASS in real and dry runs', async () => {
    const { runGates } = await loadRunner();
    const gates = (await loadManifest()).getGateManifest(['development']);
    for (const dryRun of [false, true]) {
      const spawn = vi.fn(() => ({ status: 0 }));
      const report = runGates({ gates, dryRun, capabilities: { ...capabilities, desktop: { available: false, reason: 'no GUI' } },
        spawn, writeEvidence: false });
      expect(report.results[0]).toMatchObject({ status: 'BLOCKED', required: true, reason: 'desktop: no GUI' });
      expect(report.passed).toBe(false);
      expect(report.exitCode).toBe(dryRun ? 0 : 1);
      expect(spawn).not.toHaveBeenCalled();
    }
  });

  it('records non-applicable native platforms as non-required SKIP without invoking tools', async () => {
    const { runGates } = await loadRunner();
    const spawn = vi.fn(() => ({ status: 0 }));
    const report = runGates({ stages: ['native-updater'], platform: 'linux', capabilities: {}, spawn, writeEvidence: false });
    expect(report.results[0]).toMatchObject({ status: 'SKIP', required: false, reason: 'platform-not-applicable' });
    expect(report.exitCode).toBe(0);
    expect(report.releaseReady).toBe(false);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('stops on command failure/error/signal and reports subsequent required gates NOT_RUN', async () => {
    const { runGates } = await loadRunner();
    const gates = (await loadManifest()).getGateManifest(['contract']).slice(0, 2);
    for (const child of [{ status: 4 }, { status: null, signal: 'SIGTERM' }, { status: null, error: new Error('spawn failed') }]) {
      const spawn = vi.fn(() => child);
      const report = runGates({ gates, capabilities, spawn, writeEvidence: false });
      expect(report.results.map((result) => result.status)).toEqual(['FAIL', 'NOT_RUN']);
      expect(report.exitCode).toBe(1);
      expect(report.passed).toBe(false);
      expect(spawn).toHaveBeenCalledTimes(1);
    }
  });

  it('keeps the package stage plan-only even when explicitly selected outside dry-run', async () => {
    const { runGates } = await loadRunner();
    const spawn = vi.fn(() => ({ status: 0 }));
    const report = runGates({ stages: ['package'], capabilities, spawn, writeEvidence: false });
    expect(report.results.every((result) => result.status === 'NOT_RUN')).toBe(true);
    expect(report.results[0]?.reason).toContain('separate packaging authorization');
    expect(report.exitCode).toBe(1);
    expect(report.releaseReady).toBe(false);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('discovers tool files without subprocesses and honors an explicitly unavailable desktop', async () => {
    const { detectGateCapabilities } = await loadRunner();
    const seen: string[] = [];
    const discovered = detectGateCapabilities({ platform: 'win32',
      environment: { npm_execpath: 'npm-fixture.js', SUPER_INNO_TOOLS: 'inno-fixture', WINDIR: 'windows-fixture',
        PATH: 'pwsh-fixture', SESSIONNAME: 'Console', SUPER_GATE_INTERACTIVE_DESKTOP: '0' },
      fileExists: (file) => { seen.push(file); return true; } });
    expect(discovered.desktop?.available).toBe(false);
    expect(discovered.npm?.path).toBe('npm-fixture.js');
    expect(discovered.iscc?.path).toBe(path.resolve('inno-fixture', 'ISCC.exe'));
    expect(discovered.csc?.path).toBe(path.join('windows-fixture', 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'));
    expect(seen.some((file) => path.basename(file) === 'pwsh.exe')).toBe(true);
  });

  it('inspects only local Electron path.txt/dist and never executes its loader or honors an override', async () => {
    const { detectGateCapabilities } = await loadRunner();
    const root = fixtureRoot();
    const electronRoot = path.join(root, 'electron-fixture');
    const distRoot = path.join(electronRoot, 'dist');
    mkdirSync(distRoot, { recursive: true });
    writeFileSync(path.join(electronRoot, 'package.json'), '{"name":"electron"}');
    writeFileSync(path.join(electronRoot, 'index.js'), 'throw new Error("Electron loader must never execute");');
    writeFileSync(path.join(electronRoot, 'path.txt'), 'electron.exe');
    const executable = path.join(distRoot, 'electron.exe');
    writeFileSync(executable, 'fixture binary');
    const resolveElectronPackage = vi.fn(() => path.join(electronRoot, 'package.json'));
    const readFile = vi.fn((file: string, encoding: 'utf8') => readFileSync(file, encoding));
    const environment = { ELECTRON_OVERRIDE_DIST_PATH: path.join(root, 'foreign-dist') };
    const discovered = detectGateCapabilities({ platform: 'win32', environment, readFile, resolveElectronPackage });
    expect(discovered.electron).toMatchObject({ available: true, path: executable });
    expect(resolveElectronPackage).toHaveBeenCalledTimes(1);
    expect(readFile.mock.calls).toEqual([[path.join(electronRoot, 'path.txt'), 'utf8']]);
    expect(read('scripts/release/run-gates.mjs')).not.toMatch(/require\(['"]electron['"]\)/);

    // The real electron loader would try install.js here. The inspector must
    // simply report missing capability without importing or repairing it.
    rmSync(executable);
    const missing = detectGateCapabilities({ platform: 'win32', environment, readFile, resolveElectronPackage });
    expect(missing.electron?.available).toBe(false);
    expect(missing.electron?.path).toBeUndefined();
    expect(missing.electron?.reason).toContain('no loader, override or automatic install');
  });

  it('rejects traversal and directory substitutions in the local Electron binary pointer', async () => {
    const { detectGateCapabilities } = await loadRunner();
    const root = fixtureRoot();
    const electronRoot = path.join(root, 'electron-fixture');
    mkdirSync(path.join(electronRoot, 'dist/directory.exe'), { recursive: true });
    writeFileSync(path.join(electronRoot, 'package.json'), '{"name":"electron"}');
    for (const pointer of ['../foreign.exe', path.join(root, 'foreign.exe'), 'directory.exe']) {
      writeFileSync(path.join(electronRoot, 'path.txt'), pointer);
      const discovered = detectGateCapabilities({ platform: 'win32', environment: {},
        resolveElectronPackage: () => path.join(electronRoot, 'package.json') });
      expect(discovered.electron?.available, pointer).toBe(false);
    }
  });

  it('rejects symbolic-link binary ownership without requiring symlink privileges in the fixture', async () => {
    const { detectGateCapabilities } = await loadRunner();
    const root = fixtureRoot();
    const electronRoot = path.join(root, 'electron-fixture');
    mkdirSync(path.join(electronRoot, 'dist'), { recursive: true });
    writeFileSync(path.join(electronRoot, 'package.json'), '{"name":"electron"}');
    writeFileSync(path.join(electronRoot, 'path.txt'), 'electron.exe');
    const executable = path.join(electronRoot, 'dist/electron.exe');
    writeFileSync(executable, 'fixture binary');
    const discovered = detectGateCapabilities({ platform: 'win32', environment: {},
      resolveElectronPackage: () => path.join(electronRoot, 'package.json'),
      fileStat: (file) => file === executable
        ? { isSymbolicLink: () => true, isDirectory: () => false, isFile: () => true }
        : lstatSync(file) });
    expect(discovered.electron?.available).toBe(false);
  });

  it('writes one fresh UUID evidence report for actual contract gates, including BLOCKED', async () => {
    const { runGates } = await loadRunner();
    const gates = (await loadManifest()).getGateManifest(['contract']).slice(0, 1);
    const root = fixtureRoot();
    const spawn = vi.fn(() => ({ status: 0 }));
    const first = runGates({ gates, root, capabilities, spawn });
    const second = runGates({ gates, root, capabilities: {}, spawn });
    expect(first.results[0]?.status).toBe('PASS');
    expect(second.results[0]?.status).toBe('BLOCKED');
    expect(first.reportPath).not.toBe(second.reportPath);
    for (const report of [first, second]) {
      expect(report.reportPath).toMatch(/architecture-stage-a-[0-9a-f-]{36}[\\/]gate-results\.json$/);
      const saved = JSON.parse(readFileSync(report.reportPath!, 'utf8')) as GateReport;
      expect(saved.results[0]?.status).toBe(report.results[0]?.status);
      expect(saved.releaseReady).toBe(false);
    }
    expect(spawn).toHaveBeenCalledTimes(1);
  });
});

describe('development gate per-test evidence', () => {
  it('pins the validated local Electron binary and removes installed-app/loader overrides only from its child', async () => {
    const { runGates } = await loadRunner();
    const root = fixtureRoot();
    const files = (await loadManifest()).getDefaultE2EFiles();
    const environment = { ELECTRON_OVERRIDE_DIST_PATH: 'foreign-dist', SUPER_E2E_PACKAGED_EXECUTABLE: 'installed-Super.exe',
      ELECTRON_RUN_AS_NODE: '1', SUPER_E2E_ELECTRON_EXECUTABLE: 'foreign-electron.exe', SUPER_TEST_PRESERVED: 'retained' };
    const spawn = vi.fn((_command: string, _argv: string[], options: SpawnOptions): SpawnResult => {
      expect(options.env.SUPER_E2E_ELECTRON_EXECUTABLE).toBe(capabilities.electron!.path);
      expect(options.env).not.toHaveProperty('ELECTRON_OVERRIDE_DIST_PATH');
      expect(options.env).not.toHaveProperty('SUPER_E2E_PACKAGED_EXECUTABLE');
      expect(options.env).not.toHaveProperty('ELECTRON_RUN_AS_NODE');
      expect(options.env.SUPER_TEST_PRESERVED).toBe('retained');
      writeFileSync(options.env.PLAYWRIGHT_JSON_OUTPUT_FILE!, JSON.stringify(playwrightEvidence(root, files)));
      return { status: 0 };
    });
    const report = runGates({ stages: ['development'], root, capabilities, environment, spawn });
    expect(report.results[0]?.status).toBe('PASS');
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(environment.SUPER_E2E_PACKAGED_EXECUTABLE).toBe('installed-Super.exe');
    expect(environment.ELECTRON_RUN_AS_NODE).toBe('1');
  });

  it('uses one E2E runner, workers=1 and fresh JSON; preserves each PASS/SKIP', async () => {
    const { runGates } = await loadRunner();
    const manifest = await loadManifest();
    const files = manifest.getDefaultE2EFiles();
    const root = fixtureRoot();
    const spawn = vi.fn((_command: string, argv: string[], options: SpawnOptions): SpawnResult => {
      expect(argv).toEqual(['scripts/run-e2e.mjs', '--workers=1', '--reporter=line,json']);
      writeFileSync(options.env.PLAYWRIGHT_JSON_OUTPUT_FILE!, JSON.stringify(playwrightEvidence(root, files, ['skipped'])));
      return { status: 0 };
    });
    const report = runGates({ stages: ['development'], root, capabilities, spawn });
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(report.results[0]?.status).toBe('PASS');
    expect(report.results[0]?.tests).toHaveLength(files.length);
    expect(report.results[0]?.tests?.[0]).toMatchObject({ status: 'SKIP', reason: 'skipped' });
    expect(report.results[0]?.tests?.[1]?.status).toBe('PASS');
    expect(report.results[0]?.evidence[0]).toContain('architecture-stage-a-');
  });

  it('rejects a zero exit when evidence contains unexpected/flaky tests or omitted default files', async () => {
    const { runGates } = await loadRunner();
    const files = (await loadManifest()).getDefaultE2EFiles();
    for (const variant of ['unexpected', 'flaky', 'omitted']) {
      const root = fixtureRoot();
      const spawn = vi.fn((_command: string, _argv: string[], options: SpawnOptions): SpawnResult => {
        const data = playwrightEvidence(root, variant === 'omitted' ? files.slice(1) : files,
          variant === 'omitted' ? [] : [variant]);
        writeFileSync(options.env.PLAYWRIGHT_JSON_OUTPUT_FILE!, JSON.stringify(data));
        return { status: 0 };
      });
      const report = runGates({ stages: ['development'], root, capabilities, spawn });
      expect(report.results[0]?.status, variant).toBe('FAIL');
      expect(report.results[0]?.tests?.length).toBeGreaterThan(0);
      expect(report.exitCode).toBe(1);
    }
  });

  it('rejects missing/empty evidence and all-skipped runs instead of accepting command exit zero', async () => {
    const { runGates } = await loadRunner();
    const files = (await loadManifest()).getDefaultE2EFiles();
    for (const variant of ['missing', 'empty', 'skipped']) {
      const root = fixtureRoot();
      const spawn = vi.fn((_command: string, _argv: string[], options: SpawnOptions): SpawnResult => {
        if (variant !== 'missing') {
          const data = playwrightEvidence(root, variant === 'empty' ? [] : files, files.map(() => 'skipped'));
          writeFileSync(options.env.PLAYWRIGHT_JSON_OUTPUT_FILE!, JSON.stringify(data));
        }
        return { status: 0 };
      });
      const report = runGates({ stages: ['development'], root, capabilities, spawn });
      expect(report.results[0]?.status, variant).toBe('FAIL');
      expect(report.exitCode).toBe(1);
    }
  });

  it('retains individual JSON failures when the runner also exits nonzero', async () => {
    const { runGates } = await loadRunner();
    const root = fixtureRoot();
    const files = (await loadManifest()).getDefaultE2EFiles();
    const spawn = vi.fn((_command: string, _argv: string[], options: SpawnOptions): SpawnResult => {
      writeFileSync(options.env.PLAYWRIGHT_JSON_OUTPUT_FILE!, JSON.stringify(playwrightEvidence(root, files, ['unexpected'])));
      return { status: 1 };
    });
    const report = runGates({ stages: ['development'], root, capabilities, spawn });
    expect(report.results[0]).toMatchObject({ status: 'FAIL', reason: 'Command exited 1.' });
    expect(report.results[0]?.tests?.[0]?.status).toBe('FAIL');
  });
});

describe('fresh isolated native updater fixture chain', () => {
  it('compiles both branches with current version in a fresh UUID directory before verification', async () => {
    const { runGates } = await loadRunner();
    const root = fixtureRoot();
    const oldDirectory = path.join(root, 'tmp/update-ui-preview');
    mkdirSync(oldDirectory, { recursive: true });
    writeFileSync(path.join(oldDirectory, 'SuperUpdatePreview.exe'), 'old fixture');
    const spawn = vi.fn((command: string, argv: string[]): SpawnResult => {
      if (command === capabilities.iscc!.path) {
        const directory = argv.find((argument) => argument.startsWith('/O'))!.slice(2);
        const name = argv.includes('/DSuperUpdateCompileOnly') ? 'SuperUpdateCompileOnly.exe' : 'SuperUpdatePreview.exe';
        writeFileSync(path.join(directory, name), 'fresh fixture');
      }
      return { status: 0 };
    });
    const reports = [runGates({ stages: ['native-updater'], root, platform: 'win32', capabilities, spawn }),
      runGates({ stages: ['native-updater'], root, platform: 'win32', capabilities, spawn })];
    expect(spawn).toHaveBeenCalledTimes(6);
    expect(reports[0]?.results[0]?.evidence[0]).not.toBe(reports[1]?.results[0]?.evidence[0]);
    for (const report of reports) {
      const result = report.results[0]!;
      expect(result.status).toBe('PASS');
      const executions = result.executions!;
      const nativeDirectory = result.evidence[0]!;
      expect(nativeDirectory).toMatch(/architecture-stage-a-[0-9a-f-]{36}[\\/]native$/);
      expect(nativeDirectory).not.toBe(oldDirectory);
      expect(executions[0]?.argv).toContain(`/O${nativeDirectory}`);
      expect(executions[0]?.argv).toContain(`/DAppVersion=${packageJson.version}`);
      expect(executions[1]?.argv).toContain('/DSuperUpdateCompileOnly');
      expect(executions[1]?.argv).toContain(`/O${nativeDirectory}`);
      expect(executions[2]?.argv).toEqual(['-NoProfile', '-File', path.join(root, 'scripts/release/verify-update-native-ui.ps1'),
        '-PreviewDirectory', nativeDirectory]);
    }
  });

  it('never verifies stale outputs after either compile fails or a current output is missing', async () => {
    const { runGates } = await loadRunner();
    for (const variant of ['first-fails', 'second-fails', 'missing-output']) {
      const root = fixtureRoot();
      let compileCount = 0;
      const spawn = vi.fn((_command: string, argv: string[]): SpawnResult => {
        compileCount += 1;
        if ((variant === 'first-fails' && compileCount === 1) || (variant === 'second-fails' && compileCount === 2)) return { status: 1 };
        const directory = argv.find((argument) => argument.startsWith('/O'))!.slice(2);
        if (variant !== 'missing-output') {
          const name = compileCount === 1 ? 'SuperUpdatePreview.exe' : 'SuperUpdateCompileOnly.exe';
          writeFileSync(path.join(directory, name), 'fresh fixture');
        }
        return { status: 0 };
      });
      const report = runGates({ stages: ['native-updater'], root, platform: 'win32', capabilities, spawn });
      expect(report.results[0]?.status, variant).toBe('FAIL');
      expect(report.exitCode).toBe(1);
      expect(spawn).toHaveBeenCalledTimes(variant === 'first-fails' ? 1 : 2);
      expect(report.results[0]?.evidence[0]).toContain('architecture-stage-a-');
    }
  });
});
