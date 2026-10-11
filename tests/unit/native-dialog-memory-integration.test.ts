import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogDirectoryMemory } from '../../src/main/dialog-directory-memory';
import { selectImportSources, selectSavePath } from '../../src/main/native-dialogs';

const mocks = vi.hoisted(() => ({ open: vi.fn(), save: vi.fn() }));
vi.mock('electron', () => ({ dialog: { showOpenDialog: mocks.open, showSaveDialog: mocks.save } }));
beforeEach(() => vi.clearAllMocks());
describe('native picker shared memory wiring', () => {
  it('carries successful import directory to save, while canceled dialogs do not overwrite it', async () => {
    const folder = path.resolve('picker-test'), file = path.join(folder, 'asset.png');
    const memory = new DialogDirectoryMemory({ read: () => null, write: () => {} }, candidate => candidate === folder);
    const host = { getLocale: () => 'zh-CN' as const, getMainWindow: () => null, isE2e: () => false, directoryMemory: memory };
    mocks.open.mockResolvedValueOnce({ canceled: false, filePaths: [file] });
    expect(await selectImportSources(host, 'files')).toEqual([file]);
    mocks.save.mockResolvedValueOnce({ canceled: true, filePath: path.resolve('elsewhere', 'wrong.zip') });
    expect(await selectSavePath(host, 'exportZip', undefined, { defaultPath: 'backup.zip' })).toBeUndefined();
    expect(mocks.save.mock.calls[0]?.[0]?.defaultPath).toBe(path.join(folder, 'backup.zip'));
    expect(memory.defaultPath()).toBe(folder);
    mocks.open.mockResolvedValueOnce({ canceled: true, filePaths: [] });
    expect(await selectImportSources(host, 'folder')).toBeUndefined();
    expect(memory.defaultPath()).toBe(folder);
  });
  it('test-injected paths do not write persistent directory memory or open dialogs', async () => {
    const write = vi.fn(), memory = new DialogDirectoryMemory({ read: () => null, write }, () => true);
    const host = { getLocale: () => 'en' as const, getMainWindow: () => null, isE2e: () => true, directoryMemory: memory };
    const file = path.resolve('fixture.png');
    expect(await selectImportSources(host, 'files', { SUPER_E2E_IMPORT_FILES: file })).toEqual([file]);
    expect(mocks.open).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled();
  });
});
