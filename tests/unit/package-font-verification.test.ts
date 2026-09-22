import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SOURCE_FONT_PACKAGES, verifyPackagedFonts } from '../../scripts/package-font-verification.mjs';

const roots: string[] = [];
function fixture(css = '@font-face{src:url("./font.woff2")}') {
  const root = mkdtempSync(path.join(tmpdir(), 'super-font-verification-'));
  roots.push(root);
  const assets = path.join(root, '.vite/renderer/main_window/assets');
  mkdirSync(assets, { recursive: true });
  writeFileSync(path.join(assets, 'font.woff2'), 'font fixture');
  writeFileSync(path.join(assets, 'style.css'), css);
  for (const name of SOURCE_FONT_PACKAGES) {
    const dir = path.join(root, 'node_modules', name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'LICENSE'), 'license fixture');
  }
  return root;
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('packaged fonts gate', () => {
  it('accepts copied fonts without development originals', () => {
    expect(verifyPackagedFonts(fixture())).toEqual({ fontReferences: 1 });
  });
  it('rejects broken relative font URLs', () => {
    expect(() => verifyPackagedFonts(fixture('a{src:url(missing.woff2)}'))).toThrow('missing/out-of-root');
  });
  it('rejects a silently omitted font stylesheet', () => {
    expect(() => verifyPackagedFonts(fixture('a{color:red}'))).toThrow('No bundled font');
  });
  it('rejects reintroduced raw fonts', () => {
    const root = fixture();
    writeFileSync(path.join(root, 'node_modules', SOURCE_FONT_PACKAGES[0]!, 'duplicate.woff2'), 'duplicate');
    expect(() => verifyPackagedFonts(root)).toThrow('Raw font payload');
  });
  it('requires source licenses', () => {
    const root = fixture();
    rmSync(path.join(root, 'node_modules', SOURCE_FONT_PACKAGES[0]!, 'LICENSE'));
    expect(() => verifyPackagedFonts(root)).toThrow('Missing bundled font license');
  });
  it('handles inline URLs and font URL queries', () => {
    expect(verifyPackagedFonts(fixture('a{src:url(font.woff2?v=1)}b{background:url(data:image/png;base64,AA==)}'))).toEqual({ fontReferences: 1 });
  });
});
