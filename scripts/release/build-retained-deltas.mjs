#!/usr/bin/env node
/**
 * Builds direct Windows deltas from the newest retained baselines to the
 * current package version. The publisher adds the surviving packages to the
 * current latest.json manifest.
 */
import { spawn } from 'node:child_process';
import { access, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { loadArtifactDerivative, validateLegacyBaseline } from './artifact-manifest.mjs';
import { loadPackageBuildProvenance } from './build-with-provenance.mjs';
import { ownedPath, ownedRoot, unverified } from './derivative-producer-utils.mjs';

import {
  DELTA_SOURCE_RETENTION,
  MAX_DELTA_TO_FULL_RATIO,
  isDeltaWithinSizeLimit,
  selectRetainedDeltaSources,
} from './update-retention-policy.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const buildDeltaScript = path.join(repoRoot, 'scripts', 'release', 'build-inno-delta.mjs');
const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;

function fail(message) {
  throw new Error(`[build-retained-deltas] ${message}`);
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function run(command, args, settings) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, settings);
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve({ status: 0 });
      else reject(new Error(`${command} exited with ${String(code)}${signal ? ` (${signal})` : ''}.`));
    });
  });
}

async function currentVersion(root) {
  const manifest = JSON.parse(await readFile(await ownedPath(root, path.join(root, 'package.json')), 'utf8'));
  if (typeof manifest.version !== 'string' || !semver.test(manifest.version)) {
    fail('package.json has no valid semantic version.');
  }
  return manifest.version;
}

async function readBaselines(root, baselineDirectory) {
  await ownedPath(root, baselineDirectory, { directory: true });
  let names;
  try {
    names = await readdir(baselineDirectory);
  } catch {
    fail(`Baseline directory does not exist: ${baselineDirectory}`);
  }
  const baselines = new Map();
  for (const name of names.filter((candidate) => candidate.endsWith('.json')).sort()) {
    const manifestPath = path.join(baselineDirectory, name);
    let manifest;
    try {
      manifest = JSON.parse(await readFile(await ownedPath(root, manifestPath), 'utf8'));
    } catch {
      fail(`Invalid baseline manifest: ${manifestPath}`);
    }
    const version = manifest?.version;
    if (typeof version !== 'string' || !semver.test(version) || name !== `${version}.json`) {
      fail(`Baseline filename/version mismatch: ${manifestPath}`);
    }
    if (baselines.has(version)) fail(`Duplicate baseline version: ${version}`);
    validateLegacyBaseline(manifest, version);
    baselines.set(version, manifestPath);
  }
  return baselines;
}

function deltaStem(fromVersion, toVersion) {
  return `Super-win-x86-64-${fromVersion}-to-${toVersion}-delta`;
}

async function removePreviousTargetDeltas(root, outputDirectory, version) {
  let names;
  try {
    await ownedPath(root, outputDirectory, { directory: true });
    names = await readdir(outputDirectory);
  } catch {
    // Missing output is normal, but a linked/invalid path must not be ignored.
    if (!await exists(outputDirectory)) return;
    throw unverified('Invalid owned delta output directory.');
  }
  const marker = `-to-${version}-delta`;
  const removable = names.filter((name) => name.startsWith('Super-win-x86-64-')
    && name.includes(marker)
    && (name.endsWith('.zip') || name.endsWith('.json') || name.endsWith('.iss')));
  for (const name of removable) await ownedPath(root, path.join(outputDirectory, name));
  for (const name of removable) {
    await rm(path.join(outputDirectory, name), { force: true });
    if (name.endsWith('.zip')) {
      const locator = path.join(root, 'out/.build-provenance/artifacts', `${name}.json`);
      if (await exists(locator)) { await ownedPath(root, locator); await rm(locator); }
    }
  }
}

async function removeSkippedDelta(root, outputDirectory, fromVersion, toVersion) {
  const stem = deltaStem(fromVersion, toVersion);
  await Promise.all(['.zip', '.json', '.iss'].map((extension) =>
    ownedPath(root, path.join(outputDirectory, `${stem}${extension}`), { missing: true }).then((filename) => rm(filename, { force: true }))));
  const locator = path.join(root, 'out/.build-provenance/artifacts', `${stem}.zip.json`);
  if (await exists(locator)) { await ownedPath(root, locator); await rm(locator); }
}

export async function buildRetainedDeltas(options = {}) {
  const root = await ownedRoot(options.repoRoot ?? repoRoot);
  const version = await currentVersion(root);
  const baselineDirectory = path.resolve(options.baselineDirectory ?? path.join(root, 'release/baselines'));
  const packageDirectory = path.resolve(options.packageRoot ?? path.join(root, 'out/Super-win32-x64'));
  const outputDirectory = path.resolve(options.outputDirectory ?? path.join(root, 'out/make/delta'));
  const fullPackagePath = path.resolve(options.fullPackagePath ?? path.join(root, 'out/make', `Super-win-x86-64-${version}-setup.zip`));
  const packageReceipt = await loadPackageBuildProvenance({ repoRoot: root, packageRoot: packageDirectory, targetVersion: version, platform: 'win32-x64' });
  const ports = { repoRoot: root, packageRoot: packageDirectory, packageReceipt, targetVersion: version, platform: 'win32-x64' };
  const fullProof = await loadArtifactDerivative({ ...ports, artifactPath: fullPackagePath });
  if (fullProof.kind !== 'full-update') throw unverified('Retained deltas require the exact full ZIP producer proof.');
  await ownedPath(root, outputDirectory, { missing: true, directory: true });
  const dryRun = options.dryRun === true;
  const baselines = await readBaselines(root, baselineDirectory);
  const sources = selectRetainedDeltaSources([...baselines.keys()], version);
  const fullPackageBytes = fullProof.artifact.bytes;
  if (fullPackageBytes <= 0) fail(`Full update archive is empty: ${fullPackagePath}`);

  console.log(`[build-retained-deltas] ${sources.length}/${DELTA_SOURCE_RETENTION} retained source version(s) selected for ${version}.`);
  if (dryRun) {
    console.log(`[build-retained-deltas] Sources: ${sources.join(', ') || '(none)'}`);
    return;
  }
  await loadArtifactDerivative({ ...ports, artifactPath: fullPackagePath });
  await removePreviousTargetDeltas(root, outputDirectory, version);
  const runner = options.run ?? run;
  for (const sourceVersion of sources) {
    const producerStarted = performance.now();
    const result = await runner(process.execPath, [
      root === repoRoot ? buildDeltaScript : path.join(root, 'scripts/release/build-inno-delta.mjs'),
      '--from-version', sourceVersion,
      '--to-version', version,
      '--baseline', baselines.get(sourceVersion),
      '--package-dir', packageDirectory,
      '--output-dir', outputDirectory,
    ], { cwd: root, shell: false, stdio: 'inherit', env: options.env ?? process.env });
    const producerMs = performance.now() - producerStarted;
    if (result?.error || result?.status !== 0) throw unverified(`Delta child failed: ${result?.error?.message ?? String(result?.status)}`);
    const stem = deltaStem(sourceVersion, version);
    const metadataPath = path.join(outputDirectory, `${stem}.json`);
    const archivePath = path.join(outputDirectory, `${stem}.zip`);
    const metadata = JSON.parse(await readFile(await ownedPath(root, metadataPath), 'utf8'));
    const verificationStarted = performance.now();
    const proof = await loadArtifactDerivative({ ...ports, artifactPath: archivePath });
    console.log(`[build-retained-deltas:timing] ${JSON.stringify({ fromVersion: sourceVersion, toVersion: version,
      producerMs: Math.round(producerMs), parentVerificationMs: Math.round(performance.now() - verificationStarted) })}`);
    const archiveBytes = proof.artifact.bytes;
    if (metadata?.fromVersion !== sourceVersion || metadata?.toVersion !== version || metadata?.size !== archiveBytes) {
      fail(`Generated delta metadata is invalid: ${metadataPath}`);
    }
    if (!isDeltaWithinSizeLimit(archiveBytes, fullPackageBytes)) {
      await removeSkippedDelta(root, outputDirectory, sourceVersion, version);
      console.log(`[build-retained-deltas] Skipped ${sourceVersion} -> ${version}: ${(archiveBytes / 1024 / 1024).toFixed(1)} MB exceeds ${(MAX_DELTA_TO_FULL_RATIO * 100).toFixed(0)}% of the full package.`);
      continue;
    }
    console.log(`[build-retained-deltas] Kept ${sourceVersion} -> ${version}: ${(archiveBytes / 1024 / 1024).toFixed(1)} MB.`);
  }
  // build-inno-delta uses this fixed intermediate filename. Published delta
  // ZIPs are self-contained, so do not let the intermediate enter checksums.
  // Compiler intermediates now remain in fresh owned GUID stages, never under
  // the publication directory. No generic old SuperSetup.exe is touched here.
}

async function main() {
  await buildRetainedDeltas({ baselineDirectory: argument('--baseline-dir'), packageRoot: argument('--package-dir'),
    outputDirectory: argument('--output-dir'), fullPackagePath: argument('--full-package'), dryRun: process.argv.includes('--dry-run') });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
