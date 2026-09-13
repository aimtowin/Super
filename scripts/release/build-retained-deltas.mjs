#!/usr/bin/env node
/**
 * Builds direct Windows deltas from the newest retained baselines to the
 * current package version. The publisher adds the surviving packages to the
 * current latest.json manifest.
 */
import { spawn } from 'node:child_process';
import { access, readdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: repoRoot, shell: false, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${String(code)}${signal ? ` (${signal})` : ''}.`));
    });
  });
}

async function currentVersion() {
  const manifest = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'));
  if (typeof manifest.version !== 'string' || !semver.test(manifest.version)) {
    fail('package.json has no valid semantic version.');
  }
  return manifest.version;
}

async function readBaselines(baselineDirectory) {
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
      manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    } catch {
      fail(`Invalid baseline manifest: ${manifestPath}`);
    }
    const version = manifest?.version;
    if (typeof version !== 'string' || !semver.test(version) || name !== `${version}.json`) {
      fail(`Baseline filename/version mismatch: ${manifestPath}`);
    }
    if (baselines.has(version)) fail(`Duplicate baseline version: ${version}`);
    baselines.set(version, manifestPath);
  }
  return baselines;
}

function deltaStem(fromVersion, toVersion) {
  return `Super-win-x86-64-${fromVersion}-to-${toVersion}-delta`;
}

async function removePreviousTargetDeltas(outputDirectory, version) {
  let names;
  try {
    names = await readdir(outputDirectory);
  } catch {
    return;
  }
  const marker = `-to-${version}-delta`;
  const removable = names.filter((name) => name.startsWith('Super-win-x86-64-')
    && name.includes(marker)
    && (name.endsWith('.zip') || name.endsWith('.json') || name.endsWith('.iss')));
  await Promise.all(removable.map((name) => rm(path.join(outputDirectory, name), { force: true })));
}

async function removeSkippedDelta(outputDirectory, fromVersion, toVersion) {
  const stem = deltaStem(fromVersion, toVersion);
  await Promise.all(['.zip', '.json', '.iss'].map((extension) =>
    rm(path.join(outputDirectory, `${stem}${extension}`), { force: true })));
}

async function main() {
  const version = await currentVersion();
  const baselineDirectory = path.resolve(argument('--baseline-dir') ?? path.join(repoRoot, 'release', 'baselines'));
  const packageDirectory = path.resolve(argument('--package-dir') ?? path.join(repoRoot, 'out', 'Super-win32-x64'));
  const outputDirectory = path.resolve(argument('--output-dir') ?? path.join(repoRoot, 'out', 'make', 'delta'));
  const fullPackagePath = path.resolve(argument('--full-package') ?? path.join(repoRoot, 'out', 'make', `Super-win-x86-64-${version}-setup.zip`));
  const dryRun = process.argv.includes('--dry-run');
  const baselines = await readBaselines(baselineDirectory);
  const sources = selectRetainedDeltaSources([...baselines.keys()], version);
  if (!await exists(fullPackagePath)) fail(`Full update archive does not exist: ${fullPackagePath}`);
  if (!await exists(packageDirectory)) fail(`Packaged application does not exist: ${packageDirectory}`);
  const fullPackageBytes = (await stat(fullPackagePath)).size;
  if (fullPackageBytes <= 0) fail(`Full update archive is empty: ${fullPackagePath}`);

  console.log(`[build-retained-deltas] ${sources.length}/${DELTA_SOURCE_RETENTION} retained source version(s) selected for ${version}.`);
  if (dryRun) {
    console.log(`[build-retained-deltas] Sources: ${sources.join(', ') || '(none)'}`);
    return;
  }
  await removePreviousTargetDeltas(outputDirectory, version);
  for (const sourceVersion of sources) {
    await run(process.execPath, [
      buildDeltaScript,
      '--from-version', sourceVersion,
      '--to-version', version,
      '--baseline', baselines.get(sourceVersion),
      '--package-dir', packageDirectory,
      '--output-dir', outputDirectory,
    ]);
    const stem = deltaStem(sourceVersion, version);
    const metadataPath = path.join(outputDirectory, `${stem}.json`);
    const archivePath = path.join(outputDirectory, `${stem}.zip`);
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
    const archiveBytes = (await stat(archivePath)).size;
    if (metadata?.fromVersion !== sourceVersion || metadata?.toVersion !== version || metadata?.size !== archiveBytes) {
      fail(`Generated delta metadata is invalid: ${metadataPath}`);
    }
    if (!isDeltaWithinSizeLimit(archiveBytes, fullPackageBytes)) {
      await removeSkippedDelta(outputDirectory, sourceVersion, version);
      console.log(`[build-retained-deltas] Skipped ${sourceVersion} -> ${version}: ${(archiveBytes / 1024 / 1024).toFixed(1)} MB exceeds ${(MAX_DELTA_TO_FULL_RATIO * 100).toFixed(0)}% of the full package.`);
      continue;
    }
    console.log(`[build-retained-deltas] Kept ${sourceVersion} -> ${version}: ${(archiveBytes / 1024 / 1024).toFixed(1)} MB.`);
  }
  // build-inno-delta uses this fixed intermediate filename. Published delta
  // ZIPs are self-contained, so do not let the intermediate enter checksums.
  await rm(path.join(outputDirectory, 'SuperSetup.exe'), { force: true });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
