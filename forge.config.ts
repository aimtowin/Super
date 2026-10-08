import type { ForgeConfig } from '@electron-forge/shared-types';
import path from 'node:path';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { createBuildProvenanceHooks } from './scripts/release/build-with-provenance.mjs';

const projectRoot = import.meta.dirname;
const appIconBase = path.join(projectRoot, 'assets', 'icons', 'app');

/**
 * Files copied by Electron Packager that are useful while developing native
 * dependencies, but are never opened by the shipped application. Keeping
 * this list deliberately narrow protects runtime assets such as .node,
 * .wasm, fonts, and the media binaries in `resources/`.
 */
function isPackagedDebugOrBuildArtifact(file: string): boolean {
  if (file.startsWith('/node_modules/.vite/')) return true;
  if (file.startsWith('/node_modules/@types/')) return true;

  // Vite emits the referenced font subsets into renderer/assets. Never remove
  // those assets: only omit the raw font/CSS copies from these exact packages.
  // Keep package metadata, licenses and notices alongside the bundled fonts.
  const fontPackage = /^\/node_modules\/(?:@fontsource-variable\/noto-sans-sc|@fontsource\/ibm-plex-mono|harmonyos-sans-sc-webfont-splitted)\//u;
  if (fontPackage.test(file) && /\.(?:woff2?|ttf|otf|css)$/iu.test(file)) return true;

  // These are transitive font-subsetting tools, not font rendering runtimes.
  // Canvas/Sharp and every other native dependency remain untouched.
  const fontTool = file.match(/^\/node_modules\/(?:cn-font-split|@napi-rs\/woff-build(?:-(?:win32|darwin|linux|android|wasm32)-[^/]+)?)\/(.+)$/u);
  if (fontTool?.[1] && !/^(?:package\.json|(?:licen[cs]e|copying|notice|ofl|readme)(?:[.-][^/]*)?)$/iu.test(fontTool[1])) {
    return true;
  }

  // better-sqlite3 loads only build/Release/better_sqlite3.node at runtime.
  // Its copied C/C++ sources and linker intermediates otherwise account for
  // dozens of megabytes in every full update archive.
  if (file.startsWith('/node_modules/better-sqlite3/bin/')) return true;
  if (file.startsWith('/node_modules/better-sqlite3/deps/')) return true;
  if (file.startsWith('/node_modules/better-sqlite3/build/deps/')) return true;
  if (file.startsWith('/node_modules/better-sqlite3/build/Release/obj/')) return true;

  return /\.(?:map|pdb|ipdb|iobj|lib|exp|obj)$/i.test(file);
}

const config: ForgeConfig = {
  // generateAssets owns the early immutable receipt; existing media/ufbx,
  // extension, copied-payload and VcpkgEnabled gates remain inside these hooks.
  hooks: createBuildProvenanceHooks({ repoRoot: projectRoot }),
  packagerConfig: {
    icon: appIconBase,
    // File-level delta installers compare package paths by hash. A monolithic
    // ASAR turns a one-line renderer change into a replacement of the entire
    // archive, so keep the production app as individually verifiable files.
    // Native modules still load normally from `resources/app/node_modules`.
    asar: false,
    // Super 初版不购买签名证书（MarkText/VSCodium 先例：未签名发布 +
    // 文档引导）。但 Apple Silicon 上完全不签名会报"已损坏"无法启动，所以
    // 用 ad-hoc 签名（identity '-'）作为技术底线。拿到 Developer ID 后把
    // identity 换成证书名并补 osxNotarize（Zettlr 条件模式）即可升级。
    osxSign: {
      identity: '-',
    },
    // Media executables must remain outside app.asar so the Library Worker can
    // spawn them. `npm run media:verify` is the release gate that validates the
    // platform bundle before packaging; `verify:package` repeats the same
    // checks against this copied directory.
    extraResource: [
      'resources',
      // Browser extension bundle (manual-load distribution): installed at
      // Super.app/Contents/Resources/extension (macOS) or
      // resources/extension (Windows) so users can load it unpacked.
      'dist/extension',
      'assets/icons/app-dock.png',
      'assets/icons/app.png',
      'assets/icons/app.ico',
      'assets/icons/app.icns',
      // Third-party attribution ships inside the package next to the LICENSE.
      'THIRD_PARTY_NOTICES.md',
      'LICENSE',
    ],
    // Forge's Vite plugin otherwise excludes all node_modules. Keep them in the
    // copy set so Packager can prune to production dependencies and the native
    // module plugin can unpack better-sqlite3.
    ignore: (file) => {
      if (!file) return false;
      if (isPackagedDebugOrBuildArtifact(file)) return true;
      return !file.startsWith('/.vite') && !file.startsWith('/node_modules');
    },
  },
  rebuildConfig: {},
  makers: [
    // Windows 安装器不在此处（2026-08-08 决策：WiX MSI 已回退——MSI 语言
    // 切换需自定义 bootstrapper（社区确认），Inno/NSIS 内置多语言选择
    // （VS Code 用 Inno））。Inno Setup 以独立脚本产出（scripts/inno-build.mjs
    // + assets/inno/supersetup.iss），release pipeline 的 make 阶段会串联。
    new MakerZIP({}, ['darwin', 'win32']),
    new MakerDMG({}),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main/index.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload/index.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
        {
          // Slice E (Super-hnmg): dedicated bridge for the hidden offscreen
          // thumbnail window; emitted as `.vite/build/offscreen.js`.
          entry: 'src/preload/offscreen.ts',
          config: 'vite.offscreen-preload.config.ts',
          target: 'preload',
        },
        {
          // Critical confirmation child windows have a deliberately narrow
          // bridge; they must not inherit the full application preload.
          entry: 'src/preload/critical-confirmation.ts',
          config: 'vite.critical-confirmation-preload.config.ts',
          target: 'preload',
        },
        {
          // The floating image monitor is also a separate BrowserWindow, but
          // it intentionally exposes only read-state + self-close IPC.
          entry: 'src/preload/floating-preview.ts',
          config: 'vite.floating-preview-preload.config.ts',
          target: 'preload',
        },
        {
          entry: 'src/worker/index.ts',
          config: 'vite.worker.config.ts',
          target: 'main',
        },
        {
          entry: 'src/scripting/script-runtime-utility-entry.ts',
          config: 'vite.script-runtime.config.ts',
          target: 'main',
        },
        {
          entry: 'src/scripting/plugin-standard-host-entry.ts',
          config: 'vite.plugin-runtime.config.ts',
          target: 'main',
        },
        {
          entry: 'src/scripting/plugin-trusted-host-entry.ts',
          config: 'vite.plugin-trusted-runtime.config.ts',
          target: 'main',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
  ],
};

export default config;
