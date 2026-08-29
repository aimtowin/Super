import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

const updateNoticeSchema = z.strictObject({
  version: z.string().min(1).max(64),
  releaseNotes: z.string().max(12_000),
});

const pendingUpdateSchema = updateNoticeSchema.extend({
  installerPath: z.string().min(1).max(4_096),
  cleanupPath: z.string().min(1).max(4_096),
});

export type AppUpdateNotice = z.infer<typeof updateNoticeSchema>;
export type PendingAppUpdate = z.infer<typeof pendingUpdateSchema>;

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
    await writeJsonAtomically(this.#pendingPath, update);
  }

  async loadPending(): Promise<PendingAppUpdate | undefined> {
    const parsed = pendingUpdateSchema.safeParse(await readJson(this.#pendingPath));
    if (!parsed.success
      || !isWithin(this.#cacheDirectory, parsed.data.installerPath)
      || !isWithin(this.#cacheDirectory, parsed.data.cleanupPath)) {
      return undefined;
    }
    try {
      await access(parsed.data.installerPath);
      return parsed.data;
    } catch {
      await this.clearPending();
      return undefined;
    }
  }

  async clearPending(): Promise<void> {
    await rm(this.#pendingPath, { force: true });
  }

  async saveCompletion(notice: AppUpdateNotice): Promise<void> {
    await writeJsonAtomically(this.#completedPath, notice);
  }

  async consumeCompletion(): Promise<AppUpdateNotice | undefined> {
    const parsed = updateNoticeSchema.safeParse(await readJson(this.#completedPath));
    await rm(this.#completedPath, { force: true });
    return parsed.success ? parsed.data : undefined;
  }
}
