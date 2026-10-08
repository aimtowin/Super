#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GATE_STAGES, MAINLINE_STAGES, getDefaultE2EFiles, getGateManifest } from './gate-manifest.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);

function executableOnPath(name, environment, platform, fileExists) {
  const filename = platform === 'win32' ? `${name}.exe` : name;
  return (environment.PATH ?? environment.Path ?? '').split(path.delimiter)
    .map((directory) => path.join(directory, filename)).find((candidate) => fileExists(candidate));
}

/** Read-only capability discovery. No subprocess (including in dry-run). */
export function detectGateCapabilities({
  platform = process.platform, environment = process.env, fileExists = existsSync,
  readFile = readFileSync, fileStat = lstatSync, realPath = realpathSync,
  resolveElectronPackage = () => require.resolve('electron/package.json'),
} = {}) {
  const capability = (executable, reason) => ({ available: Boolean(executable && fileExists(executable)), path: executable, reason });
  const npmCandidates = [environment.npm_execpath,
    path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    ...(environment.PATH ?? environment.Path ?? '').split(path.delimiter)
      .map((directory) => path.join(directory, 'node_modules/npm/bin/npm-cli.js'))];
  const npmPath = npmCandidates.find((candidate) => candidate && fileExists(candidate));
  let electronPath;
  try {
    // Do not execute electron/index.js: it can spawn install.js/downloads when
    // the binary is missing, and honors ELECTRON_OVERRIDE_DIST_PATH. Inspect
    // only the local package's path.txt and owned dist tree instead.
    const packageJson = resolveElectronPackage();
    const packageRoot = path.dirname(packageJson);
    const pathFile = path.join(packageRoot, 'path.txt');
    const distRoot = path.join(packageRoot, 'dist');
    const assertEntry = (filename, directory) => {
      if (!fileExists(filename)) throw new Error('Local Electron installation incomplete.');
      const stat = fileStat(filename);
      if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile())) {
        throw new Error('Local Electron path is not an owned regular file/directory.');
      }
    };
    assertEntry(packageRoot, true);
    assertEntry(packageJson, false);
    assertEntry(pathFile, false);
    assertEntry(distRoot, true);
    const relative = readFile(pathFile, 'utf8').trim();
    const segments = relative.split(/[\\/]/u);
    if (!relative || path.isAbsolute(relative) || segments.some((segment) => !segment || segment === '.' || segment === '..')
      || relative.includes('\0') || relative.includes('\r') || relative.includes('\n')) throw new Error('Invalid local Electron executable path.');
    let candidate = distRoot;
    for (const [index, segment] of segments.entries()) {
      candidate = path.join(candidate, segment);
      assertEntry(candidate, index < segments.length - 1);
    }
    if (path.relative(realPath(packageRoot), realPath(distRoot)) !== 'dist'
      || path.relative(realPath(distRoot), realPath(candidate)) !== segments.join(path.sep)) {
      throw new Error('Local Electron executable escapes its package dist tree.');
    }
    electronPath = candidate;
  } catch { /* Missing/unsafe local installation is BLOCKED, never repaired here. */ }
  const desktopOverride = environment.SUPER_GATE_INTERACTIVE_DESKTOP;
  const desktopAvailable = desktopOverride === '1' || (desktopOverride !== '0'
    && !/^(?:true|1)$/iu.test(environment.CI ?? '')
    && (platform === 'win32' ? Boolean(environment.SESSIONNAME && !/^services$/iu.test(environment.SESSIONNAME))
      : platform === 'linux' ? Boolean(environment.DISPLAY || environment.WAYLAND_DISPLAY) : false));
  const isccPath = environment.SUPER_INNO_TOOLS
    ? path.resolve(environment.SUPER_INNO_TOOLS, 'ISCC.exe')
    : environment.LOCALAPPDATA && path.join(environment.LOCALAPPDATA, 'SuperTools/inno/tools/ISCC.exe');
  const cscPath = environment.WINDIR && path.join(environment.WINDIR, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
  return {
    npm: capability(npmPath, 'Local npm CLI missing; run through npm or repair the local Node installation.'),
    electron: capability(electronPath, 'Local Electron dist executable missing or unsafe; no loader, override or automatic install is used.'),
    desktop: { available: desktopAvailable, reason: 'Interactive desktop unconfirmed. Confirm the session, then set SUPER_GATE_INTERACTIVE_DESKTOP=1; 0 forces BLOCKED.' },
    iscc: capability(isccPath, 'ISCC missing. SUPER_INNO_TOOLS must name its directory, or use LOCALAPPDATA/SuperTools/inno/tools.'),
    csc: capability(cscPath, 'Windows .NET Framework csc.exe missing.'),
    pwsh: capability(executableOnPath('pwsh', environment, platform, fileExists), 'PowerShell 7 (pwsh) missing from PATH.'),
  };
}

/** Thin synchronous adapter; injected spawn/capabilities keep unit tests hermetic. */
export function runGates({
  stages = MAINLINE_STAGES, gates = getGateManifest(stages), dryRun = false,
  root = repositoryRoot, platform = process.platform, environment = process.env,
  spawn = spawnSync, fileExists = existsSync,
  capabilities = detectGateCapabilities({ platform, environment, fileExists }), onResult = () => {},
  createRunDirectory = () => {
    mkdirSync(path.join(root, 'tmp'), { recursive: true });
    const directory = path.join(root, 'tmp', `architecture-stage-a-${randomUUID()}`);
    mkdirSync(directory);
    return directory;
  },
  writeEvidence = true,
} = {}) {
  const ids = new Set();
  for (const gate of gates) {
    if (ids.has(gate.id) || !GATE_STAGES.includes(gate.stage)) throw new Error(`Invalid or duplicate gate: ${gate.id}`);
    ids.add(gate.id);
  }
  let runDirectory;
  const evidenceRoot = () => (runDirectory ??= createRunDirectory());
  const results = [];
  let stopped = false;

  function execute(command, argv, extraEnvironment = {}, removedEnvironment = []) {
    const childEnvironment = { ...environment, ...extraEnvironment };
    for (const name of removedEnvironment) delete childEnvironment[name];
    const child = spawn(command, argv, { cwd: root, env: childEnvironment, shell: false, stdio: 'inherit' });
    if (child.error) throw child.error;
    if (child.status !== 0) throw new Error(`Command exited ${String(child.status)}${child.signal ? ` (${child.signal})` : ''}.`);
  }

  function executeNative(result) {
    const nativeDirectory = path.join(evidenceRoot(), 'native');
    mkdirSync(nativeDirectory);
    result.evidence.push(nativeDirectory);
    const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(version)) {
      throw new Error('Invalid package version for native updater fixture.');
    }
    const fixture = path.join(root, 'scripts/release/preview-update-ui.iss');
    result.executions = [];
    const compile = (defines) => {
      const argv = [`/O${nativeDirectory}`, `/DAppVersion=${version}`, ...defines, fixture];
      result.executions.push({ command: capabilities.iscc.path, argv });
      execute(capabilities.iscc.path, argv);
    };
    compile([]);
    compile(['/DSuperUpdateCompileOnly']);
    for (const name of ['SuperUpdatePreview.exe', 'SuperUpdateCompileOnly.exe']) {
      if (!fileExists(path.join(nativeDirectory, name))) throw new Error(`Current fixture compilation did not produce ${name}.`);
    }
    const argv = ['-NoProfile', '-File', path.join(root, 'scripts/release/verify-update-native-ui.ps1'), '-PreviewDirectory', nativeDirectory];
    result.executions.push({ command: capabilities.pwsh.path, argv });
    execute(capabilities.pwsh.path, argv);
  }

  function readDevelopmentResults(jsonPath, result) {
    const report = JSON.parse(readFileSync(jsonPath, 'utf8'));
    if (!report.config || typeof report.config.rootDir !== 'string' || !Array.isArray(report.suites)
      || !Array.isArray(report.errors) || !report.stats) throw new Error('Invalid Playwright JSON evidence.');
    const perTest = [];
    const visit = (suite) => {
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests ?? []) {
          const status = test.status === 'expected' ? 'PASS' : test.status === 'skipped' ? 'SKIP' : 'FAIL';
          perTest.push({ file: path.relative(root, path.resolve(report.config.rootDir, spec.file ?? suite.file)),
            title: spec.title, project: test.projectName, status, reason: test.status,
            expectedStatus: test.expectedStatus, results: test.results });
        }
      }
      for (const child of suite.suites ?? []) visit(child);
    };
    for (const suite of report.suites) visit(suite);
    result.tests = perTest;
    const statNames = ['expected', 'skipped', 'unexpected', 'flaky'];
    if (statNames.some((name) => !Number.isInteger(report.stats[name]) || report.stats[name] < 0)
      || statNames.reduce((total, name) => total + report.stats[name], 0) !== perTest.length) {
      throw new Error('Incomplete Playwright per-test evidence.');
    }
    if (report.errors.length || report.stats.unexpected || report.stats.flaky || perTest.some((test) => test.status === 'FAIL')) {
      throw new Error('Playwright JSON contains failed, flaky or interrupted tests despite command exit status.');
    }
    if (!report.stats.expected || !perTest.some((test) => test.status === 'PASS')) throw new Error('Playwright did not execute any passing tests.');
    const recorded = new Set(perTest.map((test) => path.normalize(test.file)));
    const missing = getDefaultE2EFiles().filter((file) => !recorded.has(path.normalize(file)));
    if (missing.length) throw new Error(`Default E2E evidence omitted: ${missing.join(', ')}.`);
  }

  for (const gate of gates) {
    const applicable = gate.platform === 'all' || gate.platform.includes(platform);
    const result = {
      id: gate.id, stage: gate.stage, platform, required: applicable && gate.required,
      command: gate.command, argv: [...gate.argv], preconditions: gate.preconditions,
      capabilities: [...gate.capabilities],
      capabilityChecks: Object.fromEntries(gate.capabilities.map((name) => [name,
        capabilities[name] ?? { available: false, reason: 'capability missing' }])),
      status: 'NOT_RUN', reason: 'not-executed', evidence: [],
    };
    if (!applicable) {
      result.status = 'SKIP'; result.reason = 'platform-not-applicable';
    } else if (stopped) {
      result.reason = 'previous-required-gate-failed';
    } else {
      const missing = gate.capabilities.filter((name) => !capabilities[name]?.available);
      if (missing.length > 0) {
        result.status = 'BLOCKED';
        result.reason = missing.map((name) => `${name}: ${capabilities[name]?.reason ?? 'capability missing'}`).join('; ');
      } else if (gate.stage === 'package') {
        result.reason = 'package-stage-is-plan-only; separate packaging authorization required';
      } else if (dryRun) {
        result.reason = 'dry-run; no commands spawned';
      } else {
        try {
          if (gate.id === 'native-updater') {
            executeNative(result);
          } else {
            const command = gate.command === 'npm' || gate.command === 'node' ? process.execPath : gate.command;
            const argv = gate.command === 'npm' ? [capabilities.npm.path, ...gate.argv] : [...gate.argv];
            let extraEnvironment = {};
            if (gate.stage === 'development') {
              const jsonPath = path.join(evidenceRoot(), `${gate.id}.playwright.json`);
              argv.push('--reporter=line,json');
              extraEnvironment = { PLAYWRIGHT_JSON_OUTPUT_FILE: jsonPath,
                SUPER_E2E_ELECTRON_EXECUTABLE: capabilities.electron.path };
              result.evidence.push(jsonPath);
            }
            result.executions = [{ command, argv }];
            // Read even a failing command's JSON so the individual failures are
            // preserved instead of collapsing all evidence to an exit code.
            let commandError;
            try {
              execute(command, argv, extraEnvironment, gate.stage === 'development'
                ? ['ELECTRON_OVERRIDE_DIST_PATH', 'SUPER_E2E_PACKAGED_EXECUTABLE', 'ELECTRON_RUN_AS_NODE'] : []);
            } catch (error) { commandError = error; }
            if (gate.stage === 'development') {
              try { readDevelopmentResults(result.evidence[0], result); }
              catch (error) { if (!commandError) commandError = error; }
            }
            if (commandError) throw commandError;
          }
          result.status = 'PASS'; result.reason = 'command-completed';
        } catch (error) {
          result.status = 'FAIL'; result.reason = error instanceof Error ? error.message : String(error);
        }
      }
    }
    results.push(result);
    onResult(result);
    if (!dryRun && result.required && result.status !== 'PASS') stopped = true;
  }
  const passed = !dryRun && results.every((result) => !result.required || result.status === 'PASS');
  const report = { dryRun, passed, releaseReady: false, exitCode: dryRun || passed ? 0 : 1, results };
  if (!dryRun && writeEvidence) {
    const reportPath = path.join(evidenceRoot(), 'gate-results.json');
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
    report.reportPath = reportPath;
  }
  return report;
}

export function gateCli(argv) {
  const stages = [];
  let dryRun = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--dry-run') dryRun = true;
    else if (argv[index] === '--stage' && argv[index + 1]) stages.push(...argv[++index].split(','));
    else throw new Error(`Unknown gate argument: ${argv[index]}`);
  }
  return runGates({ stages: stages.length ? stages : MAINLINE_STAGES, dryRun });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = gateCli(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = report.exitCode;
  } catch (error) {
    console.error(error);
    process.exitCode = 2;
  }
}
