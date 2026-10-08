// Offline source census only: no build, installer, native loader, network or live library.
// Root owns execution after every source writer freezes. Outputs never overwrite history.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const review = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(review, '../../..');
const normalize = (value) => value.replaceAll('\\', '/');
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const relative = (filename) => normalize(path.relative(repoRoot, filename));
const hashValue = (value) => createHash('sha256').update(value).digest('hex');
const roots = ['src', 'tests', 'extension', 'scripts', 'assets', 'resources'];
const textual = /\.(?:ts|tsx|mjs|cjs|js|css|ps1|iss|html|json|md|txt|ya?ml|c|cpp|h|sh)$/iu;
const rootInput = (name) => /^(?:package\.json|package-lock\.json|npm-shrinkwrap\.json|tsconfig(?:\.[^/]+)?\.json|(?:vite(?:\.[^/]+)?|vitest|forge|eslint|postcss|tailwind)\.config\.[cm]?[jt]s|forge\.env\.d\.ts|[^/]+\.html|LICENSE(?:\.[^/]+)?|COPYING(?:\.[^/]+)?|NOTICE(?:\.[^/]+)?|THIRD_PARTY_NOTICES\.md)$/iu.test(name);
const artifactNames = ['architecture-overview.svg', 'diagrams/runtime.mmd', 'index.html', 'tools/build-inventory.mjs'];

function owned(filename, { missing = false } = {}) {
  const absolute = path.resolve(filename);
  const relation = path.relative(repoRoot, absolute);
  if (relation === '' || relation === '..' || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) {
    throw new Error(`Path is not an owned repository member: ${filename}`);
  }
  let cursor = repoRoot;
  for (const segment of relation.split(path.sep)) {
    cursor = path.join(cursor, segment);
    let entry;
    try { entry = fs.lstatSync(cursor); }
    catch (error) { if (missing && error.code === 'ENOENT') return absolute; throw error; }
    if (entry.isSymbolicLink()) throw new Error(`Linked inventory path is not supported: ${relative(cursor)}`);
  }
  return absolute;
}

function walk(directory) {
  owned(directory);
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => compare(a.name, b.name))) {
    const filename = owned(path.join(directory, entry.name));
    if (entry.isDirectory()) files.push(...walk(filename));
    else if (entry.isFile()) files.push(filename);
    else throw new Error(`Non-regular inventory member: ${relative(filename)}`);
  }
  return files;
}

function members() {
  const rootFiles = fs.readdirSync(repoRoot, { withFileTypes: true }).filter((entry) => rootInput(entry.name))
    .map((entry) => {
      const filename = owned(path.join(repoRoot, entry.name));
      if (!entry.isFile()) throw new Error(`Root input is not a regular file: ${entry.name}`);
      return filename;
    });
  return [...roots.flatMap((name) => walk(path.join(repoRoot, name))),
    ...rootFiles].sort((a, b) => compare(relative(a), relative(b)));
}

async function digest(filename, { countLines = false } = {}) {
  owned(filename);
  const before = fs.statSync(filename);
  if (!before.isFile()) throw new Error(`Cannot hash a non-regular file: ${relative(filename)}`);
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of fs.createReadStream(filename)) { hash.update(chunk); bytes += chunk.byteLength; }
  const lines = countLines && textual.test(filename) ? fs.readFileSync(filename, 'utf8').split(/\r?\n/u).length : null;
  const after = fs.statSync(owned(filename));
  if (bytes !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs
    || after.ctimeMs !== before.ctimeMs || after.dev !== before.dev || after.ino !== before.ino) {
    throw new Error(`File changed during source census: ${relative(filename)}`);
  }
  return { path: relative(filename), bytes, lines, sha256: hash.digest('hex') };
}

const git = (argv) => execFileSync('git', argv, { cwd: repoRoot, encoding: 'utf8', shell: false }).trim();
const fingerprint = (files) => hashValue(JSON.stringify(files.map(({ path: name, bytes, sha256 }) => ({ path: name, bytes, sha256 }))));

function dependencyCensus(files) {
  const sourceFiles = files.filter((file) => file.path.startsWith('src/') && /\.tsx?$/u.test(file.path));
  const paths = new Set(sourceFiles.map((file) => file.path));
  const config = ts.readConfigFile(path.join(repoRoot, 'tsconfig.json'), ts.sys.readFile);
  if (config.error) throw new Error(`tsconfig read failed: ${ts.flattenDiagnosticMessageText(config.error.messageText, '\n')}`);
  const options = ts.convertCompilerOptionsFromJson(config.config.compilerOptions, repoRoot);
  if (options.errors.length) throw new Error('Cannot resolve imports using the current compiler options.');
  const edges = [];
  const unresolved = [];
  const resolve = (from, specifier, typeOnly, kind, line) => {
    if (!specifier.startsWith('.')) return;
    const targetName = ts.resolveModuleName(specifier, path.join(repoRoot, from), options.options, ts.sys).resolvedModule?.resolvedFileName;
    const target = targetName ? relative(targetName) : null;
    if (target && paths.has(target)) edges.push({ from, to: target, typeOnly, kind, line });
    else if (!/\.(?:css|png|jpg|hdr|wasm|json)(?:\?|$)/u.test(specifier) && !specifier.includes('?')) unresolved.push({ from, specifier, line });
  };
  for (const file of sourceFiles) {
    const ast = ts.createSourceFile(file.path, fs.readFileSync(owned(path.join(repoRoot, file.path)), 'utf8'), ts.ScriptTarget.Latest, true);
    const lineAt = (node) => ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
    const visit = (node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const bindings = node.importClause?.namedBindings;
        const allType = bindings && ts.isNamedImports(bindings) && bindings.elements.length > 0
          && bindings.elements.every((element) => element.isTypeOnly) && !node.importClause?.name;
        resolve(file.path, node.moduleSpecifier.text, Boolean(node.importClause?.isTypeOnly || allType), 'import', lineAt(node));
      } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const allType = node.exportClause && ts.isNamedExports(node.exportClause) && node.exportClause.elements.length > 0
          && node.exportClause.elements.every((element) => element.isTypeOnly);
        resolve(file.path, node.moduleSpecifier.text, Boolean(node.isTypeOnly || allType), 'export', lineAt(node));
      } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
        && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        resolve(file.path, node.arguments[0].text, false, 'dynamic-import', lineAt(node));
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
  const counts = new Map(sourceFiles.map((file) => [file.path, { imports: 0, importers: new Set() }]));
  const matrix = {};
  for (const edge of edges) {
    counts.get(edge.from).imports++;
    counts.get(edge.to).importers.add(edge.from);
    const key = `${edge.from.split('/')[1]} -> ${edge.to.split('/')[1]}`;
    const value = matrix[key] ??= { typeOnly: 0, valueOrMixed: 0, dynamic: 0 };
    value[edge.typeOnly ? 'typeOnly' : edge.kind === 'dynamic-import' ? 'dynamic' : 'valueOrMixed']++;
  }
  const modules = sourceFiles.map((file) => ({ ...file, localImportDeclarations: counts.get(file.path).imports,
    localImporters: counts.get(file.path).importers.size }));
  return { sourceModuleCount: modules.length, localDependencyDeclarations: edges.length, layerDependencyMatrix: matrix,
    unresolvedRelativeImports: unresolved, largestSourceModules: [...modules].sort((a, b) => b.lines - a.lines).slice(0, 20),
    mostImportedModules: [...modules].sort((a, b) => b.localImporters - a.localImporters).slice(0, 20), dependencies: edges };
}

function localLinks({ futureOutput } = {}) {
  const html = fs.readFileSync(owned(path.join(review, 'index.html')), 'utf8');
  const links = [];
  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/gu)) {
    const href = match[1];
    if (href.startsWith('#')) continue;
    if (/^[a-z][a-z0-9+.-]*:/iu.test(href) || href.startsWith('//')) throw new Error(`Offline index contains a non-local reference: ${href}`);
    const filename = owned(path.resolve(review, decodeURIComponent(href.split('#')[0])), { missing: true });
    if (!fs.existsSync(filename) && filename !== futureOutput) throw new Error(`Offline index link is missing: ${href}`);
    links.push({ href, path: relative(filename) });
  }
  return links;
}

async function verifyFiles(files) {
  const actualPaths = members().map(relative);
  if (JSON.stringify(actualPaths) !== JSON.stringify(files.map((file) => file.path))) throw new Error('Source census membership changed; do not reuse this snapshot.');
  for (const file of files) {
    const actual = await digest(owned(path.join(repoRoot, file.path)));
    if (actual.bytes !== file.bytes || actual.sha256 !== file.sha256) throw new Error(`Snapshot hash changed: ${file.path}`);
  }
}

async function writeInventory(filename) {
  if (fs.existsSync(filename)) throw new Error(`Refusing to overwrite a historical inventory: ${filename}`);
  const head = git(['rev-parse', 'HEAD']);
  const files = [];
  for (const file of members()) files.push(await digest(file, { countLines: true }));
  const dependencies = dependencyCensus(files);
  const artifacts = [];
  for (const name of artifactNames) artifacts.push(await digest(path.join(review, name)));
  const version = JSON.parse(fs.readFileSync(owned(path.join(repoRoot, 'package.json')), 'utf8')).version;
  const groups = Object.fromEntries([...roots, '(root)'].map((name) => {
    const selected = files.filter((file) => name === '(root)' ? !file.path.includes('/') : file.path.startsWith(`${name}/`));
    return [name, { files: selected.length, bytes: selected.reduce((sum, file) => sum + file.bytes, 0),
      physicalTextLines: selected.reduce((sum, file) => sum + (file.lines ?? 0), 0) }];
  }));
  const links = localLinks({ futureOutput: filename });
  await verifyFiles(files);
  if (git(['rev-parse', 'HEAD']) !== head) throw new Error('HEAD changed during the census.');
  const inventory = { schema: 2, generatedAt: new Date().toISOString(), version, sourceCommit: head,
    repoRoot: normalize(repoRoot), artifactRoot: normalize(review), sourceFingerprint: fingerprint(files),
    method: 'All regular file types, including untracked, inside src/tests/extension/scripts/assets/resources and selected root inputs. Stream SHA-256; text lines only for declared text suffixes (blanks/comments included). Relative TS import/export/literal dynamic-import AST declarations only: excludes packages, require, IPC, SQL and generated .vite/dist/out. A census is not build provenance, a typecheck, a runtime graph, a benchmark or a passing gate. No build or external/native loader is invoked.',
    limits: { svgXmlValidation: 'NOT_RUN; root must parse with a browser/XML reader', svgVisualValidation: 'NOT_RUN; root must inspect a fresh screenshot',
      mermaidRender: 'NOT_RUN; no Mermaid runtime is bundled or downloaded', releaseReady: false },
    groups, files, artifacts, localLinks: links, ...dependencies };
  // review already exists; no recursive mkdir or arbitrary output directory.
  owned(path.dirname(filename));
  fs.writeFileSync(owned(filename, { missing: true }), `${JSON.stringify(inventory, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  return { action: 'written', output: normalize(filename), sourceFiles: files.length, sourceFingerprint: inventory.sourceFingerprint,
    sourceModules: inventory.sourceModuleCount, localDependencyDeclarations: inventory.localDependencyDeclarations,
    localLinks: localLinks().length, limits: inventory.limits };
}

async function verifyInventory(filename) {
  const inventory = JSON.parse(fs.readFileSync(owned(filename), 'utf8'));
  if (inventory.schema !== 2 || inventory.repoRoot !== normalize(repoRoot) || inventory.artifactRoot !== normalize(review)
    || inventory.sourceCommit !== git(['rev-parse', 'HEAD']) || inventory.sourceFingerprint !== fingerprint(inventory.files)) {
    throw new Error('Inventory identity/HEAD/fingerprint is not the current stage-A snapshot.');
  }
  await verifyFiles(inventory.files);
  if (JSON.stringify(inventory.artifacts.map((file) => file.path))
    !== JSON.stringify(artifactNames.map((name) => relative(path.join(review, name))))) {
    throw new Error('Architecture artifact membership does not match the owned four-file set.');
  }
  for (const file of inventory.artifacts) {
    const actual = await digest(owned(path.join(repoRoot, file.path)));
    if (actual.bytes !== file.bytes || actual.sha256 !== file.sha256) throw new Error(`Architecture artifact changed: ${file.path}`);
  }
  const links = localLinks();
  return { action: 'verified', output: normalize(filename), sourceFiles: inventory.files.length,
    sourceFingerprint: inventory.sourceFingerprint, artifactHashesMatch: true, localLinks: links.length,
    svgXmlValidation: 'NOT_RUN', svgVisualValidation: 'NOT_RUN', mermaidRender: 'NOT_RUN', releaseReady: false };
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes('--help')) {
    process.stdout.write('Usage: node docs/architecture/2026-10-08-stage-a/tools/build-inventory.mjs --write|--verify [--output <owned stage-A JSON>]\nWrite refuses overwrite; run only after all source writers freeze. Verification never launches or renders.\n');
    return;
  }
  const [mode, ...tail] = argv;
  if (!['--write', '--verify'].includes(mode) || (tail.length !== 0 && (tail.length !== 2 || tail[0] !== '--output'))) throw new Error('Invalid census arguments.');
  const filename = path.resolve(tail[1] ?? path.join(review, 'inventory.json'));
  if (path.dirname(filename) !== review || !/^[a-z0-9][a-z0-9-]*\.json$/iu.test(path.basename(filename))) throw new Error('Output must be one JSON file directly in the new stage-A artifact directory.');
  if (fs.realpathSync(repoRoot) !== repoRoot || fs.realpathSync(review) !== review) throw new Error('Linked or redirected repository/artifact root is not supported.');
  process.stdout.write(`${JSON.stringify(mode === '--write' ? await writeInventory(filename) : await verifyInventory(filename), null, 2)}\n`);
}

main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
