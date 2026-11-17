import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { ExtensionCatalogClient } from '../../src/main/extension-catalog';

const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const ZIP_SHA = createHash('sha256').update(ZIP).digest('hex');

function catalog(overrides: Record<string, unknown> = {}) {
  return {
    catalogVersion: 1,
    generatedAt: '2026-11-17T00:00:00Z',
    extensions: [{
      id: 'com.super.infinite-canvas',
      name: '无限画布',
      version: '1.0.0',
      description: 'detached preview',
      author: 'Super',
      platform: 'win32-x64',
      minAppVersion: '2.4.5',
      asset: {
        path: 'infinite-canvas/1.0.0/com.super.infinite-canvas-1.0.0-win32-x64.zip',
        size: ZIP.byteLength,
        sha256: ZIP_SHA,
      },
      ...overrides,
    }],
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function assetResponse(value: Uint8Array): Response {
  return new Response(value as BodyInit, {
    status: 200,
    headers: { 'content-type': 'application/octet-stream' },
  });
}

describe('ExtensionCatalogClient', () => {
  it('lists only entries for the current platform and installs a verified archive', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => (
      String(input).endsWith('latest.json')
        ? jsonResponse(catalog())
        : assetResponse(ZIP)
    )) as unknown as typeof fetch;
    const client = new ExtensionCatalogClient({
      catalogUrl: 'https://example.test/downloads/super/plugins/latest.json',
      fetchImpl,
    });
    const listed = await client.list({ platform: 'win32', arch: 'x64' });
    expect(listed.map((entry) => entry.id)).toEqual(['com.super.infinite-canvas']);
    expect(await client.list({ platform: 'darwin', arch: 'arm64' })).toEqual([]);

    const installFromArchive = vi.fn(async (input: unknown) => {
    void input;
    return { alreadyInstalled: false };
  });
    const result = await client.install({
      manager: { installFromArchive } as never,
      pluginId: 'com.super.infinite-canvas',
      scope: 'user',
      currentVersion: '2.4.5',
    });
    expect(result.entry.version).toBe('1.0.0');
    expect(result.alreadyInstalled).toBe(false);
    expect(installFromArchive).toHaveBeenCalledOnce();
    const call = (installFromArchive.mock.calls[0] as unknown as [
      { archive: Uint8Array; source: { kind: string } },
    ])[0];
    expect(call.archive).toEqual(ZIP);
    expect(call.source.kind).toBe('local-package');
  });

  it('rejects a tampered archive and an incompatible host version', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => (
      String(input).endsWith('latest.json')
        ? jsonResponse(catalog())
        : assetResponse(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x99]))
    )) as unknown as typeof fetch;
    const client = new ExtensionCatalogClient({
      catalogUrl: 'https://example.test/downloads/super/plugins/latest.json',
      fetchImpl,
    });
    await expect(client.install({
      manager: { installFromArchive: vi.fn() } as never,
      pluginId: 'com.super.infinite-canvas',
      scope: 'user',
      currentVersion: '2.4.5',
    })).rejects.toThrow(/SHA-256/u);

    const oldHost = new ExtensionCatalogClient({
      catalogUrl: 'https://example.test/downloads/super/plugins/latest.json',
      fetchImpl: async (input) => String(input).endsWith('latest.json')
        ? jsonResponse(catalog())
        : assetResponse(ZIP),
    });
    await expect(oldHost.install({
      manager: { installFromArchive: vi.fn() } as never,
      pluginId: 'com.super.infinite-canvas',
      scope: 'user',
      currentVersion: '2.4.4',
    })).rejects.toThrow(/requires Super 2.4.5/u);
  });
});