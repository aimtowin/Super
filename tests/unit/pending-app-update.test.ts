import { createHash } from 'node:crypto';
import path from 'node:path';
import { access, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { PendingAppUpdateStore } from '../../src/main/pending-app-update';

const receipt = (installerPath: string, appVersion: string) => ({
  schemaVersion: 1 as const, installerPath, appVersion, bytes: Buffer.byteLength('installer'),
  sha256: createHash('sha256').update('installer').digest('hex'),
});

describe('PendingAppUpdateStore', () => {
  it('returns only a receipt-bearing candidate inside its update cache; Service verifies the bytes', async () => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'super-pending-update-')));
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
        receipt: receipt(installer, '0.0.5'),
      });
      await expect(store.loadPending()).resolves.toMatchObject({ status: 'candidate', update: { version: '0.0.5', installerPath: installer } });
      await store.saveCompletion({ version: '0.0.5', releaseNotes: 'Test release' });
      await expect(store.consumeCompletion('0.0.4')).resolves.toBeUndefined();
      await expect(store.consumeCompletion('0.0.5')).resolves.toEqual({ version: '0.0.5', releaseNotes: 'Test release' });
      await expect(store.consumeCompletion()).resolves.toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects pending update paths that escape the cache', async () => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'super-pending-update-')));
    try {
      const store = new PendingAppUpdateStore(path.join(root, 'updates'));
      await expect(store.savePending({
        version: '0.0.5',
        releaseNotes: '',
        installerPath: path.join(root, 'outside.exe'),
        cleanupPath: root,
        receipt: receipt(path.join(root, 'outside.exe'), '0.0.5'),
      })).rejects.toThrow('escaped');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('removes abandoned update directories while retaining the pending update', async () => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'super-pending-update-')));
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
        receipt: receipt(installer, '0.0.8'),
      });

      const pending = await store.loadPending();
      expect(pending.status).toBe('candidate');
      await expect(store.pruneStaleArtifacts(pending.status === 'candidate' ? pending.update.cleanupPath : undefined)).resolves.toBe(1);
      await expect(access(pendingDirectory)).resolves.toBeUndefined();
      await expect(access(unrelatedDirectory)).resolves.toBeUndefined();
      await expect(access(abandonedDirectory)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
