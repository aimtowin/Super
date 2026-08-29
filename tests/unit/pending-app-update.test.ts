import path from 'node:path';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { PendingAppUpdateStore } from '../../src/main/pending-app-update';

describe('PendingAppUpdateStore', () => {
  it('restores only a verified installer path inside its update cache', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'super-pending-update-'));
    const cache = path.join(root, 'updates');
    const installer = path.join(cache, 'release', 'SuperSetup.exe');
    try {
      await mkdir(path.dirname(installer), { recursive: true });
      await writeFile(installer, 'installer');
      const store = new PendingAppUpdateStore(cache);
      await store.savePending({
        version: '0.0.5',
        releaseNotes: 'Test release',
        installerPath: installer,
        cleanupPath: path.join(cache, 'release'),
      });
      await expect(store.loadPending()).resolves.toMatchObject({ version: '0.0.5', installerPath: installer });
      await store.saveCompletion({ version: '0.0.5', releaseNotes: 'Test release' });
      await expect(store.consumeCompletion()).resolves.toEqual({ version: '0.0.5', releaseNotes: 'Test release' });
      await expect(store.consumeCompletion()).resolves.toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects pending update paths that escape the cache', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'super-pending-update-'));
    try {
      const store = new PendingAppUpdateStore(path.join(root, 'updates'));
      await expect(store.savePending({
        version: '0.0.5',
        releaseNotes: '',
        installerPath: path.join(root, 'outside.exe'),
        cleanupPath: root,
      })).rejects.toThrow('escaped');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('removes abandoned update directories while retaining the pending update', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'super-pending-update-'));
    const cache = path.join(root, 'updates');
    const pendingDirectory = path.join(cache, 'super-update-pending');
    const abandonedDirectory = path.join(cache, 'super-update-abandoned');
    const unrelatedDirectory = path.join(cache, 'user-created');
    const installer = path.join(pendingDirectory, 'SuperSetup.exe');
    try {
      await Promise.all([
        mkdir(pendingDirectory, { recursive: true }),
        mkdir(abandonedDirectory, { recursive: true }),
        mkdir(unrelatedDirectory, { recursive: true }),
      ]);
      await writeFile(installer, 'installer');
      const store = new PendingAppUpdateStore(cache);
      await store.savePending({
        version: '0.0.8',
        releaseNotes: 'Test release',
        installerPath: installer,
        cleanupPath: pendingDirectory,
      });

      await expect(store.pruneStaleArtifacts((await store.loadPending())?.cleanupPath)).resolves.toBe(1);
      await expect(access(pendingDirectory)).resolves.toBeUndefined();
      await expect(access(unrelatedDirectory)).resolves.toBeUndefined();
      await expect(access(abandonedDirectory)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
