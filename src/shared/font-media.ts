export const FONT_EXTENSIONS = ['.ttf', '.otf', '.woff', '.woff2', '.ttc'] as const;
export const FONT_PREVIEW_MAX_BYTES = 32 * 1024 * 1024;
export function fontMimeForExtension(name: string): string | null {
  const ext = name.toLowerCase().slice(name.lastIndexOf('.'));
  return ext === '.ttf' ? 'font/ttf' : ext === '.otf' ? 'font/otf' : ext === '.woff' ? 'font/woff' : ext === '.woff2' ? 'font/woff2' : ext === '.ttc' ? 'font/collection' : null;
}

/** Extract the first sfnt from TTC; table offsets in TTC are file-absolute. */
export function fontPreviewBytes(bytes: ArrayBuffer): ArrayBuffer {
  if (bytes.byteLength < 12 || bytes.byteLength > FONT_PREVIEW_MAX_BYTES) throw Error('Invalid font size');
  const view = new DataView(bytes);
  if (view.getUint32(0) !== 0x74746366) return bytes; // Not a TTC; FontFace validates the actual font.
  const count = view.getUint32(8);
  if (count < 1 || count > 64 || bytes.byteLength < 12 + count * 4) throw Error('Invalid font collection');
  const base = view.getUint32(12);
  if (base > bytes.byteLength - 12) throw Error('Invalid font offset');
  const tables = view.getUint16(base + 4);
  if (tables < 1 || tables > 256 || base + 12 + tables * 16 > bytes.byteLength) throw Error('Invalid table directory');
  let size = 12 + tables * 16;
  const entries = Array.from({length: tables}, (_, index) => {
    const pos = base + 12 + index * 16, source = view.getUint32(pos + 8), length = view.getUint32(pos + 12);
    if (source > bytes.byteLength || length > bytes.byteLength - source) throw Error('Invalid font table');
    const target = size; size += Math.ceil(length / 4) * 4;
    if (size > FONT_PREVIEW_MAX_BYTES) throw Error('Font exceeds preview budget');
    return {pos, source, length, target};
  });
  const output = new ArrayBuffer(size), dst = new Uint8Array(output), out = new DataView(output);
  dst.set(new Uint8Array(bytes, base, 12 + tables * 16));
  let head: number | null = null;
  for (const [i, entry] of entries.entries()) {
    dst.set(new Uint8Array(bytes, entry.source, entry.length), entry.target);
    out.setUint32(12 + i * 16 + 8, entry.target);
    if (view.getUint32(entry.pos) === 0x68656164 && entry.length >= 12) { head = entry.target; out.setUint32(head + 8, 0); }
  }
  if (head !== null) {
    let sum = 0; for (let pos = 0; pos < size; pos += 4) sum = (sum + out.getUint32(pos)) >>> 0;
    out.setUint32(head + 8, (0xb1b0afba - sum) >>> 0);
  }
  return output;
}
