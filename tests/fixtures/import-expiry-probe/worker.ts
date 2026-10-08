import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { ParentPort } from 'electron';

import { LibraryService, openConfiguredDatabase, type ImportExpiryClock } from '../../../src/worker/library-service';

// Intentionally not the production Worker entry point. The callback and Service
// below are real; only the clock, observer, and one targeted cleanup fault are
// fixture-controlled. In particular there is NO uncaughtException handler.
const parentPort: ParentPort | undefined = process.parentPort;
if (!parentPort) throw new Error('Import expiry fixture requires a real Electron UtilityProcess.');
const port = parentPort;
function argument(name: string): string {
  const prefix = `--${name}=`;
  const value = process.argv.find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
  if (!value) throw new Error(`Missing fixture argument: ${name}`);
  return value;
}
const ownedRoot = argument('probe-owned-root');
const runId = argument('probe-run-id');
if (!path.isAbsolute(ownedRoot)
  || !path.basename(ownedRoot).startsWith('super-import-expiry-probe-')
  || !lstatSync(ownedRoot).isDirectory()
  || lstatSync(ownedRoot).isSymbolicLink()
  || readFileSync(path.join(ownedRoot, '.probe-owned'), 'utf8') !== runId) {
  throw new Error('Refusing a non-owned probe directory.');
}

class ManualImportClock implements ImportExpiryClock {
  private nowValue = 0;
  private nextId = 1;
  private readonly tasks = new Map<number, { callback: () => void; dueAt: number }>();
  now(): number { return this.nowValue; }
  schedule(callback: () => void, delayMs: number): unknown {
    const id = this.nextId++;
    this.tasks.set(id, { callback, dueAt: this.nowValue + delayMs });
    return id;
  }
  cancel(handle: unknown): void { this.tasks.delete(handle as number); }
  advance(milliseconds: number): void {
    this.nowValue += milliseconds;
    const due = [...this.tasks.entries()].filter(([, entry]) => entry.dueAt <= this.nowValue);
    for (const [id, entry] of due) { this.tasks.delete(id); entry.callback(); }
  }
}

function diagnosticError(error: unknown) {
  const normalized = error instanceof Error ? error : new Error(String(error));
  return { name: normalized.name, message: normalized.message, stack: normalized.stack,
    ...('code' in normalized && typeof normalized.code === 'string' ? { code: normalized.code } : {}) };
}

const clock = new ManualImportClock();
const TTL_MS = 1_000;
function createService(): LibraryService {
  return new LibraryService({ importClock: clock, importTtlMs: TTL_MS,
    // No unrelated filesystem callbacks/media work in this TTL-specific gate.
    observerFactory: () => ({ close: () => undefined }),
    onDiagnostic: ({ scope, error, context }) => port.postMessage({ type: 'probe.diagnostic',
      diagnostic: { scope, error: diagnosticError(error), context } }),
  });
}
let service = createService();
let library: ReturnType<LibraryService['createLibrary']> | undefined;
let plan: ReturnType<LibraryService['prepareImport']> | undefined;
let operationPath: string | undefined;
let restoreCleanup: (() => void) | undefined;
let faultArmed = false;
let faultThrown = false;

interface FixtureCleanupAccess {
  removeOperation(operationPath: string): void;
  assertSafeOperationPath(operationPath: string): void;
}

function setup() {
  if (library) throw new Error('Probe setup is single-use.');
  const incoming = path.join(ownedRoot, 'incoming');
  const parent = path.join(ownedRoot, 'library-parent');
  mkdirSync(incoming);
  mkdirSync(parent);
  const source = path.join(incoming, 'same.txt');
  writeFileSync(source, 'old fixture content');
  library = service.createLibrary({ displayName: 'TTL UtilityProcess Probe', selectedParentPath: parent });
  const existing = service.prepareImport({ libraryId: library.libraryId, sourceKind: 'files', sourcePaths: [source] });
  service.resolveImport({ importId: existing.importId, suspectedDuplicate: 'skip', nameConflict: 'keep-both' });
  writeFileSync(source, 'incoming fixture content');
  plan = service.prepareImport({ libraryId: library.libraryId, sourceKind: 'files', sourcePaths: [source] });
  operationPath = path.join(library.libraryPath, '.super', 'operations', plan.importId);
  if (!existsSync(operationPath)) throw new Error('The real prepareImport did not leave a staged operation.');
  const target = operationPath;
  const access = service as unknown as FixtureCleanupAccess;
  const original = access.removeOperation;
  access.removeOperation = function (this: FixtureCleanupAccess, candidate: string): void {
    if (faultArmed && path.resolve(candidate) === path.resolve(target)) {
      // The production safe-path assertion remains real, not mocked or skipped.
      this.assertSafeOperationPath(candidate);
      faultArmed = false;
      faultThrown = true;
      throw Object.assign(new Error('Fixture-only transient cleanup lock.'), { code: 'EPERM' });
    }
    original.call(this, candidate);
  };
  restoreCleanup = () => { access.removeOperation = original; };
  return { pid: process.pid, libraryId: library.libraryId, libraryPath: library.libraryPath,
    importId: plan.importId, operationPath, operationExists: true };
}

function inspect() {
  if (!library || !plan || !operationPath) throw new Error('Probe is not prepared.');
  const connection = openConfiguredDatabase(path.join(library.libraryPath, '.super', 'library.db'), 5_000, { readonly: true });
  let operation: { status: string; error_code: string | null } | undefined;
  try {
    operation = connection.prepare('SELECT status, error_code FROM file_operations WHERE operation_id = ?')
      .get(plan.importId) as typeof operation;
  } finally { connection.close(); }
  let tokenErrorCode: string | null = null;
  try { service.abandonImport(plan.importId); }
  catch (error) { tokenErrorCode = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : String(error); }
  return { pid: process.pid, faultThrown, operationExists: existsSync(operationPath),
    operationStatus: operation?.status ?? null, operationErrorCode: operation?.error_code ?? null,
    tokenErrorCode, assetCount: service.listAssets({ libraryId: library.libraryId, recursive: true }).length,
    existingAssetContent: readFileSync(path.join(library.libraryPath, 'Assets', 'same.txt'), 'utf8') };
}

function recover() {
  if (!library || !operationPath || !faultThrown) throw new Error('Recovery requires the observed TTL cleanup fault.');
  const libraryPath = library.libraryPath;
  restoreCleanup?.();
  restoreCleanup = undefined;
  service.closeAll();
  service = createService();
  library = service.openLibrary(libraryPath);
  return { ...inspect(), operationExists: existsSync(operationPath) };
}

const lifetime = setInterval(() => undefined, 60_000);
port.on('message', (event) => {
  const input: unknown = event.data;
  if (typeof input !== 'object' || input === null || !('requestId' in input) || !('command' in input)) return;
  const requestId = String(input.requestId);
  const command = input.command as { type?: string };
  try {
    if (command.type === 'arm') {
      if (!plan || faultArmed || faultThrown) throw new Error('The targeted expiry fault can only be armed once after setup.');
      faultArmed = true;
      port.postMessage({ type: 'probe.response', requestId, ok: true, value: { armed: true, pid: process.pid } });
      // Crucial: outside the request handler's try/catch. Old production code
      // must crash this UtilityProcess; the fixture must not swallow the throw.
      setImmediate(() => clock.advance(TTL_MS));
      return;
    }
    let value: unknown;
    switch (command.type) {
      case 'setup': value = setup(); break;
      case 'ping': value = { pid: process.pid, pong: true }; break;
      case 'inspect': value = inspect(); break;
      case 'recover': value = recover(); break;
      case 'shutdown':
        restoreCleanup?.();
        service.closeAll();
        value = { stopped: true, pid: process.pid };
        break;
      default: throw new Error(`Unknown probe command: ${String(command.type)}`);
    }
    port.postMessage({ type: 'probe.response', requestId, ok: true, value });
    if (command.type === 'shutdown') setImmediate(() => { clearInterval(lifetime); process.exit(0); });
  } catch (error) {
    port.postMessage({ type: 'probe.response', requestId, ok: false, error: diagnosticError(error).message });
  }
});
port.postMessage({ type: 'probe.ready', pid: process.pid });
