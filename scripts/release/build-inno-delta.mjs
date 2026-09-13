#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { ZipArchive } = require('archiver');
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const silentUpdateUiPath = path.join(repoRoot, 'assets', 'inno', 'silent-update-ui.iss');
const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;

function fail(message) { throw new Error(`[build-inno-delta] ${message}`); }
function argument(name) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
function escaped(value) { return value.replaceAll('"', '""'); }
function sha256(filePath) { return createHash('sha256').update(readFileSync(filePath)).digest('hex'); }
function safePath(value) {
  return typeof value === 'string'
    && value.length > 0
    && !value.includes('\\')
    && !value.includes('\0')
    && !path.posix.isAbsolute(value)
    && value.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

async function collect(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(root, absolute));
    else if (entry.isFile()) {
      const metadata = await stat(absolute);
      files.push({ path: path.relative(root, absolute).replaceAll('\\', '/'), size: metadata.size, sha256: sha256(absolute) });
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function loadBaseline(filePath, version) {
  const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  if (parsed?.version !== version || !Array.isArray(parsed.files)) fail('Baseline manifest version or files are invalid.');
  const files = new Map();
  for (const file of parsed.files) {
    if (!file || typeof file.path !== 'string' || !safePath(file.path) || typeof file.sha256 !== 'string') fail('Baseline manifest contains an unsafe file entry.');
    files.set(file.path, file);
  }
  return { files, runtimeVersion: typeof parsed.runtimeVersion === 'string' ? parsed.runtimeVersion : undefined };
}

function electronRuntimeVersion() {
  const manifest = JSON.parse(readFileSync(path.join(repoRoot, 'node_modules', 'electron', 'package.json'), 'utf8'));
  if (typeof manifest.version !== 'string') fail('Unable to determine Electron runtime version.');
  return manifest.version;
}

function innoScript({ version, changed, removed, packageRoot, outputDirectory }) {
  const fileLines = changed.map((file) => {
    const destination = path.posix.dirname(file.path);
    const destDir = destination === '.' ? '{app}' : `{app}\\${destination.replaceAll('/', '\\')}`;
    return `Source: "${escaped(path.join(packageRoot, file.path))}"; DestDir: "${destDir}"; Flags: ignoreversion`;
  });
  const deleteLines = removed.map((relative) => `    DeleteFile(ExpandConstant('{app}\\${relative.replaceAll('/', '\\')}'));`);
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
SetupIconFile=${escaped(path.join(repoRoot, 'assets', 'icons', 'app.ico'))}
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

async function zipInstaller(exePath, archivePath) {
  rmSync(archivePath, { force: true });
  await new Promise((resolve, reject) => {
    const output = createWriteStream(archivePath, { flags: 'wx' });
    const archive = new ZipArchive({ zlib: { level: 9 } });
    output.once('close', resolve); output.once('error', reject); archive.once('error', reject);
    archive.pipe(output); archive.file(exePath, { name: 'SuperSetup.exe' }); void archive.finalize();
  });
}

async function main() {
  const fromVersion = argument('--from-version');
  const toVersion = argument('--to-version');
  const baselinePath = argument('--baseline');
  const packageDirectory = argument('--package-dir') ?? path.join(repoRoot, 'out', 'Super-win32-x64');
  const outputDirectory = argument('--output-dir') ?? path.join(repoRoot, 'out', 'make', 'delta');
  if (!fromVersion || !toVersion || !baselinePath || !semver.test(fromVersion) || !semver.test(toVersion)) fail('from/to versions and baseline are required semantic versions.');
  const baseline = loadBaseline(path.resolve(baselinePath), fromVersion);
  const current = await collect(path.resolve(packageDirectory));
  if (current.some((file) => !safePath(file.path))) fail('Packaged output contains an unsafe file path.');
  const runtimeChanged = baseline.runtimeVersion !== undefined
    && baseline.runtimeVersion !== electronRuntimeVersion();
  const changed = current.filter((file) =>
    baseline.files.get(file.path)?.sha256 !== file.sha256
    && (runtimeChanged || file.path !== 'Super.exe'),
  );
  if (changed.length === 0) fail('No changed packaged files; refusing to create an empty delta.');
  const currentPaths = new Set(current.map((file) => file.path));
  const removed = [...baseline.files.keys()].filter((file) => !currentPaths.has(file));
  const deltaRoot = path.resolve(outputDirectory);
  await mkdir(deltaRoot, { recursive: true });
  const stem = `Super-win-x86-64-${fromVersion}-to-${toVersion}-delta`;
  const issPath = path.join(deltaRoot, `${stem}.iss`);
  await writeFile(issPath, innoScript({ version: toVersion, changed, removed, packageRoot: path.resolve(packageDirectory), outputDirectory: deltaRoot }));
  const iscc = process.env.SUPER_INNO_TOOLS
    ? path.join(process.env.SUPER_INNO_TOOLS, 'ISCC.exe')
    : path.join(process.env.LOCALAPPDATA || '', 'SuperTools', 'inno', 'tools', 'ISCC.exe');
  if (!existsSync(iscc)) fail(`ISCC.exe not found at ${iscc}`);
  const result = spawnSync(iscc, [issPath], { cwd: repoRoot, stdio: 'inherit', shell: false });
  if (result.error || result.status !== 0) fail(`ISCC failed: ${result.error?.message ?? String(result.status)}`);
  const setupPath = path.join(deltaRoot, 'SuperSetup.exe');
  if (!existsSync(setupPath) || statSync(setupPath).size < 100 * 1024) fail('Delta setup executable was not produced.');
  const archivePath = path.join(deltaRoot, `${stem}.zip`);
  await zipInstaller(setupPath, archivePath);
  const artifact = { fromVersion, toVersion, path: archivePath, remoteName: `${stem}.zip`, size: statSync(archivePath).size, sha256: sha256(archivePath), changedFiles: changed.map((file) => file.path), removedFiles: removed };
  await writeFile(path.join(deltaRoot, `${stem}.json`), `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(`[build-inno-delta] ${changed.length} changed, ${removed.length} removed; runtime ${runtimeChanged ? 'included' : 'reused'}; archive ${archivePath} (${artifact.size} bytes)`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
