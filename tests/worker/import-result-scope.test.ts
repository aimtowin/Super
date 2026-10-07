import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LibraryService, type LibraryServiceOptions } from '../../src/worker/library-service';
import { importNoConflict } from './import-no-conflict';

const roots: string[] = [];
const services: LibraryService[] = [];
function setup(options: LibraryServiceOptions = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'super-import-result-'));
  roots.push(root);
  const statements: string[] = [];
  const service = new LibraryService({ observerFactory: () => ({ close() {} }), ...options,
    onDbStatement: (sql) => statements.push(sql) });
  services.push(service);
  const library = service.createLibrary({ displayName: 'Scoped results', selectedParentPath: root });
  return { root, service, library, statements };
}
function summaryQueries(statements: readonly string[]) {
  return statements.filter((sql) => sql.includes('AS thumbnail_status') && sql.includes('ORDER BY a.relative_file_path'));
}
afterEach(() => {
  for (const service of services.splice(0)) service.closeAll();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('bounded import completion summaries', () => {
  it('does not hydrate the library when every conflict is skipped', () => {
    const { root, service, library, statements } = setup();
    const source = path.join(root, 'skipped.txt');
    writeFileSync(source, 'already imported');
    importNoConflict(service, library.libraryId, source);
    statements.length = 0;
    const completion = importNoConflict(service, library.libraryId, source, undefined,
      { suspectedDuplicate: 'skip', nameConflict: 'skip' });
    expect(completion.importedCount).toBe(0);
    expect(completion.assets).toEqual([]);
    expect(summaryQueries(statements)).toEqual([]);
  });

  it('queries only affected summaries and preserves retained duplicate metadata/artifacts', () => {
    const { root, service, library, statements } = setup();
    const source = path.join(root, '[华为] image.png');
    writeFileSync(source, 'unique bytes');
    const original = importNoConflict(service, library.libraryId, source).assets[0]!;
    const artifact = service.writeDerivedArtifact({ libraryId: library.libraryId, assetId: original.assetId,
      kind: 'thumbnail', mimeType: 'image/png', bytes: Buffer.from('thumbnail'), generatorVersion: 'test', maxBytes: 1024 });
    const unrelated = path.join(root, 'unrelated.txt');
    writeFileSync(unrelated, 'unrelated');
    importNoConflict(service, library.libraryId, unrelated);
    const duplicate = path.join(root, 'different-name.png');
    writeFileSync(duplicate, 'unique bytes');
    statements.length = 0;
    const result = importNoConflict(service, library.libraryId, duplicate, undefined, { suspectedDuplicate: 'merge' });
    const queries = summaryQueries(statements);
    expect(queries.length).toBeGreaterThan(0);
    expect(queries.every((sql) => sql.includes('a.asset_id IN ('))).toBe(true);
    expect(result.assets).toEqual(service.listAssets({ libraryId: library.libraryId, recursive: true })
      .filter((asset) => asset.assetId === original.assetId));
    expect(result.assets[0]!.thumbnailArtifactId).toBe(artifact.artifactId);
  });

  it('batches more than 500 IDs and keeps SQLite binary path order across batches', () => {
    const { root, service, library, statements } = setup();
    const names = ['😀.txt', '\uE000.txt', '[中文].txt', ...Array.from({ length: 503 }, (_, i) => `asset-${i}.txt`)];
    const sources = names.map((name, i) => {
      const source = path.join(root, name);
      writeFileSync(source, `unique-${i}`);
      return source;
    });
    const plan = service.prepareImport({ libraryId: library.libraryId, sourceKind: 'files', sourcePaths: sources });
    statements.length = 0;
    const completion = service.resolveImport({ importId: plan.importId, suspectedDuplicate: 'create-copy', nameConflict: 'keep-both' });
    const queries = summaryQueries(statements);
    expect(queries).toHaveLength(2);
    expect(queries.every((sql) => sql.includes('a.asset_id IN ('))).toBe(true);
    expect(completion.assets).toHaveLength(names.length);
    expect(completion.assets).toEqual(service.listAssets({ libraryId: library.libraryId, recursive: true }));
  });

  it('keeps sequence summaries complete when frames span result batches', () => {
    const { root, service, library } = setup();
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWM4kKBwIEGBAUIBACWOBQHzNCW5AAAAAElFTkSuQmCC', 'base64');
    const sources = Array.from({ length: 503 }, (_, i) => {
      const source = path.join(root, `frame_${String(i + 1).padStart(4, '0')}.png`);
      writeFileSync(source, png);
      return source;
    });
    const plan = service.prepareImport({ libraryId: library.libraryId, sourceKind: 'files', sourcePaths: sources });
    const completion = service.resolveImport({ importId: plan.importId, suspectedDuplicate: 'create-copy', nameConflict: 'keep-both' });
    expect(completion.assets).toHaveLength(1);
    expect(completion.assets[0]!.sequence?.frameCount).toBe(503);
    expect(completion.assetCount).toBe(1);
    expect(completion.assets).toEqual(service.listAssets({ libraryId: library.libraryId, recursive: true }));
  });

  it('uses scoped summaries for partial durable imports without losing committed files', () => {
    let seen = 0;
    const { root, service, library, statements } = setup({ onAssetsChanged: () => {
      if (++seen === 1) throw new Error('failure after a durable commit');
    } });
    const sources = ['a.txt', 'b.txt'].map((name) => {
      const source = path.join(root, name);
      writeFileSync(source, name);
      return source;
    });
    const plan = service.prepareImport({ libraryId: library.libraryId, sourceKind: 'files', sourcePaths: sources });
    statements.length = 0;
    const completion = service.resolveImport({ importId: plan.importId, suspectedDuplicate: 'create-copy', nameConflict: 'keep-both' });
    expect(completion.importedCount).toBe(1);
    expect(summaryQueries(statements).every((sql) => sql.includes('a.asset_id IN ('))).toBe(true);
    expect(completion.assets).toHaveLength(1);
    expect(completion.assets).toEqual(service.listAssets({ libraryId: library.libraryId, recursive: true }));
  });
});
