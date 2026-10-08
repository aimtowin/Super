import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { lstat, mkdir, open, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { ZipArchive } = require('archiver');
const yauzl = require('yauzl');

export function unverified(message) {
  return Object.assign(new Error(`UNVERIFIED: ${message}`), { code: 'BUILD_PROVENANCE_UNVERIFIED' });
}

export function safeRelative(value) {
  if (typeof value !== 'string' || value === '' || value.includes('\\') || value.includes('\0')
    || value.startsWith('/') || /^[a-z]:/iu.test(value)
    || value.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    throw unverified('Unsafe owned relative artifact/receipt path.');
  }
  return value;
}

export function relativeTo(root, candidate) {
  if (typeof candidate !== 'string' || !path.isAbsolute(candidate)) throw unverified('Absolute owned artifact path required.');
  return safeRelative(path.relative(root, path.resolve(candidate)).replaceAll('\\', '/'));
}

export async function ownedRoot(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw unverified('Absolute repository root required.');
  const root = path.resolve(value);
  const info = await lstat(root);
  if (!info.isDirectory() || info.isSymbolicLink() || path.resolve(await realpath(root)) !== root) {
    throw unverified('Owned root has a link/redirected parent.');
  }
  return root;
}

/** Also BEFORE mkdir/rm/compiler: never create through a redirected ancestor. */
export async function ownedPath(root, candidate, { missing = false, directory = false } = {}) {
  const relative = relativeTo(root, candidate);
  const resolved = path.join(root, relative);
  let cursor = root;
  const parts = relative.split('/');
  for (const [index, part] of parts.entries()) {
    cursor = path.join(cursor, part);
    let info;
    try { info = await lstat(cursor); }
    catch (error) {
      if (missing && error.code === 'ENOENT') return resolved;
      throw error;
    }
    if (info.isSymbolicLink() || (index < parts.length - 1 && !info.isDirectory())
      || (index === parts.length - 1 && (directory ? !info.isDirectory() : !info.isFile()))) {
      throw unverified('Owned artifact/receipt path is linked or not regular.');
    }
  }
  if (path.resolve(await realpath(resolved)) !== resolved) throw unverified('Owned path was redirected.');
  return resolved;
}

export async function mkdirOwned(root, directory) {
  await ownedPath(root, directory, { missing: true, directory: true });
  await mkdir(directory, { recursive: true });
  await ownedPath(root, directory, { directory: true });
}

export async function readOwnedJson(root, filename) {
  const file = await ownedPath(root, filename);
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { throw unverified(`Invalid owned JSON: ${error.message}`); }
}

export async function writeFreshJson(root, filename, value) {
  await ownedPath(root, filename, { missing: true });
  await mkdirOwned(root, path.dirname(filename));
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
}

export async function writeAtomic(root, filename, contents) {
  await ownedPath(root, filename, { missing: true });
  await mkdirOwned(root, path.dirname(filename));
  const temporary = path.join(path.dirname(filename), `${path.basename(filename)}.${randomUUID()}.tmp`);
  await writeFile(temporary, contents, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  await ownedPath(root, filename, { missing: true });
  await rename(temporary, filename);
}

function unchanged(before, after) {
  return before.dev === after.dev && before.ino === after.ino && before.size === after.size
    && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs;
}

export async function digestOwned(root, filename) {
  const file = await ownedPath(root, filename);
  const handle = await open(file, 'r');
  try {
    const before = await handle.stat();
    if (!before.isFile()) throw unverified('Artifact must be a regular file.');
    const hash = createHash('sha256');
    let bytes = 0;
    for await (const chunk of handle.createReadStream({ autoClose: false })) { hash.update(chunk); bytes += chunk.length; }
    const after = await handle.stat();
    const current = await lstat(await ownedPath(root, file));
    if (bytes !== before.size || !unchanged(before, after) || !unchanged(before, current)) {
      throw unverified('Artifact changed while stream hashing.');
    }
    return { path: relativeTo(root, file), bytes, sha256: hash.digest('hex') };
  } finally { await handle.close(); }
}

export async function installerInZip(root, filename, expected) {
  const file = await ownedPath(root, filename);
  const before = await lstat(file);
  const zip = await yauzl.openPromise(file, { lazyEntries: true, autoClose: false, strictFileNames: true, validateEntrySizes: true });
  let count = 0;
  let actual;
  try {
    for await (const entry of zip.eachEntry()) {
      count++;
      const type = (entry.externalFileAttributes >>> 16) & 0o170000;
      if (count !== 1 || entry.fileName !== 'SuperSetup.exe' || (type !== 0 && type !== 0o100000)
        || entry.uncompressedSize !== expected.bytes) throw unverified('ZIP must contain only the matching regular SuperSetup.exe entry.');
      const stream = await zip.openReadStreamPromise(entry);
      const hash = createHash('sha256');
      let bytes = 0;
      for await (const chunk of stream) {
        bytes += chunk.length;
        if (bytes > expected.bytes) throw unverified('ZIP installer exceeds its declared binary size.');
        hash.update(chunk);
      }
      actual = { bytes, sha256: hash.digest('hex') };
    }
    if (count !== 1 || actual?.bytes !== expected.bytes || actual.sha256 !== expected.sha256) {
      throw unverified('ZIP installer checksum/hash does not match its producer binary.');
    }
    if (!unchanged(before, await lstat(await ownedPath(root, file)))) throw unverified('ZIP changed during installer verification.');
    return actual;
  } finally { zip.close(); }
}

export async function createInstallerArchive(root, setupExe, archivePath) {
  await ownedPath(root, setupExe);
  await ownedPath(root, archivePath, { missing: true });
  await mkdirOwned(root, path.dirname(archivePath));
  await new Promise((resolve, reject) => {
    const output = createWriteStream(archivePath, { flags: 'wx' });
    const archive = new ZipArchive({ zlib: { level: 9 } });
    output.once('close', resolve);
    output.once('error', reject);
    archive.once('error', (error) => { output.destroy(error); reject(error); });
    archive.pipe(output);
    archive.file(setupExe, { name: 'SuperSetup.exe' });
    archive.finalize().catch(reject);
  });
  const digest = await digestOwned(root, setupExe);
  await installerInZip(root, archivePath, digest);
  return await digestOwned(root, archivePath);
}

export function defaultIscc(environment) {
  return environment.SUPER_INNO_TOOLS ? path.resolve(environment.SUPER_INNO_TOOLS, 'ISCC.exe')
    : path.join(environment.LOCALAPPDATA || '', 'SuperTools', 'inno', 'tools', 'ISCC.exe');
}

export async function freshCompilerDirectory(root, receipt) {
  const directory = path.join(root, 'tmp/build-provenance', receipt.buildId, 'derivative-builds', randomUUID());
  await mkdirOwned(root, directory);
  return directory;
}

export async function compilerPath(filename) {
  if (typeof filename !== 'string' || !path.isAbsolute(filename)) throw unverified('Absolute local ISCC compiler path required.');
  const info = await lstat(filename);
  if (!info.isFile() || info.isSymbolicLink() || path.resolve(await realpath(filename)) !== path.resolve(filename)) {
    throw unverified('ISCC compiler is missing, linked, or not regular.');
  }
  return filename;
}
