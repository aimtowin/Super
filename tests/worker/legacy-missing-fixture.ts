import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { LibraryService } from '../../src/worker/library-service';

const require = createRequire(import.meta.url);
interface FixtureDatabase {
  prepare(sql: string): {run(...parameters: unknown[]): unknown};
  close(): void;
}
const Database = require('better-sqlite3') as new (filename: string) => FixtureDatabase;

/** Seed an older/offline library's missing rows for relink recovery tests.
 * Current successful reconciliation intentionally removes confirmed missing
 * index rows; it is NOT a way to create this historical state.
 */
export function seedLegacyMissingAssets(service: LibraryService, libraryId: string, libraryPath: string): void {
  const db = new Database(path.join(libraryPath, '.super', 'library.db'));
  try {
    const missing = db.prepare("UPDATE assets SET availability = 'missing' WHERE asset_id = ?");
    for (const asset of service.listAssets({libraryId, recursive: true})) {
      if (!existsSync(service.resolveAssetPath(libraryId, asset.assetId))) missing.run(asset.assetId);
    }
  } finally {db.close();}
}
