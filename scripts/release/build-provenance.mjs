import { createHash } from 'node:crypto';
import { lstat, mkdir, open, readdir, readFile, readlink, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { mapBounded } from './bounded-map.mjs';

const SHA256 = /^[a-f0-9]{64}$/u;
const HEAD = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const BUILD_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const PLATFORMS = new Set(['win32-x64', 'darwin-arm64']);
const INPUT_DIRECTORIES = new Set(['src', 'extension', 'scripts', 'assets', 'resources']);
const TOOL_KEYS = new Set(['node', 'electron', 'forge', 'inno']);
const CONFIGURATION_KEYS = new Set(['asar', 'prune', 'vcpkgEnabled']);
// Conservative default: overlap filesystem latency without multiplying compiler
// processes or caching any proof. At most four guarded streams per verification.
const HASH_CONCURRENCY = 4;
const comparePaths = (left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
const fingerprint = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const record = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

function unverified(message) {
  const error = new Error(`UNVERIFIED: ${message}`);
  error.code = 'BUILD_PROVENANCE_UNVERIFIED';
  return error;
}

function relativePath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096 || value.includes('\\')
    || value.includes('\0') || /^[a-z]:/iu.test(value) || value.startsWith('/')
    || value.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    throw unverified('Unsafe relative receipt path.');
  }
  return value;
}

function contained(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function checkedRoot(input) {
  if (typeof input !== 'string' || !path.isAbsolute(input)) throw unverified('An absolute owned root is required.');
  const root = path.resolve(input);
  const info = await lstat(root);
  if (info.isSymbolicLink() || !info.isDirectory() || path.resolve(await realpath(root)) !== root) {
    throw unverified('Root path contains a link or redirected parent.');
  }
  return root;
}

async function checkedPath(root, relative) {
  relativePath(relative);
  let cursor = root;
  const parts = relative.split('/');
  for (const [index, part] of parts.entries()) {
    cursor = path.join(cursor, part);
    const info = await lstat(cursor);
    if (info.isSymbolicLink() || (index < parts.length - 1 && !info.isDirectory())) {
      throw unverified(`Linked or non-directory production path: ${relative}`);
    }
  }
  if (!contained(root, path.resolve(await realpath(cursor)))) throw unverified(`Path escaped its owned root: ${relative}`);
  return cursor;
}

async function checkedExistingParents(root, directory) {
  const relative = path.relative(root, directory).replaceAll('\\', '/');
  if (relative === '') return;
  relativePath(relative);
  let cursor = root;
  for (const part of relative.split('/')) {
    cursor = path.join(cursor, part);
    let info;
    try { info = await lstat(cursor); }
    catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    if (info.isSymbolicLink() || !info.isDirectory() || path.resolve(await realpath(cursor)) !== cursor) {
      throw unverified('Receipt parent contains a link or redirected/non-directory ancestor.');
    }
  }
}

/** Hash one regular file from a stream; do not load runtime binaries into RAM. */
async function digestFile(root, relative) {
  const file = await checkedPath(root, relative);
  const handle = await open(file, 'r');
  try {
    const before = await handle.stat();
    if (!before.isFile()) throw unverified(`Non-regular input or package file: ${relative}`);
    const hash = createHash('sha256');
    let bytes = 0;
    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      hash.update(chunk);
      bytes += chunk.length;
    }
    const after = await handle.stat();
    const current = await lstat(await checkedPath(root, relative));
    if (bytes !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs
      || after.ctimeMs !== before.ctimeMs || current.dev !== before.dev || current.ino !== before.ino
      || current.size !== before.size || current.mtimeMs !== before.mtimeMs || current.ctimeMs !== before.ctimeMs) {
      throw unverified(`File changed during stream hashing: ${relative}`);
    }
    return { path: relative, bytes, sha256: hash.digest('hex') };
  } finally {
    await handle.close();
  }
}

async function jsonAt(root, relative) {
  const file = await checkedPath(root, relative);
  if (!(await lstat(file)).isFile()) throw unverified(`JSON path is not regular: ${relative}`);
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { throw unverified(`Invalid JSON ${relative}: ${error.message}`); }
}

function rootInputFile(name) {
  return /^(?:package\.json|package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|tsconfig(?:\.[^/]+)?\.json|(?:vite(?:\.[^/]+)?|vitest|forge|eslint|postcss|tailwind)\.config\.[cm]?[jt]s|forge\.env\.d\.ts|[^/]+\.html|LICENSE(?:\.[^/]+)?|COPYING(?:\.[^/]+)?|NOTICE(?:\.[^/]+)?|THIRD_PARTY_NOTICES\.md)$/iu.test(name);
}

function inputPath(relative) {
  return INPUT_DIRECTORIES.has(relative.split('/')[0]) || (!relative.includes('/') && rootInputFile(relative));
}

async function walk(root, relative = '') {
  const directory = relative === '' ? root : await checkedPath(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const next = relative === '' ? entry.name : `${relative}/${entry.name}`;
    // Top-level selection is explicit; it does not use git ls-files and so
    // cannot omit untracked production files or unknown types within a root.
    if (relative === '' && !inputPath(next)) continue;
    if (entry.isSymbolicLink()) throw unverified(`Linked production input: ${next}`);
    if (entry.isDirectory()) files.push(...await walk(root, next));
    else if (entry.isFile()) files.push(next);
    else throw unverified(`Non-regular production input: ${next}`);
  }
  return files.sort();
}

function relativeLinkTarget(target) {
  if (typeof target !== 'string' || target.length === 0 || target.length > 4096 || target.includes('\0')
    || path.posix.isAbsolute(target) || path.win32.isAbsolute(target) || /^[a-z]:/iu.test(target)) {
    throw unverified('Package symlink target must be a relative path.');
  }
  return target;
}

async function packageLink(root, relative) {
  relativePath(relative);
  const directory = path.dirname(relative).replaceAll('\\', '/');
  const parent = directory === '.' ? root : await checkedPath(root, directory);
  const filename = path.join(parent, path.basename(relative));
  try {
    const before = await lstat(filename);
    if (!before.isSymbolicLink()) throw unverified(`Package symlink was replaced: ${relative}`);
    const target = relativeLinkTarget(await readlink(filename));
    if (!contained(root, path.resolve(parent, target))) throw unverified(`Package symlink target escaped its root: ${relative}`);
    // Resolve chains to detect escapes, missing targets and symlink loops, but
    // never walk the target directory. Regular targets are hashed once through
    // their actual non-linked entries by the ordinary streaming file path.
    const resolved = path.resolve(await realpath(filename));
    if (!contained(root, resolved)) throw unverified(`Package symlink chain escaped its root: ${relative}`);
    const destination = await lstat(resolved);
    if (!destination.isFile() && !destination.isDirectory()) throw unverified(`Non-regular package symlink target: ${relative}`);
    if (destination.isDirectory() && (resolved === parent || contained(resolved, parent))) {
      throw unverified(`Recursive package directory symlink loop: ${relative}`);
    }
    const after = await lstat(filename);
    if (!after.isSymbolicLink() || after.dev !== before.dev || after.ino !== before.ino
      || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs
      || await readlink(filename) !== target || path.resolve(await realpath(filename)) !== resolved) {
      throw unverified(`Package symlink changed while verifying: ${relative}`);
    }
    return { path: relative, kind: 'symlink', target };
  } catch (error) {
    if (error.code === 'BUILD_PROVENANCE_UNVERIFIED') throw error;
    throw unverified(`Unresolvable/broken/loop package symlink target ${relative}: ${error.message}`);
  }
}

async function walkPackage(root, platform, relative = '') {
  const directory = relative === '' ? root : await checkedPath(root, relative);
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const next = relative === '' ? entry.name : `${relative}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      if (platform !== 'darwin-arm64') throw unverified(`Linked package payload: ${next}`);
      files.push(await packageLink(root, next));
    } else if (entry.isDirectory()) files.push(...await walkPackage(root, platform, next));
    else if (entry.isFile()) files.push({ path: next });
    else throw unverified(`Non-regular package payload: ${next}`);
  }
  return files.sort(comparePaths);
}

function mediaPaths(platform) {
  const suffix = platform === 'win32-x64' ? '.exe' : '';
  return {
    manifest: `resources/media-binaries/${platform}/manifest.json`,
    acquisition: `resources/media-binaries/${platform}/acquisition.json`,
    licensePrefix: `media-binaries/${platform}/licenses/`,
    executables: [`ffmpeg/${platform}/ffmpeg${suffix}`, `ffmpeg/${platform}/ffprobe${suffix}`, `oiio/${platform}/oiiotool${suffix}`],
  };
}

function parseMediaManifest(manifest, platform) {
  const known = mediaPaths(platform);
  if (!record(manifest) || manifest.schemaVersion !== 1 || manifest.platform !== platform || !Array.isArray(manifest.files)) {
    throw unverified('Invalid media manifest schema/platform.');
  }
  const seen = new Set();
  const files = manifest.files.map((file) => {
    if (!record(file) || !SHA256.test(file.sha256 ?? '')) throw unverified('Invalid media file checksum.');
    const relative = relativePath(file.path);
    const allowed = file.role === 'executable' ? known.executables.includes(relative)
      : file.role === 'license' && relative.startsWith(known.licensePrefix);
    if (!allowed || seen.has(relative)) throw unverified(`Media manifest has an undeclared/duplicate generated path: ${relative}`);
    seen.add(relative);
    return { path: `resources/${relative}`, role: file.role, sha256: file.sha256 };
  });
  for (const executable of known.executables) {
    if (!seen.has(executable)) throw unverified(`Media manifest is missing declared executable ${executable}.`);
  }
  return files;
}

function parseBundle(lock, platform) {
  const bundle = lock?.bundles?.[platform];
  if (!record(lock) || lock.schemaVersion !== 1 || !record(bundle) || bundle.status !== 'ready'
    || !SHA256.test(bundle.sha256 ?? '') || !SHA256.test(bundle.manifestSha256 ?? '')
    || !Number.isSafeInteger(bundle.size) || bundle.size <= 0) throw unverified('Media bundle lock is not ready/trusted.');
  let url;
  try { url = new URL(bundle.url); }
  catch { throw unverified('Invalid locked media URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw unverified('Unsafe locked media URL.');
  return { url: bundle.url, sha256: bundle.sha256, size: bundle.size, manifestSha256: bundle.manifestSha256 };
}

async function captureMedia(root, platform) {
  const paths = mediaPaths(platform);
  const bundle = parseBundle(await jsonAt(root, 'resources/media-binaries/bundle-lock.json'), platform);
  const sourceLock = await digestFile(root, 'resources/media-binaries/source-lock.json');
  let manifestPresent = false;
  try {
    const manifestHash = await digestFile(root, paths.manifest);
    if (manifestHash.sha256 !== bundle.manifestSha256) throw unverified('Existing media manifest does not match captured bundle lock.');
    parseMediaManifest(await jsonAt(root, paths.manifest), platform);
    manifestPresent = true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  // No ensure/download happens here. A clean checkout can lack its platform
  // manifest; only the previously pinned bundle digest may authorize it later.
  return { platform, bundle, sourceLockSha256: sourceLock.sha256, manifestPresent };
}

async function captureInputs(root, platform) {
  const generated = new Set(mediaPaths(platform).executables.map((relative) => `resources/${relative}`));
  generated.add(mediaPaths(platform).acquisition);
  const files = (await walk(root)).filter((relative) => !generated.has(relative));
  const inputs = await mapBounded(files, HASH_CONCURRENCY, (relative) => digestFile(root, relative));
  return inputs.sort(comparePaths);
}

function safeTools(tools) {
  if (!record(tools)) throw unverified('Missing builder/tool versions.');
  return Object.fromEntries(Object.entries(tools).filter(([key]) => TOOL_KEYS.has(key)).map(([key, value]) => {
    if (typeof value !== 'string' || !/^[A-Za-z0-9._+-]{1,128}$/u.test(value)) throw unverified(`Invalid tool version: ${key}`);
    return [key, value];
  }));
}

function safeConfiguration(configuration = {}) {
  if (!record(configuration)) throw unverified('Invalid allowlisted build configuration.');
  return Object.fromEntries(Object.entries(configuration).filter(([key]) => CONFIGURATION_KEYS.has(key)).map(([key, value]) => {
    if (typeof value !== 'boolean') throw unverified(`Build configuration ${key} must be boolean.`);
    return [key, value];
  }));
}

function validateIdentity(value) {
  if (!record(value) || !BUILD_ID.test(value.buildId ?? '') || !HEAD.test(value.sourceHead ?? '')
    || !VERSION.test(value.targetVersion ?? '') || !PLATFORMS.has(value.platform)
    || typeof value.builderVersion !== 'string' || !/^[A-Za-z0-9._+-]{1,128}$/u.test(value.builderVersion)) {
    throw unverified('Invalid receipt build identity/head/version/platform.');
  }
}

function validateFiles(files) {
  if (!Array.isArray(files)) throw unverified('Invalid receipt file list.');
  const seen = new Set();
  for (const file of files) {
    if (!record(file) || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || !SHA256.test(file.sha256 ?? '')) {
      throw unverified('Invalid receipt file digest.');
    }
    if (Object.keys(file).some((key) => !['path', 'bytes', 'sha256'].includes(key))) throw unverified('Receipt file has non-allowlisted fields.');
    relativePath(file.path);
    if (seen.has(file.path)) throw unverified('Duplicate receipt file path.');
    seen.add(file.path);
  }
  if (JSON.stringify([...files].sort(comparePaths)) !== JSON.stringify(files)) throw unverified('Unsorted receipt file list.');
}

function validatePackageFiles(files, platform) {
  if (!Array.isArray(files)) throw unverified('Invalid package receipt file list.');
  const seen = new Set();
  for (const file of files) {
    if (record(file) && file.kind === 'symlink') {
      if (platform !== 'darwin-arm64' || Object.keys(file).sort().join(',') !== 'kind,path,target') {
        throw unverified('Invalid or non-darwin package symlink receipt.');
      }
      relativePath(file.path);
      relativeLinkTarget(file.target);
    } else {
      validateFiles([file]);
    }
    if (seen.has(file.path)) throw unverified('Duplicate package receipt file path.');
    seen.add(file.path);
  }
  if (JSON.stringify([...files].sort(comparePaths)) !== JSON.stringify(files)) throw unverified('Unsorted package receipt file list.');
}

function validateReceipt(receipt) {
  validateIdentity(receipt);
  const allowed = new Set(['schemaVersion', 'buildId', 'sourceHead', 'targetVersion', 'platform', 'builderVersion', 'toolVersions',
    'configuration', 'phase', 'inputs', 'media', 'dirtyPaths', 'inputFingerprint', 'dirtyFingerprint', 'package']);
  if (Object.keys(receipt).some((key) => !allowed.has(key))) throw unverified('Receipt contains non-allowlisted fields.');
  if (receipt.schemaVersion !== 1 || !['inputs', 'package'].includes(receipt.phase)) throw unverified('Invalid receipt schema/phase.');
  validateFiles(receipt.inputs);
  if (receipt.inputs.some((file) => !inputPath(file.path)) || fingerprint(receipt.inputs) !== receipt.inputFingerprint) {
    throw unverified('Invalid immutable input fingerprint/path.');
  }
  if (!SHA256.test(receipt.dirtyFingerprint ?? '') || !Array.isArray(receipt.dirtyPaths)) throw unverified('Invalid dirty fingerprint.');
  for (const relative of receipt.dirtyPaths) relativePath(relative);
  if (fingerprint({ sourceHead: receipt.sourceHead, dirtyPaths: receipt.dirtyPaths, inputs: receipt.inputs }) !== receipt.dirtyFingerprint) {
    throw unverified('Dirty fingerprint does not bind the input snapshot.');
  }
  if (Object.keys(receipt.toolVersions ?? {}).some((key) => !TOOL_KEYS.has(key))
    || Object.keys(receipt.configuration ?? {}).some((key) => !CONFIGURATION_KEYS.has(key))) {
    throw unverified('Receipt contains non-allowlisted tool/configuration fields.');
  }
  safeTools(receipt.toolVersions);
  safeConfiguration(receipt.configuration);
  if (!record(receipt.media) || receipt.media.platform !== receipt.platform || !SHA256.test(receipt.media.sourceLockSha256 ?? '')
    || typeof receipt.media.manifestPresent !== 'boolean'
    || Object.keys(receipt.media).some((key) => !['platform', 'bundle', 'sourceLockSha256', 'manifestPresent'].includes(key))) {
    throw unverified('Invalid captured media provenance.');
  }
  parseBundle({ schemaVersion: 1, bundles: { [receipt.platform]: { status: 'ready', ...receipt.media.bundle } } }, receipt.platform);
  return receipt;
}

/** Pure snapshot: caller supplies a real Git HEAD; no Git subprocess, ensure or network is run. */
export async function captureBuildProvenance(options) {
  validateIdentity(options);
  const root = await checkedRoot(options.repoRoot);
  const packageManifest = await jsonAt(root, 'package.json');
  if (packageManifest.version !== options.targetVersion) throw unverified('Source package version does not match target version.');
  const media = await captureMedia(root, options.platform);
  const inputs = await captureInputs(root, options.platform);
  const dirtyPaths = [...new Set((options.dirtyPaths ?? []).map(relativePath).filter(inputPath))].sort();
  return {
    schemaVersion: 1, buildId: options.buildId, sourceHead: options.sourceHead,
    targetVersion: options.targetVersion, platform: options.platform,
    builderVersion: options.builderVersion, toolVersions: safeTools(options.toolVersions),
    configuration: safeConfiguration(options.configuration), phase: 'inputs', inputs, media, dirtyPaths,
    inputFingerprint: fingerprint(inputs), dirtyFingerprint: fingerprint({ sourceHead: options.sourceHead, dirtyPaths, inputs }),
  };
}

async function verifiedMedia(root, receipt) {
  const paths = mediaPaths(receipt.platform);
  const manifestHash = await digestFile(root, paths.manifest);
  if (manifestHash.sha256 !== receipt.media.bundle.manifestSha256) throw unverified('Generated media manifest hash differs from captured lock.');
  const files = parseMediaManifest(await jsonAt(root, paths.manifest), receipt.platform);
  for (const file of files) {
    if ((await digestFile(root, file.path)).sha256 !== file.sha256) throw unverified(`Media lock checksum mismatch: ${file.path}`);
  }
  const acquisition = await jsonAt(root, paths.acquisition);
  const expected = { schemaVersion: 1, platform: receipt.platform, url: receipt.media.bundle.url,
    archiveSha256: receipt.media.bundle.sha256, manifestSha256: receipt.media.bundle.manifestSha256 };
  if (!record(acquisition) || Object.keys(acquisition).length !== Object.keys(expected).length
    || Object.entries(expected).some(([key, value]) => acquisition[key] !== value)) {
    throw unverified('Generated media acquisition provenance does not match captured lock.');
  }
  return files;
}

/** Read-only before producers: incomplete generated media is not a final package proof. */
export async function verifyImmutableBuildInputs({ repoRoot, receipt }) {
  validateReceipt(receipt);
  const root = await checkedRoot(repoRoot);
  const current = await captureInputs(root, receipt.platform);
  const original = new Map(receipt.inputs.map((file) => [file.path, file]));
  const currentMap = new Map(current.map((file) => [file.path, file]));
  // Verify old immutable members before accepting any newly generated member.
  for (const file of receipt.inputs) {
    if (JSON.stringify(currentMap.get(file.path)) !== JSON.stringify(file)) throw unverified(`Immutable input drift/changed: ${file.path}`);
  }
  const actualBundle = parseBundle(await jsonAt(root, 'resources/media-binaries/bundle-lock.json'), receipt.platform);
  const actualSourceLock = await digestFile(root, 'resources/media-binaries/source-lock.json');
  if (JSON.stringify(actualBundle) !== JSON.stringify(receipt.media.bundle) || actualSourceLock.sha256 !== receipt.media.sourceLockSha256) {
    throw unverified('Captured media anchors do not match immutable lock inputs.');
  }
  const manifestPath = mediaPaths(receipt.platform).manifest;
  const allowedNew = new Set();
  const manifestHash = currentMap.get(manifestPath);
  if (manifestHash) {
    if (manifestHash.sha256 !== receipt.media.bundle.manifestSha256) {
      throw unverified('Generated media manifest hash differs from captured lock.');
    }
    const mediaFiles = parseMediaManifest(await jsonAt(root, manifestPath), receipt.platform);
    for (const file of mediaFiles) {
      allowedNew.add(file.path);
      const present = currentMap.get(file.path);
      if (present && present.sha256 !== file.sha256) throw unverified(`Media lock checksum mismatch: ${file.path}`);
    }
    if (!receipt.media.manifestPresent) allowedNew.add(manifestPath);
  }
  for (const file of current) {
    if (!original.has(file.path) && !allowedNew.has(file.path)) throw unverified(`Undeclared immutable resource addition: ${file.path}`);
  }
}

/** Full consuming/build proof: immutable inputs AND every generated media member. */
export async function verifyBuildInputs({ repoRoot, receipt }) {
  await verifyImmutableBuildInputs({ repoRoot, receipt });
  await verifiedMedia(await checkedRoot(repoRoot), receipt);
}

async function packageLocation(repoRoot, packageRoot) {
  const root = await checkedRoot(repoRoot);
  const packaged = await checkedRoot(packageRoot);
  if (!contained(root, packaged)) throw unverified('Package path escaped the owned repository root.');
  return { root, packaged, relative: path.relative(root, packaged).replaceAll('\\', '/') };
}

async function packageVersion(root, platform) {
  const manifestPath = platform === 'win32-x64' ? 'resources/app/package.json'
    : 'Super.app/Contents/Resources/app/package.json';
  const manifest = await jsonAt(root, manifestPath);
  return manifest.version;
}

async function inspectPayload(root, platform, concurrency) {
  const started = performance.now();
  const members = await walkPackage(root, platform);
  const walked = performance.now();
  const files = await mapBounded(members, concurrency, (member) =>
    member.kind === 'symlink' ? member : digestFile(root, member.path));
  const hashed = performance.now();
  // Linking must still be safe/current after streaming the regular payloads.
  for (const member of files) {
    if (member.kind === 'symlink' && JSON.stringify(await packageLink(root, member.path)) !== JSON.stringify(member)) {
      throw unverified(`Package symlink changed during payload hashing: ${member.path}`);
    }
  }
  files.sort(comparePaths);
  const finished = performance.now();
  return {
    files,
    metrics: {
      concurrency, fileCount: files.filter((member) => member.kind !== 'symlink').length,
      linkCount: files.filter((member) => member.kind === 'symlink').length,
      bytes: files.reduce((total, member) => total + (member.bytes ?? 0), 0),
      walkMs: walked - started, hashMs: hashed - walked,
      finalizeMs: finished - hashed, totalMs: finished - started,
    },
  };
}

async function packageFiles(root, platform) {
  return (await inspectPayload(root, platform, HASH_CONCURRENCY)).files;
}

/**
 * Read-only performance inspection, NOT build provenance. Does not verify
 * source inputs, produce a receipt, reuse hashes or authorize any derivative.
 */
export async function inspectPackagePayload({ repoRoot, packageRoot, platform, concurrency = HASH_CONCURRENCY }) {
  if (!PLATFORMS.has(platform)) throw unverified('Unsupported payload inspection platform.');
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    throw unverified('Payload inspection concurrency must be an integer from 1 to 8.');
  }
  const location = await packageLocation(repoRoot, packageRoot);
  return inspectPayload(location.packaged, platform, concurrency);
}

function assertTarget(receipt, targetVersion, platform) {
  if (targetVersion !== receipt.targetVersion || platform !== receipt.platform) throw unverified('Target version/platform does not match receipt.');
}

/** Bind only after rebuild/sign/copy gates. Sidecar is deliberately outside its payload. */
export async function bindPackageProvenance({ repoRoot, receipt, packageRoot, receiptPath, targetVersion, platform }) {
  validateReceipt(receipt);
  if (receipt.phase !== 'inputs') throw unverified('Only a fresh inputs receipt may bind a final package.');
  assertTarget(receipt, targetVersion, platform);
  await verifyBuildInputs({ repoRoot, receipt });
  const location = await packageLocation(repoRoot, packageRoot);
  if (typeof receiptPath !== 'string' || !path.isAbsolute(receiptPath)) throw unverified('An absolute receipt sidecar path is required.');
  const output = path.resolve(receiptPath);
  const relativeOutput = path.relative(location.root, output).replaceAll('\\', '/');
  if (!contained(location.root, output) || output === location.packaged || contained(location.packaged, output)
    || inputPath(relativeOutput)) throw unverified('Receipt sidecar must be outside the package and immutable inputs; no self-reference.');
  if (await packageVersion(location.packaged, platform) !== targetVersion) throw unverified('Actual packaged version does not match target.');
  const files = await packageFiles(location.packaged, platform);
  const bound = { ...receipt, phase: 'package', package: { relativePath: location.relative, files, fingerprint: fingerprint(files) } };
  // Check existing ancestors BEFORE recursive mkdir: an owned lexical path
  // must not create a child through a junction, even if a later check rejects.
  await checkedExistingParents(location.root, path.dirname(output));
  await mkdir(path.dirname(output), { recursive: true });
  const parentRelative = path.relative(location.root, path.dirname(output)).replaceAll('\\', '/');
  if (parentRelative !== '') await checkedPath(location.root, parentRelative);
  // Payload hashing may be lengthy. Do not publish a bound receipt if source
  // or pinned media changed while the final package bytes were being read.
  await verifyBuildInputs({ repoRoot, receipt });
  await writeFile(output, `${JSON.stringify(bound, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  return bound;
}

export async function verifyPackageProvenance({ repoRoot, receipt, packageRoot, targetVersion, platform }) {
  validateReceipt(receipt);
  assertTarget(receipt, targetVersion, platform);
  if (receipt.phase !== 'package' || !record(receipt.package)) throw unverified('Package receipt is absent or inputs-only.');
  validatePackageFiles(receipt.package.files, platform);
  if (fingerprint(receipt.package.files) !== receipt.package.fingerprint) throw unverified('Invalid package payload fingerprint.');
  await verifyBuildInputs({ repoRoot, receipt });
  const location = await packageLocation(repoRoot, packageRoot);
  if (receipt.package.relativePath !== location.relative || await packageVersion(location.packaged, platform) !== targetVersion) {
    throw unverified('Actual package target/path/version does not match receipt.');
  }
  if (JSON.stringify(await packageFiles(location.packaged, platform)) !== JSON.stringify(receipt.package.files)) {
    throw unverified('Package payload changed/hash mismatch.');
  }
}
