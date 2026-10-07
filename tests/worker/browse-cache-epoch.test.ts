import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { readBrowseCacheEpoch } from '../../src/worker/browse-cache-epoch';

interface TestDatabase {
  readonly inTransaction: boolean;
  close(): void;
  exec(sql: string): void;
  pragma(source: string, options?: { simple: boolean }): unknown;
  prepare(sql: string): { get(): unknown; all(): unknown[] };
}
const Database = BetterSqlite3 as new (filename: string) => TestDatabase;

describe('browse cache dependency epoch', () => {
  it('ignores local job progress but tracks data, external commits, rollback and schema changes without changing main schema', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'super-cache-epoch-'));
    const filename = path.join(root, 'library.db');
    const db = new Database(filename);
    const other = new Database(filename);
    try {
      db.exec('CREATE TABLE assets(id TEXT); CREATE TABLE jobs(progress REAL); INSERT INTO jobs VALUES(0);');
      const schema = db.prepare('SELECT * FROM sqlite_master ORDER BY name').all();
      const initial = readBrowseCacheEpoch(db);
      expect(initial).not.toBeNull();
      db.exec('UPDATE jobs SET progress = 0.5');
      expect(readBrowseCacheEpoch(db)).toBe(initial);
      db.exec("INSERT INTO assets VALUES('a')");
      const changed = readBrowseCacheEpoch(db);
      expect(changed).not.toBe(initial);
      db.exec('BEGIN; INSERT INTO assets VALUES(\'rolled-back\')');
      const duringTransaction = readBrowseCacheEpoch(db);
      expect(readBrowseCacheEpoch(db)).not.toBe(duringTransaction);
      db.exec('ROLLBACK');
      expect(readBrowseCacheEpoch(db)).toBe(changed);
      other.exec("INSERT INTO assets VALUES('external')");
      expect(readBrowseCacheEpoch(db)).not.toBe(changed);
      expect(db.prepare('SELECT * FROM sqlite_master ORDER BY name').all()).toEqual(schema);
      const beforeSchema = readBrowseCacheEpoch(db);
      db.exec('CREATE TABLE tags(id TEXT)');
      expect(readBrowseCacheEpoch(db)).not.toBe(beforeSchema);
      const beforeTags = readBrowseCacheEpoch(db);
      db.exec("INSERT INTO tags VALUES('new-tag')");
      expect(readBrowseCacheEpoch(db)).not.toBe(beforeTags);
    } finally {
      other.close(); db.close(); rmSync(root, { recursive: true, force: true });
    }
  });

  it('uses the conservative fallback for query-only inspection handles without writes', () => {
    const db = new Database(':memory:');
    try {
      db.exec('CREATE TABLE assets(id TEXT)');
      db.pragma('query_only = ON');
      expect(readBrowseCacheEpoch(db)).toBeNull();
      expect(db.prepare('SELECT * FROM sqlite_temp_master').all()).toEqual([]);
    } finally { db.close(); }
  });

  it.each([
    'assets', 'revisions', 'managed_folders', 'linked_folders',
    'asset_metadata', 'tags', 'human_asset_tags', 'ai_asset_tags',
    'collections', 'collection_assets', 'smart_collections',
    'linked_folder_rules', 'linked_ignored_assets', 'explicit_ignored_paths',
    'gitignore_ignored_paths', 'asset_sequences', 'asset_sequence_frames',
    'revision_artifacts', 'palette_color_index', 'asset_search_index',
    'asset_ai_analysis_state',
  ])('invalidates on insert/update/delete of %s', (table) => {
    const db = new Database(':memory:');
    try {
      db.exec(`CREATE TABLE ${table}(value TEXT)`);
      let previous = readBrowseCacheEpoch(db);
      for (const statement of [
        `INSERT INTO ${table} VALUES('initial')`,
        `UPDATE ${table} SET value = 'changed'`,
        `DELETE FROM ${table}`,
      ]) {
        db.exec(statement);
        const next = readBrowseCacheEpoch(db);
        expect(next).not.toBe(previous);
        previous = next;
      }
    } finally { db.close(); }
  });
});
