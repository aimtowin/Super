#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function usage() {
  throw new Error('Usage: node scripts/release/package-file-manifest.mjs [--version <semver> --input <package-dir> --output <manifest.json>]');
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function hashFile(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

async function collect(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(root, absolute));
    else if (entry.isFile()) {
      const info = await stat(absolute);
      files.push({
        path: path.relative(root, absolute).replaceAll('\\', '/'),
        size: info.size,
        sha256: await hashFile(absolute),
      });
    }
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

async function main() {
  const explicitVersion = argument('--version');
  const explicitInput = argument('--input');
  const explicitOutput = argument('--output');
  const explicitCount = [explicitVersion, explicitInput, explicitOutput].filter((value) => value !== undefined).length;
  if (explicitCount !== 0 && explicitCount !== 3) usage();
  const packageManifest = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'));
  const version = explicitVersion ?? packageManifest.version;
  const input = explicitInput ?? path.join(repoRoot, 'out', 'Super-win32-x64');
  const output = explicitOutput ?? path.join(repoRoot, 'release', 'baselines', `${String(version)}.json`);
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(version)) usage();
  const root = path.resolve(input);
  const files = await collect(root);
  const runtimeVersion = JSON.parse(
    await readFile(path.join(repoRoot, 'node_modules', 'electron', 'package.json'), 'utf8'),
  ).version;
  if (typeof runtimeVersion !== 'string') throw new Error('Unable to determine Electron runtime version.');
  await mkdir(path.dirname(path.resolve(output)), { recursive: true });
  const outputPath = path.resolve(output);
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
  await writeFile(outputPath, content, { flag: 'wx' });
  console.log(`[package-file-manifest] Wrote ${files.length} entries to ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
