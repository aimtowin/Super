#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function usage() {
  throw new Error('Usage: node scripts/release/package-file-manifest.mjs --version <semver> --input <package-dir> --output <manifest.json>');
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
  const version = argument('--version');
  const input = argument('--input');
  const output = argument('--output');
  if (!version || !input || !output) usage();
  const root = path.resolve(input);
  const files = await collect(root);
  const runtimeVersion = JSON.parse(
    await readFile(path.join(repoRoot, 'node_modules', 'electron', 'package.json'), 'utf8'),
  ).version;
  if (typeof runtimeVersion !== 'string') throw new Error('Unable to determine Electron runtime version.');
  await mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await writeFile(path.resolve(output), `${JSON.stringify({ version, runtimeVersion, files }, null, 2)}\n`);
  console.log(`[package-file-manifest] Wrote ${files.length} entries to ${path.resolve(output)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
