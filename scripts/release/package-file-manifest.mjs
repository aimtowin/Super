#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPackageBuildProvenance } from './build-with-provenance.mjs';
import { mkdirOwned, ownedPath, ownedRoot, unverified } from './derivative-producer-utils.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function usage() {
  throw new Error('Usage: node scripts/release/package-file-manifest.mjs [--version <semver> --input <package-dir> --output <manifest.json>]');
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export async function writePackageFileManifest(options = {}) {
  const root = await ownedRoot(options.repoRoot ?? repoRoot);
  const packageManifest = JSON.parse(await readFile(await ownedPath(root, path.join(root, 'package.json')), 'utf8'));
  const version = options.version ?? packageManifest.version;
  const input = options.packageRoot ?? path.join(root, 'out/Super-win32-x64');
  const output = options.outputPath ?? path.join(root, 'release/baselines', `${String(version)}.json`);
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(version)) usage();
  const receipt = await loadPackageBuildProvenance({ repoRoot: root, packageRoot: path.resolve(input), targetVersion: version, platform: 'win32-x64' });
  const files = receipt.package.files.map((file) => ({ path: file.path, size: file.bytes, sha256: file.sha256 }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const runtimeVersion = receipt.toolVersions.electron;
  if (typeof runtimeVersion !== 'string') throw unverified('Verified target receipt has no Electron runtime version.');
  const outputPath = path.resolve(output);
  await ownedPath(root, outputPath, { missing: true });
  const content = `${JSON.stringify({ version, runtimeVersion, files }, null, 2)}\n`;
  try {
    const existing = await readFile(outputPath, 'utf8');
    if (existing === content) {
      console.log(`[package-file-manifest] Verified existing immutable baseline: ${outputPath}`);
      return;
    }
    throw new Error(`Refusing to overwrite immutable baseline: ${outputPath}`);
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
  }
  await loadPackageBuildProvenance({ repoRoot: root, packageRoot: path.resolve(input), targetVersion: version, platform: 'win32-x64' });
  await mkdirOwned(root, path.dirname(outputPath));
  await ownedPath(root, outputPath, { missing: true });
  await writeFile(outputPath, content, { flag: 'wx' });
  console.log(`[package-file-manifest] Wrote ${files.length} entries to ${outputPath}`);
}

async function main() {
  const version = argument('--version');
  const input = argument('--input');
  const output = argument('--output');
  const count = [version, input, output].filter((value) => value !== undefined).length;
  if (count !== 0 && count !== 3) usage();
  await writePackageFileManifest({ version, packageRoot: input, outputPath: output });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
