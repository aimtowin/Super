#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { bindDerivativeProvenance, validateLegacyBaseline } from './artifact-manifest.mjs';
import { loadPackageBuildProvenance } from './build-with-provenance.mjs';
import { selectRetainedDeltaSources } from './update-retention-policy.mjs';
import { compilerPath, createInstallerArchive, defaultIscc, digestOwned, freshCompilerDirectory, mkdirOwned, ownedPath, ownedRoot, readOwnedJson, unverified, writeAtomic } from './derivative-producer-utils.mjs';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;

function fail(message) { throw new Error(`[build-inno-delta] ${message}`); }
function argument(name) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
function escaped(value) { return value.replaceAll('"', '""'); }
function innoScript({ version, changed, removed, packageRoot, outputDirectory, sourceRoot }) {
  const silentUpdateUiPath = path.join(sourceRoot, 'assets', 'inno', 'silent-update-ui.iss');
  const fileLines = changed.map((file) => {
    const destination = path.posix.dirname(file.path);
    const destDir = destination === '.' ? '{app}' : `{app}\\${destination.replaceAll('/', '\\')}`;
    return `Source: "${escaped(path.join(packageRoot, file.path))}"; DestDir: "${destDir}"; Flags: ignoreversion`;
  });
  const deleteLines = removed.map((relative) => `    DeleteFile(ExpandConstant('{app}\\${relative.replaceAll('/', '\\').replaceAll("'", "''")}'));`);
  return `#define AppName "Super Lib"
#define AppVersion "${version}"
#define AppExeName "Super.exe"
[Setup]
AppId={{F3A7C2E1-9B5D-4E8A-8C3F-1D6B2A9E4C71}
AppName={#AppName}
AppVersion={#AppVersion}
DefaultDirName={autopf}\\{#AppName}
OutputDir=${escaped(outputDirectory)}
OutputBaseFilename=SuperSetup
Compression=lzma
SolidCompression=yes
SetupIconFile=${escaped(path.join(sourceRoot, 'assets', 'icons', 'app.ico'))}
MinVersion=10.0
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
CloseApplications=force
UsePreviousAppDir=yes
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableWelcomePage=yes
DisableReadyPage=yes
Uninstallable=no
CreateUninstallRegKey=no
[Files]
${fileLines.join('\n')}
[Code]
#include "${escaped(silentUpdateUiPath)}"

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then
  begin
${deleteLines.length ? deleteLines.join('\n') : '    { No obsolete packaged files in this delta. }'}
    ShowSilentUpdateProgress();
  end;
  if CurStep = ssPostInstall then
  begin
    SaveStringToFile(ExpandConstant('{app}\\.super-installed'), 'installed', False);
    ShowSilentUpdateCompletion();
  end;
end;

procedure CurInstallProgressChanged(CurProgress, MaxProgress: Integer);
begin
  UpdateSilentUpdateProgress(CurProgress, MaxProgress);
end;
`;
}

export async function buildInnoDelta(options = {}) {
  const root = await ownedRoot(options.repoRoot ?? repoRoot);
  const { fromVersion, toVersion } = options;
  const baselinePath = options.baselinePath;
  const packageDirectory = options.packageRoot ?? path.join(root, 'out/Super-win32-x64');
  const outputDirectory = path.resolve(options.outputDirectory ?? path.join(root, 'out/make/delta'));
  if (!fromVersion || !toVersion || !baselinePath || !semver.test(fromVersion) || !semver.test(toVersion)) fail('from/to versions and baseline are required semantic versions.');
  if (!selectRetainedDeltaSources([fromVersion], toVersion).includes(fromVersion)) fail('Delta source must precede its target version.');
  const platform = 'win32-x64';
  const packageReceipt = await loadPackageBuildProvenance({ repoRoot: root, packageRoot: packageDirectory, targetVersion: toVersion, platform });
  if (typeof packageReceipt.toolVersions.electron !== 'string') throw unverified('Target receipt has no Electron runtime version.');
  const baseline = validateLegacyBaseline(await readOwnedJson(root, path.resolve(baselinePath)), fromVersion);
  const baselineDigest = await digestOwned(root, path.resolve(baselinePath));
  const baselineFiles = new Map(baseline.files.map((file) => [file.path, file]));
  const current = packageReceipt.package.files;
  const runtimeChanged = baseline.runtimeVersion !== undefined && baseline.runtimeVersion !== packageReceipt.toolVersions.electron;
  const changed = current.filter((file) =>
    baselineFiles.get(file.path)?.sha256 !== file.sha256
    && (runtimeChanged || file.path !== 'Super.exe'),
  );
  if (changed.length === 0) fail('No changed packaged files; refusing to create an empty delta.');
  const currentPaths = new Set(current.map((file) => file.path));
  const removed = [...baselineFiles.keys()].filter((file) => !currentPaths.has(file));
  const deltaRoot = outputDirectory;
  const stem = `Super-win-x86-64-${fromVersion}-to-${toVersion}-delta`;
  const archivePath = path.join(deltaRoot, `${stem}.zip`);
  const metadataPath = path.join(deltaRoot, `${stem}.json`);
  const finalIssPath = path.join(deltaRoot, `${stem}.iss`);
  for (const filename of [archivePath, metadataPath, finalIssPath]) await ownedPath(root, filename, { missing: true });
  const environment = options.env ?? process.env;
  const iscc = await compilerPath(options.isccPath ?? defaultIscc(environment));
  const freshDirectory = await freshCompilerDirectory(root, packageReceipt);
  const issPath = path.join(freshDirectory, `${stem}.iss`);
  const script = innoScript({ version: toVersion, changed, removed, packageRoot: path.resolve(packageDirectory), outputDirectory: freshDirectory, sourceRoot: root });
  await writeFile(issPath, script, { flag: 'wx' });
  const run = options.run ?? ((command, argv, settings) => spawnSync(command, argv, settings));
  const result = await run(iscc, [`/O${freshDirectory}`, issPath], { cwd: root, stdio: 'inherit', shell: false, env: environment });
  if (result.error || result.status !== 0) fail(`ISCC failed: ${result.error?.message ?? String(result.status)}`);
  const setupPath = await ownedPath(root, path.join(freshDirectory, 'SuperSetup.exe'));
  if ((await stat(setupPath)).size < 100 * 1024) fail('Fresh delta setup executable was not produced.');
  const freshArchive = path.join(freshDirectory, `${stem}.zip`);
  const archiveDigest = await createInstallerArchive(root, setupPath, freshArchive);
  await loadPackageBuildProvenance({ repoRoot: root, packageRoot: packageDirectory, targetVersion: toVersion, platform });
  if (JSON.stringify(await digestOwned(root, path.resolve(baselinePath))) !== JSON.stringify(baselineDigest)) throw unverified('Legacy source baseline changed while compiling.');
  await mkdirOwned(root, deltaRoot);
  const temporary = path.join(deltaRoot, `${stem}.${randomUUID()}.tmp`);
  await copyFile(freshArchive, temporary);
  await ownedPath(root, archivePath, { missing: true });
  await rename(temporary, archivePath);
  const bound = await bindDerivativeProvenance({ repoRoot: root, packageRoot: packageDirectory, packageReceipt, targetVersion: toVersion, platform,
    derivativeId: randomUUID(), artifactKind: 'delta', artifactPath: archivePath, installerPath: setupPath, fromVersion, baselinePath: path.resolve(baselinePath) });
  const artifact = { fromVersion, toVersion, path: archivePath, remoteName: `${stem}.zip`, size: archiveDigest.bytes, sha256: archiveDigest.sha256,
    changedFiles: changed.map((file) => file.path), removedFiles: removed, receiptPath: bound.receiptPath };
  await writeAtomic(root, finalIssPath, script);
  await writeAtomic(root, metadataPath, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(`[build-inno-delta] ${changed.length} changed, ${removed.length} removed; runtime ${runtimeChanged ? 'included' : 'reused'}; archive ${archivePath} (${artifact.size} bytes)`);
  return artifact;
}

async function main() {
  await buildInnoDelta({ fromVersion: argument('--from-version'), toVersion: argument('--to-version'), baselinePath: argument('--baseline'),
    packageRoot: argument('--package-dir'), outputDirectory: argument('--output-dir') });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
