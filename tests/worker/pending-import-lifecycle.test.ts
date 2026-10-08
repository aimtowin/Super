import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  LibraryService,
  LibraryServiceError,
  openConfiguredDatabase,
  type ImportExpiryClock,
  type LibraryServiceDiagnostic,
  type LibraryServiceOptions,
} from '../../src/worker/library-service';

const temporaryRoots: string[] = [];

class ManualImportClock implements ImportExpiryClock {
  private nowValue = 0;
  private nextId = 1;
  private readonly tasks = new Map<number, { callback: () => void; dueAt: number }>();
  readonly cancelled: number[] = [];

  cancel(handle: unknown): void {
    const id = handle as number;
    this.cancelled.push(id);
    this.tasks.delete(id);
  }

  now(): number {
    return this.nowValue;
  }

  schedule(callback: () => void, delayMs: number): unknown {
    const id = this.nextId++;
    this.tasks.set(id, { callback, dueAt: this.nowValue + delayMs });
    return id;
  }

  advance(milliseconds: number): void {
    this.nowValue += milliseconds;
    const due = [...this.tasks.entries()].filter(([, task]) => task.dueAt <= this.nowValue);
    for (const [id, task] of due) {
      this.tasks.delete(id);
      task.callback();
    }
  }
}

function temporaryRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'super-import-ttl-test-'));
  temporaryRoots.push(root);
  return root;
}

function expectCode(operation: () => unknown, code: LibraryServiceError['code']): void {
  let thrown: unknown;
  try {
    operation();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(LibraryServiceError);
  expect((thrown as LibraryServiceError).code).toBe(code);
}

// Test-only access to ordinary private methods; production fault controls and
// global filesystem patches are deliberately not added for this regression.
interface OperationCleanupTestPort {
  assertSafeOperationPath(operationPath: string): void;
  removeOperation(operationPath: string): void;
}

function pendingFixture(options: Pick<LibraryServiceOptions, 'onDiagnostic'> = {}) {
  const root = temporaryRoot();
  const source = path.join(root, 'pending.png');
  writeFileSync(source, 'incoming');
  const clock = new ManualImportClock();
  const service = new LibraryService({
    ...options,
    importClock: clock,
    importTtlMs: 1_000,
    observerFactory: () => ({ close() {} }),
  });
  const library = service.createLibrary({ displayName: 'Cleanup TTL', selectedParentPath: root });
  const plan = service.prepareImport({
    libraryId: library.libraryId,
    sourceKind: 'files',
    sourcePaths: [source],
  });
  const operationPath = path.join(library.libraryPath, '.super', 'operations', plan.importId);
  return { root, source, clock, service, library, plan, operationPath };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe('pending import lifecycle', () => {
  it.each(['EPERM', 'ENOTEMPTY'])('contains TTL cleanup %s without reviving the expired token', (code) => {
    const diagnostics: LibraryServiceDiagnostic[] = [];
    const fixture = pendingFixture({ onDiagnostic: (entry) => diagnostics.push(entry) });
    const { service, clock, library, plan, operationPath } = fixture;
    const port = service as unknown as OperationCleanupTestPort;
    const cleanupError = Object.assign(new Error(`Injected cleanup ${code}`), { code });
    const cleanup = vi.spyOn(port, 'removeOperation').mockImplementation((target) => {
      expect(target).toBe(operationPath);
      port.assertSafeOperationPath(target);
      throw cleanupError;
    });
    try {
      expect(() => clock.advance(1_000)).not.toThrow();
      expectCode(() => service.abandonImport(plan.importId), 'IMPORT_NOT_FOUND');
      expect(cleanup).toHaveBeenCalledTimes(1);
      expect(existsSync(operationPath)).toBe(true);
      expect(diagnostics).toContainEqual({
        scope: 'import.expiry.cleanup',
        error: cleanupError,
        context: { libraryId: library.libraryId, operationId: plan.importId },
      });
      expect(service.searchAssets({ libraryId: library.libraryId, query: null }).items).toEqual([]);
      // A consumed timer/token must not retry or resurrect when time advances.
      clock.advance(10_000);
      expect(cleanup).toHaveBeenCalledTimes(1);
      cleanup.mockRestore();
      service.closeAll();
      const database = openConfiguredDatabase(path.join(library.libraryPath, '.super', 'library.db'));
      try {
        expect(database.prepare('SELECT status, error_code FROM file_operations WHERE operation_id = ?')
          .get(plan.importId)).toEqual({ status: 'rolled_back', error_code: 'IMPORT_EXPIRED' });
      } finally {
        database.close();
      }
      // Residual staging is safely recoverable once the transient fault clears.
      service.openLibrary(library.libraryPath);
      expect(existsSync(operationPath)).toBe(false);
      expectCode(() => service.abandonImport(plan.importId), 'IMPORT_NOT_FOUND');
    } finally {
      cleanup.mockRestore();
      service.closeAll();
    }
  });

  it('contains a failing diagnostic sink after TTL cleanup fails', () => {
    const report = vi.fn(() => { throw new Error('Diagnostic sink unavailable'); });
    const { service, clock, plan, operationPath } = pendingFixture({ onDiagnostic: report });
    const port = service as unknown as OperationCleanupTestPort;
    const cleanup = vi.spyOn(port, 'removeOperation').mockImplementation((target) => {
      expect(target).toBe(operationPath);
      port.assertSafeOperationPath(target);
      throw Object.assign(new Error('Cleanup permission denied'), { code: 'EPERM' });
    });
    try {
      expect(() => clock.advance(1_000)).not.toThrow();
      expect(report).toHaveBeenCalledWith(expect.objectContaining({ scope: 'import.expiry.cleanup' }));
      expectCode(() => service.abandonImport(plan.importId), 'IMPORT_NOT_FOUND');
      expect(existsSync(operationPath)).toBe(true);
    } finally {
      cleanup.mockRestore();
      service.closeAll();
    }
  });

  it('keeps unsafe staging links untouched while containing the expiry failure', () => {
    const diagnostics: LibraryServiceDiagnostic[] = [];
    const { root, service, clock, plan, operationPath } = pendingFixture({
      onDiagnostic: (entry) => diagnostics.push(entry),
    });
    const externalPath = path.join(root, 'outside-operation');
    mkdirSync(externalPath);
    const sentinelPath = path.join(externalPath, 'keep.txt');
    writeFileSync(sentinelPath, 'external data');
    const stagePath = path.join(operationPath, 'stage');
    // Both paths are in this test's fresh mkdtemp root. The actual Service
    // safety assertion must reject the substituted stage, not follow it.
    rmSync(stagePath, { recursive: true, force: true });
    symlinkSync(externalPath, stagePath, process.platform === 'win32' ? 'junction' : 'dir');
    try {
      expect(() => clock.advance(1_000)).not.toThrow();
      expectCode(() => service.abandonImport(plan.importId), 'IMPORT_NOT_FOUND');
      expect(readFileSync(sentinelPath, 'utf8')).toBe('external data');
      expect(existsSync(operationPath)).toBe(true);
      expect(diagnostics).toContainEqual(expect.objectContaining({
        scope: 'import.expiry.cleanup',
        error: expect.objectContaining({ code: 'LIBRARY_CORRUPT' }),
      }));
    } finally {
      // Remove only the test-owned junction itself, never its target contents.
      try {
        unlinkSync(stagePath);
      } finally {
        service.closeAll();
      }
    }
  });

  it('expires a pending token at its TTL and removes its staged operation', () => {
    const root = temporaryRoot();
    const incoming = path.join(root, 'incoming');
    mkdirSync(incoming);
    const source = path.join(incoming, 'same.png');
    writeFileSync(source, 'incoming');
    const clock = new ManualImportClock();
    const service = new LibraryService({ importClock: clock, importTtlMs: 1_000 });
    const library = service.createLibrary({ displayName: 'TTL', selectedParentPath: root });
    writeFileSync(path.join(library.libraryPath, 'Assets', 'same.png'), 'old');
    const plan = service.prepareImport({ libraryId: library.libraryId, sourceKind: 'files', sourcePaths: [source] });
    const operationPath = path.join(library.libraryPath, '.super', 'operations', plan.importId);
    expect(existsSync(operationPath)).toBe(true);

    clock.advance(999);
    expect(existsSync(operationPath)).toBe(true);
    clock.advance(1);
    expect(existsSync(operationPath)).toBe(false);
    expectCode(() => service.abandonImport(plan.importId), 'IMPORT_NOT_FOUND');
    service.closeAll();
  });

  it('cancels the expiry timer during normal close cleanup', () => {
    const root = temporaryRoot();
    const source = path.join(root, 'same.png');
    writeFileSync(source, 'incoming');
    const clock = new ManualImportClock();
    const service = new LibraryService({ importClock: clock, importTtlMs: 1_000 });
    const library = service.createLibrary({ displayName: 'Close TTL', selectedParentPath: root });
    writeFileSync(path.join(library.libraryPath, 'Assets', 'same.png'), 'old');
    const plan = service.prepareImport({ libraryId: library.libraryId, sourceKind: 'files', sourcePaths: [source] });
    service.closeAll();

    expect(clock.cancelled).toHaveLength(1);
    expect(existsSync(path.join(library.libraryPath, '.super', 'operations', plan.importId))).toBe(false);
  });

  it('recovers an audited preparing operation after a crash during staging', () => {
    const root = temporaryRoot();
    const first = path.join(root, 'first.png');
    const second = path.join(root, 'second.png');
    writeFileSync(first, 'first');
    writeFileSync(second, 'second');
    const crashing = new LibraryService({ failAt: 'crash-during-prepare-stage' });
    const library = crashing.createLibrary({ displayName: 'Prepare Crash', selectedParentPath: root });
    expectCode(
      () => crashing.prepareImport({ libraryId: library.libraryId, sourceKind: 'files', sourcePaths: [first, second] }),
      'INVALID_IMPORT_SOURCE',
    );
    const operationsPath = path.join(library.libraryPath, '.super', 'operations');
    const [operationId] = readdirSync(operationsPath);
    expect(operationId).toBeTruthy();
    crashing.closeAll();
    const database = openConfiguredDatabase(path.join(library.libraryPath, '.super', 'library.db'));
    expect(database.prepare('SELECT status FROM file_operations WHERE operation_id = ?').get(operationId)).toEqual({ status: 'preparing' });
    database.close();

    const recovered = new LibraryService();
    recovered.openLibrary(library.libraryPath);
    expect(existsSync(operationsPath)).toBe(false);
    recovered.closeAll();
  });

  it('does not delete a destination created externally while a preparing import is staged', () => {
    const root = temporaryRoot();
    const first = path.join(root, 'first.png');
    const second = path.join(root, 'second.png');
    writeFileSync(first, 'first');
    writeFileSync(second, 'second');
    const crashing = new LibraryService({ failAt: 'crash-during-prepare-stage' });
    const library = crashing.createLibrary({ displayName: 'Prepare Concurrent', selectedParentPath: root });
    expectCode(
      () => crashing.prepareImport({ libraryId: library.libraryId, sourceKind: 'files', sourcePaths: [first, second] }),
      'INVALID_IMPORT_SOURCE',
    );

    const concurrentDestination = path.join(library.libraryPath, 'Assets', 'second.png');
    writeFileSync(concurrentDestination, 'created by another process');
    crashing.closeAll();

    const recovered = new LibraryService();
    recovered.openLibrary(library.libraryPath);
    expect(existsSync(concurrentDestination)).toBe(true);
    recovered.closeAll();
  });

  it('does not claim an external destination while recovering a prepared import', () => {
    const root = temporaryRoot();
    const source = path.join(root, 'prepared.png');
    writeFileSync(source, 'source');
    const preparing = new LibraryService();
    const library = preparing.createLibrary({ displayName: 'Prepared Concurrent', selectedParentPath: root });
    const plan = preparing.prepareImport({
      libraryId: library.libraryId,
      sourceKind: 'files',
      sourcePaths: [source],
    });
    const operationPath = path.join(library.libraryPath, '.super', 'operations', plan.importId);
    rmSync(path.join(operationPath, 'stage', '0'));
    const concurrentDestination = path.join(library.libraryPath, 'Assets', 'prepared.png');
    writeFileSync(concurrentDestination, 'created by another process');

    const recovered = new LibraryService();
    recovered.openLibrary(library.libraryPath);
    expect(existsSync(concurrentDestination)).toBe(true);
    expect(existsSync(operationPath)).toBe(false);
    recovered.closeAll();
    preparing.closeAll();
  });
});
