import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import * as http from 'node:http';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppLogger } from '../../src/main/app-logger';
import { createPublicError } from '../../src/shared/protocol/errors';
import { createExtensionUploadStaging } from '../../src/main/extension-upload-staging';
import { createExtensionServer, type ExtensionServer, type SaveUploadRequest } from '../../src/main/extension-server';

const fork = vi.hoisted(() => vi.fn());
vi.mock('electron', () => ({ utilityProcess: { fork } }));
import { LibraryWorkerClient } from '../../src/main/worker-client';

class Child extends EventEmitter {
  readonly pid = 1;
  readonly postMessage = vi.fn();
  readonly kill = vi.fn();
}
let root: string;
let server: ExtensionServer | undefined;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'super-staging-lifecycle-'));
  fork.mockReset();
  vi.stubEnv('SUPER_FFMPEG_PATH', '/usr/bin/true');
  vi.stubEnv('SUPER_OIIO_PATH', '/usr/bin/true');
});
afterEach(async () => {
  vi.useRealTimers(); vi.unstubAllEnvs();
  if (server) { await new Promise<void>((resolve) => server!.server.close(() => resolve())); server = undefined; }
  await rm(root, { recursive: true, force: true });
});
async function staged(removeDirectory?: (directory: string) => Promise<void>) {
  const directory = path.join(root, `super-ext-upload-${randomUUID()}`);
  const file = path.join(directory, 'fixture.png');
  await mkdir(directory); await writeFile(file, 'owned-content');
  return { directory, file, owner: createExtensionUploadStaging({ root, directory, removeDirectory }) };
}
async function started(children = [new Child()]) {
  children.forEach((child) => fork.mockReturnValueOnce(child));
  const logger = { worker: vi.fn(), error: vi.fn(), info: vi.fn() } as unknown as AppLogger;
  const client = new LibraryWorkerClient('/fixture/worker.js', logger);
  const start = client.start(); children[0]!.emit('message', { type: 'worker.ready' }); await start;
  return { client, child: children[0]!, logger };
}
function reply(child: Child, requestId: string, ok = true) {
  child.emit('message', { requestId, result: ok
    ? { ok: true, type: 'library.closed', libraryId: 'library' }
    : { ok: false, error: createPublicError('LIBRARY_NOT_OPEN') } });
}
function capture(client: LibraryWorkerClient, child: Child, fixture: Awaited<ReturnType<typeof staged>>) {
  fixture.owner.handle.claim();
  let terminal!: Promise<void>;
  const callback = vi.fn(() => { terminal = fixture.owner.handle.release(); return terminal; });
  const result = client.request({
    type: 'extension.save-from-file', libraryId: 'library', stagedFilePath: fixture.file,
    contentType: 'image/png', filename: 'fixture.png',
  }, { onTerminal: callback }).catch((error: unknown) => error);
  const requestId = child.postMessage.mock.calls.at(-1)![0].requestId as string;
  return { result, requestId, callback, terminal: () => terminal };
}
const uploadHeaders = {
  'X-Super-Kind': 'image', 'X-Super-Local-File': 'true',
  'X-Super-Content-Type': 'image/png', 'X-Super-Filename': 'fixture.png',
};
function upload(port: number, onResponse?: (request: http.ClientRequest) => void) {
  let request!: http.ClientRequest;
  const response = new Promise<number>((resolve, reject) => {
    request = http.request({ host: '127.0.0.1', port, path: '/save-upload', method: 'POST', headers: { ...uploadHeaders, 'Content-Length': '5' } }, (res) => {
      res.resume(); res.on('end', () => resolve(res.statusCode!));
    });
    request.on('error', reject);
    request.end('image'); onResponse?.(request);
  });
  return { request, response };
}

describe('actual upload staging ownership', () => {
  it('only releases its own validated child, and release is idempotent', async () => {
    const first = await staged(); const second = await staged();
    first.owner.handle.claim(); second.owner.handle.claim();
    await first.owner.releaseIfUnclaimed();
    expect(await readFile(first.file, 'utf8')).toBe('owned-content');
    const release = first.owner.handle.release();
    expect(first.owner.handle.release()).toBe(release); await release;
    await expect(readFile(first.file)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(second.file, 'utf8')).toBe('owned-content');
    expect(() => createExtensionUploadStaging({ root, directory: root })).toThrow('owned');
    expect(() => createExtensionUploadStaging({ root, directory: path.join(root, 'other') })).toThrow('owned');
  });

  it('rejects a staging junction without touching its target', async () => {
    const target = path.join(root, 'target'); await mkdir(target); await writeFile(path.join(target, 'sentinel'), 'safe');
    const directory = path.join(root, `super-ext-upload-${randomUUID()}`);
    await symlink(target, directory, process.platform === 'win32' ? 'junction' : 'dir');
    const owner = createExtensionUploadStaging({ root, directory });
    await expect(owner.handle.release()).rejects.toThrow('residual retained');
    expect(await readFile(path.join(target, 'sentinel'), 'utf8')).toBe('safe');
  });

  it.each([true, false])('reclaims on valid response ok=%s, but not twice on exit', async (ok) => {
    const { client, child } = await started(); const fixture = await staged();
    const request = capture(client, child, fixture);
    reply(child, request.requestId, ok); await request.result; await request.terminal();
    child.emit('exit', 0);
    expect(request.callback).toHaveBeenCalledOnce();
    await expect(readFile(fixture.file)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps the source readable through caller deadline and late-ID eviction', async () => {
    const { client, child } = await started(); const fixture = await staged();
    vi.useFakeTimers();
    const request = capture(client, child, fixture);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(await request.result).toMatchObject({ code: 'WORKER_REQUEST_TIMEOUT' });
    await fixture.owner.releaseIfUnclaimed();
    expect(await readFile(fixture.file, 'utf8')).toBe('owned-content');
    expect(request.callback).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10 * 60_000 + 1);
    reply(child, request.requestId); await request.terminal();
    expect(child.kill).not.toHaveBeenCalled();
    await expect(readFile(fixture.file)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each(['unavailable', 'post-throw'] as const)('reclaims a source that was never dispatched (%s)', async (kind) => {
    const { client, child } = await started(); const fixture = await staged();
    if (kind === 'unavailable') child.emit('exit', 1);
    else child.postMessage.mockImplementationOnce(() => { throw new Error('post failed'); });
    fixture.owner.handle.claim();
    let terminal!: Promise<void>;
    const onTerminal = vi.fn(() => { terminal = fixture.owner.handle.release(); return terminal; });
    await expect(client.request({ type: 'library.close', libraryId: 'library' }, { onTerminal })).rejects.toThrow();
    await terminal;
    expect(onTerminal).toHaveBeenCalledExactlyOnceWith('not-dispatched');
    await expect(readFile(fixture.file)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('does not remove a protocol-failed request source until the child exits', async () => {
    const { client, child } = await started(); const fixture = await staged();
    const request = capture(client, child, fixture);
    child.emit('message', { malformed: true }); await request.result;
    expect(await readFile(fixture.file, 'utf8')).toBe('owned-content');
    child.emit('exit', 1); await request.terminal();
    await expect(readFile(fixture.file)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('isolates two interleaved requests and ignores invalid responses as terminals', async () => {
    const { client, child } = await started();
    const first = await staged(); const second = await staged();
    const a = capture(client, child, first); const b = capture(client, child, second);
    reply(child, b.requestId); await b.result; await b.terminal();
    expect(await readFile(first.file, 'utf8')).toBe('owned-content');
    expect(a.callback).not.toHaveBeenCalled();
    await expect(readFile(second.file)).rejects.toMatchObject({ code: 'ENOENT' });
    // Malformed replies can cause protocol retirement, but cannot prove the
    // first Worker operation has stopped using its input.
    child.emit('message', { requestId: a.requestId, result: { invalid: true } });
    await a.result;
    expect(await readFile(first.file, 'utf8')).toBe('owned-content');
    child.emit('exit', 1); await a.terminal();
    expect(a.callback).toHaveBeenCalledExactlyOnceWith('worker-exit');
    expect(b.callback).toHaveBeenCalledOnce();
  });

  it('retains through shutdown kill intent, ignores old events, and releases only the origin resources', async () => {
    const old = new Child(); const next = new Child();
    const { client } = await started([old, next]); const oldFixture = await staged();
    const oldRequest = capture(client, old, oldFixture);
    const shutdown = client.shutdown(); old.emit('message', { type: 'worker.shutdown.ack' }); await shutdown; await oldRequest.result;
    expect(await readFile(oldFixture.file, 'utf8')).toBe('owned-content');
    const start = client.start(); next.emit('message', { type: 'worker.ready' }); await start;
    const newFixture = await staged(); const newRequest = capture(client, next, newFixture);
    old.emit('message', { requestId: newRequest.requestId, result: { invalid: true } });
    old.emit('message', { type: 'worker.ready' }); old.emit('exit', 0);
    await oldRequest.terminal();
    expect(await readFile(newFixture.file, 'utf8')).toBe('owned-content');
    expect(newRequest.callback).not.toHaveBeenCalled();
    reply(next, newRequest.requestId); await newRequest.result; await newRequest.terminal();
    expect(next.kill).not.toHaveBeenCalled();
  });

  it.each(['sync', 'async'] as const)('diagnoses a %s cleanup failure without changing the business response', async (kind) => {
    const { client, child, logger } = await started();
    const fixture = await staged(async () => { throw Object.assign(new Error('locked'), { code: 'EPERM' }); });
    fixture.owner.handle.claim();
    const onTerminal = kind === 'sync'
      ? () => { throw new Error('cleanup callback failed'); }
      : () => fixture.owner.handle.release();
    const result = client.request({ type: 'library.close', libraryId: 'library' }, { onTerminal });
    reply(child, child.postMessage.mock.calls.at(-1)![0].requestId);
    await expect(result).resolves.toMatchObject({ ok: true });
    await vi.waitFor(() => expect(logger.error).toHaveBeenCalledWith('worker.request.terminal-cleanup', expect.any(Error), expect.any(Object)));
    expect(await readFile(fixture.file, 'utf8')).toBe('owned-content');
  });

  it('retains a claimed source after a complete HTTP upload disconnects', async () => {
    const { client, child } = await started();
    let uploaded!: SaveUploadRequest;
    let terminal!: Promise<void>;
    let entered!: () => void;
    const enteredPromise = new Promise<void>((resolve) => { entered = resolve; });
    server = await createExtensionServer({
      port: 0, uploadStagingRoot: root, onSaveIntent: () => {},
      onListFolders: () => ({ ok: true, folders: [], recentBrowsedFolderIds: [], libraryDisplayName: 'Fixture' }),
      onSaveUpload: async (received, staging) => {
        uploaded = received; staging.claim();
        const result = client.request({ type: 'extension.save-from-file', libraryId: 'library', stagedFilePath: received.stagedFilePath, contentType: received.contentType, filename: received.filename }, {
          onTerminal: () => { terminal = staging.release(); return terminal; },
        });
        entered(); await result; return { accepted: true };
      },
    });
    const address = server.server.address();
    if (!address || typeof address === 'string') throw new Error('Expected loopback TCP server.');
    const request = upload(address.port); const disconnected = request.response.catch(() => -1);
    await enteredPromise; request.request.destroy(); await disconnected;
    expect(await readFile(uploaded.stagedFilePath, 'utf8')).toBe('image');
    reply(child, child.postMessage.mock.calls.at(-1)![0].requestId);
    await terminal;
    await expect(readFile(uploaded.stagedFilePath)).rejects.toMatchObject({ code: 'ENOENT' });
  }, 5_000);

  it('cleans a partially received body without dispatching an upload', async () => {
    const onSaveUpload = vi.fn();
    server = await createExtensionServer({
      port: 0, uploadStagingRoot: root, onSaveIntent: () => {}, onSaveUpload,
      onListFolders: () => ({ ok: true, folders: [], recentBrowsedFolderIds: [], libraryDisplayName: 'Fixture' }),
    });
    const address = server.server.address();
    if (!address || typeof address === 'string') throw new Error('Expected loopback TCP server.');
    const request = http.request({ host: '127.0.0.1', port: address.port, path: '/save-upload', method: 'POST', headers: { ...uploadHeaders, 'Content-Length': '100' } });
    request.on('error', () => {}); request.write('partial');
    await vi.waitFor(async () => expect((await readdir(root)).length).toBe(1));
    request.destroy();
    await vi.waitFor(async () => expect(await readdir(root)).toEqual([]));
    expect(onSaveUpload).not.toHaveBeenCalled();
  }, 5_000);
});
