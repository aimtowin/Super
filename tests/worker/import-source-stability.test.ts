import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LibraryService, type LibraryServiceOptions } from '../../src/worker/library-service';

const roots: string[] = [];
const services: LibraryService[] = [];
function setup(options: LibraryServiceOptions = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'super-import-stability-'));
  roots.push(root);
  const service = new LibraryService(options);
  services.push(service);
  const library = service.createLibrary({ displayName: 'Stable import', selectedParentPath: root });
  const source = path.join(root, 'source.png');
  writeFileSync(source, 'old bytes');
  const input = { libraryId: library.libraryId, sourceKind: 'files' as const, sourcePaths: [source] };
  return { root, service, library, source, input };
}
afterEach(() => {
  for (const service of services.splice(0)) service.closeAll();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('import source stability', () => {
  for (const mode of ['sync', 'async'] as const) {
    it(`${mode}: refreshes stale enumeration metadata and imports the current complete bytes`, async () => {
      const { service, library, root, input } = setup({
        beforeSourceSnapshotOpen: (source) => writeFileSync(source, 'new complete contents'),
      });
      const result = mode === 'async'
        ? await service.prepareOrExecuteImportAsync(input)
        : service.prepareOrExecuteImport(input);
      expect(result).toMatchObject({ importedCount: 1 });
      expect(readFileSync(path.join(library.libraryPath, 'Assets', 'source.png'), 'utf8')).toBe('new complete contents');
      // The stream hash must match the ordinary hash used to identify duplicates.
      const another = path.join(root, 'same-content.png');
      writeFileSync(another, 'new complete contents');
      const duplicate = service.prepareImport({ ...input, sourcePaths: [another] });
      expect(duplicate.suspectedDuplicateCount).toBe(1);
    });

    it(`${mode}: retries a transient change during copying without restarting the whole batch`, async () => {
      let copies = 0;
      const { service, library, input } = setup({
        afterSourceSnapshotCopy: (source) => { if (++copies === 1) writeFileSync(source, 'finished downloading'); },
      });
      const result = mode === 'async'
        ? await service.prepareOrExecuteImportAsync(input)
        : service.prepareOrExecuteImport(input);
      expect(result).toMatchObject({ importedCount: 1 });
      expect(copies).toBe(2);
      expect(readFileSync(path.join(library.libraryPath, 'Assets', 'source.png'), 'utf8')).toBe('finished downloading');
    });

    it(`${mode}: stops after three unstable attempts, reports the file, and cleans the batch`, async () => {
      let copies = 0;
      const diagnostics: Array<{ scope: string; context?: Record<string, unknown> }> = [];
      const { service, library, source, input } = setup({
        afterSourceSnapshotCopy: (file) => writeFileSync(file, `changing ${++copies}`),
        onDiagnostic: (event) => diagnostics.push(event),
      });
      await expect(Promise.resolve().then(() => mode === 'async'
        ? service.prepareImportAsync(input) : service.prepareImport(input)))
        .rejects.toMatchObject({ code: 'INVALID_IMPORT_SOURCE', reason: 'SOURCE_CHANGED' });
      expect(copies).toBe(3);
      expect(diagnostics.filter((event) => event.scope === 'import.source-copy')).toHaveLength(3);
      expect(diagnostics.at(-1)?.context).toMatchObject({ sourcePath: source, attempt: 3, retrying: false });
      expect(existsSync(path.join(library.libraryPath, '.super', 'operations'))).toBe(false);
      expect(service.listAssets({ libraryId: library.libraryId, recursive: true })).toEqual([]);
    });

    it(`${mode}: keeps automation snapshots strict even if the change happens after validation`, async () => {
      let mutate = false;
      const { service, input } = setup({
        beforeSourceSnapshotOpen: (source) => { if (mutate) writeFileSync(source, 'unapproved contents'); },
      });
      const plan = service.previewAutomationImport(input);
      const automationPlan = { planHash: plan.planHash, expectedChangeSequence: plan.changeSequence, sourceStates: plan.sourceStates };
      mutate = true;
      await expect(Promise.resolve().then(() => mode === 'async'
        ? service.prepareOrExecuteImportAsync({ ...input, automationPlan })
        : service.prepareOrExecuteImport({ ...input, automationPlan })))
        .rejects.toMatchObject({ code: 'INVALID_IMPORT_SOURCE', reason: 'SOURCE_CHANGED' });
    });

    it(`${mode}: still rejects a different file substituted after enumeration`, async () => {
      let replaced = false;
      const { service, library, input } = setup({ beforeSourceSnapshotOpen: (source) => {
        if (!replaced) {
          replaced = true;
          renameSync(source, `${source}.original`);
          writeFileSync(source, 'substituted file');
        }
      } });
      await expect(Promise.resolve().then(() => mode === 'async'
        ? service.prepareImportAsync(input) : service.prepareImport(input)))
        .rejects.toMatchObject({ reason: 'SOURCE_CHANGED' });
      expect(existsSync(path.join(library.libraryPath, '.super', 'operations'))).toBe(false);
    });
  }

  it('serves reads and timer callbacks while copying a single large file', async () => {
    let poll: Promise<void> | undefined;
    let finished = false;
    const { service, library, source, input } = setup({
      beforeSourceSnapshotOpen: () => {
        poll = new Promise<void>((resolve, reject) => setImmediate(() => {
          try {
            expect(finished).toBe(false);
            expect(service.listAssets({ libraryId: library.libraryId, recursive: true })).toEqual([]);
            resolve();
          } catch (error) { reject(error); }
        }));
      },
    });
    writeFileSync(source, Buffer.alloc(8 * 1024 * 1024, 42));
    const result = await service.prepareOrExecuteImportAsync(input);
    finished = true;
    await poll;
    expect(poll).toBeDefined();
    expect(result).toMatchObject({ importedCount: 1 });
  });

  it('does not accept new bytes while a confirmed automation import waits for its writer lease', async () => {
    const { service, library, source, input } = setup();
    const plan = service.previewAutomationImport(input);
    const lease = await service.acquireWriteLease(library.libraryId);
    const importing = service.prepareOrExecuteImportAsync({ ...input, automationPlan: {
      planHash: plan.planHash, expectedChangeSequence: plan.changeSequence, sourceStates: plan.sourceStates,
    } });
    writeFileSync(source, 'changed during the lease wait');
    lease.release();
    await expect(importing).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    expect(service.listAssets({ libraryId: library.libraryId, recursive: true })).toEqual([]);
    expect(existsSync(path.join(library.libraryPath, '.super', 'operations'))).toBe(false);
  });

  it('completes a confirmed automation import asynchronously and preserves conflict policy', async () => {
    const { service, library, root, input } = setup();
    await service.prepareOrExecuteImportAsync(input);
    const copy = path.join(root, 'another.png');
    writeFileSync(copy, 'old bytes');
    const next = { ...input, sourcePaths: [copy] };
    const plan = service.previewAutomationImport(next);
    expect(plan.suspectedDuplicateCount).toBe(1);
    const result = await service.prepareOrExecuteImportAsync({ ...next, automationPlan: {
      planHash: plan.planHash, expectedChangeSequence: plan.changeSequence, sourceStates: plan.sourceStates,
    } });
    expect(result).toMatchObject({ importedCount: 0, skippedCount: 1 });
    expect(service.listAssets({ libraryId: library.libraryId, recursive: true })).toHaveLength(1);
  });

  it('keeps a previously staged file when a later file needs a retry', async () => {
    const copied: string[] = [];
    let changed = false;
    const { service, library, root, input } = setup({ afterSourceSnapshotCopy: (source) => {
      copied.push(path.basename(source));
      if (path.basename(source) === 'second.png' && !changed) {
        changed = true;
        writeFileSync(source, 'second stable');
      }
    } });
    const second = path.join(root, 'second.png');
    writeFileSync(second, 'second partial');
    const result = await service.prepareOrExecuteImportAsync({ ...input, sourcePaths: [...input.sourcePaths, second] });
    expect(result).toMatchObject({ importedCount: 2 });
    expect(copied).toEqual(['source.png', 'second.png', 'second.png']);
    expect(readFileSync(path.join(library.libraryPath, 'Assets', 'second.png'), 'utf8')).toBe('second stable');
  });

  it('serializes concurrent preparations while allowing status reads', async () => {
    const { service, library, root, input } = setup();
    const second = path.join(root, 'second.png');
    writeFileSync(second, 'second');
    const plans = await Promise.all([
      service.prepareImportAsync(input),
      service.prepareImportAsync({ ...input, sourcePaths: [second] }),
    ]);
    for (const plan of plans) {
      const result = service.resolveImport({ importId: plan.importId, suspectedDuplicate: 'skip', nameConflict: 'keep-both' });
      expect(result.importedCount).toBe(1);
    }
    expect(service.listAssets({ libraryId: library.libraryId, recursive: true })).toHaveLength(2);
  });

  it('does not invalidate a selected batch when an unrelated image arrives', async () => {
    let sourceDirectory = '';
    const { service, library, root, source } = setup({
      beforeSourceSnapshotOpen: () => writeFileSync(path.join(sourceDirectory, 'new-arrival.png'), 'later'),
    });
    sourceDirectory = path.join(root, 'incoming');
    mkdirSync(sourceDirectory);
    writeFileSync(path.join(sourceDirectory, 'selected.png'), readFileSync(source));
    const result = await service.prepareOrExecuteImportAsync({ libraryId: library.libraryId, sourceKind: 'folder', sourcePaths: [sourceDirectory] });
    expect(result).toMatchObject({ importedCount: 1 });
    expect(readdirSync(path.join(library.libraryPath, 'Assets', 'incoming'))).toEqual(['selected.png']);
  });

  it('imports Chinese names and bracketed Billfish-style folders without renaming', async () => {
    const { service, library, root } = setup();
    const source = path.join(root, 'Billfish素材库');
    const names = ['[OPPO]', '[华为]', '[临时文件]', '[其他]', '[课程]', '参考', '我的资源库'];
    for (const [index, name] of names.entries()) {
      const directory = path.join(source, name);
      mkdirSync(directory, { recursive: true });
      writeFileSync(path.join(directory, `测试图片-${index}.png`), `image ${index}`);
    }
    const result = await service.prepareOrExecuteImportAsync({ libraryId: library.libraryId, sourceKind: 'folder', sourcePaths: [source] });
    expect(result).toMatchObject({ importedCount: names.length });
    for (const [index, name] of names.entries()) {
      expect(readFileSync(path.join(library.libraryPath, 'Assets', 'Billfish素材库', name, `测试图片-${index}.png`), 'utf8')).toBe(`image ${index}`);
    }
  });

  it('identifies a changing hidden Billfish file instead of blaming its parent folder name', async () => {
    const diagnostics: Array<{ scope: string; context?: Record<string, unknown> }> = [];
    let attempts = 0;
    const { service, library, root } = setup({
      afterSourceSnapshotCopy: (source) => {
        if (path.basename(source) === 'library.db') writeFileSync(source, `updated database ${++attempts}`);
      },
      onDiagnostic: (event) => diagnostics.push(event),
    });
    const source = path.join(root, 'Billfish素材库');
    mkdirSync(path.join(source, '.bf'), { recursive: true });
    writeFileSync(path.join(source, '.bf', 'library.db'), 'database');
    writeFileSync(path.join(source, '图片.png'), 'image');
    await expect(service.prepareImportAsync({ libraryId: library.libraryId, sourceKind: 'folder', sourcePaths: [source] }))
      .rejects.toMatchObject({ reason: 'SOURCE_CHANGED' });
    expect(diagnostics.at(-1)?.context).toMatchObject({
      sourcePath: path.join(source, '.bf', 'library.db'), phase: 'after-copy', attempt: 3, retrying: false,
    });
  });

  it('rejects a symlink substituted before async opening', async () => {
    let outside = '';
    const { root, service, input } = setup({ beforeSourceSnapshotOpen: (source) => {
      rmSync(source);
      symlinkSync(outside, source);
    } });
    outside = path.join(root, 'outside.png');
    writeFileSync(outside, 'outside');
    await expect(service.prepareImportAsync(input)).rejects.toMatchObject({ reason: 'SYMBOLIC_LINK_NOT_ALLOWED' });
  });

  it('cancels and cleans staging before closing the library', async () => {
    let closing: Promise<void> | undefined;
    const { service, library, input } = setup({ afterSourceSnapshotCopy: () => {
      closing = service.closeLibraryAsync(library.libraryId);
    } });
    await expect(service.prepareImportAsync(input)).rejects.toMatchObject({ code: 'CANCELLED' });
    await closing;
    expect(service.hasOpenLibrary(library.libraryId)).toBe(false);
    expect(existsSync(path.join(library.libraryPath, '.super', 'operations'))).toBe(false);
  });
});
