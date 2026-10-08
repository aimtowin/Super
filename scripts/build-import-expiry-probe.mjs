import { createHash, randomUUID } from 'node:crypto';
import { builtinModules } from 'node:module';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'vite';

// Test-only build: never imports the production composition root, writes .vite,
// rebuilds native dependencies, installs packages, or downloads media.
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixedInputs = [
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'vite.worker.config.ts',
  'playwright.config.ts',
  'scripts/build-import-expiry-probe.mjs',
  'tests/fixtures/import-expiry-probe/main.ts',
  'tests/fixtures/import-expiry-probe/worker.ts',
  'tests/e2e/import-expiry-fault-containment.test.ts',
  'tests/e2e/electron-test-helpers.ts',
];

async function treePaths(root, directory = '') {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error(`Probe source input is a symlink: ${directory}/${entry.name}`);
    const relative = directory ? `${directory}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await treePaths(root, relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

async function fileDigest(filename) {
  const bytes = await readFile(filename);
  return { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}

async function sourceSnapshot() {
  const paths = [...new Set([...fixedInputs, ...await treePaths(repositoryRoot, 'src')])].sort();
  const files = [];
  for (const relative of paths) files.push({ path: relative, ...await fileDigest(path.join(repositoryRoot, relative)) });
  return {
    files,
    sha256: createHash('sha256').update(JSON.stringify(files)).digest('hex'),
  };
}

async function buildProbe() {
  for (const argument of process.argv.slice(2)) {
    if (argument !== '--print-manifest') throw new Error(`Unknown probe build argument: ${argument}`);
  }
  const runId = randomUUID();
  const outputDirectory = path.join(repositoryRoot, 'tmp', `architecture-stage-a-${runId}`, 'import-expiry-probe');
  await mkdir(outputDirectory, { recursive: true });
  const before = await sourceSnapshot();
  const external = [
    'electron', 'electron/common', 'electron/main', 'electron/renderer',
    ...builtinModules, ...builtinModules.map((name) => `node:${name}`),
    // Keep the native/Node runtime boundary used by vite.worker.config.ts.
    'better-sqlite3', 'koffi', 'sharp', 'trash', 'exifr', '@napi-rs/canvas',
  ];
  const bundles = {};
  for (const entry of ['main', 'worker']) {
    await build({
      root: repositoryRoot,
      configFile: false,
      logLevel: 'silent',
      resolve: { conditions: ['node'], mainFields: ['module', 'jsnext:main', 'jsnext'] },
      build: {
        emptyOutDir: false,
        outDir: outputDirectory,
        minify: false,
        lib: {
          entry: path.join(repositoryRoot, 'tests', 'fixtures', 'import-expiry-probe', `${entry}.ts`),
          formats: ['cjs'],
          fileName: () => `${entry}.cjs`,
        },
        rollupOptions: { external, output: { chunkFileNames: '[name]-[hash].cjs' } },
      },
    });
    const bundlePath = path.join(outputDirectory, `${entry}.cjs`);
    bundles[entry] = { path: bundlePath, ...await fileDigest(bundlePath) };
  }
  const after = await sourceSnapshot();
  if (before.sha256 !== after.sha256) throw new Error('Probe source changed during build; rebuild in a new owned directory.');
  const compiledFiles = [];
  for (const relative of (await treePaths(outputDirectory)).sort()) {
    compiledFiles.push({ path: relative, ...await fileDigest(path.join(outputDirectory, relative)) });
  }
  const manifestPath = path.join(outputDirectory, 'manifest.json');
  await writeFile(manifestPath, `${JSON.stringify({
    formatVersion: 1,
    kind: 'import-expiry-utility-probe',
    runId,
    createdAt: new Date().toISOString(),
    repositoryRoot,
    outputDirectory,
    sourceSha256: before.sha256,
    sourceFiles: before.files,
    compiledFiles,
    bundles,
  }, null, 2)}\n`, { flag: 'wx' });
  return manifestPath;
}

// Even a build dependency that writes directly to stdout must not contaminate
// PowerShell's --print-manifest assignment. Build diagnostics go to stderr.
const stdoutWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = (...args) => process.stderr.write(...args);
try {
  const manifestPath = await buildProbe();
  stdoutWrite(`${manifestPath}\n`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
