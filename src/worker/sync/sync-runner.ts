/**
 * 同步动作执行器（Super-xffq）。
 *
 * 将 planSyncActions 的产物执行到 RemoteStorageDriver 上，并通过
 * RunnerContext 与应用层交换文件内容（读本地资产/写入下载内容/回收站/
 * 冲突副本）。本模块不触碰 SQLite；所有库副作用经 context 回调。
 *
 * 冲突处理（规格 §6.3）：LWW 决定正式版本，败者内容在双端各保存一份
 * 冲突副本（`name (conflict-YYYYMMDD-HHMM).ext`），并随结果返回供 UI 通知。
 */

import type { SyncMetadata } from './sync-metadata';
import path from 'node:path';

import { DriverUnsupportedError, RemoteStorageError, type RemoteStorageDriver } from './remote-storage';
import type { SyncManifest, SyncManifestEntry } from './manifest';
import { SYNC_ASSETS_DIR, SYNC_TRASH_DIR } from '../../shared/sync-paths';
import type { SyncAction } from './sync-plan';

/** 可重试错误的自动重试：3 次，指数退避（1s/2s/4s）。 */
const SYNC_RETRY_ATTEMPTS = 3;
const SYNC_RETRY_BASE_MS = 1_000;

function isRetryable(error: unknown): boolean {
  return (
    typeof error === 'object'
    && error !== null
    && 'retryable' in error
    && (error as RemoteStorageError).retryable === true
  );
}

export async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= SYNC_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === SYNC_RETRY_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, SYNC_RETRY_BASE_MS * 2 ** attempt));
    }
  }
  throw lastError;
}

export interface SyncRunnerContext {
  driver: RemoteStorageDriver;
  /** 安全化后的库目录名（远端根下的子目录）。 */
  libraryDirectory: string;
  deviceId: string;
  now(): string;
  /** 读本地资产当前内容。 */
  readLocalAsset(assetId: string): Promise<Buffer>;
  /** 把远端内容写入本地资产（新资产或更新）。 */
  writeLocalAsset(assetId: string, relativePath: string, body: Buffer): Promise<void>;
  relocateLocalAsset?(assetId: string, relativePath: string): Promise<void>;
  supportsMove?: boolean;
  onActionComplete?(): void;
  isCancelled?(): boolean;
  /** 远端墓碑传播：本地资产进回收站。 */
  recycleLocalAsset(assetId: string): Promise<void>;
  /**
   * 保存冲突副本到本地库（导入为独立资产），返回该副本的新 syncId 与
   * 内容指纹；runner 会把它登记进 manifest（path = conflictName），
   * 使双端下一次同步一致。
   */
  saveLocalConflictCopy(
    assetId: string,
    relativePath: string,
    body: Buffer,
    conflictName: string,
  ): Promise<{ syncId: string; contentHash: string; size: number; metadata?: SyncMetadata }>;
}

export interface SyncRunResult {
  manifest: SyncManifest;
  /** 冲突列表（供 UI 通知），每项带双端保存的冲突副本路径。 */
  conflicts: Array<{ assetId: string; conflictCopyPath: string }>;
  uploaded: number;
  downloaded: number;
  deletedRemote: number;
  recycledLocal: number;
  tombstones: number;
}

/** `name.ext` → `name (conflict-YYYYMMDD-HHMM).ext`。 */
export function conflictCopyFileName(originalPath: string, now: string): string {
  const dir = path.posix.dirname(originalPath);
  const base = path.posix.basename(originalPath);
  const dot = base.lastIndexOf('.');
  const stamp = now.replace(/\D/g, '').slice(0, 12);
  const conflictBase = dot > 0
    ? `${base.slice(0, dot)} (conflict-${stamp})${base.slice(dot)}`
    : `${base} (conflict-${stamp})`;
  return dir === '.' ? conflictBase : `${dir}/${conflictBase}`;
}

function assetsPathOf(libraryDirectory: string, entryPath: string): string {
  return `${libraryDirectory}/${SYNC_ASSETS_DIR}/${entryPath}`;
}

/** 上传前确保远端父目录存在（多数服务端不允许 PUT 隐式建目录）。 */
async function ensureRemoteDir(driver: RemoteStorageDriver, remotePath: string): Promise<void> {
  const dir = path.posix.dirname(remotePath);
  if (dir && dir !== '.') await withRetry(() => driver.mkdir(dir));
}

export async function runSyncActions(
  actions: readonly SyncAction[],
  manifest: SyncManifest,
  context: SyncRunnerContext,
): Promise<SyncRunResult> {
  const result: SyncRunResult = {
    manifest,
    conflicts: [],
    uploaded: 0,
    downloaded: 0,
    deletedRemote: 0,
    recycledLocal: 0,
    tombstones: 0,
  };
  const checkCancelled = () => { if (context.isCancelled?.()) throw new RemoteStorageError('CANCELLED','Sync cancelled'); };
  const driver: RemoteStorageDriver = new Proxy(context.driver, {
    get(target,key) {
      const value = Reflect.get(target,key);
      return typeof value === 'function' ? (...args: unknown[]) => {checkCancelled();return value.apply(target,args);} : value;
    },
  });
  const now = context.now();
  const { libraryDirectory } = context;
  const assetPath = (entryPath: string) => assetsPathOf(libraryDirectory, entryPath);
  const assertFree = async (remotePath: string) => {
    if (await driver.exists(remotePath)) throw new RemoteStorageError('CONFLICT', '同步目标路径已被占用；保留双方文件，请先处理同名冲突。');
  };

  for (const action of actions) {
    checkCancelled();
    switch (action.type) {
      case 'upload': {
        const body = await context.readLocalAsset(action.assetId);
        const remotePath = assetPath(action.entry.path);
        await ensureRemoteDir(driver, remotePath);
        const relocating = action.previousPath !== undefined && action.previousPath !== action.entry.path;
        const replacingKnownPath = manifest.entries[action.assetId]?.path === action.entry.path;
        if (!replacingKnownPath) await assertFree(remotePath);
        const written = await withRetry(() => driver.write(remotePath, body,
          replacingKnownPath ? { ifMatch: action.entry.etag } : { overwrite: false }));
        if (relocating) {
          await withRetry(() => driver.delete(assetPath(action.previousPath!), { ifMatch: action.entry.etag }));
        }
        const entry: SyncManifestEntry = { ...action.entry, etag: written.etag, deviceId: context.deviceId, modifiedAt: now };
        manifest.entries[action.assetId] = entry;
        result.uploaded += 1;
        break;
      }
      case 'move-remote': {
        const from = assetPath(action.previousPath);
        const to = assetPath(action.entry.path);
        await assertFree(to);
        await ensureRemoteDir(driver, to);
        let copiedEtag: string | undefined;
        try {
          if (context.supportsMove === false) throw new DriverUnsupportedError('MOVE unavailable');
          await withRetry(() => driver.move(from, to, { ifMatch: action.entry.etag }));
        } catch (error) {
          if (!(error instanceof DriverUnsupportedError)) throw error;
          const read = await withRetry(() => driver.read(from));
          if (action.entry.etag && read.etag !== action.entry.etag) {
            throw new RemoteStorageError('PRECONDITION_FAILED', '远端内容已变化；未执行改名。');
          }
          const written = await withRetry(() => driver.write(to, read.body, { overwrite: false }));
          copiedEtag = written.etag;
          await withRetry(() => driver.delete(from, { ifMatch: read.etag }));
        }
        // MOVE may change an ETag. Do not carry the old path's token forward.
        manifest.entries[action.assetId] = { ...action.entry, etag: copiedEtag,
          deviceId: context.deviceId, modifiedAt: now };
        break;
      }
      case 'relocate-local': {
        if (context.relocateLocalAsset) await context.relocateLocalAsset(action.assetId, action.entry.path);
        else {
          // Compatibility with ports without the dedicated rename capability.
          const body = await context.readLocalAsset(action.assetId);
          checkCancelled(); await context.writeLocalAsset(action.assetId, action.entry.path, body);
        }
        manifest.entries[action.assetId] = { ...action.entry };
        break;
      }
      case 'clear-tombstone': {
        await withRetry(() => driver.delete(`${libraryDirectory}/${SYNC_TRASH_DIR}/${action.assetId}.json`));
        break;
      }
      case 'download': {
        const remotePath = assetPath(action.entry.path);
        await ensureRemoteDir(driver, remotePath);
        const read = await withRetry(() => driver.read(remotePath));
        await context.writeLocalAsset(action.assetId, action.entry.path, read.body);
        manifest.entries[action.assetId] = { ...action.entry, etag: read.etag ?? action.entry.etag };
        result.downloaded += 1;
        break;
      }
      case 'conflict': {
        const proposedName = conflictCopyFileName(action.remote.path, now);
        let conflictName = proposedName;
        for (let suffix = 2; await driver.exists(assetPath(conflictName)); suffix++) {
          const extension = path.posix.extname(proposedName);
          conflictName = `${proposedName.slice(0, proposedName.length - extension.length)}-${suffix}${extension}`;
        }
        if (action.winner === 'local') {
          // 正式版 = 本地内容上传；败者（远端内容）双端存冲突副本。
          const localBody = await context.readLocalAsset(action.assetId);
          const remoteBody = await withRetry(() => driver.read(assetPath(action.remote.path))).then((read) => read.body);
          const remotePath = assetPath(action.local.path);
          const relocating = action.local.path !== action.remote.path;
          if (relocating) await assertFree(remotePath);
          // Preserve the losing bytes on both sides before replacing the winner.
          await ensureRemoteDir(driver, assetPath(conflictName));
          await withRetry(() => driver.write(assetPath(conflictName), remoteBody, { overwrite: false }));
          const copyMeta = await context.saveLocalConflictCopy(action.assetId, action.remote.path, remoteBody, conflictName);
          await ensureRemoteDir(driver, remotePath);
          const written = await withRetry(() => driver.write(remotePath, localBody,
            relocating ? { overwrite: false } : { ifMatch: action.remote.etag }));
          manifest.entries[action.assetId] = {
            ...action.remote,
            path: action.local.path,
            contentHash: action.local.contentHash,
            size: action.local.size,
            version: action.remote.version + 1,
            deviceId: context.deviceId,
            modifiedAt: now,
            etag: written.etag,
          };
          manifest.entries[copyMeta.syncId] = {
            path: conflictName,
            contentHash: copyMeta.contentHash,
            size: copyMeta.size,
            version: 1,
            deviceId: context.deviceId,
            modifiedAt: now,
            metadataVersion: 1,
            ...(copyMeta.metadata ? {metadata:copyMeta.metadata} : {}),
          };
          if (relocating) {
            await withRetry(() => driver.delete(assetPath(action.remote.path), { ifMatch: action.remote.etag }));
          }
          result.uploaded += 2;
        } else {
          // 正式版 = 远端内容落本地；败者（本地内容）双端存冲突副本。
          const remoteBody = await withRetry(() => driver.read(assetPath(action.remote.path))).then((read) => read.body);
          const localBody = await context.readLocalAsset(action.assetId);
          await ensureRemoteDir(driver, assetPath(conflictName));
          await withRetry(() => driver.write(assetPath(conflictName), localBody, { overwrite: false }));
          const copyMeta = await context.saveLocalConflictCopy(action.assetId, action.remote.path, localBody, conflictName);
          await context.writeLocalAsset(action.assetId, action.remote.path, remoteBody);
          manifest.entries[action.assetId] = { ...action.remote };
          manifest.entries[copyMeta.syncId] = {
            path: conflictName,
            contentHash: copyMeta.contentHash,
            size: copyMeta.size,
            version: 1,
            deviceId: context.deviceId,
            modifiedAt: now,
            metadataVersion: 1,
            ...(copyMeta.metadata ? {metadata:copyMeta.metadata} : {}),
          };
          result.downloaded += 1;
          result.uploaded += 1;
        }
        result.conflicts.push({ assetId: action.assetId, conflictCopyPath: conflictName });
        break;
      }
      case 'delete-remote': {
        const entry = manifest.entries[action.assetId];
        if (entry) {
          await withRetry(() => driver.delete(assetPath(entry.path), { ifMatch: entry.etag }));
          result.deletedRemote += 1;
        }
        break;
      }
      case 'tombstone-upload': {
        const entry = manifest.entries[action.assetId];
        const tombstone = JSON.stringify({
          assetId: action.assetId,
          path: entry?.path ?? '',
          deviceId: context.deviceId,
          deletedAt: now,
        });
        await driver.write(`${libraryDirectory}/${SYNC_TRASH_DIR}/${action.assetId}.json`, Buffer.from(tombstone, 'utf-8'));
        delete manifest.entries[action.assetId];
        result.tombstones += 1;
        break;
      }
      case 'delete-local': {
        checkCancelled(); await context.recycleLocalAsset(action.assetId);
        delete manifest.entries[action.assetId];
        result.recycledLocal += 1;
        break;
      }
    }
    context.onActionComplete?.();
  }
  return result;
}
