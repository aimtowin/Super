import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeTextBytes } from '../../src/shared/text-encoding';
import { normalizeRawImageMetadata, resolvedImagePixelSize, usablePixelDimension } from '../../src/worker/raw-image-metadata';
import { resolveImagePreviewChannel, pbrTextureDisplayFilter } from '../../src/renderer/pbr-texture-channel';
import { parseRendererResult, parseWorkerResponse } from '../../src/shared/protocol/responses';

describe('sync move report protocol', () => {
  it.each(['sync.previewed', 'sync.completed'] as const)('preserves move counts through Worker and Renderer for %s', (type) => {
    const report = { libraryDirectory: 'fixture', newLocal: 0, newRemote: 0, uploads: 0, downloads: 0,
      conflicts: 0, remoteDeletes: 0, localRecycles: 0, remoteMoves: 1, localMoves: 2,
      capabilities: { auth: 'none', supportsContentTransfer: true, supportsDepthInfinity: true,
        supportsEtagIfMatch: true, supportsMove: true, supportsLock: false } };
    const payload = { ok: true, type, report, ...(type === 'sync.completed' ? { conflicts: [] } : {}) };
    expect(parseWorkerResponse({ requestId: 'move-fixture', result: payload })).toMatchObject({ result: { report: { remoteMoves: 1, localMoves: 2 } } });
    expect(parseRendererResult(payload)).toMatchObject({ report: { remoteMoves: 1, localMoves: 2 } });
    const oldReport: Partial<typeof report> = { ...report };
    delete oldReport.remoteMoves;
    delete oldReport.localMoves;
    expect(() => parseRendererResult({ ...payload, report: oldReport })).not.toThrow();
  });
});

describe('follow-up metadata and preview boundaries', () => {
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, null])('rejects unsafe pixel count %s', (value) => {
    expect(usablePixelDimension(value)).toBeNull();
  });
  it('falls back as a pair, never mixing EXIF width with header height', () => {
    expect(resolvedImagePixelSize({ width: 900, height: -1 }, { width: 640, height: 480 })).toEqual({ width: 640, height: 480 });
    expect(resolvedImagePixelSize({ width: 900, height: 600 }, { width: 640, height: 480 })).toEqual({ width: 900, height: 600 });
    expect(resolvedImagePixelSize({ width: 1.5, height: 2 }, null)).toEqual({ width: null, height: null });
    expect(normalizeRawImageMetadata({ ImageWidth: '900', ImageHeight: '600' })).toMatchObject({ width: 900, height: 600 });
  });
  it.each(['photo_roughness.png', 'ordinary_gloss.jpg', 'hero_normal.png'])('keeps ordinary preview %s untransformed', (name) => {
    expect(resolveImagePreviewChannel(name)).toBeNull();
  });
  it('keeps explicit material presentation available and default viewer opt-out wired', () => {
    const explicit = resolveImagePreviewChannel('hero_gloss.png', true)!;
    expect(pbrTextureDisplayFilter(explicit)).toBe('grayscale(1) invert(1)');
    const source = readFileSync(new URL('../../src/renderer/AssetPreviewModal.tsx', import.meta.url), 'utf8');
    expect(source).toContain('resolveImagePreviewChannel(asset.displayName)');
    expect(source).not.toContain('detectPbrTextureChannel(asset.displayName)');
  });
});

describe('bounded text encoding', () => {
  it.each([
    [Buffer.from('中文'), 'utf-8', '中文'],
    [Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('中文')]), 'utf-8', '中文'],
    [Buffer.from([0xd6, 0xd0, 0xce, 0xc4]), 'gb18030', '中文'],
    [Buffer.from([0x81, 0x30, 0x81, 0x30]), 'gb18030', '\u0080'],
    [Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('中文', 'utf16le')]), 'utf-16le', '中文'],
    [Buffer.from([0xfe, 0xff, 0x4e, 0x2d, 0x65, 0x87]), 'utf-16be', '中文'],
    [Buffer.from('hello world', 'utf16le'), 'utf-16le', 'hello world'],
  ] as const)('decodes supported encoding %s', (bytes, encoding, text) => {
    expect(decodeTextBytes(bytes)).toEqual({ encoding, text, binary: false });
  });
  it.each([Buffer.from([0, 1, 2]), Buffer.from([0xff, 0xfe, 0, 0, 1, 0]), Buffer.from('a\0b')])('rejects binary controls %s', (bytes) => {
    expect(decodeTextBytes(bytes).binary).toBe(true);
  });
  it('does not introduce replacement characters at an incomplete UTF-8/UTF-16 boundary', () => {
    expect(decodeTextBytes(Buffer.from([0x61, 0xe4, 0xb8]), true)).toMatchObject({ encoding: 'utf-8', text: 'a', binary: false });
    expect(decodeTextBytes(Buffer.from([0xff, 0xfe, 0x2d, 0x4e, 0x87]), true)).toMatchObject({ encoding: 'utf-16le', text: '中', binary: false });
  });
  it('does not silently use GBK when a UTF-8 BOM explicitly declares invalid content', () => {
    expect(decodeTextBytes(Buffer.from([0xef, 0xbb, 0xbf, 0xff])).binary).toBe(true);
  });
});
