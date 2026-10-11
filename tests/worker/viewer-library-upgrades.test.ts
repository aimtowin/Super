import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import AdmZip from 'adm-zip';
import { LibraryService } from '../../src/worker/library-service';
import { encodeLinkedVirtualFolderId } from '../../src/shared/linked-folder-tree';

const roots: string[] = [], services: LibraryService[] = [];
const TestDatabase = createRequire(import.meta.url)('better-sqlite3') as new (filename: string) => {
  close(): void;
  prepare(sql: string): { run(...values: unknown[]): unknown };
};
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
function setup() {
  const root = mkdtempSync(path.join(tmpdir(), 'super-viewer-library-')); roots.push(root);
  const service = new LibraryService(); services.push(service);
  const library = service.createLibrary({ displayName: 'Upgrades', selectedParentPath: root });
  return { root, service, library, libraryId: library.libraryId };
}
function importFile(service: LibraryService, libraryId: string, file: string, targetFolderId?: string) {
  const result = service.prepareOrExecuteImport({ libraryId, sourceKind: 'files', sourcePaths: [file], targetFolderId });
  if ('importId' in result) throw new Error('Unexpected conflicts');
  return result.assets[0]!;
}
afterEach(() => { for (const service of services.splice(0)) service.closeAll(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
describe('viewer/library upgrade integration', () => {
  it('persists custom folder covers; falls back on missing/deleted images and resets', () => {
    const { root, service, library, libraryId } = setup();
    const folder = service.createManagedFolder({ libraryId, name: 'Folder' });
    const autoFile = path.join(root, 'auto.png'), customFile = path.join(root, 'custom.png');
    writeFileSync(autoFile, png); writeFileSync(customFile, Buffer.concat([png, Buffer.from('custom')]));
    const auto = importFile(service, libraryId, autoFile, folder.folderId), custom = importFile(service, libraryId, customFile);
    const db = new TestDatabase(path.join(library.libraryPath, '.super', 'library.db'));
    try {
      for (const [asset, id] of [[auto, 'auto-thumb'], [custom, 'custom-thumb']] as const) db.prepare("INSERT INTO revision_artifacts(artifact_id, revision_id, kind, mime_type, byte_size, file_path, generator_version, status, generated_at) VALUES (?, ?, 'thumbnail', 'image/png', 68, 'fixture.png', 'test', 'ready', ?)").run(id, asset.currentRevisionId, new Date().toISOString());
      const sequence = service.getChangeSequence(libraryId);
      expect(service.folderCover({ libraryId, folderId: folder.folderId, assetId: custom.assetId }).assetId).toBe(custom.assetId);
      expect(service.getChangeSequence(libraryId)).toBeGreaterThan(sequence);
      const entries = () => service.listFolderBrowseEntries({ libraryId, parentFolderId: null });
      expect(entries()[0]!.coverArtifactIds).toEqual(['custom-thumb']);
      service.closeAll(); service.openLibrary(library.libraryPath);
      expect(service.folderCover({ libraryId, folderId: folder.folderId }).assetId).toBe(custom.assetId);
      db.prepare("UPDATE revision_artifacts SET invalidated_at = ? WHERE artifact_id = 'custom-thumb'").run(new Date().toISOString());
      expect(entries()[0]!.coverArtifactIds).toEqual(['auto-thumb']);
      db.prepare("UPDATE revision_artifacts SET invalidated_at = NULL WHERE artifact_id = 'custom-thumb'").run();
      db.prepare("UPDATE assets SET availability = 'missing' WHERE asset_id = ?").run(custom.assetId);
      expect(entries()[0]!.coverArtifactIds).toEqual(['auto-thumb']);
      db.prepare("UPDATE assets SET availability = 'available', deleted_at = ? WHERE asset_id = ?").run(new Date().toISOString(), custom.assetId);
      expect(entries()[0]!.coverArtifactIds).toEqual(['auto-thumb']);
      service.folderCover({ libraryId, folderId: folder.folderId, assetId: null });
      expect(service.folderCover({ libraryId, folderId: folder.folderId }).assetId).toBeNull();
      expect(entries()[0]!.coverArtifactIds).toEqual(['auto-thumb']);
    } finally { db.close(); }
  });
  it('keeps linked virtual-folder covers through directory rename', () => {
    const { root, service, libraryId } = setup(), source = path.join(root, 'source');
    mkdirSync(path.join(source, 'child'), { recursive: true }); writeFileSync(path.join(source, 'child', 'image.png'), png);
    const linked = service.importFolderAsLinked({ libraryId, sourceRootPath: source });
    const asset = service.listAssets({ libraryId, recursive: true }).find(item => item.locationKind === 'linked')!;
    service.folderCover({ libraryId, folderId: encodeLinkedVirtualFolderId(linked.folderId, 'child'), assetId: asset.assetId });
    service.renameLinkedFolderDirectory({ libraryId, linkedFolderId: linked.folderId, relativePath: 'child', newName: 'renamed' });
    expect(service.folderCover({ libraryId, folderId: encodeLinkedVirtualFolderId(linked.folderId, 'renamed') }).assetId).toBe(asset.assetId);
  });
  it('filters missing linked records before pagination, layout, selection and folder hierarchy without hiding managed missing assets', () => {
    const { root, service, library, libraryId } = setup(), source = path.join(root, 'linked');
    mkdirSync(path.join(source, 'live'), { recursive: true }); mkdirSync(path.join(source, 'gone'), { recursive: true });
    writeFileSync(path.join(source, 'live', 'live.png'), png); writeFileSync(path.join(source, 'gone', 'gone.png'), png);
    const managedFile = path.join(root, 'managed.png'); writeFileSync(managedFile, png); const managed = importFile(service, libraryId, managedFile);
    const linked = service.importFolderAsLinked({ libraryId, sourceRootPath: source });
    const db = new TestDatabase(path.join(library.libraryPath, '.super', 'library.db'));
    try {
      db.prepare("UPDATE assets SET availability = 'missing' WHERE asset_id = ? OR relative_file_path = 'gone/gone.png'").run(managed.assetId);
      rmSync(path.join(source, 'gone'), { recursive: true });
      const filters = [{ field: 'linked_visibility' as const, values: ['available'], exclude: false }];
      const first = service.searchAssets({ libraryId, filters, limit: 1, offset: 0 }), second = service.searchAssets({ libraryId, filters, limit: 1, offset: 1 });
      expect(first.total).toBe(2); expect(second.total).toBe(2);
      expect([...first.items, ...second.items].map(item => item.assetId)).toContain(managed.assetId);
      expect(service.searchAssets({ libraryId, filters, idsOnly: true }).assetIds).toHaveLength(2);
      expect(service.searchAssets({ libraryId, filters, layoutOnly: true }).layout).toHaveLength(2);
      expect(service.searchAssets({ libraryId }).total).toBe(3);
      expect(service.listLinkedFolders(libraryId, false, true).map(folder => folder.relativePath)).not.toContain('gone');
      expect(service.listLinkedFolders(libraryId).map(folder => folder.relativePath)).toContain('gone');
      expect(service.listFolderBrowseEntries({ libraryId, parentFolderId: linked.folderId, hideMissing: true }).map(folder => folder.name)).toEqual(['live']);
      db.prepare("UPDATE linked_folders SET status = 'offline' WHERE folder_id = ?").run(linked.folderId);
      expect(service.listLinkedFolders(libraryId, false, true)).toHaveLength(0);
      expect(service.listLinkedFolders(libraryId)).not.toHaveLength(0);
    } finally { db.close(); }
  });
  it('ZIP service validates asset identity, source revision and format', async () => {
    const { root, service, libraryId } = setup(), zip = new AdmZip(), file = path.join(root, 'archive.zip');
    zip.addFile('read.md', Buffer.from('# readonly')); zip.writeZip(file);
    const asset = importFile(service, libraryId, file);
    const result = await service.previewZipAsset({ libraryId, assetId: asset.assetId });
    expect(result.entries[0]!.name).toBe('read.md');
    await expect(service.previewZipAsset({ libraryId, assetId: asset.assetId, expectedRevisionId: 'old', memberPath: 'read.md' })).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    const textFile = path.join(root, 'not-zip.txt'); writeFileSync(textFile, 'text'); const text = importFile(service, libraryId, textFile);
    await expect(service.previewZipAsset({ libraryId, assetId: text.assetId })).rejects.toMatchObject({ code: 'INVALID_IMPORT_DECISION' });
    expect(() => service.folderCover({ libraryId, folderId: 'absent', assetId: text.assetId })).toThrow();
  });
});
