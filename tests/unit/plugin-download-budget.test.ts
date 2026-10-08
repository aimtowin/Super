import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGitHubPluginClient } from '../../src/main/plugin-github-client';
import { PluginInstallOperation } from '../../src/main/plugin-install-operation';
import { PluginPackageManager } from '../../src/main/plugin-package-manager';
import type { PluginGitHubClient, PluginGitHubDownloadOptions } from '../../src/main/plugin-package-manager-types';
import { defaultPluginPackageLimits } from '../../src/plugins/plugin-package';
import manifestFixture from '../fixtures/plugin-manifests/palette-tools.super-plugin.json';

const repository = 'https://github.com/example/super-palette-tools';
const assetUrl = `${repository}/releases/download/v2.0.0/com.example.palette-tools-2.0.0-darwin-arm64.zip`;
const sha = 'a'.repeat(40);
// These optional controls are passed to the EXISTING production entry point.
// The red branch ignores them; absence of a future module is never the red.
type BudgetOptions = PluginGitHubDownloadOptions & {
  maxArchiveBytes?: number;
  headerTimeoutMs?: number;
  idleTimeoutMs?: number;
  subscribePause?: (listener: (paused: boolean) => void) => () => void;
};
type ReadResult = ReadableStreamReadResult<Uint8Array>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
function observed<T>(promise: Promise<T>) {
  const result: { status: 'pending' | 'fulfilled' | 'rejected'; promise: Promise<T>; value?: T; error?: unknown } = { status: 'pending', promise };
  void promise.then(
    (value) => { result.status = 'fulfilled'; result.value = value; },
    (error: unknown) => { result.status = 'rejected'; result.error = error; },
  );
  return result;
}
async function flush() {
  for (let index = 0; index < 24; index += 1) await Promise.resolve();
}
function streamedResponse(chunks: Uint8Array[], contentLength?: string, pendingRead?: Promise<ReadResult>) {
  let index = 0;
  const read = vi.fn(async (): Promise<ReadResult> => {
    if (index < chunks.length) return { done: false, value: chunks[index++]! };
    return pendingRead ?? { done: true, value: undefined };
  });
  const cancel = vi.fn(async () => undefined);
  const releaseLock = vi.fn();
  const bodyCancel = vi.fn(async () => undefined);
  const reader = { read, cancel, releaseLock };
  const response = {
    ok: true, status: 200,
    headers: new Headers(contentLength === undefined ? {} : { 'content-length': contentLength }),
    body: { getReader: vi.fn(() => reader), cancel: bodyCancel },
    arrayBuffer: vi.fn(async () => new Uint8Array([9]).buffer),
  } as unknown as Response;
  return { response, read, cancel, releaseLock, bodyCancel };
}
function pauseControl() {
  let paused = false;
  const listeners = new Set<(value: boolean) => void>();
  let resume: (() => void) | undefined;
  return {
    options: {
      waitIfPaused: async () => { if (paused) await new Promise<void>((resolve) => { resume = resolve; }); },
      subscribePause: (listener: (value: boolean) => void) => {
        listeners.add(listener);
        listener(paused);
        return () => { listeners.delete(listener); };
      },
    },
    pause: () => { paused = true; for (const listener of listeners) listener(true); },
    resume: () => { paused = false; for (const listener of listeners) listener(false); resume?.(); resume = undefined; },
    listenerCount: () => listeners.size,
  };
}
function abortError(error: unknown): boolean {
  return error instanceof Error && ['AbortError', 'PluginInstallCancelledError'].includes(error.name);
}

const roots: string[] = [];
function managerFixture(maxArchiveBytes = 32) {
  const root = mkdtempSync(path.join(tmpdir(), 'super-plugin-budget-'));
  roots.push(root);
  const manager = new PluginPackageManager({ userDataDirectory: path.join(root, 'user-data'), deviceId: path.basename(root),
    superVersion: '0.2.4', pluginApiVersion: 1, platform: 'darwin', arch: 'arm64', nodeAbi: 140,
    limits: { ...defaultPluginPackageLimits, maxArchiveBytes } });
  return { root, manager };
}
function customClient(): PluginGitHubClient {
  return {
    listTags: vi.fn(async () => [{ name: 'v2.0.0', commitSha: sha }]),
    defaultBranch: vi.fn(async () => ({ name: 'main', commitSha: sha })),
    listReleases: vi.fn(async () => [{ tagName: 'v2.0.0', draft: false, prerelease: false,
      assets: [{ name: 'com.example.palette-tools-2.0.0-darwin-arm64.zip', browserDownloadUrl: assetUrl, size: 2 }] }]),
    downloadReleaseAsset: vi.fn(async () => new Uint8Array([1, 2])),
    downloadArchive: vi.fn(async () => ({ archive: new Uint8Array([1, 2]), commitSha: sha })),
    commitShaForRef: vi.fn(async () => sha),
  };
}
async function installOldPackage(root: string, manager: PluginPackageManager) {
  const source = path.join(root, 'source');
  mkdirSync(path.join(source, 'dist/ui'), { recursive: true });
  writeFileSync(path.join(source, 'super-plugin.json'), JSON.stringify({ ...manifestFixture, version: '1.2.0' }));
  writeFileSync(path.join(source, 'dist/main.js'), 'export const original = "old fixture bytes";\n');
  writeFileSync(path.join(source, 'dist/ui/index.html'), '<main>old fixture</main>');
  writeFileSync(path.join(source, 'README.md'), '# Palette Tools fixture\n');
  writeFileSync(path.join(source, 'LICENSE'), 'MIT\n');
  return manager.installFromDirectory({ directory: source, scope: 'user', source: { kind: 'github', repository,
    ref: 'v1.2.0', commitSha: sha, fingerprint: `github:${repository}` } });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== path.resolve(tmpdir()) || !path.basename(root).startsWith('super-plugin-budget-')) {
      throw new Error('Refusing to clean a non-owned plugin budget fixture.');
    }
    rmSync(root, { recursive: true, force: true });
  }
});

describe('real GitHub client receive-time archive budget', () => {
  it.each([undefined, '2', 'bogus', '-9'])('rejects actual chunks above the budget despite Content-Length=%s', async (contentLength) => {
    const stream = streamedResponse([new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6]), new Uint8Array([7, 8, 9])], contentLength);
    const progress = vi.fn<(event: { bytesDownloaded: number; totalBytes?: number }) => void>();
    const options: BudgetOptions = { maxArchiveBytes: 6, onProgress: progress };
    const result = observed(createGitHubPluginClient(vi.fn(async () => stream.response)).downloadReleaseAsset(assetUrl, options));
    await expect(result.promise).rejects.toMatchObject({ code: 'PLUGIN_ARCHIVE_INVALID' });
    expect(result.status).toBe('rejected');
    expect(result.error).toMatchObject({ code: 'PLUGIN_ARCHIVE_INVALID' });
    expect(stream.read).toHaveBeenCalledTimes(3);
    expect(stream.cancel).toHaveBeenCalledTimes(1);
    expect(stream.releaseLock).toHaveBeenCalledTimes(1);
    expect(progress.mock.calls.map(([event]) => event.bytesDownloaded)).toEqual([3, 6]);
  });

  it('rejects a declared oversized body before any reader read', async () => {
    const stream = streamedResponse([new Uint8Array([1])], '7');
    const options: BudgetOptions = { maxArchiveBytes: 6 };
    const result = observed(createGitHubPluginClient(vi.fn(async () => stream.response)).downloadReleaseAsset(assetUrl, options));
    await flush();
    expect(result.status).toBe('rejected');
    expect(result.error).toMatchObject({ code: 'PLUGIN_ARCHIVE_INVALID' });
    expect(stream.read).not.toHaveBeenCalled();
  });

  it('allows fragmented data exactly at the budget and clears timers/listeners on success', async () => {
    vi.useFakeTimers();
    const parent = new AbortController();
    const pause = pauseControl();
    const stream = streamedResponse([new Uint8Array([1, 2]), new Uint8Array([3]), new Uint8Array([4, 5, 6])]);
    const options: BudgetOptions = { ...pause.options, signal: parent.signal, maxArchiveBytes: 6, headerTimeoutMs: 30, idleTimeoutMs: 30 };
    const bytes = await createGitHubPluginClient(vi.fn(async () => stream.response)).downloadReleaseAsset(assetUrl, options);
    expect([...bytes]).toEqual([1, 2, 3, 4, 5, 6]);
    expect(stream.cancel).not.toHaveBeenCalled();
    expect(stream.releaseLock).toHaveBeenCalledTimes(1);
    expect(pause.listenerCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    parent.abort();
    await flush();
    expect(stream.cancel).not.toHaveBeenCalled();
  });

  it('enforces the same cumulative budget on the source archive entry point', async () => {
    const stream = streamedResponse([new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6])], '1');
    const fetchImpl = vi.fn(async (url: string) => url.includes('/commits/')
      ? new Response(JSON.stringify({ sha }), { status: 200 }) : stream.response);
    const options: BudgetOptions = { maxArchiveBytes: 5 };
    const result = observed(createGitHubPluginClient(fetchImpl).downloadArchive(repository, 'main', options));
    await flush();
    expect(result.status).toBe('rejected');
    expect(result.error).toMatchObject({ code: 'PLUGIN_ARCHIVE_INVALID' });
    expect(stream.cancel).toHaveBeenCalledTimes(1);
  });

  it('fails diagnostically without calling unbounded arrayBuffer when there is no reader', async () => {
    const arrayBuffer = vi.fn(async () => new Uint8Array([1, 2, 3]).buffer);
    const response = { ok: true, status: 200, headers: new Headers(), body: null, arrayBuffer } as unknown as Response;
    const result = observed(createGitHubPluginClient(vi.fn(async () => response)).downloadReleaseAsset(assetUrl));
    await flush();
    expect(result.status).toBe('rejected');
    expect(result.error).toMatchObject({ code: 'PLUGIN_ARCHIVE_INVALID' });
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('samples memory for a small generated fragmented archive without asserting an RSS cap', async () => {
    const archiveBytes = 256 * 1_024;
    const chunkBytes = 32 * 1_024;
    const samples: Array<{ stage: string; rss: number; external: number; arrayBuffers: number }> = [];
    const sample = (stage: string) => {
      const { rss, external, arrayBuffers } = process.memoryUsage();
      samples.push({ stage, rss, external, arrayBuffers });
    };
    sample('before');
    let received = 0;
    const reader = {
      read: vi.fn(async (): Promise<ReadResult> => {
        if (received === archiveBytes) return { done: true, value: undefined };
        const chunk = new Uint8Array(chunkBytes).fill(received / chunkBytes + 1);
        received += chunk.byteLength;
        sample(`read:${received}`);
        return { done: false, value: chunk };
      }),
      cancel: vi.fn(async () => undefined),
      releaseLock: vi.fn(),
    };
    const response = { ok: true, status: 200, headers: new Headers(),
      body: { getReader: () => reader, cancel: vi.fn(async () => undefined) } } as unknown as Response;
    const bytes = await createGitHubPluginClient(vi.fn(async () => response)).downloadReleaseAsset(assetUrl, {
      maxArchiveBytes: archiveBytes,
      onProgress: ({ bytesDownloaded }) => sample(`progress:${bytesDownloaded}`),
    });
    sample('after-merge');
    expect(bytes.byteLength).toBe(archiveBytes);
    expect(bytes[0]).toBe(1);
    expect(bytes.at(-1)).toBe(8);
    expect(reader.read).toHaveBeenCalledTimes(9);
    expect(reader.cancel).not.toHaveBeenCalled();
    expect(reader.releaseLock).toHaveBeenCalledTimes(1);
    expect(samples).toHaveLength(18);
    if (process.env.SUPER_TEST_DOWNLOAD_MEMORY_RECORD === '1') {
      const sampledMax = Object.fromEntries(['rss', 'external', 'arrayBuffers'].map((key) => [key,
        Math.max(...samples.map((item) => item[key as 'rss' | 'external' | 'arrayBuffers'])),
      ]));
      console.info(JSON.stringify({ kind: 'plugin-download-memory-sample', archiveBytes, chunkBytes,
        sampleCount: samples.length, before: samples[0], afterMerge: samples.at(-1), sampledMax,
        note: 'Sampled maxima only, not a continuously observed peak, a strict RSS limit, or a 256 MiB archive measurement.',
        samples }));
    }
  });
});

describe('real GitHub client cancellable header/read/pause lifetime', () => {
  it.each(['fetch', 'read'] as const)('observes a rejected %s promise when it synchronously aborts the parent', async (entry) => {
    const parent = new AbortController();
    const rejection = new Error(`Synchronous ${entry} rejection after abort.`);
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => { unhandled.push(reason); };
    process.on('unhandledRejection', onUnhandled);
    const stream = streamedResponse([]);
    const abortAndReject = () => { parent.abort(); return Promise.reject(rejection); };
    const fetchImpl = vi.fn(() => entry === 'fetch' ? abortAndReject() : Promise.resolve(stream.response));
    if (entry === 'read') stream.read.mockImplementation(abortAndReject);
    try {
      await expect(createGitHubPluginClient(fetchImpl).downloadReleaseAsset(assetUrl,
        { signal: parent.signal })).rejects.toMatchObject({ name: 'AbortError' });
      await new Promise<void>((resolve) => { setImmediate(resolve); });
      expect(unhandled).toEqual([]);
      if (entry === 'read') {
        expect(stream.cancel).toHaveBeenCalledTimes(1);
        expect(stream.releaseLock).toHaveBeenCalledTimes(1);
      }
    } finally { parent.abort(); process.removeListener('unhandledRejection', onUnhandled); }
  });

  it('cancels a hanging reader immediately, even when reader.cancel itself never settles', async () => {
    const pending = deferred<ReadResult>();
    const stream = streamedResponse([], undefined, pending.promise);
    stream.cancel.mockImplementation(() => new Promise<undefined>(() => undefined));
    const parent = new AbortController();
    const result = observed(createGitHubPluginClient(vi.fn(async () => stream.response)).downloadReleaseAsset(assetUrl, { signal: parent.signal }));
    try {
      await flush();
      expect(stream.read).toHaveBeenCalledTimes(1);
      parent.abort();
      await flush();
      expect(result.status).toBe('rejected');
      expect(abortError(result.error)).toBe(true);
      expect(stream.cancel).toHaveBeenCalledTimes(1);
      expect(stream.releaseLock).toHaveBeenCalledTimes(1);
    } finally {
      parent.abort();
      pending.resolve({ done: true, value: undefined });
      await flush();
    }
  });

  it.each([undefined, 40])('times out a hanging response header with the default/configured deadline %s', async (headerTimeoutMs) => {
    vi.useFakeTimers();
    const header = deferred<Response>();
    const fetchImpl = vi.fn((_url: string, _init?: RequestInit) => {
      void _url; void _init; // The recorded tuple proves timeout aborts the actual fetch signal.
      return header.promise;
    });
    const deadline = headerTimeoutMs ?? 30_000;
    const options: BudgetOptions = { headerTimeoutMs };
    const result = observed(createGitHubPluginClient(fetchImpl).downloadReleaseAsset(assetUrl, options));
    try {
      await vi.advanceTimersByTimeAsync(deadline - 1);
      expect(result.status).toBe('pending');
      await vi.advanceTimersByTimeAsync(1);
      expect(result.status).toBe('rejected');
      expect(result.error).toBeInstanceOf(Error);
      expect((result.error as Error).message).toMatch(/timed out|timeout|deadline/iu);
      expect(fetchImpl.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally { header.resolve(streamedResponse([]).response); await flush(); }
  });

  it.each([undefined, 40])('uses the default/configured active-idle deadline %s and clears it on failure', async (idleTimeoutMs) => {
    vi.useFakeTimers();
    const pending = deferred<ReadResult>();
    const stream = streamedResponse([], undefined, pending.promise);
    const deadline = idleTimeoutMs ?? 30_000;
    const options: BudgetOptions = { idleTimeoutMs };
    const result = observed(createGitHubPluginClient(vi.fn(async () => stream.response)).downloadReleaseAsset(assetUrl, options));
    try {
      await flush();
      await vi.advanceTimersByTimeAsync(deadline - 1);
      expect(result.status).toBe('pending');
      await vi.advanceTimersByTimeAsync(1);
      expect(result.status).toBe('rejected');
      expect((result.error as Error).message).toMatch(/timed out|timeout|deadline/iu);
      expect(stream.cancel).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally { pending.resolve({ done: true, value: undefined }); await flush(); }
  });

  it('allows progressive fragmented reads lasting longer than 30 seconds without a total-duration cap', async () => {
    vi.useFakeTimers();
    let index = 0;
    const read = vi.fn(async (): Promise<ReadResult> => {
      if (index === 4) return { done: true, value: undefined };
      const value = ++index;
      await new Promise<void>((resolve) => { setTimeout(resolve, 20_000); });
      return { done: false, value: new Uint8Array([value]) };
    });
    const cancel = vi.fn(async () => undefined);
    const releaseLock = vi.fn();
    const response = { ok: true, status: 200, headers: new Headers(),
      body: { getReader: () => ({ read, cancel, releaseLock }), cancel: vi.fn(async () => undefined) } } as unknown as Response;
    const progress = vi.fn();
    const result = observed(createGitHubPluginClient(vi.fn(async () => response)).downloadReleaseAsset(assetUrl,
      { maxArchiveBytes: 4, onProgress: progress }));
    await flush();
    for (let chunk = 0; chunk < 4; chunk += 1) {
      await vi.advanceTimersByTimeAsync(20_000);
      if (chunk < 3) expect(result.status).toBe('pending');
    }
    expect(result.status).toBe('fulfilled');
    expect([...result.value!]).toEqual([1, 2, 3, 4]);
    expect(progress).toHaveBeenCalledTimes(4);
    expect(cancel).not.toHaveBeenCalled();
    expect(releaseLock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('excludes user pause from idle time even after reader.read is already hanging', async () => {
    vi.useFakeTimers();
    const pending = deferred<ReadResult>();
    const stream = streamedResponse([], undefined, pending.promise);
    const pause = pauseControl();
    const options: BudgetOptions = { ...pause.options, idleTimeoutMs: 40 };
    const result = observed(createGitHubPluginClient(vi.fn(async () => stream.response)).downloadReleaseAsset(assetUrl, options));
    try {
      await flush();
      expect(stream.read).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(30);
      pause.pause();
      await vi.advanceTimersByTimeAsync(400);
      expect(result.status).toBe('pending');
      expect(stream.cancel).not.toHaveBeenCalled();
      pause.resume();
      await vi.advanceTimersByTimeAsync(39);
      expect(result.status).toBe('pending');
      await vi.advanceTimersByTimeAsync(1);
      expect(result.status).toBe('rejected');
      expect(stream.cancel).toHaveBeenCalledTimes(1);
      expect(pause.listenerCount()).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally { pause.resume(); pending.resolve({ done: true, value: undefined }); await flush(); }
  });

  it('can cancel while a caller-provided pause promise is still pending', async () => {
    const pause = pauseControl();
    const stream = streamedResponse([new Uint8Array([1])]);
    const parent = new AbortController();
    pause.pause();
    const options: BudgetOptions = { ...pause.options, signal: parent.signal };
    const result = observed(createGitHubPluginClient(vi.fn(async () => stream.response)).downloadReleaseAsset(assetUrl, options));
    try {
      await flush();
      parent.abort();
      await flush();
      expect(result.status).toBe('rejected');
      expect(abortError(result.error)).toBe(true);
      expect(stream.read).not.toHaveBeenCalled();
      expect(stream.cancel).toHaveBeenCalledTimes(1);
      expect(pause.listenerCount()).toBe(0);
    } finally { parent.abort(); pause.resume(); await flush(); }
  });

  it('cancels both concurrent commit/archive requests instead of leaving commit lookup hanging', async () => {
    const commit = deferred<Response>();
    const pending = deferred<ReadResult>();
    const stream = streamedResponse([], undefined, pending.promise);
    const parent = new AbortController();
    const fetchImpl = vi.fn((url: string, _init?: RequestInit) => {
      void _init; // Keep signal in mock.calls without making the fake cooperate with abort.
      return url.includes('/commits/') ? commit.promise : Promise.resolve(stream.response);
    });
    const result = observed(createGitHubPluginClient(fetchImpl).downloadArchive(repository, 'main', { signal: parent.signal }));
    try {
      await flush();
      parent.abort();
      await flush();
      expect(result.status).toBe('rejected');
      expect(abortError(result.error)).toBe(true);
      expect(fetchImpl.mock.calls).toHaveLength(2);
      expect(fetchImpl.mock.calls.every(([, init]) => init?.signal?.aborted === true)).toBe(true);
      expect(stream.cancel.mock.calls.length + stream.bodyCancel.mock.calls.length).toBe(1);
    } finally { parent.abort(); commit.resolve(new Response(JSON.stringify({ sha }))); pending.resolve({ done: true, value: undefined }); await flush(); }
  });

  it('stops a real operation during pause without a later completion notification', async () => {
    const report = vi.fn();
    const operation = new PluginInstallOperation('download-pause-stop', report);
    const stream = streamedResponse([new Uint8Array([1])]);
    operation.control('pause');
    const result = observed(createGitHubPluginClient(vi.fn(async () => stream.response)).downloadReleaseAsset(assetUrl, operation.downloadOptions()));
    await flush();
    operation.control('stop');
    await flush();
    expect(result.status).toBe('rejected');
    expect(stream.read).not.toHaveBeenCalled();
    expect(stream.cancel).toHaveBeenCalledTimes(1);
    operation.setCompleted();
    expect(report).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'stopped' }));
  });
});

describe('actual PackageManager install/update budget plumbing and final safety boundary', () => {
  it.each(['release', 'source', 'default-branch'] as const)('forwards the archive limit and parent signal through %s installation', async (route) => {
    const { manager } = managerFixture();
    const client = customClient();
    if (route !== 'release') vi.mocked(client.listReleases).mockResolvedValue([]);
    if (route === 'default-branch') vi.mocked(client.listTags).mockResolvedValue([]);
    const sentinel = new Error('Stop after inspecting the real manager download handoff.');
    vi.spyOn(manager, 'installFromArchive').mockRejectedValue(sentinel);
    const parent = new AbortController();
    await expect(manager.installFromGitHub({ repository, scope: 'user', client, signal: parent.signal })).rejects.toBe(sentinel);
    const options = expect.objectContaining({ maxArchiveBytes: 32, signal: expect.any(AbortSignal) });
    expect(client.listReleases).toHaveBeenCalledWith(repository, options);
    if (route === 'release') {
      expect(client.downloadReleaseAsset).toHaveBeenCalledWith(assetUrl, options);
      expect(client.commitShaForRef).toHaveBeenCalledWith(repository, 'v2.0.0', options);
    } else {
      expect(client.listTags).toHaveBeenCalledWith(repository, options);
      if (route === 'default-branch') expect(client.defaultBranch).toHaveBeenCalledWith(repository, options);
      expect(client.downloadArchive).toHaveBeenCalledWith(repository, route === 'source' ? 'v2.0.0' : 'main', options);
    }
  });

  it.each([1_024, 12])('only permits caller budget %s to tighten, never exceed, the host limit', async (requested) => {
    const { manager } = managerFixture();
    const client = customClient();
    const sentinel = new Error('Observed budget handoff.');
    vi.spyOn(manager, 'installFromArchive').mockRejectedValue(sentinel);
    await expect(manager.installFromGitHub({ repository, scope: 'user', client,
      downloadOptions: { maxArchiveBytes: requested } })).rejects.toBe(sentinel);
    expect(client.downloadReleaseAsset).toHaveBeenCalledWith(assetUrl,
      expect.objectContaining({ maxArchiveBytes: Math.min(32, requested) }));
  });

  it.each([NaN, Infinity, -1, 0.5])('rejects invalid caller budget %s before calling a custom client', async (requested) => {
    const { manager } = managerFixture();
    const client = customClient();
    await expect(manager.installFromGitHub({ repository, scope: 'user', client,
      downloadOptions: { maxArchiveBytes: requested } })).rejects.toMatchObject({ code: 'PLUGIN_ARCHIVE_INVALID' });
    expect(client.listReleases).not.toHaveBeenCalled();
    expect(client.downloadReleaseAsset).not.toHaveBeenCalled();
  });

  it('propagates parent cancellation into both real release-download/commit children without fallback', async () => {
    const { manager } = managerFixture();
    const parent = new AbortController();
    const pending = deferred<Response>();
    const requests: Array<{ url: string; signal: AbortSignal | undefined | null }> = [];
    const fetchImpl = vi.fn((url: string, init?: RequestInit) => {
      requests.push({ url, signal: init?.signal });
      if (url.includes('/releases?')) return Promise.resolve(new Response(JSON.stringify([{
        tag_name: 'v2.0.0', assets: [{ name: path.basename(assetUrl), browser_download_url: assetUrl, size: 2 }],
      }])));
      return pending.promise; // Deliberately ignores AbortSignal.
    });
    const result = observed(manager.installFromGitHub({ repository, scope: 'user', signal: parent.signal,
      client: createGitHubPluginClient(fetchImpl) }));
    try {
      await flush();
      expect(requests).toHaveLength(3);
      parent.abort();
      await flush();
      expect(result.status).toBe('rejected');
      expect(abortError(result.error)).toBe(true);
      expect(requests.slice(1).every(({ signal }) => signal?.aborted)).toBe(true);
      expect(requests.some(({ url }) => url.includes('/tags?'))).toBe(false);
    } finally { parent.abort(); pending.resolve(streamedResponse([]).response); await flush(); }
  });

  it('cancels the pending real commit sibling on budget failure, without aborting the parent or falling back', async () => {
    const { manager } = managerFixture();
    const parent = new AbortController();
    const pendingCommit = deferred<Response>();
    const stream = streamedResponse([new Uint8Array(33)]);
    let commitSignal: AbortSignal | undefined | null;
    const fetchImpl = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('/releases?')) return Promise.resolve(new Response(JSON.stringify([{
        tag_name: 'v2.0.0', assets: [{ name: path.basename(assetUrl), browser_download_url: assetUrl, size: 1 }],
      }])));
      if (url.includes('/commits/')) { commitSignal = init?.signal; return pendingCommit.promise; }
      return Promise.resolve(stream.response);
    });
    const result = observed(manager.installFromGitHub({ repository, scope: 'user', signal: parent.signal,
      client: createGitHubPluginClient(fetchImpl) }));
    try {
      await expect(result.promise).rejects.toMatchObject({ code: 'PLUGIN_ARCHIVE_INVALID' });
      expect(result.status).toBe('rejected');
      expect(result.error).toMatchObject({ code: 'PLUGIN_ARCHIVE_INVALID' });
      expect(commitSignal?.aborted).toBe(true);
      expect(parent.signal.aborted).toBe(false);
      expect(stream.cancel).toHaveBeenCalledTimes(1);
      expect(fetchImpl.mock.calls.some(([url]) => url.includes('/tags?'))).toBe(false);
    } finally { pendingCommit.resolve(new Response(JSON.stringify({ sha }))); await flush(); }
  });

  it('keeps the final archive size check for a legacy custom client that ignores download controls', async () => {
    const { manager } = managerFixture();
    const client = customClient();
    vi.mocked(client.downloadReleaseAsset).mockResolvedValue(new Uint8Array(33));
    await expect(manager.installFromGitHub({ repository, scope: 'user', client })).rejects.toMatchObject({ code: 'PLUGIN_ARCHIVE_INVALID' });
    await expect(manager.listInstalled({ scope: 'user' })).resolves.toEqual([]);
  });

  it('forwards limits/signal to the update download and retains the verified old plugin on failure', async () => {
    const { root, manager } = managerFixture();
    const installed = await installOldPackage(root, manager);
    const entry = path.join(installed.packageDirectory, 'dist/main.js');
    const original = readFileSync(entry);
    const client = customClient();
    vi.mocked(client.downloadReleaseAsset).mockResolvedValue(new Uint8Array(33));
    const parent = new AbortController();
    const input = { scope: 'user' as const, pluginId: installed.package.lock.pluginId,
      packageHash: installed.package.lock.packageHash, client, signal: parent.signal };
    await expect(manager.applyGitHubUpdateForLock(input)).rejects.toMatchObject({ code: 'PLUGIN_ARCHIVE_INVALID' });
    expect(client.downloadReleaseAsset).toHaveBeenCalledWith(assetUrl, expect.objectContaining({ maxArchiveBytes: 32, signal: parent.signal }));
    expect(readFileSync(entry)).toEqual(original);
    await expect(manager.listInstalled({ scope: 'user' })).resolves.toMatchObject([
      { status: 'valid', package: { lock: { version: '1.2.0', packageHash: installed.package.lock.packageHash } } },
    ]);
  });
});
