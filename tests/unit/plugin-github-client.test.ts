import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGitHubPluginClient } from '../../src/main/plugin-github-client';
import type { PluginGitHubDownloadOptions } from '../../src/main/plugin-package-manager-types';

const repository = 'https://github.com/owner/repo';
const sha = 'a'.repeat(40);
type ControlledLookup = (repository: string, options?: PluginGitHubDownloadOptions) => Promise<unknown>;
type ControlledCommit = (repository: string, ref: string, options?: PluginGitHubDownloadOptions) => Promise<string>;

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('GitHub plugin client downloads', () => {
  it('streams release bytes and reports progress without exposing a path', async () => {
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array([1, 2, 3, 4]), {
      status: 200,
      headers: { 'content-length': '4' },
    }));
    const progress: Array<{ bytesDownloaded: number; totalBytes?: number }> = [];
    const archive = await createGitHubPluginClient(fetchImpl).downloadReleaseAsset(
      'https://github.com/owner/repo/releases/download/v1/plugin.zip',
      { onProgress: (event) => progress.push(event) },
    );
    expect([...archive]).toEqual([1, 2, 3, 4]);
    expect(progress.at(-1)).toEqual({ bytesDownloaded: 4, totalBytes: 4 });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://github.com/owner/repo/releases/download/v1/plugin.zip',
      expect.objectContaining({ redirect: 'follow' }),
    );
  });

  it('preserves the normal source archive/commit result', async () => {
    const fetchImpl = vi.fn(async (url: string) => url.includes('/commits/')
      ? new Response(JSON.stringify({ sha })) : new Response(new Uint8Array([1, 2, 3])));
    const result = await createGitHubPluginClient(fetchImpl).downloadArchive(repository, 'main');
    expect(result.commitSha).toBe(sha);
    expect([...result.archive]).toEqual([1, 2, 3]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each(['listTags', 'listReleases', 'defaultBranch', 'commitShaForRef'] as const)('passes parent cancellation into the actual %s fetch chain', async (method) => {
    const parent = new AbortController();
    const fetchImpl = vi.fn(async (url: string, _init?: RequestInit) => {
      void _init; // Retain the RequestInit tuple so signal forwarding is asserted below.
      if (url.includes('/tags?') || url.includes('/releases?')) return new Response('[]');
      return new Response(JSON.stringify({ sha, default_branch: 'main' }));
    });
    const client = createGitHubPluginClient(fetchImpl);
    if (method === 'commitShaForRef') {
      await (client.commitShaForRef as ControlledCommit)(repository, 'main', { signal: parent.signal });
    } else {
      await (client[method] as ControlledLookup)(repository, { signal: parent.signal });
    }
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(0);
    expect(fetchImpl.mock.calls.every(([, init]) => init?.signal instanceof AbortSignal)).toBe(true);
  });

  it('settles an aborted commit header even if the injected fetch ignores its signal', async () => {
    const parent = new AbortController();
    let release!: (response: Response) => void;
    const header = new Promise<Response>((resolve) => { release = resolve; });
    const client = createGitHubPluginClient(vi.fn(() => header));
    let state = 'pending';
    const result = (client.commitShaForRef as ControlledCommit)(repository, 'main', { signal: parent.signal });
    void result.then(() => { state = 'fulfilled'; }, () => { state = 'rejected'; });
    try {
      parent.abort();
      for (let index = 0; index < 16; index += 1) await Promise.resolve();
      expect(state).toBe('rejected');
    } finally { release(new Response(JSON.stringify({ sha }))); }
  });

  it.each(['abort', 'timeout'] as const)('settles a hanging metadata json() on %s and removes parent listeners/timers', async (reason) => {
    vi.useFakeTimers();
    const parent = new AbortController();
    const added = vi.spyOn(parent.signal, 'addEventListener');
    const removed = vi.spyOn(parent.signal, 'removeEventListener');
    let release!: (value: unknown) => void;
    const json = new Promise<unknown>((resolve) => { release = resolve; });
    const cancel = vi.fn(async () => undefined);
    const response = { ok: true, status: 200, headers: new Headers(), body: { cancel }, json: () => json } as unknown as Response;
    const client = createGitHubPluginClient(vi.fn(async () => response));
    let state = 'pending';
    const result = client.listReleases(repository, { signal: parent.signal, idleTimeoutMs: 40 });
    void result.then(() => { state = 'fulfilled'; }, () => { state = 'rejected'; });
    try {
      for (let index = 0; index < 24; index += 1) await Promise.resolve();
      if (reason === 'abort') parent.abort();
      else await vi.advanceTimersByTimeAsync(40);
      for (let index = 0; index < 24; index += 1) await Promise.resolve();
      expect(state).toBe('rejected');
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(added.mock.calls.filter(([type]) => type === 'abort').length).toBeGreaterThan(0);
      expect(removed.mock.calls.filter(([type]) => type === 'abort')).toHaveLength(added.mock.calls.filter(([type]) => type === 'abort').length);
      expect(vi.getTimerCount()).toBe(0);
    } finally { parent.abort(); release([]); }
  });

  it('cancels a late response body after a header abort instead of reading it', async () => {
    const parent = new AbortController();
    let release!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { release = resolve; });
    const client = createGitHubPluginClient(vi.fn(() => pending));
    const result = client.downloadReleaseAsset('https://github.com/owner/repo/plugin.zip', { signal: parent.signal });
    const rejection = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    parent.abort();
    await rejection;
    const cancel = vi.fn(async () => undefined);
    const getReader = vi.fn();
    release({ ok: true, body: { cancel, getReader } } as unknown as Response);
    for (let index = 0; index < 16; index += 1) await Promise.resolve();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(getReader).not.toHaveBeenCalled();
  });
});
