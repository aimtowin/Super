import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, rename, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { bindPackageProvenance, captureBuildProvenance, verifyBuildInputs, verifyImmutableBuildInputs, verifyPackageProvenance } from './build-provenance.mjs';
import { bindDerivativeProvenance } from './artifact-manifest.mjs';

const require = createRequire(import.meta.url);
const { Command } = require('commander');
const ID_ENV = 'SUPER_BUILD_PROVENANCE_BUILD_ID';
const INPUT_ENV = 'SUPER_BUILD_PROVENANCE_INPUT_RECEIPT';
const GUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
const PLATFORMS = new Set(['win32-x64', 'darwin-arm64']);
const defaultRoot = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));

function unverified(message) {
  const error = new Error(`UNVERIFIED: ${message}`);
  error.code = 'BUILD_PROVENANCE_UNVERIFIED';
  return error;
}

function within(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function safeRelative(value) {
  if (typeof value !== 'string' || value === '' || value.includes('\\') || value.includes('\0')
    || value.startsWith('/') || /^[a-z]:/iu.test(value)
    || value.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    throw unverified('Unsafe receipt locator path.');
  }
  return value;
}

async function ownedRoot(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw unverified('An absolute owned repository root is required.');
  const root = path.resolve(value);
  const info = await lstat(root);
  if (!info.isDirectory() || info.isSymbolicLink() || path.resolve(await realpath(root)) !== root) {
    throw unverified('Repository root contains a linked or redirected parent.');
  }
  return root;
}

// Also used BEFORE mkdir/producer dispatch: existing ancestors must not redirect
// an apparently owned output or receipt to somebody else's directory.
async function ownedPath(root, candidate, { missing = false, directory = false } = {}) {
  const resolved = path.resolve(candidate);
  if (!within(root, resolved)) throw unverified('Path escaped the owned repository root.');
  const parts = path.relative(root, resolved).split(path.sep);
  let cursor = root;
  for (const [index, part] of parts.entries()) {
    cursor = path.join(cursor, part);
    let info;
    try { info = await lstat(cursor); }
    catch (error) {
      if (missing && error.code === 'ENOENT') return resolved;
      throw error;
    }
    if (info.isSymbolicLink() || (index < parts.length - 1 && !info.isDirectory())
      || (index === parts.length - 1 && (directory ? !info.isDirectory() : !info.isFile()))) {
      throw unverified('Receipt/output path is linked or not a regular owned path.');
    }
  }
  if (path.resolve(await realpath(resolved)) !== resolved) throw unverified('Receipt/output real path was redirected.');
  return resolved;
}

async function readOwnedJson(root, filename) {
  const file = await ownedPath(root, filename);
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { throw unverified(`Invalid receipt/config JSON: ${error.message}`); }
}

async function writeFreshJson(root, filename, value) {
  await ownedPath(root, filename, { missing: true });
  await mkdir(path.dirname(filename), { recursive: true });
  await ownedPath(root, path.dirname(filename), { directory: true });
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
}

function processPort(command, argv, options) {
  return spawnSync(command, argv, { ...options, encoding: 'utf8' });
}

function ports(options = {}) {
  return { repoRoot: options.repoRoot ?? defaultRoot, env: options.env ?? process.env,
    platform: options.platform ?? `${process.platform}-${process.arch}`, run: options.run ?? processPort,
    loadForgeConfig: options.loadForgeConfig ?? loadLocalForgeConfig,
    makeArgv: options.makeArgv ?? directMakeArgv() };
}

function directMakeArgv() {
  const script = path.basename(process.argv[1] ?? '');
  if (script === 'electron-forge-make.js') return process.argv.slice(2);
  if (script === 'electron-forge.js' && process.argv[2] === 'make') return process.argv.slice(3);
  return undefined;
}

function nativeTarget(expected, platform, arch) {
  const target = `${platform}-${arch}`;
  if (!PLATFORMS.has(expected) || target !== expected) {
    throw unverified(`BLOCKED: release packages require the supported native host; host=${expected}, target=${target}.`);
  }
  return target;
}

async function checkedRun(context, command, argv, stdio = 'inherit', extraEnv = {}) {
  const result = await context.run(command, argv, { cwd: context.repoRoot,
    env: { ...context.env, ...extraEnv }, stdio, shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw unverified(`${path.basename(argv[0] ?? command)} gate exited with ${String(result.status)}.`);
  return result;
}

async function nodeGate(context, script, argv = [], extraEnv = {}) {
  await checkedRun(context, process.execPath, [path.join(context.repoRoot, script), ...argv], 'inherit', extraEnv);
}

async function localTools(root) {
  // Never import electron's entry point: it can bootstrap a missing binary.
  const electron = await readOwnedJson(root, path.join(root, 'node_modules/electron/package.json'));
  const source = await readOwnedJson(root, path.join(root, 'package.json'));
  const cli = await readOwnedJson(root, path.join(root, 'node_modules/@electron-forge/cli/package.json'));
  const core = await readOwnedJson(root, path.join(root, 'node_modules/@electron-forge/core/package.json'));
  const cliDirectory = path.join(root, 'node_modules/@electron-forge/cli');
  const executable = path.resolve(cliDirectory, safeRelative(typeof cli.bin === 'string' ? cli.bin : cli.bin?.['electron-forge']));
  if (!within(cliDirectory, executable)) throw unverified('Local Forge CLI path escaped its package.');
  await ownedPath(root, executable);
  // Forge getElectronVersion uses the exact declared devDependency when it is
  // semver-valid, and falls back to installed metadata only for a range.
  const semver = require('semver');
  const declaredElectron = source.devDependencies?.electron;
  if (typeof declaredElectron !== 'string') throw unverified('This build requires the declared Electron devDependency.');
  const electronVersion = semver.valid(declaredElectron) ? declaredElectron : electron.version;
  return { executable, builderVersion: core.version,
    toolVersions: { node: process.versions.node, electron: electronVersion, forge: cli.version } };
}

function dirtyPaths(stdout) {
  const entries = stdout.split('\0');
  const result = [];
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    if (!entry) continue;
    if (entry.length < 4 || entry[2] !== ' ') throw unverified('Invalid Git porcelain identity response.');
    result.push(entry.slice(3));
    if (/[RC]/u.test(entry.slice(0, 2))) {
      const original = entries[++index];
      if (!original) throw unverified('Incomplete Git rename identity response.');
      result.push(original);
    }
  }
  return result;
}

async function capture(context, config = {}) {
  const tools = await localTools(context.repoRoot);
  const manifest = await readOwnedJson(context.repoRoot, path.join(context.repoRoot, 'package.json'));
  const headResult = await checkedRun(context, 'git', ['rev-parse', 'HEAD'], 'pipe');
  const statusResult = await checkedRun(context, 'git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], 'pipe');
  const buildId = randomUUID();
  const receiptPath = path.join(context.repoRoot, 'tmp/build-provenance', buildId, 'inputs.json');
  const configuration = { vcpkgEnabled: false };
  if (typeof config.packagerConfig?.asar === 'boolean') configuration.asar = config.packagerConfig.asar;
  if (typeof config.packagerConfig?.prune === 'boolean') configuration.prune = config.packagerConfig.prune;
  const receipt = await captureBuildProvenance({ repoRoot: context.repoRoot, buildId,
    sourceHead: String(headResult.stdout ?? '').trim(), targetVersion: manifest.version, platform: context.platform,
    builderVersion: tools.builderVersion, toolVersions: tools.toolVersions, configuration,
    dirtyPaths: dirtyPaths(String(statusResult.stdout ?? '')) });
  await writeFreshJson(context.repoRoot, receiptPath, receipt);
  context.env[ID_ENV] = buildId;
  context.env[INPUT_ENV] = receiptPath;
  return { receipt, receiptPath };
}

async function inheritedInput(context) {
  const buildId = context.env[ID_ENV];
  const receiptPath = context.env[INPUT_ENV];
  if (!buildId && !receiptPath) return undefined;
  if (!GUID.test(buildId ?? '') || typeof receiptPath !== 'string'
    || path.resolve(receiptPath) !== path.join(context.repoRoot, 'tmp/build-provenance', buildId, 'inputs.json')) {
    throw unverified('Inherited input receipt identity/path is not owned by this exact build.');
  }
  const receipt = await readOwnedJson(context.repoRoot, receiptPath);
  const manifest = await readOwnedJson(context.repoRoot, path.join(context.repoRoot, 'package.json'));
  if (receipt.buildId !== buildId || receipt.phase !== 'inputs' || receipt.platform !== context.platform
    || receipt.targetVersion !== manifest.version) throw unverified('Inherited input receipt build/phase/target identity differs.');
  // npm transfer happens AFTER ensure. Fully verify, do not trust its env path
  // merely because it names a recent file or the current source version.
  await verifyBuildInputs({ repoRoot: context.repoRoot, receipt });
  return { receipt, receiptPath };
}

function locator(root, packageRoot) {
  const base = path.basename(packageRoot);
  if (!/^[A-Za-z0-9_. -]+$/u.test(base) || base === '.' || base === '..') throw unverified('Unsafe exact package locator basename.');
  return path.join(root, 'out/.build-provenance', `${base}.json`);
}

export async function loadPackageBuildProvenance({ repoRoot, packageRoot, targetVersion, platform }) {
  const root = await ownedRoot(repoRoot);
  const packaged = await ownedPath(root, packageRoot, { directory: true });
  const pointer = await readOwnedJson(root, locator(root, packaged));
  if (!pointer || pointer.schemaVersion !== 1 || !GUID.test(pointer.buildId ?? '')
    || Object.keys(pointer).sort().join(',') !== 'buildId,receiptPath,schemaVersion'
    || safeRelative(pointer.receiptPath) !== `tmp/build-provenance/${pointer.buildId}/package.json`) {
    throw unverified('Invalid exact-package receipt locator schema/identity/path.');
  }
  const receipt = await readOwnedJson(root, path.join(root, pointer.receiptPath));
  if (receipt.buildId !== pointer.buildId) throw unverified('Package receipt locator build identity differs.');
  await verifyPackageProvenance({ repoRoot: root, receipt, packageRoot: packaged, targetVersion, platform });
  return receipt;
}

async function publishLocator(root, packageRoot, receiptPath, receipt) {
  const filename = locator(root, packageRoot);
  await ownedPath(root, filename, { missing: true });
  await mkdir(path.dirname(filename), { recursive: true });
  await ownedPath(root, path.dirname(filename), { directory: true });
  const temporary = path.join(path.dirname(filename), `${path.basename(filename)}.${randomUUID()}.tmp`);
  await writeFreshJson(root, temporary, { schemaVersion: 1, buildId: receipt.buildId,
    receiptPath: path.relative(root, receiptPath).replaceAll('\\', '/') });
  // Pointer replacement is only a locator update, never deletion or rewriting
  // of previous immutable receipts, packages, make artifacts or baselines.
  await ownedPath(root, filename, { missing: true });
  await rename(temporary, filename);
}

async function loadLocalForgeConfig(root) {
  // Node >=24 is already the project's required host. Native type stripping
  // loads this erasable TS config without Jiti caches/temp files or re-evaluating
  // this .mjs CLI as a second main module. Never run packaging/plugin init here.
  const loaded = await import(pathToFileURL(await ownedPath(root, path.join(root, 'forge.config.ts'))).href);
  const config = loaded.default ?? loaded;
  return typeof config === 'function' ? await config() : config;
}

async function expectedPackage(context, config = {}) {
  const manifest = await readOwnedJson(context.repoRoot, path.join(context.repoRoot, 'package.json'));
  if (config.packagerConfig?.appVersion !== undefined && config.packagerConfig.appVersion !== manifest.version) {
    throw unverified('BLOCKED: configured appVersion differs from the source package target version.');
  }
  const { default: outDirectory } = require('@electron-forge/core/dist/util/out-dir.js');
  const filenamify = require('filenamify');
  const filename = (filenamify.default ?? filenamify)(config.packagerConfig?.name ?? manifest.productName ?? manifest.name, { replacement: '-' });
  const effectiveConfig = { ...config, outDir: config.outDir ?? context.env.ELECTRON_FORGE_OUT_DIR };
  const outputRoot = outDirectory(context.repoRoot, effectiveConfig);
  await ownedPath(context.repoRoot, outputRoot, { missing: true, directory: true });
  return path.join(outputRoot, `${filename}-${context.platform}`);
}

const fileIdentity = (info) => `${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
async function makerOutputSnapshot(root, directory, entries = new Map()) {
  try { await ownedPath(root, directory, { directory: true }); }
  catch (error) { if (error.code === 'ENOENT') return entries; throw error; }
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw unverified('Maker output path is linked.');
    if (entry.isDirectory()) await makerOutputSnapshot(root, filename, entries);
    else if (entry.isFile()) entries.set(filename, fileIdentity(await lstat(filename)));
    else throw unverified('Maker output contains a non-regular artifact.');
  }
  return entries;
}

export function createBuildProvenanceHooks(options = {}) {
  const context = ports(options);
  let state;
  let makeState;
  return {
    generateAssets: async (config, platform, arch) => {
      context.repoRoot = await ownedRoot(context.repoRoot);
      nativeTarget(context.platform, platform, arch);
      await expectedPackage(context, config);
      if (!state) state = await inheritedInput(context) ?? await capture(context, config);
    },
    prePackage: async (_config, platform, arch) => {
      nativeTarget(context.platform, platform, arch);
      if (!state) throw unverified('The early generateAssets input receipt has not been captured.');
      // generateAssets plugins run after the user hook. Reject their source
      // drift before ensure/ufbx/extension can create or replace anything.
      await verifyImmutableBuildInputs({ repoRoot: context.repoRoot, receipt: state.receipt });
      // 2026-08-21: never let vcpkg integration redirect better-sqlite3's static
      // SQLite linkage. Forge rebuild forks inherit this exact process env.
      context.env.VcpkgEnabled = 'false';
      await nodeGate(context, 'scripts/media-binaries.mjs', ['ensure', '--platform', context.platform]);
      await nodeGate(context, 'scripts/verify-ufbx-wasm.mjs');
      await verifyBuildInputs({ repoRoot: context.repoRoot, receipt: state.receipt });
      await nodeGate(context, 'scripts/build-extension.mjs');
      await verifyBuildInputs({ repoRoot: context.repoRoot, receipt: state.receipt });
    },
    postPackage: async (_config, result) => {
      nativeTarget(context.platform, result.platform, result.arch);
      if (!state || result.outputPaths.length !== 1) throw unverified('One exact native package and its early input receipt are required.');
      const packageRoot = await ownedPath(context.repoRoot, result.outputPaths[0], { directory: true });
      await verifyBuildInputs({ repoRoot: context.repoRoot, receipt: state.receipt });
      await nodeGate(context, 'scripts/verify-package.mjs', [], { SUPER_PACKAGE_ROOT: packageRoot });
      const receiptPath = path.join(path.dirname(state.receiptPath), 'package.json');
      const bound = await bindPackageProvenance({ repoRoot: context.repoRoot, receipt: state.receipt,
        packageRoot, receiptPath, targetVersion: state.receipt.targetVersion, platform: context.platform });
      await publishLocator(context.repoRoot, packageRoot, receiptPath, bound);
    },
    preMake: async (config) => {
      context.repoRoot = await ownedRoot(context.repoRoot);
      if (!context.makeArgv) throw unverified('BLOCKED: cannot establish the actual make CLI target; programmatic make requires an explicit target contract.');
      const target = cliArguments('make', context.makeArgv, context.platform);
      nativeTarget(context.platform, target.platform, target.arch);
      if (target.directory && path.resolve(context.repoRoot, target.directory) !== context.repoRoot) {
        throw unverified('BLOCKED: cross-repository make CLI cannot consume this package receipt.');
      }
      const packageRoot = await expectedPackage(context, config);
      const manifest = await readOwnedJson(context.repoRoot, path.join(context.repoRoot, 'package.json'));
      await loadPackageBuildProvenance({ repoRoot: context.repoRoot, packageRoot,
        targetVersion: manifest.version, platform: context.platform });
      context.env.VcpkgEnabled = 'false';
      await nodeGate(context, 'scripts/media-binaries.mjs', ['ensure', '--platform', context.platform]);
      await nodeGate(context, 'scripts/verify-package.mjs', [], { SUPER_PACKAGE_ROOT: packageRoot });
      // Ensure/verification are existing gates. Revalidate afterwards too so a
      // gate cannot change immutable source or the exact payload before makers.
      const receipt = await loadPackageBuildProvenance({ repoRoot: context.repoRoot, packageRoot,
        targetVersion: manifest.version, platform: context.platform });
      const makeRoot = path.join(path.dirname(packageRoot), 'make');
      makeState = { packageRoot, receipt, makeRoot, before: await makerOutputSnapshot(context.repoRoot, makeRoot) };
    },
    postMake: async (_config, outputs) => {
      if (!makeState || !Array.isArray(outputs) || outputs.length === 0) throw unverified('Actual preMake package proof and maker results required.');
      for (const output of outputs) {
        nativeTarget(context.platform, output.platform, output.arch);
        if (output.packageJSON?.version !== makeState.receipt.targetVersion || !Array.isArray(output.artifacts)) {
          throw unverified('Maker result package target differs from the verified preMake package.');
        }
        for (const artifact of output.artifacts) {
          const filename = await ownedPath(context.repoRoot, artifact);
          if (!within(makeState.makeRoot, filename) || makeState.before.get(filename) === fileIdentity(await lstat(filename))) {
            throw unverified('Maker artifact is outside its exact output root or was not produced by this make run.');
          }
          const extension = path.extname(filename).toLowerCase();
          const kind = extension === '.zip' ? 'forge-zip' : extension === '.dmg' ? 'dmg' : undefined;
          if (!kind) throw unverified('Unsupported actual maker artifact type.');
          await bindDerivativeProvenance({ repoRoot: context.repoRoot, packageRoot: makeState.packageRoot, packageReceipt: makeState.receipt,
            targetVersion: makeState.receipt.targetVersion, platform: context.platform, derivativeId: randomUUID(), artifactKind: kind, artifactPath: filename });
        }
      }
      return outputs;
    },
  };
}

function cliArguments(command, argv, platform) {
  const [hostPlatform, hostArch] = platform.split('-');
  const parser = new Command().exitOverride().configureOutput({ writeOut() {}, writeErr() {} })
    .helpOption(false).option('-h, --help').option('-V, --version')
    .argument('[dir]').option('-a, --arch [arch]', '', hostArch).option('-p, --platform [platform]', '', hostPlatform);
  if (command === 'make') parser.option('--skip-package').option('--targets [targets]').allowUnknownOption(true);
  parser.parse(argv, { from: 'user' });
  const parsed = parser.opts();
  return { ...parsed, directory: parser.args[0], informational: Boolean(parsed.help || parsed.version) };
}

export async function runBuildWithProvenance(options) {
  const context = ports({ ...options, env: { ...(options.env ?? process.env) } });
  context.repoRoot = await ownedRoot(context.repoRoot);
  const { command, argv = [] } = options;
  if (!['package', 'make'].includes(command)) throw unverified('Only local package/make builds are supported.');
  const argumentsResult = cliArguments(command, argv, context.platform);
  const tools = await localTools(context.repoRoot);
  if (argumentsResult.informational) {
    await checkedRun(context, process.execPath, [tools.executable, command, ...argv]);
    return { buildId: null, receiptPath: null };
  }
  nativeTarget(context.platform, argumentsResult.platform, argumentsResult.arch);
  if (argumentsResult.directory && path.resolve(context.repoRoot, argumentsResult.directory) !== context.repoRoot) {
    throw unverified('BLOCKED: cross-repository CLI directory cannot use this repository input receipt.');
  }
  context.env.VcpkgEnabled = 'false';
  let state;
  if (argumentsResult.skipPackage) {
    const config = await context.loadForgeConfig(context.repoRoot);
    const packageRoot = await expectedPackage(context, config);
    const manifest = await readOwnedJson(context.repoRoot, path.join(context.repoRoot, 'package.json'));
    const receipt = await loadPackageBuildProvenance({ repoRoot: context.repoRoot, packageRoot,
      targetVersion: manifest.version, platform: context.platform });
    const receiptPath = path.join(context.repoRoot, 'tmp/build-provenance', receipt.buildId, 'package.json');
    context.env[ID_ENV] = receipt.buildId;
    context.env[INPUT_ENV] = receiptPath;
    state = { receipt, receiptPath };
  } else {
    // Do not accept a parent's arbitrary last receipt for a NEW build.
    delete context.env[ID_ENV];
    delete context.env[INPUT_ENV];
    state = await capture(context);
    await nodeGate(context, 'scripts/media-binaries.mjs', ['ensure', '--platform', context.platform]);
    await nodeGate(context, 'scripts/verify-ufbx-wasm.mjs');
    await verifyBuildInputs({ repoRoot: context.repoRoot, receipt: state.receipt });
  }
  await checkedRun(context, process.execPath, [tools.executable, command, ...argv]);
  return { buildId: state.receipt.buildId, receiptPath: state.receiptPath };
}

async function main() {
  const [command, ...argv] = process.argv.slice(2);
  if (command === 'preflight') {
    const root = await ownedRoot(defaultRoot);
    if (!PLATFORMS.has(`${process.platform}-${process.arch}`)) throw unverified('BLOCKED: unsupported native build host.');
    await readOwnedJson(root, path.join(root, 'package.json'));
    await localTools(root);
    return;
  }
  await runBuildWithProvenance({ repoRoot: defaultRoot, command, argv });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
