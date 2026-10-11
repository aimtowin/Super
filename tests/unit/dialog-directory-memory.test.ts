import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DialogDirectoryMemory } from '../../src/main/dialog-directory-memory';

describe('shared native dialog directory memory', () => {
  const directory = path.resolve('test-picker-folder');
  const storage = () => { let value: string | null = null; return { read: () => value, write: (next: string) => { value = next; } }; };
  it('remembers successful files across dialog types and preserves save filenames', () => {
    const store = storage(), memory = new DialogDirectoryMemory(store, candidate => candidate === directory);
    memory.remember(path.join(directory, 'photo.png'), false);
    expect(memory.defaultPath()).toBe(directory);
    expect(memory.defaultPath('Untitled.md')).toBe(path.join(directory, 'Untitled.md'));
    expect(new DialogDirectoryMemory(store, candidate => candidate === directory).defaultPath()).toBe(directory);
  });
  it('remembers folder itself; cancellation and non-directories do not overwrite it', () => {
    const memory = new DialogDirectoryMemory(storage(), candidate => candidate === directory);
    memory.remember(directory, true);
    memory.remember(undefined, false);
    memory.remember(path.resolve('missing'), true);
    expect(memory.defaultPath()).toBe(directory);
  });
  it('honors explicit directory defaults and ignores removed remembered directories', () => {
    let exists = true;
    const memory = new DialogDirectoryMemory(storage(), () => exists);
    memory.remember(directory, true);
    const explicit = path.resolve('exports', 'archive.zip');
    expect(memory.defaultPath(explicit)).toBe(explicit);
    exists = false;
    expect(memory.defaultPath('New.txt')).toBe('New.txt');
    expect(memory.defaultPath()).toBeUndefined();
  });
  it('survives invalid persisted state and unavailable storage', () => {
    const memory = new DialogDirectoryMemory({ read: () => '{bad', write: () => { throw Error('readonly'); } }, () => true);
    memory.remember(directory, true);
    expect(memory.defaultPath()).toBe(directory);
  });
});
