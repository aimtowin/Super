#!/usr/bin/env node
/**
 * Publish a verified Windows update package to Super's ECS update volume.
 *
 * Required environment:
 *   SUPER_UPDATE_SSH_HOST      ECS hostname or IP
 * Optional environment:
 *   SUPER_UPDATE_SSH_USER      SSH user (default: root)
 *   SUPER_UPDATE_SSH_PORT      SSH port (default: 22)
 *   SUPER_UPDATE_SSH_IDENTITY_FILE  explicit PEM/private-key path
 *   SUPER_UPDATE_REMOTE_DIR    ECS update volume (default: /www/wwwroot/resource/data/super-updates)
 *   SUPER_UPDATE_RETAIN_RELEASES  Number of newest release directories to retain (default: 5)
 *   SUPER_UPDATE_NOTES         bounded release notes shown in Super
 *
 * The server image serves `latest.json` and `releases/<version>/...` from
 * this persistent volume. Artifacts are uploaded to a staging directory;
 * moving latest.json within that volume promotes the update atomically.
 */
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { access, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const defaultRemoteDirectory = '/www/wwwroot/resource/data/super-updates';
const maxNotesLength = 12_000;
const remoteDirectoryPattern = /^\/[A-Za-z0-9._/-]*$/u;
const SAFE_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/u;

function fail(message) {
  throw new Error(`[publish-ecs-update] ${message}`);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: repoRoot, shell: false, stdio: 'inherit' });
    child.once('error', (error) => reject(error));
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${String(code)}${signal ? ` (${signal})` : ''}.`));
    });
  });
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function sha256(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

async function readReleaseVersion() {
  const manifest = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'));
  if (typeof manifest.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(manifest.version)) {
    fail('package.json has no valid semantic version.');
  }
  return manifest.version;
}

function quoteRemotePath(value) {
  if (!remoteDirectoryPattern.test(value)) fail(`Unsafe remote path: ${value}`);
  return `'${value}'`;
}

function parsePort(value) {
  const port = Number(value ?? '22');
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) fail('SUPER_UPDATE_SSH_PORT must be a valid TCP port.');
  return String(port);
}

function parseReleaseRetention(value) {
  if (value === undefined || value.trim() === '') return 5;
  if (!/^[1-9]\d?$/u.test(value.trim())) fail('SUPER_UPDATE_RETAIN_RELEASES must be an integer from 1 to 99.');
  return Number(value.trim());
}

async function loadDeltaArtifacts(version) {
  const directory = path.join(repoRoot, 'out', 'make', 'delta');
  let names;
  try {
    names = await readdir(directory);
  } catch {
    return [];
  }
  const deltas = [];
  for (const name of names.filter((candidate) => candidate.endsWith('.json')).sort()) {
    let candidate;
    try {
      candidate = JSON.parse(await readFile(path.join(directory, name), 'utf8'));
    } catch {
      fail(`Invalid delta metadata: ${name}`);
    }
    if (!candidate || candidate.toVersion !== version || typeof candidate.fromVersion !== 'string'
      || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(candidate.fromVersion)
      || candidate.fromVersion === version || typeof candidate.path !== 'string'
      || typeof candidate.remoteName !== 'string' || !SAFE_FILE_NAME.test(candidate.remoteName)) {
      continue;
    }
    const filePath = path.resolve(candidate.path);
    if (!await exists(filePath)) fail(`Missing delta artifact: ${filePath}`);
    const [metadata, digest] = await Promise.all([stat(filePath), sha256(filePath)]);
    if (metadata.size <= 0 || (typeof candidate.sha256 === 'string' && candidate.sha256.toLowerCase() !== digest)) {
      fail(`Invalid delta artifact: ${filePath}`);
    }
    deltas.push({ fromVersion: candidate.fromVersion, filePath, remoteName: candidate.remoteName, size: metadata.size, sha256: digest });
  }
  const versions = new Set(deltas.map((delta) => delta.fromVersion));
  if (versions.size !== deltas.length) fail('Duplicate delta source versions.');
  return deltas;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const version = await readReleaseVersion();
  const outputDirectory = path.join(repoRoot, 'out', 'make');
  const zipName = `Super-win-x86-64-${version}-setup.zip`;
  const zipPath = path.join(outputDirectory, zipName);
  const setupName = 'SuperSetup.exe';
  const setupPath = path.join(outputDirectory, 'inno', setupName);
  const zipChecksumPath = `${zipPath}.sha256`;
  const setupChecksumPath = `${setupPath}.sha256`;
  const fullZipName = `Super-win-x86-64-${version}-full-setup.zip`;

  for (const filePath of [zipPath, setupPath, zipChecksumPath, setupChecksumPath]) {
    if (!await exists(filePath)) fail(`Missing release artifact: ${filePath}`);
  }
  const [zipStats, setupStats, zipHash, setupHash] = await Promise.all([
    stat(zipPath),
    stat(setupPath),
    sha256(zipPath),
    sha256(setupPath),
  ]);
  if (zipStats.size <= 0 || setupStats.size <= 100 * 1024 * 1024) fail('Installer artifacts are unexpectedly small.');
  const [declaredZipHash, declaredSetupHash] = await Promise.all([
    readFile(zipChecksumPath, 'utf8').then((text) => text.match(/[a-f0-9]{64}/iu)?.[0]?.toLowerCase()),
    readFile(setupChecksumPath, 'utf8').then((text) => text.match(/[a-f0-9]{64}/iu)?.[0]?.toLowerCase()),
  ]);
  if (declaredZipHash !== zipHash || declaredSetupHash !== setupHash) {
    fail('Release checksum sidecar does not match the local artifact. Run npm run release:checksums first.');
  }

  const deltas = await loadDeltaArtifacts(version);

  const notes = (process.env.SUPER_UPDATE_NOTES ?? `Super ${version}`).trim();
  if (notes.length > maxNotesLength) fail(`SUPER_UPDATE_NOTES exceeds ${maxNotesLength} characters.`);
  const releasePath = `releases/${version}/${fullZipName}`;
  const updateManifest = {
    version,
    notes,
    full: { name: zipName, path: releasePath, size: zipStats.size, sha256: zipHash },
    deltas: deltas.map((delta) => ({
      fromVersion: delta.fromVersion,
      asset: {
        name: zipName,
        path: `releases/${version}/${delta.remoteName}`,
        size: delta.size,
        sha256: delta.sha256,
      },
    })),
  };
  const localManifestPath = path.join(outputDirectory, 'super-update-manifest.json');
  await writeFile(localManifestPath, `${JSON.stringify(updateManifest, null, 2)}\n`, 'utf8');

  console.log(`[publish-ecs-update] Prepared ${zipName} (${zipStats.size} bytes), ${deltas.length} matching delta package(s).`);
  if (dryRun) {
    console.log(`[publish-ecs-update] Dry run manifest: ${localManifestPath}`);
    return;
  }

  const host = process.env.SUPER_UPDATE_SSH_HOST?.trim();
  if (!host) fail('SUPER_UPDATE_SSH_HOST is required unless --dry-run is used.');
  const user = process.env.SUPER_UPDATE_SSH_USER?.trim() || 'root';
  const port = parsePort(process.env.SUPER_UPDATE_SSH_PORT);
  const identityFile = process.env.SUPER_UPDATE_SSH_IDENTITY_FILE?.trim();
  if (identityFile && !await exists(identityFile)) fail('SUPER_UPDATE_SSH_IDENTITY_FILE does not exist.');
  const remoteDirectory = process.env.SUPER_UPDATE_REMOTE_DIR?.trim() || defaultRemoteDirectory;
  if (!remoteDirectoryPattern.test(remoteDirectory)) fail('SUPER_UPDATE_REMOTE_DIR must be an absolute safe POSIX path.');
  const releaseRetention = parseReleaseRetention(process.env.SUPER_UPDATE_RETAIN_RELEASES);
  const destination = `${user}@${host}`;
  const stage = `${remoteDirectory}/.staging-${version}-${randomUUID()}`;
  const releaseDirectory = `${remoteDirectory}/releases/${version}`;
  const files = [zipPath, setupPath, zipChecksumPath, setupChecksumPath, localManifestPath, ...deltas.map((delta) => delta.filePath)];
  const sshOptions = [
    '-p', port,
    '-o', 'BatchMode=yes',
    ...(identityFile ? ['-i', identityFile, '-o', 'IdentitiesOnly=yes'] : []),
  ];
  const scpOptions = [
    '-P', port,
    '-o', 'BatchMode=yes',
    ...(identityFile ? ['-i', identityFile, '-o', 'IdentitiesOnly=yes'] : []),
  ];

  await run('ssh', [...sshOptions, destination, `set -eu; mkdir -p ${quoteRemotePath(stage)}`]);
  await run('scp', [...scpOptions, ...files, `${destination}:${stage}/`]);
  const moveCommand = [
    'set -eu',
    `mkdir -p ${quoteRemotePath(releaseDirectory)}`,
    `mv ${quoteRemotePath(`${stage}/${zipName}`)} ${quoteRemotePath(`${releaseDirectory}/${fullZipName}`)}`,
    `mv ${quoteRemotePath(`${stage}/${setupName}`)} ${quoteRemotePath(`${releaseDirectory}/${setupName}`)}`,
    `mv ${quoteRemotePath(`${stage}/${zipName}.sha256`)} ${quoteRemotePath(`${releaseDirectory}/${zipName}.sha256`)}`,
    `mv ${quoteRemotePath(`${stage}/${setupName}.sha256`)} ${quoteRemotePath(`${releaseDirectory}/${setupName}.sha256`)}`,
    ...deltas.map((delta) => `mv ${quoteRemotePath(`${stage}/${path.basename(delta.filePath)}`)} ${quoteRemotePath(`${releaseDirectory}/${delta.remoteName}`)}`),
    `mv ${quoteRemotePath(`${stage}/super-update-manifest.json`)} ${quoteRemotePath(`${remoteDirectory}/latest.json`)}`,
    `rmdir ${quoteRemotePath(stage)}`,
    // Release names are generated from package.json and restricted here before deletion.
    // Keep the newest N semver directories; clients always use latest.json, so older
    // installers are not needed for normal update delivery.
    `find ${quoteRemotePath(`${remoteDirectory}/releases`)} -mindepth 1 -maxdepth 1 -type d -printf '%f\\n' | grep -E '^[0-9]+\\.[0-9]+\\.[0-9]+$' | sort -V | head -n -${releaseRetention} | while IFS= read -r oldVersion; do rm -rf ${quoteRemotePath(`${remoteDirectory}/releases`)}/"$oldVersion"; done`,
  ].join('; ');
  await run('ssh', [...sshOptions, destination, moveCommand]);
  console.log(`[publish-ecs-update] Published Super ${version} to ${destination}:${remoteDirectory}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
