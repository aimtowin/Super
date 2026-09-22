import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export const SOURCE_FONT_PACKAGES = [
  '@fontsource-variable/noto-sans-sc',
  '@fontsource/ibm-plex-mono',
  'harmonyos-sans-sc-webfont-splitted',
];

function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(file) : [file];
  });
}

/** Verify the copied production assets, independent of workspace node_modules. */
export function verifyPackagedFonts(appPath) {
  const renderer = path.join(appPath, '.vite', 'renderer', 'main_window');
  const files = filesIn(renderer);
  let fontReferences = 0;
  for (const file of files.filter(file => file.endsWith('.css'))) {
    const css = readFileSync(file, 'utf8');
    for (const match of css.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/gu)) {
      const url = match[1];
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/iu.test(url)) continue;
      const pathname = decodeURIComponent(url.split(/[?#]/u)[0]);
      const asset = path.resolve(path.dirname(file), pathname);
      const relative = path.relative(renderer, asset);
      if (relative.startsWith('..') || path.isAbsolute(relative) || !existsSync(asset) || statSync(asset).size === 0) {
        throw new Error(`Packaged CSS references missing/out-of-root asset: ${file}: ${url}`);
      }
      if (/\.(?:woff2?|ttf|otf)$/iu.test(pathname)) fontReferences++;
    }
  }
  if (fontReferences === 0) throw new Error('No bundled font references found in packaged renderer CSS.');
  for (const name of SOURCE_FONT_PACKAGES) {
    const directory = path.join(appPath, 'node_modules', name);
    if (!existsSync(path.join(directory, 'LICENSE'))) throw new Error(`Missing bundled font license: ${name}`);
    const duplicates = filesIn(directory).filter(file => /\.(?:woff2?|ttf|otf|css)$/iu.test(file));
    if (duplicates.length) throw new Error(`Raw font payload survived package pruning: ${duplicates[0]}`);
  }
  return { fontReferences };
}
