import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyBuildInputs, verifyPackageProvenance } from './build-provenance.mjs';
import { isDeltaWithinSizeLimit, selectRetainedDeltaSources } from './update-retention-policy.mjs';
import { digestOwned, installerInZip, ownedPath, ownedRoot, readOwnedJson, relativeTo, safeRelative, unverified, writeAtomic, writeFreshJson } from './derivative-producer-utils.mjs';

const GUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
const SHA = /^[a-f0-9]{64}$/u;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const KINDS = new Set(['full-installer', 'full-update', 'delta', 'forge-zip', 'dmg']);
const fingerprint = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sortArtifacts = (left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0;

async function verifiedPackage(options) {
  const root = await ownedRoot(options.repoRoot);
  await verifyPackageProvenance({ repoRoot: root, receipt: options.packageReceipt, packageRoot: options.packageRoot,
    targetVersion: options.targetVersion, platform: options.platform });
  return root;
}

function receiptPath(root, buildId, derivativeId) {
  if (!GUID.test(buildId ?? '') || !GUID.test(derivativeId ?? '')) throw unverified('Invalid derivative build identity.');
  return path.join(root, 'tmp/build-provenance', buildId, 'derivatives', `${derivativeId}.json`);
}

function locatorPath(root, artifactPath) {
  const base = path.basename(artifactPath);
  if (!/^[A-Za-z0-9_. -]+$/u.test(base) || base === '.' || base === '..') throw unverified('Unsafe artifact locator basename.');
  return path.join(root, 'out/.build-provenance/artifacts', `${base}.json`);
}

function digestSchema(value) {
  if (!value || Object.keys(value).sort().join(',') !== 'bytes,path,sha256'
    || !Number.isSafeInteger(value.bytes) || value.bytes <= 0 || !SHA.test(value.sha256 ?? '')) {
    throw unverified('Invalid derivative artifact digest.');
  }
  safeRelative(value.path);
}

function binarySchema(value) {
  if (!value || Object.keys(value).sort().join(',') !== 'bytes,sha256'
    || !Number.isSafeInteger(value.bytes) || value.bytes <= 0 || !SHA.test(value.sha256 ?? '')) {
    throw unverified('Invalid derivative installer digest.');
  }
}

export function validateLegacyBaseline(value, version) {
  if (!value || value.version !== version || !VERSION.test(version ?? '') || !Array.isArray(value.files)
    || (value.runtimeVersion !== undefined && typeof value.runtimeVersion !== 'string')) throw unverified('Invalid legacy baseline version/files.');
  const seen = new Set();
  for (const file of value.files) {
    if (!file || !SHA.test(file.sha256 ?? '') || !Number.isSafeInteger(file.size) || file.size < 0) throw unverified('Unsafe legacy baseline file digest.');
    safeRelative(file.path);
    if (seen.has(file.path)) throw unverified('Duplicate legacy baseline file path.');
    seen.add(file.path);
  }
  return value;
}

function validateDerivative(value, options) {
  const allowed = new Set(['schemaVersion', 'derivativeId', 'buildId', 'targetVersion', 'platform', 'kind', 'packageFingerprint',
    'inputFingerprint', 'artifact', 'installer', 'fromVersion', 'baseline']);
  if (!value || Object.keys(value).some((key) => !allowed.has(key)) || value.schemaVersion !== 1
    || !GUID.test(value.derivativeId ?? '') || value.buildId !== options.packageReceipt.buildId
    || value.targetVersion !== options.targetVersion || value.platform !== options.platform || !KINDS.has(value.kind)
    || value.packageFingerprint !== options.packageReceipt.package.fingerprint || value.inputFingerprint !== options.packageReceipt.inputFingerprint) {
    throw unverified('Derivative receipt build/target/platform/package identity differs.');
  }
  digestSchema(value.artifact);
  const base = path.basename(value.artifact.path);
  if (value.kind === 'full-installer' && (value.platform !== 'win32-x64' || base !== 'SuperSetup.exe')) throw unverified('Invalid full installer artifact.');
  if (value.kind === 'full-update' && (value.platform !== 'win32-x64' || base !== `Super-win-x86-64-${value.targetVersion}-setup.zip`)) throw unverified('Invalid full update artifact.');
  if (value.kind === 'delta') {
    if (value.platform !== 'win32-x64' || !VERSION.test(value.fromVersion ?? '')
      || !selectRetainedDeltaSources([value.fromVersion], value.targetVersion).includes(value.fromVersion)
      || base !== `Super-win-x86-64-${value.fromVersion}-to-${value.targetVersion}-delta.zip`) throw unverified('Invalid delta source/target artifact.');
    digestSchema(value.baseline);
  } else if (value.fromVersion !== undefined || value.baseline !== undefined) throw unverified('Non-delta receipt contains source baseline fields.');
  if (value.kind === 'full-update' || value.kind === 'delta') binarySchema(value.installer);
  else if (value.installer !== undefined) throw unverified('Non-updater derivative contains installer fields.');
  if (value.kind === 'forge-zip' && path.extname(base).toLowerCase() !== '.zip') throw unverified('Invalid Forge ZIP artifact.');
  if (value.kind === 'dmg' && (value.platform !== 'darwin-arm64' || path.extname(base).toLowerCase() !== '.dmg')) throw unverified('Invalid DMG artifact.');
  return value;
}

async function verifyDerivative(root, receipt, options) {
  validateDerivative(receipt, options);
  if (JSON.stringify(await digestOwned(root, path.join(root, receipt.artifact.path))) !== JSON.stringify(receipt.artifact)) {
    throw unverified('Derivative artifact hash changed.');
  }
  if (receipt.installer) await installerInZip(root, path.join(root, receipt.artifact.path), receipt.installer);
  if (receipt.baseline) {
    const filename = path.join(root, receipt.baseline.path);
    if (JSON.stringify(await digestOwned(root, filename)) !== JSON.stringify(receipt.baseline)) throw unverified('Immutable source baseline hash changed.');
    validateLegacyBaseline(await readOwnedJson(root, filename), receipt.fromVersion);
  }
  return receipt;
}

/** Producer association, not a signature and never authority to compile an old package. */
export async function bindDerivativeProvenance(options) {
  const root = await verifiedPackage(options);
  const artifactPath = await ownedPath(root, options.artifactPath);
  const artifact = await digestOwned(root, artifactPath);
  const relativePackage = relativeTo(root, options.packageRoot);
  if (artifact.path.startsWith(`${relativePackage}/`) || /^(?:src|extension|scripts|assets|resources)\//u.test(artifact.path)) {
    throw unverified('Derived artifact must be outside payload/immutable input roots.');
  }
  const output = receiptPath(root, options.packageReceipt.buildId, options.derivativeId);
  const locator = locatorPath(root, artifactPath);
  // Validate BOTH destinations before creating either metadata tree.
  await ownedPath(root, output, { missing: true });
  await ownedPath(root, locator, { missing: true });
  const receipt = { schemaVersion: 1, derivativeId: options.derivativeId, buildId: options.packageReceipt.buildId,
    targetVersion: options.targetVersion, platform: options.platform, kind: options.artifactKind,
    packageFingerprint: options.packageReceipt.package.fingerprint, inputFingerprint: options.packageReceipt.inputFingerprint, artifact };
  if (options.artifactKind === 'full-update' || options.artifactKind === 'delta') {
    const binary = await digestOwned(root, options.installerPath);
    receipt.installer = await installerInZip(root, artifactPath, binary);
  }
  if (options.artifactKind === 'delta') {
    receipt.fromVersion = options.fromVersion;
    receipt.baseline = await digestOwned(root, options.baselinePath);
    validateLegacyBaseline(await readOwnedJson(root, options.baselinePath), options.fromVersion);
  }
  validateDerivative(receipt, options);
  await verifiedPackage(options);
  await verifyDerivative(root, receipt, options);
  await verifyBuildInputs({ repoRoot: root, receipt: options.packageReceipt });
  await writeFreshJson(root, output, receipt);
  await writeAtomic(root, locator, `${JSON.stringify({ schemaVersion: 1, buildId: receipt.buildId, derivativeId: receipt.derivativeId,
    receiptPath: relativeTo(root, output) }, null, 2)}\n`);
  return { receipt, receiptPath: output };
}

async function readDerivative(root, filename, options) {
  const receipt = await readOwnedJson(root, filename);
  if (path.resolve(filename) !== receiptPath(root, options.packageReceipt.buildId, receipt.derivativeId)) {
    throw unverified('Derivative receipt path does not belong to the exact build.');
  }
  return await verifyDerivative(root, receipt, options);
}

export async function loadArtifactDerivative(options) {
  const root = await verifiedPackage(options);
  const artifactPath = await ownedPath(root, options.artifactPath);
  const pointer = await readOwnedJson(root, locatorPath(root, artifactPath));
  if (!pointer || pointer.schemaVersion !== 1 || Object.keys(pointer).sort().join(',') !== 'buildId,derivativeId,receiptPath,schemaVersion'
    || pointer.buildId !== options.packageReceipt.buildId || !GUID.test(pointer.derivativeId ?? '')
    || safeRelative(pointer.receiptPath) !== relativeTo(root, receiptPath(root, pointer.buildId, pointer.derivativeId))) {
    throw unverified('Invalid artifact locator identity/path.');
  }
  const receipt = await readDerivative(root, path.join(root, pointer.receiptPath), options);
  if (receipt.artifact.path !== relativeTo(root, artifactPath)) throw unverified('Artifact locator belongs to another exact output.');
  return receipt;
}

async function candidates(root, options) {
  if (options.derivativeReceiptPaths !== undefined) {
    if (!Array.isArray(options.derivativeReceiptPaths)) throw unverified('Explicit derivative receipt paths must be an array.');
    return options.derivativeReceiptPaths;
  }
  const directory = path.join(root, 'out/.build-provenance/artifacts');
  let names;
  try { await ownedPath(root, directory, { directory: true }); names = await readdir(directory); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const result = [];
  for (const name of names.filter((value) => value.endsWith('.json')).sort()) {
    const pointer = await readOwnedJson(root, path.join(directory, name));
    if (!pointer || pointer.schemaVersion !== 1 || Object.keys(pointer).sort().join(',') !== 'buildId,derivativeId,receiptPath,schemaVersion'
      || !GUID.test(pointer.buildId ?? '') || !GUID.test(pointer.derivativeId ?? '')
      || safeRelative(pointer.receiptPath) !== relativeTo(root, receiptPath(root, pointer.buildId, pointer.derivativeId))) {
      throw unverified('Invalid artifact candidate locator schema/identity/path.');
    }
    // Historical/other-platform pointers are not current candidates. They are
    // retained untouched, not promoted by the current package version.
    if (pointer.buildId !== options.packageReceipt.buildId) continue;
    const receipt = await readDerivative(root, path.join(root, pointer.receiptPath), options);
    if (name !== `${path.basename(receipt.artifact.path)}.json`) throw unverified('Artifact locator points to another output basename.');
    result.push(path.join(root, pointer.receiptPath));
  }
  return result;
}

async function retainedSources(root, options) {
  const directory = options.baselineDirectory ?? path.join(root, 'release/baselines');
  let names;
  try { await ownedPath(root, directory, { directory: true }); names = await readdir(directory); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const versions = [];
  for (const name of names.filter((value) => value.endsWith('.json'))) {
    const version = name.slice(0, -5);
    validateLegacyBaseline(await readOwnedJson(root, path.join(directory, name)), version);
    versions.push(version);
  }
  return selectRetainedDeltaSources(versions, options.targetVersion);
}

export async function createArtifactManifest(options) {
  const root = await verifiedPackage(options);
  const receipts = [];
  const seen = new Set();
  for (const filename of await candidates(root, options)) {
    const receipt = await readDerivative(root, filename, options);
    if (seen.has(receipt.artifact.path)) throw unverified('Duplicate artifact/receipt in declared official set.');
    seen.add(receipt.artifact.path);
    if (options.platform === 'win32-x64' && !['full-installer', 'full-update', 'delta'].includes(receipt.kind)) continue;
    receipts.push(receipt);
  }
  if (options.platform === 'win32-x64') {
    const full = receipts.filter((value) => value.kind === 'full-installer');
    const updates = receipts.filter((value) => value.kind === 'full-update');
    if (full.length !== 1 || updates.length !== 1) throw unverified('Exactly one full installer and full ZIP receipt are required.');
    const binary = { bytes: full[0].artifact.bytes, sha256: full[0].artifact.sha256 };
    if (JSON.stringify(binary) !== JSON.stringify(updates[0].installer)) throw unverified('Full ZIP installer does not match the official full binary.');
    const sources = await retainedSources(root, options);
    for (const delta of receipts.filter((value) => value.kind === 'delta')) {
      if (!sources.includes(delta.fromVersion) || !isDeltaWithinSizeLimit(delta.artifact.bytes, updates[0].artifact.bytes)) {
        throw unverified('Declared delta violates retained source/size ratio policy.');
      }
    }
  } else if (options.platform === 'darwin-arm64') {
    if (receipts.some((value) => !['forge-zip', 'dmg'].includes(value.kind))
      || receipts.filter((value) => value.kind === 'forge-zip').length !== 1 || receipts.filter((value) => value.kind === 'dmg').length !== 1) {
      throw unverified('Darwin official set requires its actual configured maker ZIP and DMG receipts.');
    }
  } else throw unverified('Unsupported artifact target platform.');
  const artifacts = receipts.map((receipt) => ({ ...receipt.artifact, kind: receipt.kind, remoteName: path.basename(receipt.artifact.path),
    derivativeId: receipt.derivativeId, ...(receipt.fromVersion === undefined ? {} : { fromVersion: receipt.fromVersion }) })).sort(sortArtifacts);
  if (new Set(artifacts.map((value) => value.remoteName)).size !== artifacts.length) throw unverified('Duplicate official attachment name.');
  await verifiedPackage(options);
  return { schemaVersion: 1, buildId: options.packageReceipt.buildId, targetVersion: options.targetVersion, platform: options.platform,
    packageFingerprint: options.packageReceipt.package.fingerprint, artifacts, fingerprint: fingerprint(artifacts) };
}

export async function verifyArtifactManifest(options) {
  const manifest = options.manifest;
  if (!manifest || Object.keys(manifest).sort().join(',') !== 'artifacts,buildId,fingerprint,packageFingerprint,platform,schemaVersion,targetVersion'
    || manifest.schemaVersion !== 1 || manifest.buildId !== options.packageReceipt.buildId || manifest.targetVersion !== options.targetVersion
    || manifest.platform !== options.platform || manifest.packageFingerprint !== options.packageReceipt.package.fingerprint
    || !Array.isArray(manifest.artifacts) || fingerprint(manifest.artifacts) !== manifest.fingerprint) throw unverified('Invalid artifact manifest identity/fingerprint.');
  const root = await ownedRoot(options.repoRoot);
  const expected = await createArtifactManifest({ ...options, derivativeReceiptPaths: manifest.artifacts.map((value) => receiptPath(root, manifest.buildId, value.derivativeId)) });
  if (JSON.stringify(expected) !== JSON.stringify(manifest)) throw unverified('Artifact manifest differs from exact verified producer set.');
}

export async function writeArtifactChecksums(options) {
  await verifyArtifactManifest(options);
  const root = await ownedRoot(options.repoRoot);
  const checksumPath = await ownedPath(root, options.outputPath, { missing: true });
  const sidecars = options.manifest.artifacts.map((value) => path.join(root, `${value.path}.sha256`));
  const manifestPath = path.join(path.dirname(checksumPath), `ARTIFACTS-${options.platform}.json`);
  for (const filename of [...sidecars, manifestPath]) await ownedPath(root, filename, { missing: true });
  await verifyArtifactManifest(options);
  const header = `# Super v${options.targetVersion} (${options.platform})\n`;
  const lines = options.manifest.artifacts.map((value) => `${value.sha256}  ${value.path}`);
  await writeAtomic(root, checksumPath, `${header}${lines.join('\n')}\n`);
  for (const [index, filename] of sidecars.entries()) await writeAtomic(root, filename, `${header}${lines[index]}\n`);
  await writeAtomic(root, manifestPath, `${JSON.stringify(options.manifest, null, 2)}\n`);
  return { checksumPath, sidecars };
}

async function main() {
  const argument = (name) => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
  if (!process.argv.includes('--dry-run')) throw unverified('Artifact CLI is read-only; pass --dry-run.');
  const root = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
  const targetVersion = argument('--target-version');
  const platform = argument('--platform');
  const packageRoot = path.join(root, 'out', `Super-${platform}`);
  const { loadPackageBuildProvenance } = await import('./build-with-provenance.mjs');
  const packageReceipt = await loadPackageBuildProvenance({ repoRoot: root, packageRoot, targetVersion, platform });
  console.log(JSON.stringify(await createArtifactManifest({ repoRoot: root, packageRoot, packageReceipt, targetVersion, platform }), null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
