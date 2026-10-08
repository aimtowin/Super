import { randomUUID } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { app, BrowserWindow, utilityProcess, type UtilityProcess } from 'electron';

// This is a separate Electron entry point, not src/main/index.ts. No production
// startup settings, saved libraries, network services, or installed app are used.
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
  throw new Error('The probe requires its own marked temporary directory.');
}
for (const entry of ['user-data', 'logs', 'crash-dumps']) mkdirSync(path.join(ownedRoot, entry));
app.setPath('userData', path.join(ownedRoot, 'user-data'));
app.setPath('sessionData', path.join(ownedRoot, 'user-data'));
app.setPath('logs', path.join(ownedRoot, 'logs'));
app.setPath('crashDumps', path.join(ownedRoot, 'crash-dumps'));

interface ProbeDiagnostic {
  scope: string;
  context?: Record<string, unknown>;
  error: { name: string; message: string; code?: string; stack?: string };
}

type ProbeCommand = { type: 'setup' | 'arm' | 'ping' | 'inspect' | 'recover' | 'shutdown' };
type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

let child: UtilityProcess | undefined;
let fixtureWindow: BrowserWindow | undefined;
let readyPid: number | undefined;
let exitCode: number | undefined;
let stderr = '';
let stdout = '';
let forkCount = 0;
const diagnostics: ProbeDiagnostic[] = [];
const pending = new Map<string, Pending>();
const diagnosticWaiters = new Set<Pending>();
const exitWaiters = new Set<Pending>();
let resolveReady!: () => void;
let rejectReady!: (error: Error) => void;
const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
// The caller still receives the same rejection; this only prevents an early
// native-load/exit failure from becoming an unrelated Main unhandled rejection.
void ready.catch(() => undefined);

function snapshot() {
  return { readyPid: readyPid ?? null, childPid: child?.pid ?? null, forkCount,
    exitCode: exitCode ?? null, diagnostics: [...diagnostics], stdout, stderr, pendingCount: pending.size };
}

function exitError(code: number): Error {
  return new Error(`Import expiry probe UtilityProcess exited (${code}) before expiry containment was proved.\n${stderr}`);
}

function settleWaiter(waiter: Pending, value: unknown): void {
  clearTimeout(waiter.timer);
  waiter.resolve(value);
}

async function request(command: ProbeCommand): Promise<unknown> {
  await ready;
  const current = child;
  if (!current || exitCode !== undefined) throw exitError(exitCode ?? -1);
  const requestId = randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`Probe request deadline: ${command.type}`)); }, 10_000);
    pending.set(requestId, { resolve, reject, timer });
    try {
      current.postMessage({ type: 'probe.request', requestId, command });
    } catch (error) {
      clearTimeout(timer);
      pending.delete(requestId);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

function waitForExpiryDiagnostic(): Promise<unknown> {
  const observed = diagnostics.find((entry) => entry.scope === 'import.expiry.cleanup');
  if (observed) return Promise.resolve(observed);
  if (exitCode !== undefined) return Promise.reject(exitError(exitCode));
  return new Promise((resolve, reject) => {
    const waiter: Pending = { resolve, reject, timer: setTimeout(() => {
      diagnosticWaiters.delete(waiter);
      reject(new Error('Expected the real LibraryService import.expiry.cleanup diagnostic.'));
    }, 10_000) };
    diagnosticWaiters.add(waiter);
  });
}

function waitForExit(): Promise<unknown> {
  if (exitCode !== undefined) return Promise.resolve(exitCode);
  return new Promise((resolve, reject) => {
    const waiter: Pending = { resolve, reject, timer: setTimeout(() => {
      exitWaiters.delete(waiter);
      reject(new Error('Probe UtilityProcess did not terminate after explicit shutdown.'));
    }, 10_000) };
    exitWaiters.add(waiter);
  });
}

Object.assign(globalThis, { importExpiryProbe: { request, snapshot, waitForExpiryDiagnostic, waitForExit } });

app.on('before-quit', () => { if (exitCode === undefined) child?.kill(); });
app.on('window-all-closed', () => app.quit());

void app.whenReady().then(async () => {
  // A hidden fixture window gives Playwright a conventional Electron target;
  // it contains no application UI or privileged preload.
  fixtureWindow = new BrowserWindow({ show: false, width: 320, height: 180,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  await fixtureWindow.loadURL('data:text/html,<title>Import expiry isolated probe</title>');
  const current = utilityProcess.fork(path.join(__dirname, 'worker.cjs'), [
    `--probe-owned-root=${ownedRoot}`, `--probe-run-id=${runId}`,
  ], { serviceName: 'Super TTL isolation test fixture', stdio: 'pipe' });
  child = current;
  forkCount += 1;
  const readyTimer = setTimeout(() => { rejectReady(new Error('Probe UtilityProcess ready deadline.')); current.kill(); }, 15_000);
  current.stdout?.on('data', (chunk: Buffer) => { stdout = (stdout + chunk.toString()).slice(-65_536); });
  current.stderr?.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-65_536); });
  current.on('message', (input: unknown) => {
    if (typeof input !== 'object' || input === null || !('type' in input)) return;
    const message = input as Record<string, unknown>;
    if (message.type === 'probe.ready' && typeof message.pid === 'number') {
      clearTimeout(readyTimer);
      readyPid = message.pid;
      resolveReady();
    } else if (message.type === 'probe.diagnostic') {
      const diagnostic = message.diagnostic as ProbeDiagnostic;
      diagnostics.push(diagnostic);
      if (diagnostic.scope === 'import.expiry.cleanup') {
        for (const waiter of diagnosticWaiters) settleWaiter(waiter, diagnostic);
        diagnosticWaiters.clear();
      }
    } else if (message.type === 'probe.response' && typeof message.requestId === 'string') {
      const entry = pending.get(message.requestId);
      if (!entry) return;
      clearTimeout(entry.timer);
      pending.delete(message.requestId);
      if (message.ok === true) entry.resolve(message.value);
      else entry.reject(new Error(String(message.error)));
    }
  });
  current.on('exit', (code) => {
    clearTimeout(readyTimer);
    exitCode = code;
    rejectReady(exitError(code));
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(exitError(code)); }
    pending.clear();
    for (const waiter of diagnosticWaiters) { clearTimeout(waiter.timer); waiter.reject(exitError(code)); }
    diagnosticWaiters.clear();
    for (const waiter of exitWaiters) settleWaiter(waiter, code);
    exitWaiters.clear();
    // Deliberately do not quit or respawn: the test must see this exact exit.
  });
}).catch((error: unknown) => {
  const failure = error instanceof Error ? error : new Error(String(error));
  console.error(failure);
  rejectReady(failure);
});
