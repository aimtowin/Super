import { describe, expect, it } from 'vitest';
import forgeConfig from '../../forge.config';
import { readFileSync } from 'node:fs';

const ignore = forgeConfig.packagerConfig?.ignore;
if (typeof ignore !== 'function') throw new Error('Expected a Forge copy filter');

describe('conservative package pruning', () => {
  it('full upgrades remove only the six known build-only package directories', () => {
    const installer = readFileSync(new URL('../../assets/inno/supersetup.iss', import.meta.url), 'utf8');
    const targets = [...installer.matchAll(/^Type: filesandordirs; Name: "(\{app\}\\resources\\app\\node_modules\\[^"]+)"/gmu)].map(match => match[1]);
    expect(targets).toEqual([
      '@fontsource-variable\\noto-sans-sc', '@fontsource\\ibm-plex-mono',
      'harmonyos-sans-sc-webfont-splitted', 'cn-font-split',
      '@napi-rs\\woff-build', '@napi-rs\\woff-build-win32-x64-msvc',
    ].map(name => `{app}\\resources\\app\\node_modules\\${name}`));
  });
  it.each([
    '/node_modules/@fontsource-variable/noto-sans-sc/files/noto.woff2',
    '/node_modules/@fontsource-variable/noto-sans-sc/index.css',
    '/node_modules/@fontsource/ibm-plex-mono/files/mono.woff',
    '/node_modules/harmonyos-sans-sc-webfont-splitted/dist/Regular.css',
    '/node_modules/harmonyos-sans-sc-webfont-splitted/dist/Regular/1.woff2',
    '/node_modules/cn-font-split/dist',
    '/node_modules/cn-font-split/bin/cn-font-split.mjs',
    '/node_modules/@napi-rs/woff-build/index.js',
    '/node_modules/@napi-rs/woff-build-win32-x64-msvc/woff-build.win32-x64-msvc.node',
    '/node_modules/@napi-rs/woff-build-darwin-arm64/woff-build.darwin-arm64.node',
  ])('omits build-only payload %s', file => {
    expect(ignore(file)).toBe(true);
  });

  it.each([
    '',
    '/node_modules/@fontsource-variable/noto-sans-sc',
    '/node_modules/@fontsource-variable/noto-sans-sc/LICENSE',
    '/node_modules/@fontsource/ibm-plex-mono/package.json',
    '/node_modules/harmonyos-sans-sc-webfont-splitted/LICENSE',
    '/node_modules/cn-font-split',
    '/node_modules/cn-font-split/LICENSE',
    '/node_modules/@napi-rs/woff-build/package.json',
    '/node_modules/@napi-rs/woff-build-win32-x64-msvc/README.md',
    '/.vite/renderer/main_window/assets/harmony.woff2',
    '/.vite/renderer/main_window/assets/styles.css',
    '/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
    '/node_modules/@napi-rs/canvas-win32-x64-msvc/skia.win32-x64-msvc.node',
    '/node_modules/@img/sharp-win32-x64/lib/libvips-42.dll',
    '/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
    '/node_modules/quickjs-emscripten/dist/index.js',
    '/node_modules/three/build/three.cjs',
    '/node_modules/react-dom/index.js',
    '/node_modules/unrelated-font-package/Regular.woff2',
    '/node_modules/cn-font-split-other/dist/index.js',
  ])('preserves %s', file => {
    expect(ignore(file)).toBe(false);
  });
});
