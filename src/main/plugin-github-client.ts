import {
  type PluginFetch,
  type PluginGitHubClient,
  type PluginGitHubDownloadOptions,
  type PluginGitHubRelease,
  PluginPackageManagerError,
} from './plugin-package-manager-types';
import { parseGitHubRepositoryUrl } from '../shared/plugin-github-url';
import { defaultPluginPackageLimits } from '../plugins/plugin-package';

export { parseGitHubRepositoryUrl, isGitHubPluginInstallUrl } from '../shared/plugin-github-url';

const DEFAULT_NETWORK_TIMEOUT_MS = 30_000;
const cancelled = () => new DOMException('The download was stopped.', 'AbortError');

/** A single request or concurrent archive/commit pair, never a global scope. */
class DownloadControl {
  readonly controller = new AbortController();
  readonly maxArchiveBytes: number;
  readonly headerTimeoutMs: number;
  readonly idleTimeoutMs: number;
  readonly #aborted: Promise<never>;
  readonly #abortCleanup = new Set<() => void>();
  readonly #pauseListeners = new Set<(paused: boolean) => void>();
  readonly #timers = new Set<ReturnType<typeof setTimeout>>();
  readonly #responseOwners = new Map<Response, () => void>();
  #rejectAbort!: (error: unknown) => void;
  #error: unknown;
  #paused = false;
  #unsubscribePause: (() => void) | undefined;
  #unsubscribeParent: (() => void) | undefined;

  constructor(readonly options?: PluginGitHubDownloadOptions) {
    this.maxArchiveBytes = options?.maxArchiveBytes ?? defaultPluginPackageLimits.maxArchiveBytes;
    this.headerTimeoutMs = options?.headerTimeoutMs ?? DEFAULT_NETWORK_TIMEOUT_MS;
    this.idleTimeoutMs = options?.idleTimeoutMs ?? DEFAULT_NETWORK_TIMEOUT_MS;
    if (!Number.isSafeInteger(this.maxArchiveBytes) || this.maxArchiveBytes < 0
      || !Number.isFinite(this.headerTimeoutMs) || this.headerTimeoutMs <= 0 || this.headerTimeoutMs > 2_147_483_647
      || !Number.isFinite(this.idleTimeoutMs) || this.idleTimeoutMs <= 0 || this.idleTimeoutMs > 2_147_483_647) {
      throw new PluginPackageManagerError('PLUGIN_ARCHIVE_INVALID', 'Invalid GitHub download byte budget or timeout.');
    }
    this.#aborted = new Promise<never>((_resolve, reject) => { this.#rejectAbort = reject; });
    // Early aborts are observed; race() still receives the original rejection.
    void this.#aborted.catch(() => undefined);
    if (options?.signal !== undefined) {
      const parent = options.signal;
      const abort = () => this.abort(cancelled());
      parent.addEventListener('abort', abort, { once: true });
      this.#unsubscribeParent = () => parent.removeEventListener('abort', abort);
      if (parent.aborted) abort();
    }
    try {
      this.#unsubscribePause = options?.subscribePause?.((paused) => {
        this.#paused = paused;
        for (const listener of this.#pauseListeners) listener(paused);
      });
    } catch (error) { this.dispose(); throw error; }
  }

  get signal(): AbortSignal { return this.controller.signal; }
  throwIfAborted(): void { if (this.signal.aborted) throw this.#error; }

  abort(error: unknown): void {
    if (this.signal.aborted) return;
    this.#error = error;
    this.controller.abort(error);
    this.#rejectAbort(error);
    for (const cleanup of this.#abortCleanup) cleanup();
    this.#abortCleanup.clear();
  }

  race<T>(promise: Promise<T>): Promise<T> {
    // Always observe the passed promise, including an abort during read/fetch
    // creation; throwing here would leave its late rejection unhandled.
    return Promise.race([this.#aborted, promise]);
  }

  onAbort(cleanup: () => void): () => void {
    if (this.signal.aborted) { cleanup(); return () => undefined; }
    this.#abortCleanup.add(cleanup);
    return () => { this.#abortCleanup.delete(cleanup); };
  }

  timer(message: string, milliseconds: number): ReturnType<typeof setTimeout> {
    const timer = setTimeout(() => {
      this.#timers.delete(timer);
      const error = new Error(message);
      error.name = 'PluginDownloadTimeoutError';
      this.abort(error);
    }, milliseconds);
    this.#timers.add(timer);
    return timer;
  }

  clearTimer(timer: ReturnType<typeof setTimeout> | undefined): void {
    if (timer === undefined) return;
    clearTimeout(timer);
    this.#timers.delete(timer);
  }

  trackResponse(response: Response): void {
    const cancelBody = () => {
      try { void response.body?.cancel(this.#error).catch(() => undefined); }
      catch { /* A reader may own the body; its cancellation is separate. */ }
    };
    if (this.signal.aborted) { cancelBody(); return; }
    this.#responseOwners.set(response, this.onAbort(cancelBody));
  }

  releaseResponse(response: Response): void {
    this.#responseOwners.get(response)?.();
    this.#responseOwners.delete(response);
  }

  async activeRead<T>(read: () => Promise<T>): Promise<T> {
    this.throwIfAborted();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = (paused: boolean) => {
      this.clearTimer(timer);
      timer = undefined;
      if (!paused && !this.signal.aborted) timer = this.timer('GitHub download active-idle deadline timed out.', this.idleTimeoutMs);
    };
    this.#pauseListeners.add(arm);
    arm(this.#paused);
    try {
      const value = await this.race(read());
      this.throwIfAborted();
      return value;
    }
    finally { this.#pauseListeners.delete(arm); this.clearTimer(timer); }
  }

  dispose(): void {
    this.#unsubscribeParent?.();
    this.#unsubscribePause?.();
    for (const timer of this.#timers) clearTimeout(timer);
    this.#timers.clear();
    this.#pauseListeners.clear();
    this.#abortCleanup.clear();
    this.#responseOwners.clear();
  }
}

async function controlled<T>(options: PluginGitHubDownloadOptions | undefined, run: (control: DownloadControl) => Promise<T>): Promise<T> {
  const control = new DownloadControl(options);
  try {
    control.throwIfAborted();
    const value = await run(control);
    control.throwIfAborted();
    return value;
  }
  catch (error) { control.abort(error); throw error; }
  finally { control.dispose(); }
}

async function responseHeaders(fetchImpl: PluginFetch, url: string, init: RequestInit, control: DownloadControl): Promise<Response> {
  control.throwIfAborted();
  const timer = control.timer('GitHub response header deadline timed out.', control.headerTimeoutMs);
  try {
    const pending = fetchImpl(url, { ...init, signal: control.signal }).then((response) => {
      // Late responses from an injected fetch that ignores abort are cancelled,
      // not allowed to revive the already completed request.
      control.trackResponse(response);
      return response;
    });
    const response = await control.race(pending);
    control.throwIfAborted();
    return response;
  } finally { control.clearTimer(timer); }
}

async function githubJson(fetchImpl: PluginFetch, url: string, control: DownloadControl): Promise<unknown> {
  const response = await responseHeaders(fetchImpl, url, { headers: { Accept: 'application/vnd.github+json' } }, control);
  if (!response.ok) throw new PluginPackageManagerError('PLUGIN_ARCHIVE_INVALID', `GitHub request failed with HTTP ${response.status}.`);
  try { return await control.activeRead(() => response.json() as Promise<unknown>); }
  finally { control.releaseResponse(response); }
}

async function downloadBytes(
  response: Response,
  control: DownloadControl,
): Promise<Uint8Array> {
  const totalBytesHeader = response.headers.get('content-length');
  const parsedTotalBytes = totalBytesHeader === null ? undefined : Number(totalBytesHeader);
  const totalBytes = parsedTotalBytes !== undefined && Number.isSafeInteger(parsedTotalBytes) && parsedTotalBytes >= 0
    ? parsedTotalBytes
    : undefined;
  if (totalBytes !== undefined && totalBytes > control.maxArchiveBytes) {
    throw new PluginPackageManagerError('PLUGIN_ARCHIVE_INVALID', 'The plugin archive exceeds the maximum allowed size.');
  }
  if (response.body?.getReader === undefined) {
    throw new PluginPackageManagerError('PLUGIN_ARCHIVE_INVALID', 'GitHub archive download requires a readable stream; unbounded arrayBuffer is forbidden.');
  }
  const reader = response.body.getReader();
  control.releaseResponse(response);
  let cancelRequested = false;
  const releaseCancel = control.onAbort(() => {
    if (cancelRequested) return;
    cancelRequested = true;
    // A broken reader.cancel() must not hold terminal settlement hostage.
    try { void reader.cancel().catch(() => undefined); } catch { /* Best effort. */ }
  });
  const chunks: Uint8Array[] = [];
  let bytesDownloaded = 0;
  try {
    while (true) {
      control.throwIfAborted();
      await control.race(Promise.resolve().then(() => control.options?.waitIfPaused?.()));
      control.throwIfAborted();
      const next = await control.activeRead(() => reader.read());
      control.throwIfAborted();
      if (next.done) break;
      if (next.value.byteLength > control.maxArchiveBytes - bytesDownloaded) {
        throw new PluginPackageManagerError('PLUGIN_ARCHIVE_INVALID', 'The plugin archive exceeds the maximum allowed received-byte size.');
      }
      chunks.push(next.value);
      bytesDownloaded += next.value.byteLength;
      control.options?.onProgress?.({ bytesDownloaded, ...(totalBytes === undefined ? {} : { totalBytes }) });
    }
  } catch (error) { control.abort(error); throw error; }
  finally {
    releaseCancel();
    try { reader.releaseLock(); } catch { /* Pending read cancellation may reject release. */ }
  }
  control.throwIfAborted();
  const bytes = new Uint8Array(bytesDownloaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * Downloads Release platform assets (preferred) or already-built source archives.
 * It has no package manager, shell, build or lifecycle-script capability.
 */
export function createGitHubPluginClient(fetchImpl: PluginFetch = fetch): PluginGitHubClient {
  const githubApiRoot = 'https://api.github.com/repos';
  const commitForRef = async (repository: string, ref: string, control: DownloadControl): Promise<string> => {
    const { owner, name } = parseGitHubRepositoryUrl(repository);
    const body = await githubJson(fetchImpl, `${githubApiRoot}/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/commits/${encodeURIComponent(ref)}`, control);
    const sha = (body as { sha?: unknown }).sha;
    if (typeof sha !== 'string' || !/^[a-f0-9]{40,64}$/u.test(sha)) {
      throw new PluginPackageManagerError('PLUGIN_ARCHIVE_INVALID', 'GitHub returned an invalid commit SHA.');
    }
    return sha;
  };
  return {
    async listTags(repository: string, options?: PluginGitHubDownloadOptions): Promise<Array<{ name: string; commitSha: string }>> {
      return controlled(options, async (control) => {
        const { owner, name } = parseGitHubRepositoryUrl(repository);
        const body = await githubJson(fetchImpl, `${githubApiRoot}/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/tags?per_page=100`, control);
        if (!Array.isArray(body)) throw new PluginPackageManagerError('PLUGIN_ARCHIVE_INVALID', 'GitHub returned an invalid tag list.');
        return body.flatMap((tag) => {
          const nameValue = (tag as { name?: unknown }).name;
          const commitSha = (tag as { commit?: { sha?: unknown } }).commit?.sha;
          return typeof nameValue === 'string' && typeof commitSha === 'string' && /^[a-f0-9]{40,64}$/u.test(commitSha)
            ? [{ name: nameValue, commitSha }]
            : [];
        });
      });
    },
    async defaultBranch(repository: string, options?: PluginGitHubDownloadOptions): Promise<{ name: string; commitSha: string }> {
      return controlled(options, async (control) => {
        const { owner, name } = parseGitHubRepositoryUrl(repository);
        const body = await githubJson(fetchImpl, `${githubApiRoot}/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`, control);
        const branch = (body as { default_branch?: unknown }).default_branch;
        if (typeof branch !== 'string' || branch.length === 0) {
          throw new PluginPackageManagerError('PLUGIN_ARCHIVE_INVALID', 'GitHub returned no default branch for the plugin repository.');
        }
        return { name: branch, commitSha: await commitForRef(repository, branch, control) };
      });
    },
    async listReleases(repository: string, options?: PluginGitHubDownloadOptions): Promise<PluginGitHubRelease[]> {
      return controlled(options, async (control) => {
        const { owner, name } = parseGitHubRepositoryUrl(repository);
        const body = await githubJson(
          fetchImpl,
          `${githubApiRoot}/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/releases?per_page=30`,
          control,
        );
        if (!Array.isArray(body)) {
          throw new PluginPackageManagerError('PLUGIN_ARCHIVE_INVALID', 'GitHub returned an invalid release list.');
        }
        return body.flatMap((release) => {
          const tagName = (release as { tag_name?: unknown }).tag_name;
          const draft = (release as { draft?: unknown }).draft === true;
          const prerelease = (release as { prerelease?: unknown }).prerelease === true;
          const assetsRaw = (release as { assets?: unknown }).assets;
          if (typeof tagName !== 'string' || tagName.length === 0 || !Array.isArray(assetsRaw)) return [];
          const assets = assetsRaw.flatMap((asset) => {
            const assetName = (asset as { name?: unknown }).name;
            const browserDownloadUrl = (asset as { browser_download_url?: unknown }).browser_download_url;
            const size = (asset as { size?: unknown }).size;
            return typeof assetName === 'string'
              && typeof browserDownloadUrl === 'string'
              && typeof size === 'number'
              && Number.isFinite(size)
              && size >= 0
              ? [{ name: assetName, browserDownloadUrl, size }]
              : [];
          });
          return [{ tagName, draft, prerelease, assets }];
        });
      });
    },
    async downloadReleaseAsset(browserDownloadUrl: string, options?: PluginGitHubDownloadOptions): Promise<Uint8Array> {
      let url: URL;
      try {
        url = new URL(browserDownloadUrl);
      } catch {
        throw new PluginPackageManagerError('PLUGIN_ARCHIVE_INVALID', 'GitHub release asset URL is invalid.');
      }
      if (url.protocol !== 'https:') {
        throw new PluginPackageManagerError('PLUGIN_ARCHIVE_INVALID', 'GitHub release asset URL must be HTTPS.');
      }
      return controlled(options, async (control) => {
        const response = await responseHeaders(fetchImpl, browserDownloadUrl, {
          headers: { Accept: 'application/octet-stream' },
          redirect: 'follow',
        }, control);
        if (!response.ok) {
          throw new PluginPackageManagerError('PLUGIN_ARCHIVE_INVALID', `GitHub release asset download failed with HTTP ${response.status}.`);
        }
        return downloadBytes(response, control);
      });
    },
    async downloadArchive(repository: string, ref: string, options?: PluginGitHubDownloadOptions): Promise<{ archive: Uint8Array; commitSha: string }> {
      return controlled(options, async (control) => {
        const { owner, name } = parseGitHubRepositoryUrl(repository);
        const [commitSha, archive] = await Promise.all([
          commitForRef(repository, ref, control),
          responseHeaders(fetchImpl, `${githubApiRoot}/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/zipball/${encodeURIComponent(ref)}`,
            { headers: { Accept: 'application/vnd.github+json' } }, control).then((response) => {
            if (!response.ok) throw new PluginPackageManagerError('PLUGIN_ARCHIVE_INVALID', `GitHub archive download failed with HTTP ${response.status}.`);
            return downloadBytes(response, control);
          }),
        ]);
        return { archive, commitSha };
      });
    },
    async commitShaForRef(repository: string, ref: string, options?: PluginGitHubDownloadOptions): Promise<string> {
      return controlled(options, (control) => commitForRef(repository, ref, control));
    },
  };
}
