#!/usr/bin/env node
/** Existing Windows Inno/ZIP workflow; compiler outputs are now fresh and bound. */
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { copyFile, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { bindDerivativeProvenance } from './release/artifact-manifest.mjs';
import { loadPackageBuildProvenance } from './release/build-with-provenance.mjs';
import { compilerPath, createInstallerArchive, defaultIscc, freshCompilerDirectory, mkdirOwned, ownedPath, ownedRoot, readOwnedJson, unverified } from './release/derivative-producer-utils.mjs';

const repoRoot = path.resolve(fileURLToPath(new URL('../', import.meta.url)));

export async function buildInnoInstaller(options = {}) {
  const root = await ownedRoot(options.repoRoot ?? repoRoot);
  const manifest = await readOwnedJson(root, path.join(root, 'package.json'));
  const targetVersion = manifest.version;
  const platform = 'win32-x64';
  const packageRoot = options.packageRoot ?? path.join(root, 'out/Super-win32-x64');
  const packageReceipt = await loadPackageBuildProvenance({ repoRoot: root, packageRoot, targetVersion, platform });
  const outputDirectory = path.resolve(options.outputDirectory ?? path.join(root, 'out/make/inno'));
  const installerPath = path.join(outputDirectory, 'SuperSetup.exe');
  const updateArchivePath = path.join(path.dirname(outputDirectory), `Super-win-x86-64-${targetVersion}-setup.zip`);
  await ownedPath(root, outputDirectory, { missing: true, directory: true });
  await ownedPath(root, installerPath, { missing: true });
  await ownedPath(root, updateArchivePath, { missing: true });
  const environment = options.env ?? process.env;
  const iscc = await compilerPath(options.isccPath ?? defaultIscc(environment));
  const source = await ownedPath(root, path.join(root, 'assets/inno/supersetup.iss'));
  const directory = await freshCompilerDirectory(root, packageReceipt);
  const run = options.run ?? ((command, argv, settings) => spawnSync(command, argv, settings));
  const result = await run(iscc, [`/DAppVersion=${targetVersion}`, `/DPackageRoot=${packageRoot}`, `/O${directory}`, source], {
    cwd: root, shell: false, stdio: 'inherit', env: environment,
  });
  if (result.error || result.status !== 0) throw unverified(`ISCC compiler failed: ${result.error?.message ?? String(result.status)}`);
  const freshInstaller = await ownedPath(root, path.join(directory, 'SuperSetup.exe'));
  if ((await stat(freshInstaller)).size < 100 * 1024 * 1024) throw unverified('Fresh Inno installer was not produced or is suspiciously small.');
  const freshArchive = path.join(directory, `Super-win-x86-64-${targetVersion}-setup.zip`);
  await createInstallerArchive(root, freshInstaller, freshArchive);
  await loadPackageBuildProvenance({ repoRoot: root, packageRoot, targetVersion, platform });
  await ownedPath(root, installerPath, { missing: true });
  await ownedPath(root, updateArchivePath, { missing: true });
  await mkdirOwned(root, outputDirectory);
  const installerTemporary = path.join(outputDirectory, `SuperSetup.exe.${randomUUID()}.tmp`);
  await copyFile(freshInstaller, installerTemporary);
  await ownedPath(root, installerPath, { missing: true });
  await rename(installerTemporary, installerPath);
  const archiveTemporary = path.join(path.dirname(updateArchivePath), `${path.basename(updateArchivePath)}.${randomUUID()}.tmp`);
  await copyFile(freshArchive, archiveTemporary);
  await ownedPath(root, updateArchivePath, { missing: true });
  await rename(archiveTemporary, updateArchivePath);
  const ports = { repoRoot: root, packageRoot, packageReceipt, targetVersion, platform };
  const full = await bindDerivativeProvenance({ ...ports, derivativeId: randomUUID(), artifactKind: 'full-installer', artifactPath: installerPath });
  const update = await bindDerivativeProvenance({ ...ports, derivativeId: randomUUID(), artifactKind: 'full-update', artifactPath: updateArchivePath, installerPath });
  console.log(`[inno-build] Windows installer written to ${installerPath}`);
  console.log(`[inno-build] GitHub update archive written to ${updateArchivePath}`);
  return { installerPath, updateArchivePath, derivativeReceiptPaths: [full.receiptPath, update.receiptPath] };
}

async function main() {
  const index = process.argv.indexOf('--out');
  if (index >= 0 && !process.argv[index + 1]) throw new Error('--out requires a directory.');
  await buildInnoInstaller({ outputDirectory: index >= 0 ? path.resolve(process.argv[index + 1]) : undefined });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`[inno-build] FAILED: ${error.message}`); process.exitCode = 1; });
}
