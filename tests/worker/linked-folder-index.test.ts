import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { LibraryService } from '../../src/worker/library-service';

const roots: string[] = [];
const services: LibraryService[] = [];

function makeRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'super-linked-index-'));
  roots.push(root);
  return root;
}

function makeService(): LibraryService {
  const service = new LibraryService();
  services.push(service);
  return service;
}

async function waitFor(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for linked folder indexing.');
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
}

afterEach(async () => {
  for (const service of services.splice(0)) await service.closeAllAsync();
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe('linked folder background index', () => {
  it('creates the linked root immediately and indexes nested source files in resumable batches', async () => {
    const root = makeRoot();
    const source = path.join(root, 'source');
    mkdirSync(path.join(source, 'category', 'nested'), { recursive: true });
    for (let index = 0; index < 260; index += 1) {
      const directory = index % 2 === 0 ? source : path.join(source, 'category', 'nested');
      writeFileSync(path.join(directory, `asset-${index}.png`), 'linked-bytes');
    }

    const service = makeService();
    const library = service.createLibrary({ displayName: 'Background linked index', selectedParentPath: root });
    const linked = service.startFolderAsLinkedIndex({ libraryId: library.libraryId, sourceRootPath: source });

    expect(linked.assetCount).toBe(0);
    const initial = service.listLinkedFolderIndexJobs(library.libraryId).jobs[0]!;
    expect(initial).toMatchObject({ folderId: linked.folderId });
    expect(['queued', 'running']).toContain(initial.status);
    expect(service.pauseLinkedFolderIndexJobs(library.libraryId, [initial.jobId])).toEqual({ pausedCount: 1 });
    expect(service.listLinkedFolderIndexJobs(library.libraryId).jobs[0]?.status).toBe('paused');

    service.closeLibrary(library.libraryId);
    service.openLibrary(library.libraryPath);
    expect(service.listLinkedFolderIndexJobs(library.libraryId).jobs[0]?.status).toBe('paused');
    expect(service.resumeLinkedFolderIndexJobs(library.libraryId, [initial.jobId])).toEqual({ resumedCount: 1 });
    await waitFor(() => service.listLinkedFolderIndexJobs(library.libraryId).jobs[0]?.status === 'succeeded');

    expect(service.listAssets({ libraryId: library.libraryId, folderId: linked.folderId, recursive: true })).toHaveLength(260);
    expect(service.listFolderBrowseEntries({ libraryId: library.libraryId, parentFolderId: linked.folderId }))
      .toMatchObject([{ name: 'category', childFolderCount: 1, recursiveAssetCount: 130 }]);
    expect(service.listLinkedFolderIndexJobs(library.libraryId).jobs[0]).toMatchObject({
      status: 'succeeded', indexedAssets: 260, pendingDirectories: 0,
    });
  });
});
