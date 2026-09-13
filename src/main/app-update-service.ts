import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, readdirSync } from 'node:fs';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';

import AdmZip from 'adm-zip';

import {
  compareSemver,
  parseSemver,
  type ParsedSemver,
} from '../plugins/plugin-manifest';
import type {
  AppUpdateAssetKind,
  AppUpdateCheckResult,
  AppUpdateDistribution,
  AppUpdateInstallResult,
  AppUpdateProgress,
} from '../shared/app-update';

export const SUPER_UPDATE_PUBLIC_ORIGIN = 'https://liuyangyang.me';
export const SUPER_UPDATE_MANIFEST_URL =
  `${SUPER_UPDATE_PUBLIC_ORIGIN}/downloads/super/latest.json`;
const SUPER_LEGACY_UPDATE_MANIFEST_URL =
  `${SUPER_UPDATE_PUBLIC_ORIGIN}/api/super/updates/latest`;
const SUPER_UPDATE_DOWNLOAD_PREFIX = '/downloads/super/';
const MAX_RELEASE_NOTES_LENGTH = 12_000;
const MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024 * 1024;
const SAFE_ASSET_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/u;
const SHA256_PATTERN = /\b([a-f0-9]{64})\b/iu;
const INSTALLED_MARKER_NAMES = ['.super-installed', '.super-installed'] as const;

export type AppUpdatePlatform = 'darwin' | 'win32';

export type AppUpdateTarget = {
  platform: AppUpdatePlatform;
  arch: 'arm64' | 'x64';
  distribution: Exclude<AppUpdateDistribution, 'development'>;
};

export type GitHubReleaseAsset = {
  name: string;
  browserDownloadUrl: string;
  size: number;
  digest?: string;
};

export type GitHubRelease = {
  tagName: string;
  version: string;
  releaseUrl: string;
  notes: string;
  assets: GitHubReleaseAsset[];
  deltas: Array<{ fromVersion: string; asset: GitHubReleaseAsset }>;
};

export type SelectedUpdateAsset = {
  asset: GitHubReleaseAsset;
  assetKind: AppUpdateAssetKind;
  checksumAsset?: GitHubReleaseAsset;
};

export type AppUpdateLogger = {
  info(scope: string, message: string, context?: Record<string, unknown>): void;
  error(scope: string, error: unknown, context?: Record<string, unknown>): void;
};

export type AppUpdateFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export type AppUpdateDistributionInput = {
  isPackaged: boolean;
  platform: string;
  executablePath: string;
  environment?: Record<string, string | undefined>;
  fileExists?: (filePath: string) => boolean;
  directoryEntries?: (directoryPath: string) => string[];
};

export type AppUpdateServiceOptions = {
  currentVersion: string;
  isPackaged: boolean;
  platform: string;
  arch: string;
  executablePath: string;
  tempDirectory: string;
  downloadsDirectory: string;
  /** Per-user cache for an installed update that the user elected to defer. */
  preparedUpdateDirectory?: string;
  environment?: Record<string, string | undefined>;
  fetchImpl?: AppUpdateFetch;
  openPath?: (filePath: string) => Promise<string>;
  showItemInFolder?: (filePath: string) => void;
  launchInstaller?: (
    installerPath: string,
    mode: 'interactive' | 'silent',
  ) => Promise<void>;
  onDownloadProgress?: (progress: AppUpdateProgress) => void;
  logger?: AppUpdateLogger;
};

type CachedUpdate = {
  release: GitHubRelease;
  target: AppUpdateTarget;
  selected: SelectedUpdateAsset;
};

type PreparedInstaller = {
  installerPath: string;
  cleanupPath: string;
  platform: AppUpdatePlatform;
  version: string;
  distribution: 'installed';
  releaseNotes: string;
};

type UpdatePartialMetadata = {
  schemaVersion: 1;
  assetUrl: string;
  assetName: string;
  version: string;
  expectedSha256: string;
  totalBytes: number;
  validator?: string;
};

type ResumableDownload = {
  partialPath: string;
  metadataPath: string;
  downloadedBytes: number;
  metadata: UpdatePartialMetadata;
};

export type RestoredPreparedUpdate = {
  installerPath: string;
  cleanupPath: string;
  version: string;
  releaseNotes: string;
};

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null;
}

function isSafeSuperUpdateUrl(input: unknown): input is string {
  if (typeof input !== 'string' || input.length > 2_048) return false;
  try {
    const url = new URL(input);
    return url.protocol === 'https:'
      && url.origin === SUPER_UPDATE_PUBLIC_ORIGIN
      && url.pathname.startsWith(SUPER_UPDATE_DOWNLOAD_PREFIX);
  } catch {
    return false;
  }
}

function stripVersionPrefix(value: string): string {
  return value.startsWith('v') || value.startsWith('V') ? value.slice(1) : value;
}

function parseDigest(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const match = /^sha256:([a-f0-9]{64})$/iu.exec(input.trim());
  return match?.[1]?.toLowerCase();
}

function parseReleaseAsset(input: unknown): GitHubReleaseAsset | undefined {
  if (!isRecord(input)) return undefined;
  const name = input.name;
  const browserDownloadUrl = input.browser_download_url;
  const size = input.size;
  if (
    typeof name !== 'string'
    || !SAFE_ASSET_NAME.test(name)
    || !isSafeSuperUpdateUrl(browserDownloadUrl)
    || typeof size !== 'number'
    || !Number.isSafeInteger(size)
    || size < 0
    || size > MAX_DOWNLOAD_BYTES
  ) {
    return undefined;
  }
  const digest = parseDigest(input.digest);
  return digest === undefined
    ? { name, browserDownloadUrl, size }
    : { name, browserDownloadUrl, size, digest };
}

function isSafeReleaseRelativePath(input: unknown): input is string {
  if (typeof input !== 'string' || input.length === 0 || input.length > 1_024) return false;
  if (input.includes('\\') || input.includes('?') || input.includes('#')) return false;
  return input.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

function parseNativeEcsAsset(input: unknown): GitHubReleaseAsset | undefined {
  if (!isRecord(input)) return undefined;
  const name = input.name;
  const relativePath = input.path;
  const size = input.size;
  const sha256 = input.sha256;
  if (
    typeof name !== 'string'
    || !SAFE_ASSET_NAME.test(name)
    || !isSafeReleaseRelativePath(relativePath)
    || typeof size !== 'number'
    || !Number.isSafeInteger(size)
    || size < 1
    || size > MAX_DOWNLOAD_BYTES
    || typeof sha256 !== 'string'
    || !/^[a-f0-9]{64}$/iu.test(sha256)
  ) {
    return undefined;
  }
  const browserDownloadUrl = new URL(relativePath, `${SUPER_UPDATE_PUBLIC_ORIGIN}${SUPER_UPDATE_DOWNLOAD_PREFIX}`).toString();
  if (!isSafeSuperUpdateUrl(browserDownloadUrl)) return undefined;
  return {
    name,
    browserDownloadUrl,
    size,
    digest: sha256.toLowerCase(),
  };
}

/** Parse Super's native ECS release document, including source-version deltas. */
export function parseEcsUpdateRelease(input: unknown): GitHubRelease | undefined {
  if (!isRecord(input)) return undefined;
  const version = input.version;
  const full = parseNativeEcsAsset(input.full);
  if (typeof version !== 'string' || parseSemver(version) === undefined || full === undefined) {
    return undefined;
  }
  const deltasInput = input.deltas;
  if (deltasInput !== undefined && !Array.isArray(deltasInput)) return undefined;
  const deltas = (deltasInput ?? []).flatMap((candidate) => {
    if (!isRecord(candidate) || typeof candidate.fromVersion !== 'string') return [];
    if (parseSemver(candidate.fromVersion) === undefined || candidate.fromVersion === version) return [];
    const asset = parseNativeEcsAsset(candidate.asset);
    return asset === undefined ? [] : [{ fromVersion: candidate.fromVersion, asset }];
  });
  const notes = typeof input.notes === 'string'
    ? input.notes.slice(0, MAX_RELEASE_NOTES_LENGTH)
    : '';
  return {
    tagName: `v${version}`,
    version,
    releaseUrl: `${SUPER_UPDATE_PUBLIC_ORIGIN}${SUPER_UPDATE_DOWNLOAD_PREFIX}`,
    notes,
    assets: [full],
    deltas,
  };
}

/** Parse the small, stable subset of the ECS update feed consumed by Super. */
export function parseGitHubRelease(input: unknown): GitHubRelease | undefined {
  if (!isRecord(input)) return undefined;
  const tagName = input.tag_name;
  const releaseUrl = input.html_url;
  const assetsInput = input.assets;
  if (
    typeof tagName !== 'string'
    || tagName.length === 0
    || !isSafeSuperUpdateUrl(releaseUrl)
    || !Array.isArray(assetsInput)
    || input.draft === true
    || input.prerelease === true
  ) {
    return undefined;
  }
  const version = stripVersionPrefix(tagName);
  if (parseSemver(version) === undefined) return undefined;
  const assets = assetsInput.flatMap((asset) => {
    const parsed = parseReleaseAsset(asset);
    return parsed === undefined ? [] : [parsed];
  });
  const notes = typeof input.body === 'string'
    ? input.body.slice(0, MAX_RELEASE_NOTES_LENGTH)
    : '';
  return {
    tagName,
    version,
    releaseUrl,
    notes,
    assets,
    deltas: [],
  };
}

export function parseUpdateRelease(input: unknown): GitHubRelease | undefined {
  return parseEcsUpdateRelease(input) ?? parseGitHubRelease(input);
}

async function fetchLatestUpdateRelease(
  fetchImpl: AppUpdateFetch,
  options: AppUpdateServiceOptions,
): Promise<GitHubRelease | undefined> {
  // ECS publishes the native manifest atomically at this static URL. Keep the
  // legacy API as a fallback for installations behind an older server config.
  for (const url of [SUPER_UPDATE_MANIFEST_URL, SUPER_LEGACY_UPDATE_MANIFEST_URL]) {
    try {
      const response = await fetchImpl(url, {
        headers: superUpdateRequestHeaders(options, 'application/json'),
      });
      if (!response.ok) continue;
      const release = parseUpdateRelease(await response.json());
      if (release !== undefined) return release;
    } catch {
      // A proxy can serve a stale non-JSON payload at the static path. The
      // verified legacy endpoint below remains a safe compatibility fallback.
    }
  }
  return undefined;
}

export function parseSha256(text: string): string | undefined {
  return SHA256_PATTERN.exec(text)?.[1]?.toLowerCase();
}

export function detectAppDistribution(input: AppUpdateDistributionInput): AppUpdateDistribution {
  const environment = input.environment ?? {};
  const forced = environment.SUPER_DISTRIBUTION ?? environment.SUPER_DISTRIBUTION;
  if (forced === 'portable' || forced === 'installed' || forced === 'development') {
    return forced;
  }

  if (!input.isPackaged) {
    // Dev builds check GitHub Releases by default as installed distribution so
    // update UI and installer flow can be exercised without packaging.
    // Override with SUPER_DISTRIBUTION=portable or =development when needed.
    return 'installed';
  }

  if (
    environment.PORTABLE_EXECUTABLE_FILE !== undefined
    || environment.PORTABLE_EXECUTABLE_DIR !== undefined
  ) {
    return 'portable';
  }

  const fileExists = input.fileExists ?? existsSync;
  const directoryEntries = input.directoryEntries ?? ((directoryPath: string) => {
    try {
      return readdirSync(directoryPath);
    } catch {
      return [];
    }
  });
  const executableDirectory = path.dirname(input.executablePath);

  if (input.platform === 'win32') {
    // Inno Setup writes an explicit marker beside Super.exe. Keep the legacy
    // marker and uninstaller fallbacks so pre-rename installations continue
    // to update correctly. A Forge ZIP extraction has neither, so it remains
    // portable.
    if (
      INSTALLED_MARKER_NAMES.some((marker) => fileExists(path.join(executableDirectory, marker)))
      || fileExists(path.join(executableDirectory, 'unins000.exe'))
      || directoryEntries(executableDirectory).some((entry) => /^unins\d+\.exe$/iu.test(entry))
    ) {
      return 'installed';
    }
    return 'portable';
  }

  if (input.platform === 'darwin') {
    const executablePath = path.resolve(input.executablePath);
    const isInApplications = executablePath.includes(`${path.sep}Applications${path.sep}`);
    const hasBundle = executablePath.includes(`.app${path.sep}Contents${path.sep}MacOS${path.sep}`);
    return isInApplications && hasBundle ? 'installed' : 'portable';
  }

  return 'portable';
}

export function resolveAppUpdateTarget(input: {
  platform: string;
  arch: string;
  distribution: AppUpdateDistribution;
}): AppUpdateTarget | undefined {
  if (input.distribution === 'development') return undefined;
  if (input.platform !== 'darwin' && input.platform !== 'win32') return undefined;
  if (input.platform === 'darwin' && input.arch !== 'arm64') return undefined;
  if (input.platform === 'win32' && input.arch !== 'x64') return undefined;
  const platform = input.platform === 'darwin' ? 'darwin' : 'win32';
  return {
    platform,
    arch: platform === 'darwin' ? 'arm64' : 'x64',
    distribution: input.distribution,
  };
}

export function updateAssetName(
  version: string,
  target: AppUpdateTarget,
): { name: string; assetKind: AppUpdateAssetKind } {
  if (target.platform === 'darwin') {
    return target.distribution === 'installed'
      ? {
          name: `Super-darwin-arm64-${version}-package.dmg`,
          assetKind: 'installer',
        }
      : {
          name: `Super-darwin-arm64-${version}-portable.zip`,
          assetKind: 'portable',
        };
  }
  return target.distribution === 'installed'
    ? {
        name: `Super-win-x86-64-${version}-setup.zip`,
        assetKind: 'installer',
      }
    : {
        name: `Super-win-x86-64-${version}-portable.zip`,
        assetKind: 'portable',
      };
}

export function selectUpdateAsset(
  release: GitHubRelease,
  target: AppUpdateTarget,
  currentVersion?: string,
): SelectedUpdateAsset | undefined {
  const normalizedCurrentVersion = currentVersion === undefined
    ? undefined
    : stripVersionPrefix(currentVersion);
  if (target.platform === 'win32' && target.distribution === 'installed' && normalizedCurrentVersion !== undefined) {
    const delta = release.deltas.find((candidate) => candidate.fromVersion === normalizedCurrentVersion);
    if (delta !== undefined) {
      return { asset: delta.asset, assetKind: 'delta-installer' };
    }
  }
  const expected = updateAssetName(release.version, target);
  const asset = release.assets.find((candidate) => candidate.name === expected.name);
  if (asset === undefined) return undefined;
  const checksumAsset = release.assets.find(
    (candidate) => candidate.name === `${asset.name}.sha256`,
  );
  if (checksumAsset === undefined && asset.digest === undefined) return undefined;
  return {
    asset,
    assetKind: expected.assetKind,
    ...(checksumAsset === undefined ? {} : { checksumAsset }),
  };
}

function resultError(
  code: Extract<AppUpdateCheckResult, { ok: false }>['code'],
): AppUpdateCheckResult {
  return { ok: false, status: 'error', code };
}

function installResultError(
  code: Extract<AppUpdateInstallResult, { ok: false }>['code'],
): AppUpdateInstallResult {
  return { ok: false, status: 'error', code };
}

function parseVersionForComparison(value: string): ParsedSemver | undefined {
  return parseSemver(stripVersionPrefix(value));
}

function superUpdateRequestHeaders(
  options: AppUpdateServiceOptions,
  accept: string,
): Record<string, string> {
  return {
    Accept: accept,
    'User-Agent': `Super/${options.currentVersion}`,
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function emitDownloadProgress(
  onProgress: AppUpdateServiceOptions['onDownloadProgress'],
  progress: AppUpdateProgress,
): void {
  onProgress?.(progress);
}

async function writeDownloadedResponse(
  response: Response,
  targetPath: string,
  options: {
    signal?: AbortSignal;
    totalBytes?: number;
    initialBytes?: number;
    append?: boolean;
    onProgress?: AppUpdateServiceOptions['onDownloadProgress'];
  } = {},
): Promise<void> {
  await mkdir(path.dirname(targetPath), { recursive: true });
  const initialBytes = options.initialBytes ?? 0;
  const append = options.append === true;
  const reportProgress = (downloadedBytes: number) => {
    emitDownloadProgress(options.onProgress, {
      phase: 'downloading',
      downloadedBytes,
      totalBytes: options.totalBytes,
    });
  };
  if (response.body === null) {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (initialBytes + bytes.byteLength > MAX_DOWNLOAD_BYTES) {
      throw new Error('The update response is too large.');
    }
    await writeFile(targetPath, bytes, { mode: 0o600, flag: append ? 'a' : 'wx' });
    reportProgress(initialBytes + bytes.byteLength);
    return;
  }
  let downloadedBytes = initialBytes;
  const progressTransform = new Transform({
    transform(chunk: Buffer | string, _encoding, callback) {
      if (options.signal?.aborted) {
        callback(new DOMException('Aborted', 'AbortError'));
        return;
      }
      downloadedBytes += Buffer.byteLength(chunk);
      if (downloadedBytes > MAX_DOWNLOAD_BYTES) {
        callback(new Error('The update response is too large.'));
        return;
      }
      reportProgress(downloadedBytes);
      callback(null, chunk);
    },
  });
  await pipeline(
    Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
    progressTransform,
    createWriteStream(targetPath, { flags: append ? 'a' : 'wx', mode: 0o600 }),
    { signal: options.signal },
  );
}

function updatePartialPaths(
  options: AppUpdateServiceOptions,
  input: Pick<UpdatePartialMetadata, 'assetUrl' | 'assetName' | 'version' | 'expectedSha256' | 'totalBytes'>,
): Pick<ResumableDownload, 'partialPath' | 'metadataPath'> {
  const cacheDirectory = options.preparedUpdateDirectory
    ?? path.join(options.tempDirectory, 'super-update-cache');
  const key = createHash('sha256')
    .update(`${input.assetUrl}\n${input.expectedSha256}\n${input.totalBytes}`)
    .digest('hex');
  const basePath = path.join(cacheDirectory, 'partials', `update-${key}`);
  return { partialPath: `${basePath}.part`, metadataPath: `${basePath}.json` };
}

function parsePartialMetadata(input: unknown): UpdatePartialMetadata | undefined {
  if (!isRecord(input)
    || input.schemaVersion !== 1
    || typeof input.assetUrl !== 'string'
    || typeof input.assetName !== 'string'
    || typeof input.version !== 'string'
    || typeof input.expectedSha256 !== 'string'
    || typeof input.totalBytes !== 'number'
    || !Number.isSafeInteger(input.totalBytes)
    || input.totalBytes < 1
    || (input.validator !== undefined && typeof input.validator !== 'string')) {
    return undefined;
  }
  return {
    schemaVersion: 1,
    assetUrl: input.assetUrl,
    assetName: input.assetName,
    version: input.version,
    expectedSha256: input.expectedSha256.toLowerCase(),
    totalBytes: input.totalBytes,
    ...(typeof input.validator === 'string' && input.validator.length <= 512
      ? { validator: input.validator }
      : {}),
  };
}

function responseValidator(response: Response): string | undefined {
  const value = response.headers.get('etag') ?? response.headers.get('last-modified');
  return value !== null && value.length > 0 && value.length <= 512 ? value : undefined;
}

function responseResumesAt(response: Response, offset: number, totalBytes: number): boolean {
  if (response.status !== 206) return false;
  const contentRange = response.headers.get('content-range');
  const match = contentRange === null
    ? undefined
    : /^bytes\s+(\d+)-(\d+)\/(\d+)$/iu.exec(contentRange.trim());
  if (match === undefined || match === null) return false;
  const start = Number(match[1]);
  const end = Number(match[2]);
  const total = Number(match[3]);
  return Number.isSafeInteger(start)
    && Number.isSafeInteger(end)
    && Number.isSafeInteger(total)
    && start === offset
    && end >= start
    && total === totalBytes;
}

async function removePartialDownload(paths: Pick<ResumableDownload, 'partialPath' | 'metadataPath'>): Promise<void> {
  await Promise.all([
    rm(paths.partialPath, { force: true }),
    rm(paths.metadataPath, { force: true }),
  ]);
}

async function savePartialMetadata(metadataPath: string, metadata: UpdatePartialMetadata): Promise<void> {
  await mkdir(path.dirname(metadataPath), { recursive: true });
  const temporaryPath = `${metadataPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(metadata)}\n`, { mode: 0o600 });
  await rename(temporaryPath, metadataPath);
}

async function loadPartialDownload(
  paths: Pick<ResumableDownload, 'partialPath' | 'metadataPath'>,
  expected: UpdatePartialMetadata,
): Promise<ResumableDownload | undefined> {
  try {
    const metadata = parsePartialMetadata(JSON.parse(await readFile(paths.metadataPath, 'utf8')));
    if (metadata === undefined
      || metadata.assetUrl !== expected.assetUrl
      || metadata.assetName !== expected.assetName
      || metadata.version !== expected.version
      || metadata.expectedSha256 !== expected.expectedSha256
      || metadata.totalBytes !== expected.totalBytes) {
      await removePartialDownload(paths);
      return undefined;
    }
    const partialStat = await stat(paths.partialPath);
    if (!partialStat.isFile() || partialStat.size <= 0 || partialStat.size > expected.totalBytes) {
      await removePartialDownload(paths);
      return undefined;
    }
    return { ...paths, downloadedBytes: partialStat.size, metadata };
  } catch {
    await removePartialDownload(paths).catch(() => undefined);
    return undefined;
  }
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

async function nextAvailableDownloadPath(
  directory: string,
  fileName: string,
): Promise<string> {
  await mkdir(directory, { recursive: true });
  const extension = path.extname(fileName);
  const stem = fileName.slice(0, -extension.length);
  for (let suffix = 0; suffix < 100; suffix += 1) {
    const candidateName = suffix === 0
      ? fileName
      : `${stem} (${suffix})${extension}`;
    const candidate = path.join(directory, candidateName);
    try {
      await access(candidate);
    } catch {
      return candidate;
    }
  }
  throw new Error('Too many downloaded update copies exist.');
}

function safeInstallerEntryName(entryName: string): boolean {
  const normalized = entryName.replaceAll('\\', '/');
  return normalized.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
    && path.posix.basename(normalized).toLowerCase() === 'supersetup.exe';
}

async function extractWindowsInstaller(
  archivePath: string,
  tempDirectory: string,
): Promise<{ installerPath: string; outputDirectory: string }> {
  const archive = new AdmZip(archivePath);
  const entry = archive.getEntries().find((candidate) =>
    !candidate.isDirectory && safeInstallerEntryName(candidate.entryName));
  if (entry === undefined) throw new Error('The Windows update archive has no SuperSetup.exe.');
  const outputDirectory = await mkdtemp(path.join(tempDirectory, 'super-installer-'));
  try {
    const installerPath = path.join(outputDirectory, 'SuperSetup.exe');
    await writeFile(installerPath, entry.getData(), { mode: 0o700, flag: 'wx' });
    return { installerPath, outputDirectory };
  } catch (error) {
    await rm(outputDirectory, {
      force: true,
      recursive: true,
      maxRetries: 3,
      retryDelay: 100,
    }).catch(() => undefined);
    throw error;
  }
}

async function removeUpdateArtifact(filePath: string | undefined): Promise<void> {
  if (filePath === undefined) return;
  await rm(filePath, {
    force: true,
    recursive: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}

function validateDownloadUrl(input: string): void {
  if (!isSafeSuperUpdateUrl(input)) throw new Error('The update asset URL is not a trusted Super HTTPS URL.');
}

export class AppUpdateService {
  readonly #options: AppUpdateServiceOptions;
  readonly #fetch: AppUpdateFetch;
  #cachedUpdate: CachedUpdate | undefined;
  #preparedInstaller: PreparedInstaller | undefined;
  #lastAttemptedUpdate: CachedUpdate | undefined;
  #busy = false;
  #downloadAbort: AbortController | undefined;

  constructor(options: AppUpdateServiceOptions) {
    this.#options = options;
    this.#fetch = options.fetchImpl ?? fetch;
  }

  cancelDownload(): void {
    this.#downloadAbort?.abort();
  }

  getPreparedUpdate(): RestoredPreparedUpdate | undefined {
    const prepared = this.#preparedInstaller;
    return prepared === undefined ? undefined : {
      installerPath: prepared.installerPath,
      cleanupPath: prepared.cleanupPath,
      version: prepared.version,
      releaseNotes: prepared.releaseNotes,
    };
  }

  restorePreparedUpdate(update: RestoredPreparedUpdate): boolean {
    const cacheDirectory = this.#options.preparedUpdateDirectory;
    if (cacheDirectory === undefined || this.#busy || this.#preparedInstaller !== undefined) return false;
    const isWithinCache = (candidate: string) => {
      const relative = path.relative(path.resolve(cacheDirectory), path.resolve(candidate));
      return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
    };
    if (!isWithinCache(update.installerPath) || !isWithinCache(update.cleanupPath) || !existsSync(update.installerPath)) {
      return false;
    }
    this.#preparedInstaller = {
      installerPath: update.installerPath,
      cleanupPath: update.cleanupPath,
      platform: 'win32',
      version: update.version,
      distribution: 'installed',
      releaseNotes: update.releaseNotes,
    };
    return true;
  }

  async checkForUpdates(): Promise<AppUpdateCheckResult> {
    this.#cachedUpdate = undefined;
    const distribution = detectAppDistribution({
      isPackaged: this.#options.isPackaged,
      platform: this.#options.platform,
      executablePath: this.#options.executablePath,
      environment: this.#options.environment,
    });
    if (distribution === 'development') {
      return {
        ok: true,
        status: 'unsupported',
        reason: 'development',
        currentVersion: this.#options.currentVersion,
        distribution,
      };
    }
    const target = resolveAppUpdateTarget({
      platform: this.#options.platform,
      arch: this.#options.arch,
      distribution,
    });
    if (this.#options.platform !== 'darwin' && this.#options.platform !== 'win32') {
      return {
        ok: true,
        status: 'unsupported',
        reason: 'platform',
        currentVersion: this.#options.currentVersion,
        distribution,
      };
    }
    if (target === undefined) {
      return {
        ok: true,
        status: 'unsupported',
        reason: 'architecture',
        currentVersion: this.#options.currentVersion,
        distribution,
      };
    }
    const currentVersion = parseVersionForComparison(this.#options.currentVersion);
    if (currentVersion === undefined) return resultError('invalid-release');

    try {
      const release = await fetchLatestUpdateRelease(this.#fetch, this.#options);
      if (release === undefined) {
        this.#options.logger?.info('app-update.check', 'Super ECS update manifest request failed.', {
          nativeManifest: SUPER_UPDATE_MANIFEST_URL,
          legacyManifest: SUPER_LEGACY_UPDATE_MANIFEST_URL,
        });
        return resultError('network');
      }
      const latestVersion = parseVersionForComparison(release.version);
      if (latestVersion === undefined) return resultError('invalid-release');
      if (compareSemver(latestVersion, currentVersion) <= 0) {
        this.#cachedUpdate = undefined;
        return {
          ok: true,
          status: 'up-to-date',
          currentVersion: this.#options.currentVersion,
          latestVersion: release.version,
          distribution,
        };
      }
      const selected = selectUpdateAsset(release, target, this.#options.currentVersion);
      if (selected === undefined) {
        this.#options.logger?.info('app-update.check', 'Latest release has no compatible verified asset.', {
          version: release.version,
          platform: target.platform,
          arch: target.arch,
          distribution: target.distribution,
        });
        return resultError('asset-missing');
      }
      this.#cachedUpdate = { release, target, selected };
      return {
        ok: true,
        status: 'available',
        currentVersion: this.#options.currentVersion,
        latestVersion: release.version,
        distribution,
        assetKind: selected.assetKind,
        assetName: selected.asset.name,
        assetSize: selected.asset.size,
        releaseNotes: release.notes,
      };
    } catch (error) {
      this.#options.logger?.error('app-update.check', error, { code: 'network' });
      return resultError('network');
    }
  }

  /** Download and verify the latest update without replacing the running app. */
  async prepareUpdate(): Promise<AppUpdateInstallResult> {
    const result = await this.#prepareUpdateOnce();
    const attempted = this.#lastAttemptedUpdate;
    if (
      result.ok
      || result.code === 'cancelled'
      || attempted?.selected.assetKind !== 'delta-installer'
    ) {
      return result;
    }

    // Deltas are an optimization, never a prerequisite for a safe update.
    // A failed archive/checksum/extraction retries the full, independently
    // verified installer within the same user-approved update action.
    const full = selectUpdateAsset(attempted.release, attempted.target);
    if (full === undefined || full.assetKind !== 'installer') return result;
    this.#cachedUpdate = { ...attempted, selected: full };
    this.#options.logger?.info('app-update.delta', 'Delta update failed; retrying the full installer.', {
      version: attempted.release.version,
      deltaAsset: attempted.selected.asset.name,
      fullAsset: full.asset.name,
      failure: result.code,
    });
    return this.#prepareUpdateOnce();
  }

  async #prepareUpdateOnce(): Promise<AppUpdateInstallResult> {
    if (this.#busy) return installResultError('busy');
    await this.discardPreparedUpdate();
    this.#busy = true;
    this.#lastAttemptedUpdate = undefined;
    this.#downloadAbort = new AbortController();
    const { signal } = this.#downloadAbort;
    let downloadPath: string | undefined;
    let extractedInstallerDirectory: string | undefined;
    let keepDownloadedUpdate = false;
    try {
      const cached = this.#cachedUpdate;
      const checked = cached === undefined ? await this.checkForUpdates() : undefined;
      const update = cached ?? (checked?.status === 'available' ? this.#cachedUpdate : undefined);
      if (update === undefined) return installResultError('not-available');
      this.#lastAttemptedUpdate = update;

      const { asset, checksumAsset } = update.selected;
      validateDownloadUrl(asset.browserDownloadUrl);
      const checksumUrl = checksumAsset?.browserDownloadUrl;
      let expectedSha256 = asset.digest;
      if (checksumUrl !== undefined) {
        validateDownloadUrl(checksumUrl);
        emitDownloadProgress(this.#options.onDownloadProgress, {
          phase: 'verifying',
          downloadedBytes: 0,
        });
        const checksumResponse = await this.#fetch(checksumUrl, {
          headers: superUpdateRequestHeaders(this.#options, 'application/octet-stream'),
          redirect: 'follow',
          signal,
        });
        if (!checksumResponse.ok) {
          this.#options.logger?.info('app-update.verify', 'Update checksum asset request failed.', {
            status: checksumResponse.status,
            version: update.release.version,
            assetName: asset.name,
          });
          return installResultError('verification-failed');
        }
        const sidecarSha256 = parseSha256(await checksumResponse.text());
        if (asset.digest !== undefined && sidecarSha256 !== undefined && asset.digest !== sidecarSha256) {
          this.#options.logger?.info('app-update.verify', 'Release digest and checksum asset disagree.', {
            version: update.release.version,
            assetName: asset.name,
          });
          return installResultError('verification-failed');
        }
        expectedSha256 ??= sidecarSha256;
      }
      if (expectedSha256 === undefined) {
        this.#options.logger?.info('app-update.verify', 'Update has no usable checksum.', {
          version: update.release.version,
          assetName: asset.name,
        });
        return installResultError('verification-failed');
      }
      if (asset.size < 1 || asset.size > MAX_DOWNLOAD_BYTES) {
        this.#options.logger?.info('app-update.verify', 'Update has no usable total byte size.', {
          version: update.release.version,
          assetName: asset.name,
          assetSize: asset.size,
        });
        return installResultError('verification-failed');
      }

      const installedCacheDirectory = update.target.distribution === 'installed'
        ? this.#options.preparedUpdateDirectory
        : undefined;
      let updateDirectory: string | undefined;
      if (installedCacheDirectory !== undefined) {
        // AppData\Roaming\Super\updates is deliberately created lazily, so
        // first-time update downloads must create the mkdtemp parent first.
        await mkdir(installedCacheDirectory, { recursive: true });
        updateDirectory = await mkdtemp(path.join(installedCacheDirectory, 'super-update-'));
      }
      downloadPath = updateDirectory === undefined
        ? await nextAvailableDownloadPath(this.#options.downloadsDirectory, asset.name)
        : path.join(updateDirectory, asset.name);
      const totalBytes = asset.size;
      const partialMetadata: UpdatePartialMetadata = {
        schemaVersion: 1,
        assetUrl: asset.browserDownloadUrl,
        assetName: asset.name,
        version: update.release.version,
        expectedSha256,
        totalBytes,
      };
      const partialPaths = updatePartialPaths(this.#options, partialMetadata);
      let partial = await loadPartialDownload(partialPaths, partialMetadata);
      if (partial?.downloadedBytes === totalBytes) {
        emitDownloadProgress(this.#options.onDownloadProgress, {
          phase: 'downloading',
          downloadedBytes: totalBytes,
          totalBytes,
        });
        if (await sha256File(partial.partialPath) === expectedSha256) {
          await rename(partial.partialPath, downloadPath);
          await rm(partial.metadataPath, { force: true });
          partial = undefined;
        } else {
          await removePartialDownload(partial);
          partial = undefined;
        }
      }
      if (!existsSync(downloadPath)) {
        const resumeOffset = partial?.downloadedBytes ?? 0;
        const headers = superUpdateRequestHeaders(this.#options, 'application/octet-stream');
        if (resumeOffset > 0) {
          headers.Range = `bytes=${resumeOffset}-`;
          if (partial?.metadata.validator !== undefined) headers['If-Range'] = partial.metadata.validator;
        }
        const response = await this.#fetch(asset.browserDownloadUrl, {
          headers,
          redirect: 'follow',
          signal,
        });
        const acceptsResume = resumeOffset > 0 && responseResumesAt(response, resumeOffset, totalBytes);
        const restartsDownload = resumeOffset > 0 && response.status === 200;
        if (!response.ok || (resumeOffset > 0 && !acceptsResume && !restartsDownload)) {
          if (resumeOffset > 0 && response.status === 416) await removePartialDownload(partialPaths);
          this.#options.logger?.info('app-update.download', 'Update asset request failed.', {
            status: response.status,
            version: update.release.version,
            assetName: asset.name,
            resumedBytes: resumeOffset,
          });
          return installResultError('download-failed');
        }
        const validator = responseValidator(response);
        const downloadMetadata: UpdatePartialMetadata = {
          ...partialMetadata,
          ...(validator === undefined
            ? (partial?.metadata.validator === undefined ? {} : { validator: partial.metadata.validator })
            : { validator }),
        };
        if (restartsDownload) await removePartialDownload(partialPaths);
        await savePartialMetadata(partialPaths.metadataPath, downloadMetadata);
        emitDownloadProgress(this.#options.onDownloadProgress, {
          phase: 'downloading',
          downloadedBytes: restartsDownload ? 0 : resumeOffset,
          totalBytes,
        });
        await writeDownloadedResponse(response, partialPaths.partialPath, {
          signal,
          totalBytes,
          initialBytes: restartsDownload ? 0 : resumeOffset,
          append: acceptsResume,
          onProgress: this.#options.onDownloadProgress,
        });
        const actualSha256 = await sha256File(partialPaths.partialPath);
        if (actualSha256 !== expectedSha256) {
          await removePartialDownload(partialPaths);
          this.#options.logger?.info('app-update.verify', 'Downloaded update checksum mismatch.', {
            version: update.release.version,
            assetName: asset.name,
          });
          return installResultError('verification-failed');
        }
        await rename(partialPaths.partialPath, downloadPath);
        await rm(partialPaths.metadataPath, { force: true });
      }

      if (update.target.distribution === 'portable') {
        // A portable update is a user-facing download rather than an
        // in-process install. Keep the archive so the user can launch or
        // copy it after the update flow completes.
        keepDownloadedUpdate = true;
        try {
          this.#options.showItemInFolder?.(downloadPath);
        } catch (error) {
          this.#options.logger?.error('app-update.reveal', error, { version: update.release.version });
        }
        this.#options.logger?.info('app-update.download', 'Portable update downloaded.', {
          version: update.release.version,
          assetName: asset.name,
        });
        this.#cachedUpdate = undefined;
        return {
          ok: true,
          status: 'completed',
          action: 'portable-downloaded',
          version: update.release.version,
          distribution: 'portable',
        };
      }

      let launchPath = downloadPath;
      if (update.target.platform === 'win32') {
        emitDownloadProgress(this.#options.onDownloadProgress, {
          phase: 'extracting',
          downloadedBytes: totalBytes ?? asset.size,
          totalBytes,
        });
        const extracted = await extractWindowsInstaller(
          downloadPath,
          updateDirectory ?? this.#options.tempDirectory,
        );
        launchPath = extracted.installerPath;
        extractedInstallerDirectory = extracted.outputDirectory;
      }
      let cleanupPath: string;
      if (update.target.platform === 'win32') {
        if (extractedInstallerDirectory === undefined) {
          return installResultError('download-failed');
        }
        cleanupPath = updateDirectory ?? extractedInstallerDirectory;
        extractedInstallerDirectory = undefined;
      } else {
        cleanupPath = downloadPath;
        keepDownloadedUpdate = true;
      }
      this.#preparedInstaller = {
        installerPath: launchPath,
        cleanupPath,
        platform: update.target.platform,
        version: update.release.version,
        distribution: 'installed',
        releaseNotes: update.release.notes,
      };
      this.#cachedUpdate = undefined;
      return {
        ok: true,
        status: 'completed',
        action: 'installer-staged',
        version: update.release.version,
        distribution: 'installed',
      };
    } catch (error) {
      if (isAbortError(error)) {
        this.#options.logger?.info('app-update.download', 'Update download cancelled.');
        return installResultError('cancelled');
      }
      this.#options.logger?.error('app-update.install', error, { code: 'download-failed' });
      return installResultError('download-failed');
    } finally {
      if (!keepDownloadedUpdate) {
        try {
          await removeUpdateArtifact(downloadPath);
        } catch (error) {
          this.#options.logger?.error('app-update.cleanup', error, {
            artifact: downloadPath,
          });
        }
      }
      try {
        await removeUpdateArtifact(extractedInstallerDirectory);
      } catch (error) {
        this.#options.logger?.error('app-update.cleanup', error, {
          artifact: extractedInstallerDirectory,
        });
      }
      this.#downloadAbort = undefined;
      this.#busy = false;
    }
  }

  /** Launch a previously verified installer. The caller must then exit Super. */
  async launchPreparedUpdate(
    mode: 'interactive' | 'silent' = 'interactive',
  ): Promise<AppUpdateInstallResult> {
    if (this.#busy) return installResultError('busy');
    const prepared = this.#preparedInstaller;
    if (prepared === undefined) return installResultError('not-available');
    this.#busy = true;
    try {
      emitDownloadProgress(this.#options.onDownloadProgress, {
        phase: 'launching',
        downloadedBytes: 0,
      });
      if (this.#options.launchInstaller !== undefined) {
        await this.#options.launchInstaller(prepared.installerPath, mode);
      } else {
        const openError = await (this.#options.openPath?.(prepared.installerPath) ?? Promise.resolve(''));
        if (openError !== '') {
          this.#options.logger?.error('app-update.open', new Error(openError), {
            version: prepared.version,
          });
          throw new Error(openError);
        }
      }
      this.#preparedInstaller = undefined;
      if (prepared.platform !== 'win32') {
        await removeUpdateArtifact(prepared.cleanupPath);
      }
      this.#options.logger?.info('app-update.install', 'Update installer opened.', {
        version: prepared.version,
        mode,
      });
      return {
        ok: true,
        status: 'completed',
        action: 'installer-opened',
        version: prepared.version,
        distribution: prepared.distribution,
      };
    } catch (error) {
      await this.discardPreparedUpdate().catch((cleanupError: unknown) => {
        this.#options.logger?.error('app-update.cleanup', cleanupError);
      });
      this.#options.logger?.error('app-update.install', error, { code: 'open-failed' });
      return installResultError('open-failed');
    } finally {
      this.#busy = false;
    }
  }

  /** Remove a staged update that will not be launched. */
  async discardPreparedUpdate(): Promise<void> {
    const prepared = this.#preparedInstaller;
    this.#preparedInstaller = undefined;
    if (prepared === undefined) return;
    await removeUpdateArtifact(prepared.cleanupPath);
  }

  /** Keep the existing explicit-update API as prepare followed by launch. */
  async downloadAndInstall(): Promise<AppUpdateInstallResult> {
    const prepared = await this.prepareUpdate();
    if (!prepared.ok || prepared.action !== 'installer-staged') return prepared;
    return this.launchPreparedUpdate('interactive');
  }
}

export function createAppUpdateService(options: AppUpdateServiceOptions): AppUpdateService {
  return new AppUpdateService(options);
}
