import { lstat, realpath, rm } from 'node:fs/promises';
import path from 'node:path';

/** This handle stays in Main; it is never part of HTTP or Worker payloads. */
export interface ExtensionUploadStagingHandle {
  claim(): void;
  release(): Promise<void>;
}

export function createExtensionUploadStaging(input: {
  root: string;
  directory: string;
  removeDirectory?: (directory: string) => Promise<void>;
}) {
  const root = path.resolve(input.root);
  const directory = path.resolve(input.directory);
  if (path.dirname(directory) !== root || !/^super-ext-upload-[0-9a-f-]{36}$/i.test(path.basename(directory))) {
    throw new Error('Upload staging directory is not an owned direct child.');
  }
  let claimed = false;
  let release: Promise<void> | undefined;
  const handle: ExtensionUploadStagingHandle = {
    claim() {
      if (release) throw new Error('Upload staging has already been released.');
      claimed = true;
    },
    release() {
      // One attempt, shared by response/exit races. A failed delete is a
      // diagnostic residual, not a successful cleanup or a timer-driven retry.
      release ??= (async () => {
        try {
          const stat = await lstat(directory);
          if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Unsafe staging directory type.');
          const [resolvedRoot, resolvedDirectory] = await Promise.all([realpath(root), realpath(directory)]);
          const expected = path.join(resolvedRoot, path.basename(directory));
          const samePath = process.platform === 'win32'
            ? resolvedDirectory.toLowerCase() === expected.toLowerCase()
            : resolvedDirectory === expected;
          if (!samePath) throw new Error('Staging directory resolves outside its owned root.');
          if (input.removeDirectory) await input.removeDirectory(directory);
          else await rm(directory, { recursive: true, force: true });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
          throw new Error(`Upload staging cleanup failed; residual retained at ${directory}.`, { cause: error });
        }
      })();
      return release;
    },
  };
  return {
    handle,
    async releaseIfUnclaimed(): Promise<void> { if (!claimed) await handle.release(); },
  };
}
