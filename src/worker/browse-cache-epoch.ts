/** Local browse/count dependencies, without a persistent schema migration. */
interface CacheConnection {
  readonly inTransaction?: boolean;
  exec(sql: string): void;
  pragma(source: string, options: { simple: boolean }): unknown;
  prepare(sql: string): { get(): unknown; all(): unknown[] };
}

const dependencies = [
  'assets', 'revisions', 'managed_folders', 'linked_folders',
  'asset_metadata', 'tags', 'human_asset_tags', 'ai_asset_tags',
  'collections', 'collection_assets', 'smart_collections',
  'linked_folder_rules', 'linked_ignored_assets', 'explicit_ignored_paths',
  'gitignore_ignored_paths', 'asset_sequences', 'asset_sequence_frames',
  'revision_artifacts', 'palette_color_index', 'asset_search_index',
  'asset_ai_analysis_state',
] as const;
const installedSchema = new WeakMap<CacheConnection, number>();
let transactionReadId = 0;

/**
 * TEMP triggers track this connection's relevant writes transactionally.
 * data_version catches every other connection's commit conservatively,
 * including external writers that know nothing about these TEMP triggers.
 * Never memoize a read in an open transaction: a rollback can reuse an epoch
 * number for different data (ABA). Inspection handles use the old sequence.
 */
export function readBrowseCacheEpoch(connection: CacheConnection): string | null {
  if (connection.inTransaction) return `transaction:${++transactionReadId}`;
  if (connection.pragma('query_only', { simple: true })) return null;
  const schemaVersion = Number(connection.pragma('schema_version', { simple: true }));
  if (installedSchema.get(connection) !== schemaVersion) {
    const tables = new Set((connection.prepare(
      "SELECT name FROM main.sqlite_master WHERE type = 'table'",
    ).all() as Array<{ name: string }>).map((row) => row.name));
    connection.exec(`CREATE TEMP TABLE IF NOT EXISTS super_browse_cache_epoch (
      id INTEGER PRIMARY KEY CHECK(id = 1), epoch INTEGER NOT NULL
    ); INSERT OR IGNORE INTO temp.super_browse_cache_epoch VALUES (1, 0);`);
    for (const table of dependencies) {
      if (!tables.has(table)) continue;
      for (const operation of ['INSERT', 'UPDATE', 'DELETE']) {
        connection.exec(`CREATE TEMP TRIGGER IF NOT EXISTS super_browse_${table}_${operation}
          AFTER ${operation} ON main.${table} BEGIN
            UPDATE super_browse_cache_epoch SET epoch = epoch + 1 WHERE id = 1;
          END;`);
      }
    }
    installedSchema.set(connection, schemaVersion);
  }
  const dataVersion = Number(connection.pragma('data_version', { simple: true }));
  const row = connection.prepare('SELECT epoch FROM temp.super_browse_cache_epoch WHERE id = 1').get() as { epoch: number };
  return `${schemaVersion}:${dataVersion}:${row.epoch}`;
}
