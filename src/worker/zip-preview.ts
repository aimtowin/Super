import { statSync } from 'node:fs';
import { crc32 } from 'node:zlib';
import type { Readable } from 'node:stream';
import * as yauzl from 'yauzl';
import type { ZipPreview } from '../shared/zip-preview';

const MAX_ENTRIES = 5000, MAX_MEMBER = 8 * 1024 * 1024, MAX_TOTAL = 8 * 1024 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 16_777_216;
export function safeZipMemberName(name: string): boolean {
  return name.length > 0 && name.length <= 2048 && !name.includes('\\') && ![...name].some(character => character.charCodeAt(0) < 32) &&
    !name.startsWith('/') && !/^[A-Za-z]:/u.test(name) && !name.split('/').some(part => part === '..' || part === '.');
}
function memberMime(name: string): string | undefined {
  const extension = name.split('.').at(-1)?.toLowerCase();
  return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
    txt: 'text/plain', md: 'text/markdown', markdown: 'text/markdown', json: 'text/plain', csv: 'text/plain',
    log: 'text/plain', yaml: 'text/plain', yml: 'text/plain', js: 'text/plain', ts: 'text/plain', css: 'text/plain',
    html: 'text/plain', xml: 'text/plain' } as Record<string, string>)[extension ?? ''];
}

/** Read-only lazy archive browsing. No extraction, arbitrary paths, or unbounded inflation. */
export async function readZipPreview(file: string, memberPath?: string): Promise<Omit<ZipPreview, 'revisionId'>> {
  const before = statSync(file);
  if (!before.isFile() || before.size > 8 * 1024 ** 3) throw new Error('ZIP_PREVIEW_LIMIT');
  if (memberPath && !safeZipMemberName(memberPath)) throw new Error('ZIP_PREVIEW_PATH');
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, autoClose: false, validateEntrySizes: true, strictFileNames: true },
      (error, value) => error || !value ? reject(error ?? new Error('ZIP_PREVIEW_INVALID')) : resolve(value));
  });
  let activeStream: NodeJS.ReadableStream & { destroy(): void } | undefined;
  const controller = new AbortController();
  const timeout = setTimeout(() => { controller.abort(); activeStream?.destroy(); zip.close(); }, 10_000);
  try {
    if (zip.entryCount > MAX_ENTRIES) throw new Error('ZIP_PREVIEW_LIMIT');
    const entries: ZipPreview['entries'] = [], seen = new Set<string>();
    let total = 0, selected: yauzl.Entry | undefined;
    await new Promise<void>((resolve, reject) => {
      const abort = () => reject(new Error('ZIP_PREVIEW_TIMEOUT'));
      controller.signal.addEventListener('abort', abort, { once: true });
      zip.once('error', reject);
      zip.once('end', () => { controller.signal.removeEventListener('abort', abort); resolve(); });
      zip.on('entry', (entry: yauzl.Entry) => {
        try {
          if (!safeZipMemberName(entry.fileName) || seen.has(entry.fileName) ||
              ((entry.externalFileAttributes >>> 16) & 0xf000) === 0xa000) throw new Error('ZIP_PREVIEW_PATH');
          if ((entry.generalPurposeBitFlag & 1) !== 0) throw new Error('ZIP_PREVIEW_ENCRYPTED');
          seen.add(entry.fileName);
          total += entry.uncompressedSize;
          if (!Number.isSafeInteger(total) || total > MAX_TOTAL || entries.length >= MAX_ENTRIES ||
              (entry.uncompressedSize > 1024 * 1024 && entry.uncompressedSize / Math.max(1, entry.compressedSize) > 100)) {
            throw new Error('ZIP_PREVIEW_LIMIT');
          }
          entries.push({ name: entry.fileName, directory: entry.fileName.endsWith('/'), size: entry.uncompressedSize });
          if (entry.fileName === memberPath) selected = entry;
          zip.readEntry();
        } catch (error) { reject(error); }
      });
      zip.readEntry();
    });
    let member: ZipPreview['member'] = null;
    if (memberPath) {
      if (!selected || selected.fileName.endsWith('/')) throw new Error('ZIP_PREVIEW_MEMBER_NOT_FOUND');
      const mime = memberMime(selected.fileName);
      const limit = mime?.startsWith('text/') ? 1024 * 1024 : MAX_MEMBER;
      if (!mime || selected.uncompressedSize > limit) throw new Error('ZIP_PREVIEW_MEMBER_UNSUPPORTED');
      const stream = await new Promise<Readable>((resolve, reject) => {
        const abort = () => reject(new Error('ZIP_PREVIEW_TIMEOUT'));
        if (controller.signal.aborted) { abort(); return; }
        controller.signal.addEventListener('abort', abort, { once: true });
        zip.openReadStream(selected!, (error, value) => {
          controller.signal.removeEventListener('abort', abort);
          if (controller.signal.aborted) { value?.destroy(); abort(); return; }
          if (error || !value) reject(error ?? new Error('ZIP_PREVIEW_INVALID')); else resolve(value);
        });
      });
      activeStream = stream;
      if (controller.signal.aborted) throw new Error('ZIP_PREVIEW_TIMEOUT');
      const chunks: Buffer[] = []; let bytes = 0;
      for await (const chunk of stream) {
        if (controller.signal.aborted) throw new Error('ZIP_PREVIEW_TIMEOUT');
        const buffer = Buffer.from(chunk as Buffer); bytes += buffer.length;
        if (bytes > limit) throw new Error('ZIP_PREVIEW_LIMIT');
        chunks.push(buffer);
      }
      const buffer = Buffer.concat(chunks);
      if (buffer.length !== selected.uncompressedSize || crc32(buffer) !== selected.crc32) throw new Error('ZIP_PREVIEW_CRC');
      if (mime.startsWith('image/')) {
        // Compressed byte limits alone cannot bound raster/animation decoding.
        // Inspect headers in the Worker before exposing bytes to Chromium.
        const { default: sharp } = await import('sharp');
        try {
          const metadata = await sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS }).metadata();
          const expectedFormat = mime === 'image/jpeg' ? 'jpeg' : mime.slice('image/'.length);
          const pixels = (metadata.width ?? 0) * (metadata.height ?? 0) * (metadata.pages ?? 1);
          if (metadata.format !== expectedFormat || pixels <= 0 || !Number.isSafeInteger(pixels) || pixels > MAX_IMAGE_PIXELS) throw new Error('Raster budget or signature');
        } catch { throw new Error('ZIP_PREVIEW_IMAGE_UNSUPPORTED'); }
      }
      if (controller.signal.aborted) throw new Error('ZIP_PREVIEW_TIMEOUT');
      member = { name: memberPath, mime, base64: buffer.toString('base64') };
    }
    const after = statSync(file);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ino !== after.ino) throw new Error('ZIP_PREVIEW_CHANGED');
    return { entries, member };
  } finally { clearTimeout(timeout); activeStream?.destroy(); zip.close(); }
}
