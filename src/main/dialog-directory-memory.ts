import path from 'node:path';
import { statSync } from 'node:fs';

/** Shared across native pickers; persistence failures must never block a dialog. */
export class DialogDirectoryMemory {
  private directory: string | undefined;
  constructor(
    private readonly storage: { read(): string | null; write(value: string): void },
    private readonly isDirectory = (candidate: string): boolean => {
      try { return statSync(candidate).isDirectory(); } catch { return false; }
    },
  ) {
    try {
      const raw = storage.read();
      if (raw && raw.length < 16_384) {
        const value: unknown = JSON.parse(raw);
        if (value && typeof value === 'object' && 'version' in value && value.version === 1 &&
            'directory' in value && typeof value.directory === 'string' && path.isAbsolute(value.directory)) {
          this.directory = value.directory;
        }
      }
    } catch { /* Start without memory if storage is absent or corrupt. */ }
  }

  defaultPath(explicit?: string): string | undefined {
    // An explicit directory/path is authoritative; only a bare save filename is merged.
    if (explicit && (path.dirname(explicit) !== '.' || path.isAbsolute(explicit))) return explicit;
    if (!this.directory || !this.isDirectory(this.directory)) return explicit;
    return explicit ? path.join(this.directory, explicit) : this.directory;
  }

  remember(selected: string | undefined, directory: boolean): void {
    if (!selected || !path.isAbsolute(selected)) return;
    const candidate = directory ? selected : path.dirname(selected);
    if (!this.isDirectory(candidate)) return;
    this.directory = candidate;
    try { this.storage.write(JSON.stringify({ version: 1, directory: candidate })); }
    catch { /* Keep session memory when persistence is unavailable. */ }
  }
}
