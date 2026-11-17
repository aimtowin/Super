import { createHash } from 'node:crypto';

import {
  DEFAULT_EXTENSION_CATALOG_URL,
  extensionCatalogSchema,
  type ExtensionCatalog,
  type ExtensionCatalogEntry,
} from '../shared/extension-catalog';
import type { PluginPackageManager } from './plugin-package-manager';
import type { PluginInstallationScope } from '../plugins/plugin-package';

const MAX_CATALOG_BYTES = 512 * 1024;
const MAX_ASSET_BYTES = 64 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;

export interface ExtensionCatalogOptions {
  readonly catalogUrl?: string;
  readonly fetchImpl?: typeof fetch;
  readonly allowInsecureForTests?: boolean;
}

export interface ExtensionPlatform {
  readonly platform: NodeJS.Platform;
  readonly arch: string;
}

export function extensionPlatformToken(platform: NodeJS.Platform, arch: string): string {
  return `${platform}-${arch}`;
}

function readablePlatforms(entry: ExtensionCatalogEntry, platformToken: string): boolean {
  return entry.platform === 'any' || entry.platform === platformToken;
}

function versionAtLeast(current: string, minimum: string): boolean {
  const parse = (value: string): number[] => value
    .split('-')[0]!
    .split('.')
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10) || 0);
  const left = parse(current);
  const right = parse(minimum);
  for (let index = 0; index < 3; index += 1) {
    if (left[index]! !== right[index]!) return left[index]! > right[index]!;
  }
  return true;
}

function assertSecureUrl(value: string, allowInsecureForTests: boolean): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' && !(allowInsecureForTests && url.protocol === 'http:')) {
    throw new Error('Extension catalogue must use HTTPS.');
  }
  return url;
}

async function readBoundedResponse(
  response: Response,
  maxBytes: number,
  label: string,
): Promise<Uint8Array> {
  if (!response.ok) throw new Error(`${label} request failed with HTTP ${response.status}.`);
  const declaredLength = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error(`${label} exceeds the maximum size.`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) {
    throw new Error(`${label} has an invalid size.`);
  }
  return bytes;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export class ExtensionCatalogClient {
  private readonly catalogUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly allowInsecureForTests: boolean;

  constructor(options: ExtensionCatalogOptions = {}) {
    this.catalogUrl = options.catalogUrl
      ?? process.env.SUPER_PLUGIN_CATALOG_URL
      ?? DEFAULT_EXTENSION_CATALOG_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.allowInsecureForTests = options.allowInsecureForTests
      ?? process.env.SUPER_E2E === '1';
  }

  async list(platform: ExtensionPlatform = { platform: process.platform, arch: process.arch }): Promise<ExtensionCatalogEntry[]> {
    const catalog = await this.#readCatalog();
    const token = extensionPlatformToken(platform.platform, platform.arch);
    return catalog.extensions
      .filter((entry) => readablePlatforms(entry, token))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async install(input: {
    manager: PluginPackageManager;
    pluginId: string;
    scope: PluginInstallationScope;
    libraryDirectory?: string;
    platform?: ExtensionPlatform;
    currentVersion: string;
  }): Promise<{ entry: ExtensionCatalogEntry; alreadyInstalled: boolean }> {
    const platform = input.platform ?? { platform: process.platform, arch: process.arch };
    const token = extensionPlatformToken(platform.platform, platform.arch);
    const catalog = await this.#readCatalog();
    const entry = catalog.extensions.find((candidate) => candidate.id === input.pluginId);
    if (entry === undefined) throw new Error(`Extension ${input.pluginId} is not in the server catalogue.`);
    if (!readablePlatforms(entry, token)) {
      throw new Error(`Extension ${entry.name} does not provide a build for ${token}.`);
    }
    if (entry.minAppVersion !== undefined && !versionAtLeast(input.currentVersion, entry.minAppVersion)) {
      throw new Error(`Extension ${entry.name} requires Super ${entry.minAppVersion} or newer.`);
    }

    const assetUrl = this.#resolveAssetUrl(entry);
    const response = await this.fetchImpl(assetUrl, {
      headers: { Accept: 'application/octet-stream' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const archive = await readBoundedResponse(response, MAX_ASSET_BYTES, `Extension ${entry.name}`);
    if (archive.byteLength !== entry.asset.size || sha256(archive) !== entry.asset.sha256) {
      throw new Error(`Extension ${entry.name} failed size or SHA-256 verification.`);
    }

    const installed = await input.manager.installFromArchive({
      archive,
      scope: input.scope,
      ...(input.libraryDirectory === undefined ? {} : { libraryDirectory: input.libraryDirectory }),
      source: {
        kind: 'local-package',
        // Keep the server identity stable across re-downloads while never
        // exposing an arbitrary URL to the plugin lock/UI.
        fingerprint: `server:${entry.id}:${entry.version}:${entry.asset.sha256}`,
      },
    });
    return { entry, alreadyInstalled: installed.alreadyInstalled };
  }

  async #readCatalog(): Promise<ExtensionCatalog> {
    const url = assertSecureUrl(this.catalogUrl, this.allowInsecureForTests);
    const response = await this.fetchImpl(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const bytes = await readBoundedResponse(response, MAX_CATALOG_BYTES, 'Extension catalogue');
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new Error('Extension catalogue is not valid JSON.');
    }
    const result = extensionCatalogSchema.safeParse(parsed);
    if (!result.success) throw new Error('Extension catalogue has an invalid schema.');
    return result.data;
  }

  #resolveAssetUrl(entry: ExtensionCatalogEntry): string {
    const catalogUrl = assertSecureUrl(this.catalogUrl, this.allowInsecureForTests);
    const base = new URL('./', catalogUrl);
    const asset = new URL(entry.asset.path, base);
    if (asset.origin !== catalogUrl.origin || !asset.pathname.startsWith(base.pathname)) {
      throw new Error('Extension asset must stay on the catalogue HTTPS origin.');
    }
    return asset.toString();
  }
}