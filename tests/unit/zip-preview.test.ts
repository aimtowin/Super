import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { crc32 } from 'node:zlib';
import AdmZip from 'adm-zip';
import { afterEach, describe, expect, it } from 'vitest';
import { readZipPreview, safeZipMemberName } from '../../src/worker/zip-preview';

const roots: string[] = [];
function fixture(entries: [string, Buffer][]): string {
  const root = mkdtempSync(path.join(tmpdir(), 'super-readonly-zip-')); roots.push(root);
  const file = path.join(root, 'test.zip'), archive = new AdmZip();
  for (const [name, data] of entries) archive.addFile(name, data);
  archive.writeZip(file); return file;
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
describe('bounded read-only ZIP preview', () => {
  it('checks raster signatures and decoded pixel budgets before browser exposure', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const file = fixture([['tiny.png', png]]);
    expect((await readZipPreview(file, 'tiny.png')).member?.mime).toBe('image/png');
    await expect(readZipPreview(fixture([['fake.jpg', png]]), 'fake.jpg')).rejects.toThrow('IMAGE_UNSUPPORTED');
    const huge = Buffer.from(png);
    huge.writeUInt32BE(4097, 16); huge.writeUInt32BE(4096, 20);
    huge.writeUInt32BE(crc32(huge.subarray(12, 29)), 29);
    await expect(readZipPreview(fixture([['huge.png', huge]]), 'huge.png')).rejects.toThrow('IMAGE_UNSUPPORTED');
  });
  it('lists nested and Unicode paths; reads exact text without modifying the ZIP', async () => {
    const file = fixture([['素材/说明.md', Buffer.from('# hello')], ['folder/', Buffer.alloc(0)], ['binary.exe', Buffer.alloc(8)]]);
    const original = readFileSync(file), listed = await readZipPreview(file);
    expect(listed.entries.map(entry => entry.name)).toContain('素材/说明.md');
    const read = await readZipPreview(file, '素材/说明.md');
    expect(Buffer.from(read.member!.base64, 'base64').toString()).toBe('# hello');
    expect(readFileSync(file)).toEqual(original);
    await expect(readZipPreview(file, 'binary.exe')).rejects.toThrow('UNSUPPORTED');
    await expect(readZipPreview(file, 'absent.txt')).rejects.toThrow('NOT_FOUND');
  });
  it('rejects path traversal and symlink-like/absolute names, never normalizes to another member', () => {
    for (const name of ['../secret','/secret','C:/secret','a\\b','a/../b','a/./b','a\0b']) expect(safeZipMemberName(name)).toBe(false);
    expect(safeZipMemberName('folder/文件.txt')).toBe(true);
  });
  it('refuses bombs and member budgets', async () => {
    await expect(readZipPreview(fixture([['large.txt', Buffer.alloc(2 * 1024 * 1024)]]))).rejects.toThrow('LIMIT');
    const large = randomBytes(1024 * 1024 + 1);
    await expect(readZipPreview(fixture([['large.txt', large]]), 'large.txt')).rejects.toThrow('UNSUPPORTED');
  });
  it('refuses corrupt archive metadata', async () => {
    const file = fixture([['read.txt', Buffer.from('hello')]]), data = readFileSync(file);
    data.fill(0, 0, Math.min(20, data.length)); writeFileSync(file, data);
    await expect(readZipPreview(file, 'read.txt')).rejects.toThrow();
  });
  it.each(['traversal', 'symlink', 'encrypted', 'duplicate', 'crc'] as const)('rejects hostile archive %s metadata before rendering', async kind => {
    const file = fixture([['a.txt', Buffer.from('hello')], ['b.txt', Buffer.from('world')]]);
    const bytes = readFileSync(file), headers: number[] = [];
    for (let offset = 0; offset + 46 <= bytes.length; offset++) {
      if (bytes.readUInt32LE(offset) === 0x02014b50) headers.push(offset);
    }
    expect(headers).toHaveLength(2);
    const header = headers[0]!;
    if (kind === 'traversal') bytes.write('../ab', header + 46);
    if (kind === 'symlink') bytes.writeUInt32LE(0xa1ff0000, header + 38);
    if (kind === 'encrypted') bytes.writeUInt16LE(bytes.readUInt16LE(header + 8) | 1, header + 8);
    if (kind === 'duplicate') bytes.write('a.txt', headers[1]! + 46);
    if (kind === 'crc') bytes.writeUInt32LE((bytes.readUInt32LE(header + 16) ^ 1) >>> 0, header + 16);
    writeFileSync(file, bytes);
    await expect(readZipPreview(file, 'a.txt')).rejects.toThrow();
    expect(readFileSync(file)).toEqual(bytes);
  });
});
