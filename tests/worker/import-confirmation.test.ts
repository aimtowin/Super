import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LibraryService, type LibraryServiceOptions } from '../../src/worker/library-service';

const roots: string[] = [];
const services: LibraryService[] = [];
function setup(options: LibraryServiceOptions = {}, count = 1) {
  const root = mkdtempSync(path.join(tmpdir(), 'super-confirmation-'));
  roots.push(root);
  const service = new LibraryService(options);
  services.push(service);
  const library = service.createLibrary({ displayName: 'Confirmation', selectedParentPath: root });
  const sources = Array.from({ length: count }, (_, i) => {
    const source = path.join(root, `[华为] 素材-${i}.txt`);
    writeFileSync(source, `unique content ${i}`);
    return source;
  });
  const plan = service.prepareImport({ libraryId: library.libraryId, sourceKind: 'files', sourcePaths: sources });
  const input = { importId: plan.importId, suspectedDuplicate: 'create-copy' as const, nameConflict: 'keep-both' as const };
  return { service, library, input, root };
}
afterEach(async () => {
  for (const service of services.splice(0)) await service.closeAllAsync();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('asynchronous import confirmation', () => {
  it('shares concurrent and completed confirmations without creating another copy', async () => {
    const { service, library, input } = setup();
    const first = service.resolveImportAsync(input);
    expect(service.resolveImportAsync(input)).toBe(first);
    const completion = await first;
    expect(completion.importedCount).toBe(1);
    expect(await service.resolveImportAsync(input)).toEqual(completion);
    expect(service.listAssets({ libraryId: library.libraryId, recursive: true })).toHaveLength(1);
  });

  it('rejects changed decisions without disturbing the running application', async () => {
    const { service, input } = setup();
    const first = service.resolveImportAsync(input);
    expect(() => service.abandonImport(input.importId)).toThrow('LIBRARY_BUSY');
    await expect(service.resolveImportAsync({ ...input, suspectedDuplicate: 'skip' })).rejects.toMatchObject({ code: 'INVALID_IMPORT_DECISION' });
    expect((await first).importedCount).toBe(1);
  });

  it('replays the actual failure instead of reporting a missing plan on retry', async () => {
    const { service, input, library } = setup({ failAt: 'before-db-commit' });
    await expect(service.resolveImportAsync(input)).rejects.toMatchObject({ code: 'IMPORT_APPLY_FAILED' });
    await expect(service.resolveImportAsync(input)).rejects.toMatchObject({ code: 'IMPORT_APPLY_FAILED' });
    expect(service.listAssets({ libraryId: library.libraryId, recursive: true })).toHaveLength(0);
    expect(existsSync(path.join(library.libraryPath, 'Assets', '[华为] 素材-0.txt'))).toBe(false);
  });

  it('does not revive expired or abandoned plans', async () => {
    const { service, input } = setup();
    service.abandonImport(input.importId);
    await expect(service.resolveImportAsync(input)).rejects.toMatchObject({ code: 'IMPORT_NOT_FOUND' });
  });

  it('reserves the expiry timer while waiting for another writer', async () => {
    const { service, library, input } = setup({ importTtlMs: 20 });
    const lease = await service.acquireWriteLease(library.libraryId);
    const task = service.resolveImportAsync(input);
    try { await new Promise((resolve) => setTimeout(resolve, 40)); }
    finally { lease.release(); }
    expect((await task).importedCount).toBe(1);
  });

  it('cleans a reserved but not yet started confirmation when the library closes', async () => {
    const { service, library, input } = setup();
    const task = service.resolveImportAsync(input);
    const closing = service.closeLibraryAsync(library.libraryId);
    await expect(task).rejects.toMatchObject({ code: 'CANCELLED' });
    await closing;
    expect(existsSync(path.join(library.libraryPath, '.super', 'operations', input.importId))).toBe(false);
  });

  it('allows timer-driven reads between durable asset commits, outside transactions', async () => {
    let committed = 0;
    const { service, library, input } = setup({ onAssetsChanged: () => { committed++; } }, 180);
    const counts: number[] = [];
    const timer = setInterval(() => {
      if (committed > 0 && committed < 180) {
        service.getOperationHistoryStatus(library.libraryId);
        counts.push(service.listAssets({ libraryId: library.libraryId, recursive: true }).length);
      }
    }, 1);
    try {
      expect((await service.resolveImportAsync(input)).importedCount).toBe(180);
      expect(counts.some((count) => count > 0 && count < 180)).toBe(true);
    } finally { clearInterval(timer); }
  });

  it('waits for active apply before closing the database and retains all committed assets', async () => {
    let closeTask: Promise<void> | undefined;
    const { service, library, input } = setup({ onAssetsChanged: () => {
      if (!closeTask) closeTask = service.closeLibraryAsync(library.libraryId);
    } }, 50);
    expect((await service.resolveImportAsync(input)).importedCount).toBe(50);
    await closeTask;
    expect(service.hasOpenLibrary(library.libraryId)).toBe(false);
    service.openLibrary(library.libraryPath);
    expect(service.listAssets({ libraryId: library.libraryId, recursive: true })).toHaveLength(50);
    await expect(service.resolveImportAsync(input)).rejects.toMatchObject({ code: 'IMPORT_NOT_FOUND' });
  });
});
