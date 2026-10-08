import type { Dirent } from 'node:fs';
import { lstat, mkdir, readdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import type { AppUpdateService } from './app-update-service';

const updateNoticeSchema = z.strictObject({
  version: z.string().min(1).max(64),
  releaseNotes: z.string().max(12_000),
});

const legacyPendingUpdateSchema = updateNoticeSchema.extend({
  installerPath: z.string().min(1).max(4_096),
  cleanupPath: z.string().min(1).max(4_096),
});

export const installerReceiptSchema = z.strictObject({
  schemaVersion: z.literal(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  bytes: z.number().int().positive().max(2 * 1024 * 1024 * 1024),
  appVersion: z.string().min(1).max(64),
  installerPath: z.string().min(1).max(4_096),
});

export const pendingUpdateSchema = legacyPendingUpdateSchema.extend({ receipt: installerReceiptSchema });

export type AppUpdateNotice = z.infer<typeof updateNoticeSchema>;
export type PendingAppUpdate = z.infer<typeof pendingUpdateSchema>;
export type InstallerReceipt = z.infer<typeof installerReceiptSchema>;
export type PendingAppUpdateState =
  | { status: 'absent' }
  | { status: 'legacy' }
  | { status: 'candidate'; update: PendingAppUpdate }
  | { status: 'invalid' };

function isWithin(directory: string, target: string): boolean {
  const relative = path.relative(path.resolve(directory), path.resolve(target));
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

async function readJson(filePath: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return undefined;
  }
}

async function writeJsonAtomically(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporaryPath, filePath);
}

/** Keeps only locally verified, per-user update metadata. Never trust paths outside the cache. */
export class PendingAppUpdateStore {
  readonly #cacheDirectory: string;
  readonly #pendingPath: string;
  readonly #completedPath: string;

  constructor(cacheDirectory: string) {
    this.#cacheDirectory = path.resolve(cacheDirectory);
    this.#pendingPath = path.join(this.#cacheDirectory, 'pending.json');
    this.#completedPath = path.join(this.#cacheDirectory, 'completed.json');
  }

  async savePending(update: PendingAppUpdate): Promise<void> {
    if (!isWithin(this.#cacheDirectory, update.installerPath) || !isWithin(this.#cacheDirectory, update.cleanupPath)) {
      throw new Error('A pending update path escaped the Super update cache.');
    }
    const parsed = pendingUpdateSchema.parse(update);
    if (parsed.receipt.appVersion !== parsed.version || parsed.receipt.installerPath !== parsed.installerPath) {
      throw new Error('A pending update receipt does not match its installer.');
    }
    await this.#assertOwnedCache();
    await this.#assertMetadataPath(this.#pendingPath);
    await this.#assertMetadataPath(`${this.#pendingPath}.tmp`);
    await writeJsonAtomically(this.#pendingPath, parsed);
  }

  async loadPending(): Promise<PendingAppUpdateState> {
    let input: unknown;
    try {
      await this.#assertOwnedCache();
      await this.#assertMetadataPath(this.#pendingPath);
      input = JSON.parse(await readFile(this.#pendingPath, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { status: 'absent' };
      return { status: 'invalid' };
    }
    const parsed = pendingUpdateSchema.safeParse(input);
    if (parsed.success) {
      const update = parsed.data;
      if (!isWithin(this.#cacheDirectory, update.installerPath)
        || !isWithin(this.#cacheDirectory, update.cleanupPath)
        || update.receipt.appVersion !== update.version
        || update.receipt.installerPath !== update.installerPath) return { status: 'invalid' };
      // A well-shaped receipt is only a candidate. Service must asynchronously
      // verify the actual bytes/path; existence is never proof of integrity.
      return { status: 'candidate', update };
    }
    return { status: legacyPendingUpdateSchema.safeParse(input).success ? 'legacy' : 'invalid' };
  }

  async clearPending(): Promise<void> {
    await this.#assertOwnedCache();
    await rm(this.#pendingPath, { force: true });
  }

  async #assertOwnedCache(): Promise<void> {
    const cacheStat = await lstat(this.#cacheDirectory);
    if (!cacheStat.isDirectory() || cacheStat.isSymbolicLink()) throw new Error('Unsafe Super update cache directory.');
    if (path.resolve(await realpath(this.#cacheDirectory)) !== this.#cacheDirectory) {
      throw new Error('The Super update cache contains a redirected parent directory.');
    }
  }

  async #assertMetadataPath(filePath: string): Promise<void> {
    try {
      const metadataStat = await lstat(filePath);
      if (!metadataStat.isFile() || metadataStat.isSymbolicLink()) throw new Error('Unsafe Super update metadata path.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  /**
   * Remove abandoned, fully-contained installer directories without touching a
   * verified update that is waiting for the user's next launch. This is kept
   * deliberately narrow: only directories created by AppUpdateService are
   * eligible, and metadata files remain intact.
   */
  async pruneStaleArtifacts(preservedCleanupPath?: string): Promise<number> {
    const preservedPath = preservedCleanupPath === undefined
      ? undefined
      : path.resolve(preservedCleanupPath);
    if (preservedPath !== undefined && !isWithin(this.#cacheDirectory, preservedPath)) {
      throw new Error('A preserved update path escaped the Super update cache.');
    }

    let entries: Dirent[];
    try {
      await this.#assertOwnedCache();
      entries = await readdir(this.#cacheDirectory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
      throw error;
    }

    let removedCount = 0;
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith('super-update-')) continue;
      const candidate = path.resolve(this.#cacheDirectory, entry.name);
      if (!isWithin(this.#cacheDirectory, candidate) || candidate === preservedPath) continue;
      await rm(candidate, { recursive: true, force: true, maxRetries: 2 });
      removedCount += 1;
    }
    return removedCount;
  }

  async saveCompletion(notice: AppUpdateNotice): Promise<void> {
    await this.#assertOwnedCache();
    await this.#assertMetadataPath(this.#completedPath);
    await this.#assertMetadataPath(`${this.#completedPath}.tmp`);
    await writeJsonAtomically(this.#completedPath, updateNoticeSchema.parse(notice));
  }

  /** Remove only a marker created by this launch, not an unrelated version's notice. */
  async clearCompletion(version: string): Promise<void> {
    await this.#assertOwnedCache();
    await this.#assertMetadataPath(this.#completedPath);
    const parsed = updateNoticeSchema.safeParse(await readJson(this.#completedPath));
    if (parsed.success && parsed.data.version === version) await rm(this.#completedPath, { force: true });
  }

  /**
   * Consume a completion notice only after the installed app reports the
   * matching version. This makes the marker safe even when a Windows setup
   * launch drops its optional `--updated` argument or a user reopens Super
   * before setup has replaced the executable.
  */
  async consumeCompletion(expectedVersion?: string): Promise<AppUpdateNotice | undefined> {
    try {
      await this.#assertOwnedCache();
      await this.#assertMetadataPath(this.#completedPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
    const parsed = updateNoticeSchema.safeParse(await readJson(this.#completedPath));
    if (!parsed.success) {
      await rm(this.#completedPath, { force: true });
      return undefined;
    }
    if (expectedVersion !== undefined && parsed.data.version !== expectedVersion) {
      return undefined;
    }
    await rm(this.#completedPath, { force: true });
    return parsed.data;
  }
}

/** The actual Main startup handoff, kept thin so Store → Service can be tested without Electron. */
export async function resumePendingAppUpdate(options: {
  store: PendingAppUpdateStore;
  service: Pick<AppUpdateService, 'restorePreparedUpdate' | 'launchPreparedUpdate'>;
  currentVersion: string;
  logger?: { info(scope: string, message: string, context?: Record<string, unknown>): void;
    error(scope: string, error: unknown, context?: Record<string, unknown>): void };
  onInvalidUpdate(): void | Promise<void>;
}): Promise<{ continueStartup: boolean; completionNotice?: AppUpdateNotice }> {
  const { store, service, logger } = options;
  let completionNotice: AppUpdateNotice | undefined;
  try {
    completionNotice = await store.consumeCompletion(options.currentVersion);
  } catch (error) {
    logger?.error('app-update.persist', error, { phase: 'startup-completion' });
  }
  let pending: PendingAppUpdateState;
  try {
    pending = await store.loadPending();
  } catch (error) {
    logger?.error('app-update.persist', error, { phase: 'startup-pending' });
    pending = { status: 'invalid' };
  }
  if (pending.status === 'absent' || pending.status === 'candidate') {
    try {
      const removedCount = await store.pruneStaleArtifacts(pending.status === 'candidate' ? pending.update.cleanupPath : undefined);
      if (removedCount > 0) logger?.info('app-update.cleanup', 'Removed abandoned update cache directories.', { removedCount });
    } catch (error) {
      logger?.error('app-update.cleanup', error, { phase: 'startup-prune' });
    }
  }
  if (pending.status === 'absent') return { continueStartup: true, completionNotice };
  if (pending.status === 'candidate' && pending.update.version === options.currentVersion) {
    // A successful installer can reopen Super before a failed metadata unlink
    // is retried. Never launch that same installed version a second time.
    await store.clearPending().catch((error: unknown) => logger?.error('app-update.persist', error, { phase: 'already-installed-clear' }));
    return { continueStartup: true, completionNotice };
  }
  let completionCreated = false;
  if (pending.status === 'candidate') {
    const update = pending.update;
    try {
      if (await service.restorePreparedUpdate(update)) {
        const launched = await service.launchPreparedUpdate('silent', {
          beforeLaunch: async () => {
            await store.saveCompletion({ version: update.version, releaseNotes: update.releaseNotes });
            completionCreated = true;
          },
        });
        if (launched.ok && launched.action === 'installer-opened') {
          await store.clearPending().catch((error: unknown) => logger?.error('app-update.persist', error, { phase: 'launched-clear' }));
          logger?.info('app-update.deferred', 'Launching a user-approved update before normal startup.', { version: update.version });
          return { continueStartup: false, completionNotice };
        }
      }
    } catch (error) {
      logger?.error('app-update.deferred', error, { phase: 'startup-restore' });
    }
    if (completionCreated) {
      await store.clearCompletion(update.version).catch((error: unknown) => logger?.error('app-update.persist', error, { phase: 'failed-completion' }));
    }
  }
  await store.clearPending().catch((error: unknown) => logger?.error('app-update.persist', error, { phase: 'invalid-clear' }));
  logger?.info('app-update.deferred', 'Pending update is untrusted or unavailable; normal startup will continue.', { state: pending.status });
  try {
    await options.onInvalidUpdate();
  } catch (error) {
    logger?.error('app-update.deferred', error, { phase: 'reprepare-notice' });
  }
  return { continueStartup: true, completionNotice };
}
