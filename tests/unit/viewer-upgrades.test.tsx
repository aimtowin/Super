// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarkdownPreview, safeMarkdownLink } from '../../src/renderer/MarkdownPreview';
import { isNearViewerEdge } from '../../src/renderer/viewer-preferences';
import { viewerDeleteAction } from '../../src/renderer/viewer-delete-shortcut';
import { LocaleProvider } from '../../src/renderer/i18n';
import type { AssetSummary } from '../../src/shared/asset-types';

describe('viewer upgrade safety', () => {
  it('renders GFM without executable HTML or implicit image loads', () => {
    const html = renderToStaticMarkup(<LocaleProvider initialPreference="en"><MarkdownPreview content={'# Title\n\n- [x] Done\n  - nested\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n```js\nalert(1)\n```\n\n<script>alert(1)</script>\n![remote](https://tracking.invalid/image.png)\n[bad](javascript:alert(1))'} /></LocaleProvider>);
    expect(html).toContain('<h1>Title</h1>'); expect(html).toContain('<table>');
    expect(html).toContain('type="checkbox"'); expect(html).toContain('language-js');
    expect(html).not.toContain('<script'); expect(html).not.toContain('<img'); expect(html).not.toContain('javascript:');
    expect(html).not.toContain('tracking.invalid');
  });
  it('renders empty lists and large content; permits only explicitly opened HTTP(S) links', () => {
    expect(renderToStaticMarkup(<LocaleProvider initialPreference="en"><MarkdownPreview content={'-\n\n' + 'long '.repeat(2000)} /></LocaleProvider>)).toContain('long');
    for (const url of ['file:///C:/secret', 'data:text/html,x', 'javascript:alert(1)', '//evil.test', './local.png', '#local']) expect(safeMarkdownLink(url)).toBe('');
    expect(safeMarkdownLink('https://example.com/a')).toBe('https://example.com/a');
  });
  it('proximity means viewer edges, not all pointer movement or outside shell', () => {
    const rect = { left: 100, top: 100, right: 900, bottom: 700 };
    expect(isNearViewerEdge(500, 400, rect)).toBe(false);
    expect(isNearViewerEdge(120, 400, rect)).toBe(true);
    expect(isNearViewerEdge(500, 680, rect)).toBe(true);
    expect(isNearViewerEdge(20, 400, rect)).toBe(false);
  });
  it('viewer deletion uses the current asset identity and protects linked Shift+Delete', () => {
    const managed = { assetId: 'current', locationKind: 'managed', availability: 'available', deletedAt: null } as AssetSummary;
    const linked = { ...managed, locationKind: 'linked' } as AssetSummary;
    expect(viewerDeleteAction(new KeyboardEvent('keydown', { key: 'Delete' }), 'windows', managed)).toBe('trash');
    expect(viewerDeleteAction(new KeyboardEvent('keydown', { key: 'Delete', shiftKey: true }), 'windows', managed)).toBe('disk');
    expect(viewerDeleteAction(new KeyboardEvent('keydown', { key: 'Delete', shiftKey: true }), 'windows', linked)).toBeNull();
    expect(viewerDeleteAction(new KeyboardEvent('keydown', { key: 'Delete', repeat: true }), 'windows', managed)).toBeNull();
  });
});
