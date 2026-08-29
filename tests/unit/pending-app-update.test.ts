import path from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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
});
